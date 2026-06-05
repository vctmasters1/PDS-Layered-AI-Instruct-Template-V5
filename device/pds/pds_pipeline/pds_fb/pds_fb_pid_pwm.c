/**
 * PDS Component — PID → PWM implementation
 */

#include "pds_fb_pid_pwm.h"
#include "pds_pwm_registry.h"   /* see pds_hal/registries/AI-INSTRUCT.md */
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include "esp_timer.h"
#include "esp_log.h"

static const char *TAG = "pid_pwm";

#define PID_PWM_RESOLUTION_BITS  8u

typedef struct {
    pds_fb_pid_pwm_settings_t settings;
    pds_fb_pid_pwm_state_t    state;
    const float *_pv_ptr;       /**< Connected process variable */
    const bool  *_enable_ptr;   /**< Connected enable gate (NULL = always enabled) */
} pid_pwm_ctx_t;

static inline uint32_t _now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000LL);
}

static esp_err_t _apply_settings(pid_pwm_ctx_t *ctx)
{
    if (ctx->settings.pin_pwm < 0) return ESP_OK;

    ESP_LOGI(TAG, "GPIO%d → PWM @ %"PRIu32"Hz  (sp=%.2f  kp=%.2f  ki=%.2f  kd=%.2f)",
             ctx->settings.pin_pwm, ctx->settings.pwm_frequency_hz,
             ctx->settings.setpoint, ctx->settings.kp, ctx->settings.ki, ctx->settings.kd);

    /* Register with PWM registry — configures LEDC channel and stores set/get backends. */
    char _label[16];
    snprintf(_label, sizeof(_label), "PWM%d", ctx->settings.pin_pwm);
    return pds_pwm_reg_register(
        (uint32_t)ctx->settings.pin_pwm,
        ctx->settings.pwm_frequency_hz,
        PID_PWM_RESOLUTION_BITS,
        PDS_PWM_set_duty_percent,
        PDS_PWM_get_duty_percent,
        _label);
}

/* ------------------------------------------------------------------ */

esp_err_t pds_fb_pid_pwm_init(
    const pds_fb_pid_pwm_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    pid_pwm_ctx_t *ctx = calloc(1, sizeof(pid_pwm_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));

    esp_err_t ret = _apply_settings(ctx);
    if (ret != ESP_OK) { free(ctx); return ret; }

    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_pid_pwm_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    pid_pwm_ctx_t *ctx = (pid_pwm_ctx_t *)handle;

    /* Master enable + optional gate. */
    if (!ctx->settings.enabled) {
        /* Disabled → zero PWM and reset controller state immediately. */
        pds_fb_pid_pwm_safe_state(handle);
        return PDS_COMP_IDLE;
    }
    if (ctx->_enable_ptr && !(*ctx->_enable_ptr)) {
        /* Gate closed: zero output, hold integral. */
        if (ctx->settings.pin_pwm >= 0) {
            pds_pwm_reg_set_duty((uint32_t)ctx->settings.pin_pwm, 0u);
        }
        ctx->state.output_pct = 0.0f;
        return PDS_COMP_IDLE;
    }

    /* No process variable connected → idle. */
    if (!ctx->_pv_ptr) return PDS_COMP_IDLE;

    uint32_t now = _now_ms();
    if ((now - ctx->state.last_sample_tick) < ctx->settings.sample_interval_ms) {
        return PDS_COMP_ACTIVE;  /* not time yet, but output is still running */
    }
    ctx->state.last_sample_tick = now;

    float pv    = *ctx->_pv_ptr;
    float error = ctx->settings.setpoint - pv;
    if (ctx->settings.reverse_acting) error = -error;

    ctx->state.pv    = pv;
    ctx->state.error = error;

    /* Deadband. */
    if (error < ctx->settings.deadband && error > -ctx->settings.deadband) {
        ctx->state.in_deadband = true;
        /* Hold output, don't wind integral. */
        return PDS_COMP_ACTIVE;
    }
    ctx->state.in_deadband = false;

    /* Discrete PID (dt = sample_interval_ms / 1000). */
    float dt = (float)ctx->settings.sample_interval_ms / 1000.0f;

    ctx->state.integral += error * dt;

    /* Anti-windup: clamp integral contribution. */
    float max_integral = ctx->settings.output_max / (ctx->settings.ki > 0.0f ? ctx->settings.ki : 1.0f);
    if (ctx->state.integral >  max_integral) ctx->state.integral =  max_integral;
    if (ctx->state.integral < -max_integral) ctx->state.integral = -max_integral;

    float derivative = (dt > 0.0f) ? ((error - ctx->state.prev_error) / dt) : 0.0f;
    ctx->state.prev_error = error;

    float output = ctx->settings.kp * error
                 + ctx->settings.ki * ctx->state.integral
                 + ctx->settings.kd * derivative;

    /* Clamp to configured range. */
    if (output < ctx->settings.output_min) output = ctx->settings.output_min;
    if (output > ctx->settings.output_max) output = ctx->settings.output_max;

    ctx->state.output_pct = output;

    /* Derived count rate: linear with PID output over the active zone. */
    ctx->state.count_rate = (ctx->settings.count_rate_at_full > 0.0f)
        ? (output / 100.0f) * ctx->settings.count_rate_at_full
        : 0.0f;

    if (ctx->settings.pin_pwm >= 0) {
        pds_pwm_reg_set_duty((uint32_t)ctx->settings.pin_pwm, (uint32_t)output);
    }

    return PDS_COMP_ACTIVE;
}

