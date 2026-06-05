/**
 * PDS Function Block — TMC2209 Stepper Driver implementation
 *
 * GPIO step generation identical to the A4988 implementation.
 * When pin_uart >= 0, the TMC2209 is configured at init via its single-wire
 * UART interface (half-duplex, 115200 baud).
 *
 * TMC2209 UART write packet format (11 bytes):
 *   [0x05] [node_addr] [reg | 0x80] [data3] [data2] [data1] [data0] [crc]
 *
 * Registers written at init:
 *   GCONF     (0x00) — en_SpreadCycle bit for StealthChop/SpreadCycle selection
 *   IHOLD_IRUN (0x10) — run/hold current, hold delay
 *   CHOPCONF  (0x6C) — MRES field for microstep resolution
 */

#include "pds_fb_stepper_tmc2209.h"
#include "pds_gpio.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "esp_timer.h"
#include "driver/uart.h"
#include "rom/ets_sys.h"

/* ── TMC2209 register addresses ─────────────────────────────────────────── */
#define TMC_REG_GCONF       0x00u
#define TMC_REG_IHOLD_IRUN  0x10u
#define TMC_REG_CHOPCONF    0x6Cu

/* ── TMC UART port used for configuration ─────────────────────────────── */
#define TMC_UART_NUM        UART_NUM_1
#define TMC_UART_BAUD       115200

/* ── CRC-8 for TMC UART packets ─────────────────────────────────────────── */
static uint8_t _tmc_crc8(const uint8_t *data, uint8_t len)
{
    uint8_t crc = 0;
    for (uint8_t i = 0; i < len; i++) {
        uint8_t b = data[i];
        for (uint8_t j = 0; j < 8; j++) {
            if ((crc ^ b) & 0x01u) crc = (uint8_t)((crc >> 1) ^ 0x8Cu);
            else                   crc >>= 1;
            b >>= 1;
        }
    }
    return crc;
}

/**
 * Send one write datagram to the TMC2209 (8 bytes total).
 * Single-wire: we TX then immediately RX the echo and discard it.
 */
static esp_err_t _tmc_write_reg(uart_port_t port, uint8_t node, uint8_t reg, uint32_t value)
{
    uint8_t buf[8];
    buf[0] = 0x05u;           /* sync + reserved nibble */
    buf[1] = node & 0x03u;
    buf[2] = reg | 0x80u;     /* write flag */
    buf[3] = (uint8_t)((value >> 24) & 0xFFu);
    buf[4] = (uint8_t)((value >> 16) & 0xFFu);
    buf[5] = (uint8_t)((value >>  8) & 0xFFu);
    buf[6] = (uint8_t)( value        & 0xFFu);
    buf[7] = _tmc_crc8(buf, 7);

    uart_write_bytes(port, (const char *)buf, sizeof(buf));
    uart_wait_tx_done(port, pdMS_TO_TICKS(10));

    /* Discard echo bytes (single-wire shares TX/RX line) */
    uint8_t echo[8];
    uart_read_bytes(port, echo, sizeof(echo), pdMS_TO_TICKS(5));
    return ESP_OK;
}

/**
 * Map microstep divisor → TMC MRES field value (CHOPCONF bits 27:24).
 * TMC2209 stores it as: MRES = log2(256 / divisor)
 *   divisor  MRES
 *     256      0
 *     128      1
 *      64      2
 *      32      3
 *      16      4
 *       8      5
 *       4      6
 *       2      7
 *       1      8
 */
static uint32_t _mres(uint16_t divisor)
{
    if (divisor >= 256) return 0;
    if (divisor >= 128) return 1;
    if (divisor >= 64)  return 2;
    if (divisor >= 32)  return 3;
    if (divisor >= 16)  return 4;
    if (divisor >= 8)   return 5;
    if (divisor >= 4)   return 6;
    if (divisor >= 2)   return 7;
    return 8; /* full step */
}

/** Clamp current to 0-31 RMS register scale (driver is ~2.8 A max, ~90 mA per count) */
static uint8_t _current_to_irun(uint16_t ma)
{
    /* Conservative: 31 counts ≈ 2000 mA for a typical 2 A driver */
    uint32_t v = ((uint32_t)ma * 31u) / 2000u;
    if (v > 31u) v = 31u;
    return (uint8_t)v;
}

/* ── Internal context ────────────────────────────────────────────────────── */
typedef struct {
    pds_fb_stepper_tmc2209_settings_t settings;
    pds_fb_stepper_tmc2209_state_t    state;
    const float *pv_speed;
    const bool  *pv_enable;
    esp_timer_handle_t step_timer;
    uint32_t last_run_tick;
} stepper_tmc2209_ctx_t;

