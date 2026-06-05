/**
 * PDS Function Block — A4988 Stepper Driver implementation
 *
 * Step pulse generation: esp_timer fires at the required step frequency.
 * Each callback does: GPIO HIGH → 2 µs delay → GPIO LOW.
 * The run() function adjusts timer period to ramp speed toward target.
 *
 * Microstep pin truth table (A4988):
 *   Divisor  MS1  MS2  MS3
 *     1       0    0    0   (full step)
 *     2       1    0    0   (half step)
 *     4       0    1    0   (quarter)
 *     8       1    1    0   (eighth)
 *    16       1    1    1   (sixteenth)
 */

#include "pds_fb_stepper_a4988.h"
#include "pds_gpio.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "esp_timer.h"
#include "rom/ets_sys.h"

/* ── Microstep pin table ─────────────────────────────────────────────────── */
typedef struct { uint8_t ms1, ms2, ms3; } ms_pins_t;
static const ms_pins_t s_a4988_ms_table[] = {
    { 0, 0, 0 }, /* divisor 1  — full   */
    { 1, 0, 0 }, /* divisor 2  — half   */
    { 0, 1, 0 }, /* divisor 4  — 1/4    */
    { 1, 1, 0 }, /* divisor 8  — 1/8    */
    { 1, 1, 1 }, /* divisor 16 — 1/16   */
};

/* ── Internal context ────────────────────────────────────────────────────── */
typedef struct {
    pds_fb_stepper_a4988_settings_t settings;
    pds_fb_stepper_a4988_state_t    state;
    const float *pv_speed;   /* connected float input (RPM) */
    const bool  *pv_enable;  /* connected bool gate         */
    esp_timer_handle_t step_timer;
    uint32_t last_run_tick;  /* for ramp delta-time          */
} stepper_a4988_ctx_t;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

static inline uint32_t _now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000LL);
}

static inline uint8_t _divisor_index(uint8_t d)
{
    if (d >= 16) return 4;
    if (d >= 8)  return 3;
    if (d >= 4)  return 2;
    if (d >= 2)  return 1;
    return 0;
}

static void _apply_ms_pins(const stepper_a4988_ctx_t *ctx)
{
    const ms_pins_t *t = &s_a4988_ms_table[_divisor_index(ctx->settings.microstep_divisor)];
    if (ctx->settings.pin_ms1 >= 0)
        PDS_GPIO_write((uint32_t)ctx->settings.pin_ms1, t->ms1);
    if (ctx->settings.pin_ms2 >= 0)
        PDS_GPIO_write((uint32_t)ctx->settings.pin_ms2, t->ms2);
    if (ctx->settings.pin_ms3 >= 0)
        PDS_GPIO_write((uint32_t)ctx->settings.pin_ms3, t->ms3);
}

/** Stop the step timer and optionally de-energise the driver. */
static void _stop(stepper_a4988_ctx_t *ctx)
{
    esp_timer_stop(ctx->step_timer);
    ctx->state.running = false;
    if (ctx->settings.pin_enable >= 0)
        PDS_GPIO_write((uint32_t)ctx->settings.pin_enable, 1); /* active-low: 1 = disabled */
}

/** Set step timer period and energise the driver. */
static void _set_period_us(stepper_a4988_ctx_t *ctx, float abs_rpm)
{
    if (abs_rpm < 0.01f || ctx->settings.pin_step < 0) {
        _stop(ctx);
        return;
    }
    if (ctx->settings.pin_enable >= 0)
        PDS_GPIO_write((uint32_t)ctx->settings.pin_enable, 0); /* active-low: 0 = enabled */

    uint32_t steps_per_sec = (uint32_t)(
        abs_rpm * (float)ctx->settings.steps_per_rev *
        (float)ctx->settings.microstep_divisor / 60.0f);
    if (steps_per_sec == 0) { _stop(ctx); return; }

    uint64_t period_us = 1000000ULL / steps_per_sec;
    if (period_us < 4) period_us = 4; /* hardware floor */

    esp_timer_stop(ctx->step_timer);
    esp_timer_start_periodic(ctx->step_timer, (uint64_t)period_us);
    ctx->state.running = true;
}

/* ── Step timer callback ─────────────────────────────────────────────────── */
static void _step_cb(void *arg)
{
    stepper_a4988_ctx_t *ctx = (stepper_a4988_ctx_t *)arg;
    PDS_GPIO_write((uint32_t)ctx->settings.pin_step, 1);
    ets_delay_us(2);
    PDS_GPIO_write((uint32_t)ctx->settings.pin_step, 0);
    ctx->state.step_count++;
}

