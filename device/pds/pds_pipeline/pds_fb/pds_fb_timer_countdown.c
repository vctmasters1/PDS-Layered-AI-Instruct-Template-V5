/**
 * PDS Component — Timer Countdown implementation
 */

#include "pds_fb_timer_countdown.h"
#include <stdlib.h>
#include <string.h>
#include "esp_timer.h"
#include "pds_tel_sink.h"

typedef struct {
    pds_fb_timer_countdown_settings_t settings;
    pds_fb_timer_countdown_state_t    state;
    const float *_trigger_ptr;   /**< Connected upstream float (>= 0.5 = rising-edge triggered) */
    bool        _prev_trigger;  /**< Edge detector state */
    uint32_t    _start_tick;    /**< Tick when current countdown began */
} timer_countdown_ctx_t;

static inline uint32_t _now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000LL);
}

static void _do_trigger(timer_countdown_ctx_t *ctx, uint32_t now)
{
    if (!ctx->settings.enabled) return;

    /* Cooldown guard (skip on first trigger). */
    if (ctx->state.trigger_count > 0 && ctx->settings.cooldown_ms > 0) {
        if ((now - ctx->state.last_trigger_tick) < ctx->settings.cooldown_ms) return;
    }

    /* Retrigger: only restart if allowed or not already active. */
    if (ctx->state.active && !ctx->settings.retrigger) return;

    ctx->_start_tick                = now;
    ctx->state.active               = true;
    ctx->state.active_f             = 100.0f;
    ctx->state.trigger_count++;
    ctx->state.last_trigger_tick    = now;
}

/* ------------------------------------------------------------------ */

esp_err_t pds_fb_timer_countdown_init(
    const pds_fb_timer_countdown_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    timer_countdown_ctx_t *ctx = calloc(1, sizeof(timer_countdown_ctx_t));
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
            .value    = &ctx->state.remaining_ms,
        },
    };
    snprintf(slot.label, sizeof(slot.label), "timer_countdown");
    pds_tel_sink_register(&slot);

    return ESP_OK;
}

pds_comp_status_t pds_fb_timer_countdown_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    timer_countdown_ctx_t *ctx = (timer_countdown_ctx_t *)handle;

    uint32_t now = _now_ms();

    /* Edge detection on connected trigger.
     * any_edge=false (default): rising edge only.
     * any_edge=true: any state change resets the countdown. */
    if (ctx->_trigger_ptr) {
        bool current = (*ctx->_trigger_ptr >= 0.5f);
        bool rising  = current  && !ctx->_prev_trigger;
        bool falling = !current && ctx->_prev_trigger;
        if (rising || (ctx->settings.any_edge && falling)) {
            _do_trigger(ctx, now);
        }
        ctx->_prev_trigger = current;
    }

    if (!ctx->state.active) return PDS_COMP_IDLE;

    uint32_t elapsed = now - ctx->_start_tick;

    if (elapsed >= ctx->settings.duration_ms) {
        ctx->state.active        = false;
        ctx->state.active_f      = 0.0f;
        ctx->state.remaining_ms  = 0;
        return PDS_COMP_IDLE;
    }

    ctx->state.remaining_ms = ctx->settings.duration_ms - elapsed;
    return PDS_COMP_ACTIVE;
}

esp_err_t pds_fb_timer_countdown_trigger(pds_comp_handle_t handle)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    timer_countdown_ctx_t *ctx = (timer_countdown_ctx_t *)handle;
    _do_trigger(ctx, _now_ms());
    return ESP_OK;
}

esp_err_t pds_fb_timer_countdown_cancel(pds_comp_handle_t handle)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    timer_countdown_ctx_t *ctx = (timer_countdown_ctx_t *)handle;
    ctx->state.active       = false;
    ctx->state.remaining_ms = 0;
    return ESP_OK;
}

esp_err_t pds_fb_timer_countdown_connect_trigger(
    pds_comp_handle_t handle, const float *trigger_ptr)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    timer_countdown_ctx_t *ctx = (timer_countdown_ctx_t *)handle;
    ctx->_trigger_ptr  = trigger_ptr;
    ctx->_prev_trigger = trigger_ptr ? (*trigger_ptr >= 0.5f) : false;
    return ESP_OK;
}

const pds_fb_timer_countdown_state_t *pds_fb_timer_countdown_get_state(
    pds_comp_handle_t handle)
{
    if (!handle) return NULL;
    return &((timer_countdown_ctx_t *)handle)->state;
}

esp_err_t pds_fb_timer_countdown_get_settings(
    pds_comp_handle_t handle,
    pds_fb_timer_countdown_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((timer_countdown_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_timer_countdown_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_timer_countdown_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    /* Preserve runtime state and connected pointer. */
    memcpy(&((timer_countdown_ctx_t *)handle)->settings, settings, sizeof(*settings));
    return ESP_OK;
}
