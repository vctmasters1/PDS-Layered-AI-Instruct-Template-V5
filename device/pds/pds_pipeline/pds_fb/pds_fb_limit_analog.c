/**
 * PDS Component — Analog Limit implementation
 */

#include "pds_fb_limit_analog.h"
#include <stdlib.h>
#include <string.h>
#include "esp_timer.h"

typedef struct {
    pds_fb_limit_analog_settings_t settings;
    pds_fb_limit_analog_state_t    state;
    const float *_pv_ptr;   /**< Connected upstream float */
} analog_limit_ctx_t;

static inline uint32_t _now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000LL);
}

/* ------------------------------------------------------------------ */

esp_err_t pds_fb_limit_analog_init(
    const pds_fb_limit_analog_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    analog_limit_ctx_t *ctx = calloc(1, sizeof(analog_limit_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));
    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_limit_analog_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    analog_limit_ctx_t *ctx = (analog_limit_ctx_t *)handle;

    if (!ctx->settings.enabled || !ctx->_pv_ptr) return PDS_COMP_IDLE;

    float pv = *ctx->_pv_ptr;
    ctx->state.pv = pv;

    bool was_tripped = ctx->state.tripped;
    bool now_tripped;

    if (ctx->settings.trip_on_high) {
        /* Trip when pv > threshold; clear when pv < (threshold - hysteresis) */
        if (!was_tripped) {
            now_tripped = (pv > ctx->settings.threshold);
        } else {
            now_tripped = (pv > (ctx->settings.threshold - ctx->settings.hysteresis));
        }
    } else {
        /* Trip when pv < threshold; clear when pv > (threshold + hysteresis) */
        if (!was_tripped) {
            now_tripped = (pv < ctx->settings.threshold);
        } else {
            now_tripped = (pv < (ctx->settings.threshold + ctx->settings.hysteresis));
        }
    }

    /* Rising edge on tripped. */
    if (now_tripped && !was_tripped) {
        ctx->state.trip_count++;
        ctx->state.last_trip_tick = _now_ms();
    }

    ctx->state.tripped      = now_tripped;
    ctx->state.tripped_f    = now_tripped ? 1.0f : 0.0f;
    ctx->state.alarm_active = ctx->settings.alarm_enabled && now_tripped;

    return now_tripped ? PDS_COMP_ACTIVE : PDS_COMP_IDLE;
}

esp_err_t pds_fb_limit_analog_reset(pds_comp_handle_t handle)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    ((analog_limit_ctx_t *)handle)->state.trip_count = 0;
    return ESP_OK;
}

esp_err_t pds_fb_limit_analog_connect_pv(
    pds_comp_handle_t handle, const float *pv_ptr)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    ((analog_limit_ctx_t *)handle)->_pv_ptr = pv_ptr;
    return ESP_OK;
}

const pds_fb_limit_analog_state_t *pds_fb_limit_analog_get_state(
    pds_comp_handle_t handle)
{
    if (!handle) return NULL;
    return &((analog_limit_ctx_t *)handle)->state;
}

esp_err_t pds_fb_limit_analog_get_settings(
    pds_comp_handle_t handle,
    pds_fb_limit_analog_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((analog_limit_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_limit_analog_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_limit_analog_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    memcpy(&((analog_limit_ctx_t *)handle)->settings, settings, sizeof(*settings));
    return ESP_OK;
}