/* ── Configure GPIO pins ─────────────────────────────────────────────────── */
static esp_err_t _configure_pins(const stepper_a4988_ctx_t *ctx)
{
    const pds_fb_stepper_a4988_settings_t *s = &ctx->settings;

#define CFG_OUT(pin) do { \
    if ((pin) >= 0) { \
        esp_err_t r = PDS_GPIO_configure((uint32_t)(pin), PDS_GPIO_MODE_OUTPUT, PDS_GPIO_PULL_NONE); \
        if (r != ESP_OK) return r; \
    } \
} while (0)

    CFG_OUT(s->pin_step);
    CFG_OUT(s->pin_dir);
    CFG_OUT(s->pin_enable);
    CFG_OUT(s->pin_ms1);
    CFG_OUT(s->pin_ms2);
    CFG_OUT(s->pin_ms3);
#undef CFG_OUT

    if (s->pin_step >= 0)   PDS_GPIO_write((uint32_t)s->pin_step, 0);
    if (s->pin_dir >= 0)    PDS_GPIO_write((uint32_t)s->pin_dir,  0);
    if (s->pin_enable >= 0) PDS_GPIO_write((uint32_t)s->pin_enable, 1); /* disabled */

    _apply_ms_pins(ctx);
    return ESP_OK;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Public API
   ═══════════════════════════════════════════════════════════════════════════ */

