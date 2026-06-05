/**
 * PDS Component — Timer Countup implementation
 */

#include "pds_fb_timer_countup.h"
#include <stdlib.h>
#include <string.h>
#include "esp_timer.h"
#include "pds_tel_sink.h"

typedef struct {
    pds_fb_timer_countup_settings_t settings;
    pds_fb_timer_countup_state_t    state;
    const float *_trigger_ptr;   /**< Connected upstream float (>= 0.5 = active) */
    bool        _prev_trigger;  /**< Edge detector (EVENTS mode) */
    uint32_t    _hold_start;    /**< When trigger went true (HOLD_TIME mode) */
} timer_countup_ctx_t;

static inline uint32_t _now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000LL);
}

/* ------------------------------------------------------------------ */

esp_err_t pds_fb_timer_countup_init(
    const pds_fb_timer_countup_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    timer_countup_ctx_t *ctx = calloc(1, sizeof(timer_countup_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));
    *out_handle = (pds_comp_handle_t)ctx;

    /* Register live-state pointers with the telemetry sink. */
    pds_tel_slot_t slot = {
        .kind  = PDS_TEL_TIMER,
        .pin   = 0,
        .timer = {
            .active   = &ctx->state.active,
            .active_f = &ctx->state.active_f,
            .value    = &ctx->state.current_count,
        },
    };
    snprintf(slot.label, sizeof(slot.label), "timer_countup");
    pds_tel_sink_register(&slot);

    return ESP_OK;
}

pds_comp_status_t pds_fb_timer_countup_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    timer_countup_ctx_t *ctx = (timer_countup_ctx_t *)handle;

    if (!ctx->settings.enabled) return PDS_COMP_IDLE;
    if (!ctx->_trigger_ptr)     return PDS_COMP_IDLE;

    uint32_t now     = _now_ms();
    bool     current = (*ctx->_trigger_ptr >= 0.5f);

    if (ctx->settings.mode == PDS_TIMER_COUNTUP_EVENTS) {
        /* Rising edge increments counter. */
        if (current && !ctx->_prev_trigger) {
            ctx->state.current_count++;
        }
    } else {
        /* HOLD_TIME_MS: accumulate while trigger is held true. */
        if (current) {
            if (!ctx->_prev_trigger) {
                ctx->_hold_start = now;   /* started holding */
            }
            ctx->state.current_count += (now - ctx->_hold_start);
            ctx->_hold_start = now;       /* advance for next call */
        }
    }
    ctx->_prev_trigger = current;

    /* Check threshold. */
    if (!ctx->state.threshold_reached &&
        ctx->state.current_count >= ctx->settings.threshold) {
        ctx->state.threshold_reached = true;
        ctx->state.active            = true;
        ctx->state.active_f          = 100.0f;
        ctx->state.activate_tick     = now;

        if (ctx->settings.auto_reset) {
            ctx->state.current_count     = 0;
            ctx->state.threshold_reached = false;
        }
    }

    /* hold_duration: de-activate after timeout (0 = latched). */
    if (ctx->state.active && ctx->settings.hold_duration_ms > 0) {
        if ((now - ctx->state.activate_tick) >= ctx->settings.hold_duration_ms) {
            ctx->state.active   = false;
            ctx->state.active_f = 0.0f;
        }
    }

    return ctx->state.active ? PDS_COMP_ACTIVE : PDS_COMP_IDLE;
}

esp_err_t pds_fb_timer_countup_reset(pds_comp_handle_t handle)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    timer_countup_ctx_t *ctx = (timer_countup_ctx_t *)handle;
    ctx->state.current_count     = 0;
    ctx->state.threshold_reached = false;
    ctx->state.active            = false;
    return ESP_OK;
}

esp_err_t pds_fb_timer_countup_connect_trigger(
    pds_comp_handle_t handle, const float *trigger_ptr)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    timer_countup_ctx_t *ctx = (timer_countup_ctx_t *)handle;
    ctx->_trigger_ptr  = trigger_ptr;
    ctx->_prev_trigger = trigger_ptr ? (*trigger_ptr >= 0.5f) : false;
    ctx->_hold_start   = (uint32_t)(esp_timer_get_time() / 1000LL);
    return ESP_OK;
}

const pds_fb_timer_countup_state_t *pds_fb_timer_countup_get_state(
    pds_comp_handle_t handle)
{
    if (!handle) return NULL;
    return &((timer_countup_ctx_t *)handle)->state;
}

esp_err_t pds_fb_timer_countup_get_settings(
    pds_comp_handle_t handle,
    pds_fb_timer_countup_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((timer_countup_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_timer_countup_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_timer_countup_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    memcpy(&((timer_countup_ctx_t *)handle)->settings, settings, sizeof(*settings));
    return ESP_OK;
}