static inline uint32_t _now_ms(void) { return (uint32_t)(esp_timer_get_time() / 1000LL); }

static void _stop(stepper_tmc2209_ctx_t *ctx)
{
    esp_timer_stop(ctx->step_timer);
    ctx->state.running = false;
    if (ctx->settings.pin_enable >= 0)
        PDS_GPIO_write((uint32_t)ctx->settings.pin_enable, 1);
}

static void _set_period_us(stepper_tmc2209_ctx_t *ctx, float abs_rpm)
{
    if (abs_rpm < 0.01f || ctx->settings.pin_step < 0) { _stop(ctx); return; }
    if (ctx->settings.pin_enable >= 0)
        PDS_GPIO_write((uint32_t)ctx->settings.pin_enable, 0);

    uint16_t div = ctx->settings.microstep_divisor;
    if (div == 0) div = 16;
    uint32_t sps = (uint32_t)(abs_rpm * (float)ctx->settings.steps_per_rev * (float)div / 60.0f);
    if (sps == 0) { _stop(ctx); return; }
    uint64_t period_us = 1000000ULL / sps;
    if (period_us < 4) period_us = 4;

    esp_timer_stop(ctx->step_timer);
    esp_timer_start_periodic(ctx->step_timer, period_us);
    ctx->state.running = true;
}

static void _step_cb(void *arg)
{
    stepper_tmc2209_ctx_t *ctx = (stepper_tmc2209_ctx_t *)arg;
    PDS_GPIO_write((uint32_t)ctx->settings.pin_step, 1);
    ets_delay_us(2);
    PDS_GPIO_write((uint32_t)ctx->settings.pin_step, 0);
    ctx->state.step_count++;
}

/** Initialise UART and push the three configuration registers. */
static void _tmc_uart_init(stepper_tmc2209_ctx_t *ctx)
{
    if (ctx->settings.pin_uart < 0) return;

    const uart_config_t ucfg = {
        .baud_rate  = TMC_UART_BAUD,
        .data_bits  = UART_DATA_8_BITS,
        .parity     = UART_PARITY_DISABLE,
        .stop_bits  = UART_STOP_BITS_1,
        .flow_ctrl  = UART_HW_FLOWCTRL_DISABLE,
    };
    /* Install UART driver — ignore errors if already installed */
    uart_driver_install(TMC_UART_NUM, 256, 0, 0, NULL, 0);
    uart_param_config(TMC_UART_NUM, &ucfg);
    /* Single-wire: both TX and RX on pin_uart */
    uart_set_pin(TMC_UART_NUM,
                 (int)ctx->settings.pin_uart, /* TX */
                 (int)ctx->settings.pin_uart, /* RX */
                 UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);

    uint8_t node = ctx->settings.uart_addr & 0x03u;

    /* GCONF: en_SpreadCycle bit is bit 2 */
    uint32_t gconf = ctx->settings.stealthchop ? 0x00000000u : 0x00000004u;
    _tmc_write_reg(TMC_UART_NUM, node, TMC_REG_GCONF, gconf);

    /* IHOLD_IRUN: [20:16]=IRUN, [12:8]=IHOLD, [3:0]=IHOLDDELAY */
    uint8_t irun  = _current_to_irun(ctx->settings.run_current_ma);
    uint8_t ihold = _current_to_irun(ctx->settings.hold_current_ma);
    uint32_t ihold_irun = ((uint32_t)irun << 8) | ((uint32_t)ihold) | (6u << 16);
    _tmc_write_reg(TMC_UART_NUM, node, TMC_REG_IHOLD_IRUN, ihold_irun);

    /* CHOPCONF: default 0x10000053, set MRES field [27:24] */
    uint32_t chopconf = 0x10000053u;
    chopconf &= ~(0x0Fu << 24);
    chopconf |= (_mres(ctx->settings.microstep_divisor) << 24);
    _tmc_write_reg(TMC_UART_NUM, node, TMC_REG_CHOPCONF, chopconf);

    ctx->state.uart_configured = true;
}

static esp_err_t _configure_pins(const stepper_tmc2209_ctx_t *ctx)
{
    const pds_fb_stepper_tmc2209_settings_t *s = &ctx->settings;
#define CFG_OUT(pin) do { \
    if ((pin) >= 0) { \
        esp_err_t r = PDS_GPIO_configure((uint32_t)(pin), PDS_GPIO_MODE_OUTPUT, PDS_GPIO_PULL_NONE); \
        if (r != ESP_OK) return r; \
    } \
} while (0)
    CFG_OUT(s->pin_step);
    CFG_OUT(s->pin_dir);
    CFG_OUT(s->pin_enable);