esp_err_t pds_fb_stepper_a4988_init(
    const pds_fb_stepper_a4988_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    stepper_a4988_ctx_t *ctx = calloc(1, sizeof(stepper_a4988_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(ctx->settings));
    if (ctx->settings.steps_per_rev == 0) ctx->settings.steps_per_rev = 200;
    if (ctx->settings.microstep_divisor == 0) ctx->settings.microstep_divisor = 1;

    esp_err_t ret = _configure_pins(ctx);
    if (ret != ESP_OK) { free(ctx); return ret; }

    const esp_timer_create_args_t timer_args = {
        .callback  = _step_cb,
        .arg       = ctx,
        .dispatch_method = ESP_TIMER_TASK,
        .name      = "stepper_a4988",
    };
    ret = esp_timer_create(&timer_args, &ctx->step_timer);
    if (ret != ESP_OK) { free(ctx); return ret; }

    ctx->last_run_tick = _now_ms();
    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_stepper_a4988_run(pds_comp_handle_t handle)
{
    stepper_a4988_ctx_t *ctx = (stepper_a4988_ctx_t *)handle;
    if (!ctx) return PDS_COMP_ERROR;

    uint32_t now = _now_ms();
    float dt_s = (float)(now - ctx->last_run_tick) / 1000.0f;
    if (dt_s <= 0.0f) dt_s = 0.001f;
    ctx->last_run_tick = now;

    /* Determine desired speed */
    bool sw_enable = ctx->pv_enable ? *ctx->pv_enable : true;
    if (!ctx->settings.enabled || !sw_enable) {
        _stop(ctx);
        ctx->state.current_rpm = 0.0f;
        ctx->state.target_rpm  = 0.0f;
        return PDS_COMP_ACTIVE;
    }

    float target = ctx->pv_speed ? *ctx->pv_speed : 0.0f;
    /* Clamp to ±max_rpm */
    float max = ctx->settings.max_rpm > 0.0f ? ctx->settings.max_rpm : 300.0f;
    if (target >  max) target =  max;
    if (target < -max) target = -max;
    ctx->state.target_rpm = target;

    /* Ramp current speed */
    float cur = ctx->state.current_rpm;
    if (ctx->settings.accel_rpm_s > 0.0f) {
        float step = ctx->settings.accel_rpm_s * dt_s;
        if (fabsf(target - cur) <= step) cur = target;
        else cur += (target > cur) ? step : -step;
    } else {
        cur = target;
    }
    ctx->state.current_rpm = cur;

    /* Update DIR pin based on sign */
    float abs_rpm = fabsf(cur);
    if (ctx->settings.pin_dir >= 0) {
        bool fwd = (cur >= 0.0f) != ctx->settings.invert_dir;
        PDS_GPIO_write((uint32_t)ctx->settings.pin_dir, fwd ? 1 : 0);
    }

    _set_period_us(ctx, abs_rpm);
    return PDS_COMP_ACTIVE;
}

esp_err_t pds_fb_stepper_a4988_stop(pds_comp_handle_t handle)
{
    stepper_a4988_ctx_t *ctx = (stepper_a4988_ctx_t *)handle;
    if (!ctx) return ESP_ERR_INVALID_ARG;
    _stop(ctx);
    ctx->state.current_rpm = 0.0f;
    return ESP_OK;
}

esp_err_t pds_fb_stepper_a4988_connect_speed(pds_comp_handle_t handle, const float *speed_ptr)
{
    stepper_a4988_ctx_t *ctx = (stepper_a4988_ctx_t *)handle;
    if (!ctx) return ESP_ERR_INVALID_ARG;
    ctx->pv_speed = speed_ptr;
    return ESP_OK;
}

esp_err_t pds_fb_stepper_a4988_connect_enable(pds_comp_handle_t handle, const bool *enable_ptr)
{
    stepper_a4988_ctx_t *ctx = (stepper_a4988_ctx_t *)handle;
    if (!ctx) return ESP_ERR_INVALID_ARG;
    ctx->pv_enable = enable_ptr;
    return ESP_OK;
}

const pds_fb_stepper_a4988_state_t *pds_fb_stepper_a4988_get_state(pds_comp_handle_t handle)
{
    return &((stepper_a4988_ctx_t *)handle)->state;
}

esp_err_t pds_fb_stepper_a4988_get_settings(
    pds_comp_handle_t handle, pds_fb_stepper_a4988_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((stepper_a4988_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_stepper_a4988_set_settings(
    pds_comp_handle_t handle, const pds_fb_stepper_a4988_settings_t *settings)
{
    stepper_a4988_ctx_t *ctx = (stepper_a4988_ctx_t *)handle;
    if (!ctx || !settings) return ESP_ERR_INVALID_ARG;
    _stop(ctx);
    memcpy(&ctx->settings, settings, sizeof(ctx->settings));
    if (ctx->settings.steps_per_rev == 0) ctx->settings.steps_per_rev = 200;
    if (ctx->settings.microstep_divisor == 0) ctx->settings.microstep_divisor = 1;
    _configure_pins(ctx);
    return ESP_OK;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Position Mode
   Inputs:  port 0 = float target_steps (cast to int32; negative = reverse)
            port 1 = float trigger       (rising edge ≥0.5 starts move)
   Output:  port 0 = float done_f        (1.0f for one tick on completion)
   Speed:   uses max_rpm setting as fixed move speed (no live ramp in position
            mode — accel_rpm_s is ignored for simplicity; add trapezoid later).
   ═══════════════════════════════════════════════════════════════════════════ */

typedef struct {
    pds_fb_stepper_a4988_settings_t          settings;
    esp_timer_handle_t                        step_timer;
    volatile int32_t                          steps_remaining;
    const float                              *pv_target;
    const float                              *pv_trigger;
    float                                     prev_trigger;
    pds_fb_stepper_a4988_position_state_t     state;
} stepper_a4988_pos_ctx_t;

static void _pos_step_cb(void *arg)
{
    stepper_a4988_pos_ctx_t *ctx = (stepper_a4988_pos_ctx_t *)arg;
    if (ctx->steps_remaining > 0) {
        PDS_GPIO_write((uint32_t)ctx->settings.pin_step, 1);
        ets_delay_us(2);
        PDS_GPIO_write((uint32_t)ctx->settings.pin_step, 0);
        ctx->steps_remaining--;
    }
}

static void _pos_stop(stepper_a4988_pos_ctx_t *ctx)
{
    esp_timer_stop(ctx->step_timer);
    ctx->state.moving = false;
    ctx->state.steps_remaining = 0;
    if (ctx->settings.pin_enable >= 0)
        PDS_GPIO_write((uint32_t)ctx->settings.pin_enable, 1); /* active-low: disabled */
}

static void _pos_start(stepper_a4988_pos_ctx_t *ctx, int32_t target_steps)
{
    int32_t abs_steps = target_steps < 0 ? -target_steps : target_steps;
    if (abs_steps == 0 || ctx->settings.pin_step < 0) return;

    /* Direction */
    if (ctx->settings.pin_dir >= 0) {
        bool fwd = (target_steps >= 0) != ctx->settings.invert_dir;
        PDS_GPIO_write((uint32_t)ctx->settings.pin_dir, fwd ? 1 : 0);
    }
    /* MS pins */
    _apply_ms_pins((const stepper_a4988_ctx_t *)ctx);
    /* Enable */
    if (ctx->settings.pin_enable >= 0)
        PDS_GPIO_write((uint32_t)ctx->settings.pin_enable, 0);

    float move_rpm = ctx->settings.max_rpm > 0.0f ? ctx->settings.max_rpm : 30.0f;
    uint32_t sps = (uint32_t)(move_rpm * (float)ctx->settings.steps_per_rev
                               * (float)ctx->settings.microstep_divisor / 60.0f);
    if (sps == 0) return;
    uint64_t period_us = 1000000ULL / sps;
    if (period_us < 4) period_us = 4;

    ctx->steps_remaining      = abs_steps;
    ctx->state.steps_remaining = abs_steps;
    ctx->state.moving          = true;
    ctx->state.done_f          = 0.0f;

    esp_timer_stop(ctx->step_timer);
    esp_timer_start_periodic(ctx->step_timer, period_us);
}

/* ── Position Mode Public API ─────────────────────────────────────────────── */

esp_err_t pds_fb_stepper_a4988_position_init(
    const pds_fb_stepper_a4988_position_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    stepper_a4988_pos_ctx_t *ctx = calloc(1, sizeof(stepper_a4988_pos_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(ctx->settings));
    if (ctx->settings.steps_per_rev == 0)    ctx->settings.steps_per_rev = 200;
    if (ctx->settings.microstep_divisor == 0) ctx->settings.microstep_divisor = 1;

    esp_err_t ret = _configure_pins((stepper_a4988_ctx_t *)ctx);
    if (ret != ESP_OK) { free(ctx); return ret; }

    const esp_timer_create_args_t ta = {
        .callback        = _pos_step_cb,
        .arg             = ctx,
        .dispatch_method = ESP_TIMER_TASK,
        .name            = "stepper_a4988_pos",
    };
    ret = esp_timer_create(&ta, &ctx->step_timer);
    if (ret != ESP_OK) { free(ctx); return ret; }

    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_stepper_a4988_position_run(pds_comp_handle_t handle)
{
    stepper_a4988_pos_ctx_t *ctx = (stepper_a4988_pos_ctx_t *)handle;
    if (!ctx) return PDS_COMP_ERROR;

    ctx->state.done_f = 0.0f;  /* clear done pulse from previous tick */

    float trig = ctx->pv_trigger ? *ctx->pv_trigger : 0.0f;
    bool rising = (trig >= 0.5f) && (ctx->prev_trigger < 0.5f);
    ctx->prev_trigger = trig;

    if (!ctx->settings.enabled) {
        if (ctx->state.moving) _pos_stop(ctx);
        return PDS_COMP_ACTIVE;
    }

    /* Check completion */
    if (ctx->state.moving && ctx->steps_remaining <= 0) {
        _pos_stop(ctx);
        ctx->state.done_f = 1.0f;  /* one-tick pulse */
    }

    ctx->state.steps_remaining = ctx->steps_remaining;

    /* Start new move on rising trigger edge */
    if (rising && !ctx->state.moving) {
        int32_t target = ctx->pv_target ? (int32_t)(*ctx->pv_target) : 0;
        if (target != 0) _pos_start(ctx, target);
    }

    return PDS_COMP_ACTIVE;
}

esp_err_t pds_fb_stepper_a4988_position_stop(pds_comp_handle_t handle)
{
    stepper_a4988_pos_ctx_t *ctx = (stepper_a4988_pos_ctx_t *)handle;
    if (!ctx) return ESP_ERR_INVALID_ARG;
    _pos_stop(ctx);
    return ESP_OK;
}

esp_err_t pds_fb_stepper_a4988_position_connect_target(
    pds_comp_handle_t handle, const float *target_steps_ptr)
{
    stepper_a4988_pos_ctx_t *ctx = (stepper_a4988_pos_ctx_t *)handle;
    if (!ctx) return ESP_ERR_INVALID_ARG;
    ctx->pv_target = target_steps_ptr;
    return ESP_OK;
}

esp_err_t pds_fb_stepper_a4988_position_connect_trigger(
    pds_comp_handle_t handle, const float *trigger_ptr)
{
    stepper_a4988_pos_ctx_t *ctx = (stepper_a4988_pos_ctx_t *)handle;
    if (!ctx) return ESP_ERR_INVALID_ARG;
    ctx->pv_trigger = trigger_ptr;
    return ESP_OK;
}

const pds_fb_stepper_a4988_position_state_t *pds_fb_stepper_a4988_position_get_state(
    pds_comp_handle_t handle)
{
    return &((stepper_a4988_pos_ctx_t *)handle)->state;
}

esp_err_t pds_fb_stepper_a4988_position_get_settings(
    pds_comp_handle_t handle, pds_fb_stepper_a4988_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((stepper_a4988_pos_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_stepper_a4988_position_set_settings(
    pds_comp_handle_t handle, const pds_fb_stepper_a4988_settings_t *settings)
{
    stepper_a4988_pos_ctx_t *ctx = (stepper_a4988_pos_ctx_t *)handle;
    if (!ctx || !settings) return ESP_ERR_INVALID_ARG;
    _pos_stop(ctx);
    memcpy(&ctx->settings, settings, sizeof(ctx->settings));
    if (ctx->settings.steps_per_rev == 0)    ctx->settings.steps_per_rev = 200;
    if (ctx->settings.microstep_divisor == 0) ctx->settings.microstep_divisor = 1;
    _configure_pins((stepper_a4988_ctx_t *)ctx);
    return ESP_OK;
}