esp_err_t pds_fb_pid_pwm_reset(pds_comp_handle_t handle)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    pid_pwm_ctx_t *ctx = (pid_pwm_ctx_t *)handle;
    ctx->state.integral   = 0.0f;
    ctx->state.prev_error = 0.0f;
    ctx->state.in_deadband = false;
    return ESP_OK;
}

esp_err_t pds_fb_pid_pwm_set_setpoint(pds_comp_handle_t handle, float setpoint)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    ((pid_pwm_ctx_t *)handle)->settings.setpoint = setpoint;
    return ESP_OK;
}

esp_err_t pds_fb_pid_pwm_connect_pv(
    pds_comp_handle_t handle, const float *pv_ptr)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    ((pid_pwm_ctx_t *)handle)->_pv_ptr = pv_ptr;
    return ESP_OK;
}

esp_err_t pds_fb_pid_pwm_connect_enable(
    pds_comp_handle_t handle, const bool *enable_ptr)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    ((pid_pwm_ctx_t *)handle)->_enable_ptr = enable_ptr;
    return ESP_OK;
}

const pds_fb_pid_pwm_state_t *pds_fb_pid_pwm_get_state(
    pds_comp_handle_t handle)
{
    if (!handle) return NULL;
    return &((pid_pwm_ctx_t *)handle)->state;
}

esp_err_t pds_fb_pid_pwm_get_settings(
    pds_comp_handle_t handle,
    pds_fb_pid_pwm_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((pid_pwm_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_pid_pwm_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_pid_pwm_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    pid_pwm_ctx_t *ctx = (pid_pwm_ctx_t *)handle;
    memcpy(&ctx->settings, settings, sizeof(*settings));
    return _apply_settings(ctx);
}

void pds_fb_pid_pwm_safe_state(pds_comp_handle_t handle)
{
    if (!handle) return;
    pid_pwm_ctx_t *ctx = (pid_pwm_ctx_t *)handle;
    ctx->state.integral    = 0.0f;
    ctx->state.prev_error  = 0.0f;
    ctx->state.in_deadband = false;
    ctx->state.output_pct  = 0.0f;
    ctx->state.count_rate  = 0.0f;
    if (ctx->settings.pin_pwm >= 0) {
        pds_pwm_reg_set_duty((uint32_t)ctx->settings.pin_pwm, 0u);
    }
}