#undef CFG_OUT
    if (s->pin_step >= 0)   PDS_GPIO_write((uint32_t)s->pin_step, 0);
    if (s->pin_dir >= 0)    PDS_GPIO_write((uint32_t)s->pin_dir, 0);
    if (s->pin_enable >= 0) PDS_GPIO_write((uint32_t)s->pin_enable, 1);
    return ESP_OK;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Public API
   ═══════════════════════════════════════════════════════════════════════════ */

esp_err_t pds_fb_stepper_tmc2209_init(
    const pds_fb_stepper_tmc2209_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;
    stepper_tmc2209_ctx_t *ctx = calloc(1, sizeof(stepper_tmc2209_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;
    memcpy(&ctx->settings, settings, sizeof(ctx->settings));
    if (ctx->settings.steps_per_rev == 0)    ctx->settings.steps_per_rev = 200;
    if (ctx->settings.microstep_divisor == 0) ctx->settings.microstep_divisor = 16;

    esp_err_t ret = _configure_pins(ctx);
    if (ret != ESP_OK) { free(ctx); return ret; }

    _tmc_uart_init(ctx);

    const esp_timer_create_args_t ta = {
        .callback = _step_cb, .arg = ctx,
        .dispatch_method = ESP_TIMER_TASK, .name = "stepper_tmc2209",
    };
    ret = esp_timer_create(&ta, &ctx->step_timer);
    if (ret != ESP_OK) { free(ctx); return ret; }

    ctx->last_run_tick = _now_ms();
    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_stepper_tmc2209_run(pds_comp_handle_t handle)
{
    stepper_tmc2209_ctx_t *ctx = (stepper_tmc2209_ctx_t *)handle;
    if (!ctx) return PDS_COMP_ERROR;

    uint32_t now = _now_ms();
    float dt_s = (float)(now - ctx->last_run_tick) / 1000.0f;
    if (dt_s <= 0.0f) dt_s = 0.001f;
    ctx->last_run_tick = now;

    bool sw_enable = ctx->pv_enable ? *ctx->pv_enable : true;
    if (!ctx->settings.enabled || !sw_enable) {
        _stop(ctx);
        ctx->state.current_rpm = 0.0f;
        ctx->state.target_rpm  = 0.0f;
        return PDS_COMP_ACTIVE;
    }

    float target = ctx->pv_speed ? *ctx->pv_speed : 0.0f;
    float max = ctx->settings.max_rpm > 0.0f ? ctx->settings.max_rpm : 300.0f;
    if (target >  max) target =  max;
    if (target < -max) target = -max;
    ctx->state.target_rpm = target;

    float cur = ctx->state.current_rpm;
    if (ctx->settings.accel_rpm_s > 0.0f) {
        float step = ctx->settings.accel_rpm_s * dt_s;
        if (fabsf(target - cur) <= step) cur = target;
        else cur += (target > cur) ? step : -step;
    } else { cur = target; }
    ctx->state.current_rpm = cur;

    if (ctx->settings.pin_dir >= 0) {
        bool fwd = (cur >= 0.0f) != ctx->settings.invert_dir;
        PDS_GPIO_write((uint32_t)ctx->settings.pin_dir, fwd ? 1 : 0);
    }
    _set_period_us(ctx, fabsf(cur));
    return PDS_COMP_ACTIVE;
}

esp_err_t pds_fb_stepper_tmc2209_stop(pds_comp_handle_t handle)
{
    stepper_tmc2209_ctx_t *ctx = (stepper_tmc2209_ctx_t *)handle;
    if (!ctx) return ESP_ERR_INVALID_ARG;
    _stop(ctx);
    ctx->state.current_rpm = 0.0f;
    return ESP_OK;
}

esp_err_t pds_fb_stepper_tmc2209_connect_speed(pds_comp_handle_t handle, const float *speed_ptr)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    ((stepper_tmc2209_ctx_t *)handle)->pv_speed = speed_ptr;
    return ESP_OK;
}

esp_err_t pds_fb_stepper_tmc2209_connect_enable(pds_comp_handle_t handle, const bool *enable_ptr)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    ((stepper_tmc2209_ctx_t *)handle)->pv_enable = enable_ptr;
    return ESP_OK;
}

const pds_fb_stepper_tmc2209_state_t *pds_fb_stepper_tmc2209_get_state(pds_comp_handle_t handle)
{
    return &((stepper_tmc2209_ctx_t *)handle)->state;
}

esp_err_t pds_fb_stepper_tmc2209_get_settings(
    pds_comp_handle_t handle, pds_fb_stepper_tmc2209_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((stepper_tmc2209_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_stepper_tmc2209_set_settings(
    pds_comp_handle_t handle, const pds_fb_stepper_tmc2209_settings_t *settings)
{
    stepper_tmc2209_ctx_t *ctx = (stepper_tmc2209_ctx_t *)handle;
    if (!ctx || !settings) return ESP_ERR_INVALID_ARG;
    _stop(ctx);
    memcpy(&ctx->settings, settings, sizeof(ctx->settings));
    if (ctx->settings.steps_per_rev == 0)    ctx->settings.steps_per_rev = 200;
    if (ctx->settings.microstep_divisor == 0) ctx->settings.microstep_divisor = 16;
    _configure_pins(ctx);
    _tmc_uart_init(ctx);
    return ESP_OK;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TMC2209 — Position Mode
   Context mirrors the first 6 members of stepper_tmc2209_ctx_t exactly so
   _configure_pins() and _tmc_uart_init() can be called via safe cast.
   ═══════════════════════════════════════════════════════════════════════════ */

typedef struct {
    pds_fb_stepper_tmc2209_settings_t         settings;   /* [0] matches velocity ctx */
    pds_fb_stepper_tmc2209_state_t            vel_state;  /* [1] for _tmc_uart_init cast */
    const float                              *pv_speed;   /* [2] unused */
    const bool                               *pv_enable;  /* [3] unused */
    esp_timer_handle_t                        step_timer; /* [4] matches velocity ctx */
    uint32_t                                  last_run_tick; /* [5] unused */
    /* Position-mode specific */
    volatile int32_t                          steps_remaining;
    const float                              *pv_target;
    const float                              *pv_trigger;
    float                                     prev_trigger;
    pds_fb_stepper_tmc2209_position_state_t   state;
} stepper_tmc2209_pos_ctx_t;

static void _pos_step_cb_tmc2209(void *arg)
{
    stepper_tmc2209_pos_ctx_t *ctx = (stepper_tmc2209_pos_ctx_t *)arg;
    if (ctx->steps_remaining > 0) {
        PDS_GPIO_write((uint32_t)ctx->settings.pin_step, 1);
        ets_delay_us(2);
        PDS_GPIO_write((uint32_t)ctx->settings.pin_step, 0);
        ctx->steps_remaining--;
    }
}

static void _pos_stop_tmc2209(stepper_tmc2209_pos_ctx_t *ctx)
{
    esp_timer_stop(ctx->step_timer);
    ctx->state.moving = false;
    ctx->state.steps_remaining = 0;
    if (ctx->settings.pin_enable >= 0)
        PDS_GPIO_write((uint32_t)ctx->settings.pin_enable, 1);
}

static void _pos_start_tmc2209(stepper_tmc2209_pos_ctx_t *ctx, int32_t target_steps)
{
    int32_t abs_steps = target_steps < 0 ? -target_steps : target_steps;
    if (abs_steps == 0 || ctx->settings.pin_step < 0) return;
    if (ctx->settings.pin_dir >= 0) {
        bool fwd = (target_steps >= 0) != ctx->settings.invert_dir;
        PDS_GPIO_write((uint32_t)ctx->settings.pin_dir, fwd ? 1 : 0);
    }
    if (ctx->settings.pin_enable >= 0)
        PDS_GPIO_write((uint32_t)ctx->settings.pin_enable, 0);
    float move_rpm = ctx->settings.max_rpm > 0.0f ? ctx->settings.max_rpm : 30.0f;
    uint16_t div = ctx->settings.microstep_divisor;
    if (div == 0) div = 16;
    uint32_t sps = (uint32_t)(move_rpm * (float)ctx->settings.steps_per_rev * (float)div / 60.0f);
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

esp_err_t pds_fb_stepper_tmc2209_position_init(
    const pds_fb_stepper_tmc2209_position_settings_t *settings, pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;
    stepper_tmc2209_pos_ctx_t *ctx = calloc(1, sizeof(stepper_tmc2209_pos_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;
    memcpy(&ctx->settings, settings, sizeof(ctx->settings));
    if (ctx->settings.steps_per_rev == 0)    ctx->settings.steps_per_rev = 200;
    if (ctx->settings.microstep_divisor == 0) ctx->settings.microstep_divisor = 16;
    esp_err_t ret = _configure_pins((const stepper_tmc2209_ctx_t *)ctx);
    if (ret != ESP_OK) { free(ctx); return ret; }
    _tmc_uart_init((stepper_tmc2209_ctx_t *)ctx);
    const esp_timer_create_args_t ta = {
        .callback = _pos_step_cb_tmc2209, .arg = ctx,
        .dispatch_method = ESP_TIMER_TASK, .name = "stepper_tmc2209_pos",
    };
    ret = esp_timer_create(&ta, &ctx->step_timer);
    if (ret != ESP_OK) { free(ctx); return ret; }
    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_stepper_tmc2209_position_run(pds_comp_handle_t handle)
{
    stepper_tmc2209_pos_ctx_t *ctx = (stepper_tmc2209_pos_ctx_t *)handle;
    if (!ctx) return PDS_COMP_ERROR;
    ctx->state.done_f = 0.0f;
    float trig = ctx->pv_trigger ? *ctx->pv_trigger : 0.0f;
    bool rising = (trig >= 0.5f) && (ctx->prev_trigger < 0.5f);
    ctx->prev_trigger = trig;
    if (!ctx->settings.enabled) { if (ctx->state.moving) _pos_stop_tmc2209(ctx); return PDS_COMP_ACTIVE; }
    if (ctx->state.moving && ctx->steps_remaining <= 0) {
        _pos_stop_tmc2209(ctx); ctx->state.done_f = 1.0f;
    }
    ctx->state.steps_remaining = ctx->steps_remaining;
    if (rising && !ctx->state.moving) {
        int32_t target = ctx->pv_target ? (int32_t)(*ctx->pv_target) : 0;
        if (target != 0) _pos_start_tmc2209(ctx, target);
    }
    return PDS_COMP_ACTIVE;
}

esp_err_t pds_fb_stepper_tmc2209_position_stop(pds_comp_handle_t handle)
{ stepper_tmc2209_pos_ctx_t *ctx = (stepper_tmc2209_pos_ctx_t *)handle;
  if (!ctx) return ESP_ERR_INVALID_ARG; _pos_stop_tmc2209(ctx); return ESP_OK; }

esp_err_t pds_fb_stepper_tmc2209_position_connect_target(pds_comp_handle_t handle, const float *p)
{ stepper_tmc2209_pos_ctx_t *ctx = (stepper_tmc2209_pos_ctx_t *)handle;
  if (!ctx) return ESP_ERR_INVALID_ARG; ctx->pv_target = p; return ESP_OK; }

esp_err_t pds_fb_stepper_tmc2209_position_connect_trigger(pds_comp_handle_t handle, const float *p)
{ stepper_tmc2209_pos_ctx_t *ctx = (stepper_tmc2209_pos_ctx_t *)handle;
  if (!ctx) return ESP_ERR_INVALID_ARG; ctx->pv_trigger = p; return ESP_OK; }

const pds_fb_stepper_tmc2209_position_state_t *pds_fb_stepper_tmc2209_position_get_state(
    pds_comp_handle_t handle)
{ return &((stepper_tmc2209_pos_ctx_t *)handle)->state; }

esp_err_t pds_fb_stepper_tmc2209_position_get_settings(
    pds_comp_handle_t handle, pds_fb_stepper_tmc2209_settings_t *out)
{ if (!handle||!out) return ESP_ERR_INVALID_ARG;
  memcpy(out,&((stepper_tmc2209_pos_ctx_t *)handle)->settings,sizeof(*out)); return ESP_OK; }

esp_err_t pds_fb_stepper_tmc2209_position_set_settings(
    pds_comp_handle_t handle, const pds_fb_stepper_tmc2209_settings_t *settings)
{ stepper_tmc2209_pos_ctx_t *ctx = (stepper_tmc2209_pos_ctx_t *)handle;
  if (!ctx||!settings) return ESP_ERR_INVALID_ARG;
  _pos_stop_tmc2209(ctx); memcpy(&ctx->settings,settings,sizeof(ctx->settings));
  if (ctx->settings.steps_per_rev==0)    ctx->settings.steps_per_rev=200;
  if (ctx->settings.microstep_divisor==0) ctx->settings.microstep_divisor=16;
  _configure_pins((const stepper_tmc2209_ctx_t *)ctx);
  _tmc_uart_init((stepper_tmc2209_ctx_t *)ctx); return ESP_OK; }
