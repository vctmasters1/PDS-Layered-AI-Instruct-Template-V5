/**
 * PDS Component — Timer Cycle (timer_cycle)
 *
 * Generates a repeating on/off signal with no GPIO output.
 * state.active is the chainable bool — connect downstream components
 * via their _connect_enable() or _connect_signal() API.
 *
 * HAL dependencies: none (esp_timer only)
 */

#include "pds_fb_timer_cycle.h"
#include <stdlib.h>
#include <string.h>
#include "esp_timer.h"
#include "esp_log.h"
#include "pds_tel_sink.h"

static const char *TAG = "timer_cycle";

typedef struct {
    pds_fb_timer_cycle_settings_t settings;
    pds_fb_timer_cycle_state_t    state;
} timer_cycle_ctx_t;

static inline uint32_t _now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000LL);
}

/* ------------------------------------------------------------------ */

esp_err_t pds_fb_timer_cycle_init(
    const pds_fb_timer_cycle_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    timer_cycle_ctx_t *ctx = calloc(1, sizeof(timer_cycle_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));
    *out_handle = (pds_comp_handle_t)ctx;

    /* Register live-state pointers with the telemetry sink. */
    pds_tel_slot_t slot = {
        .kind  = PDS_TEL_TIMER,
        .pin   = 0,
        .timer = {
            .active     = &ctx->state.active,
            .active_f   = &ctx->state.active_f,
            .value      = &ctx->state.cycle_count,
            .elapsed_ms = &ctx->state.elapsed_ms,
        },
    };
    snprintf(slot.label, sizeof(slot.label), "timer_cycle");
    pds_tel_sink_register(&slot);

    return ESP_OK;
}

pds_comp_status_t pds_fb_timer_cycle_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    timer_cycle_ctx_t *ctx = (timer_cycle_ctx_t *)handle;

    if (!ctx->settings.enabled) {
        ctx->state.active     = false;
        ctx->state.elapsed_ms = 0;
        return PDS_COMP_IDLE;
    }

    uint32_t now = _now_ms();

    /* First call: arm initial delay. */
    if (!ctx->state.initialized) {
        ctx->state.initialized      = true;
        ctx->state.next_toggle_tick = now + ctx->settings.initial_delay_ms;
        ctx->state.elapsed_ms       = 0;
        return PDS_COMP_IDLE;
    }

    /* Update elapsed_ms: how long we have been in the current phase. */
    {
        uint32_t phase_dur   = ctx->state.active ? ctx->settings.on_duration_ms
                                                 : ctx->settings.off_duration_ms;
        uint32_t phase_start = ctx->state.next_toggle_tick - phase_dur;
        ctx->state.elapsed_ms = now - phase_start;
    }

    if ((int32_t)(now - ctx->state.next_toggle_tick) < 0) return PDS_COMP_IDLE;

    if (ctx->state.active) {
        /* ON → OFF */
        ctx->state.active           = false;
        ctx->state.active_f         = 0.0f;
        ctx->state.total_on_ms     += ctx->settings.on_duration_ms;
        ctx->state.next_toggle_tick = now + ctx->settings.off_duration_ms;
        ESP_LOGI(TAG, "OFF  (cycle #%"PRIu32"  on_total=%"PRIu32"ms)",
                 ctx->state.cycle_count, ctx->state.total_on_ms);
    } else {
        /* OFF → ON: check budget */
        if (ctx->settings.max_on_count > 0 &&
            ctx->state.cycle_count >= ctx->settings.max_on_count) {
            return PDS_COMP_IDLE;
        }
        ctx->state.active           = true;
        ctx->state.active_f         = 100.0f;
        ctx->state.cycle_count++;
        ctx->state.next_toggle_tick = now + ctx->settings.on_duration_ms;
        ESP_LOGI(TAG, "ON   (cycle #%"PRIu32")", ctx->state.cycle_count);
    }

    return PDS_COMP_ACTIVE;
}

esp_err_t pds_fb_timer_cycle_force(pds_comp_handle_t handle, bool active)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    timer_cycle_ctx_t *ctx = (timer_cycle_ctx_t *)handle;

    ctx->state.active = active;
    uint32_t now = _now_ms();
    ctx->state.next_toggle_tick = now + (active ? ctx->settings.on_duration_ms
                                                 : ctx->settings.off_duration_ms);
    return ESP_OK;
}

const pds_fb_timer_cycle_state_t *pds_fb_timer_cycle_get_state(
    pds_comp_handle_t handle)
{
    if (!handle) return NULL;
    return &((timer_cycle_ctx_t *)handle)->state;
}

esp_err_t pds_fb_timer_cycle_get_settings(
    pds_comp_handle_t handle,
    pds_fb_timer_cycle_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((timer_cycle_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_timer_cycle_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_timer_cycle_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    memcpy(&((timer_cycle_ctx_t *)handle)->settings, settings, sizeof(*settings));
    return ESP_OK;
}
