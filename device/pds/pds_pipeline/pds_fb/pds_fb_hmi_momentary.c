/**
 * PDS Function Block — HMI Momentary implementation
 *
 * Uses esp_timer for millisecond timestamps.
 * No critical section needed — pulse_ms expiry is checked once per pipeline tick.
 */

#include "pds_fb_hmi_momentary.h"
#include "esp_timer.h"
#include <stdlib.h>
#include <string.h>

typedef struct {
    pds_fb_hmi_momentary_settings_t settings;
    pds_fb_hmi_momentary_state_t    state;
    uint32_t _trigger_start_ms;  /**< esp_timer snapshot when trigger() was last called */
} hmi_momentary_ctx_t;

static inline uint32_t _now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000LL);
}

/* ------------------------------------------------------------------ */

esp_err_t pds_fb_hmi_momentary_init(
    const pds_fb_hmi_momentary_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    hmi_momentary_ctx_t *ctx = calloc(1, sizeof(hmi_momentary_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));
    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_hmi_momentary_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    hmi_momentary_ctx_t *ctx = (hmi_momentary_ctx_t *)handle;

    if (!ctx->settings.enabled || !ctx->state.triggered) {
        ctx->state.active_f = 0.0f;
        return PDS_COMP_IDLE;
    }

    uint32_t elapsed = _now_ms() - ctx->_trigger_start_ms;
    if (elapsed < ctx->settings.pulse_ms) {
        ctx->state.active_f = 100.0f;
        return PDS_COMP_ACTIVE;
    }

    /* Pulse expired */
    ctx->state.triggered = false;
    ctx->state.active_f  = 0.0f;
    return PDS_COMP_IDLE;
}

esp_err_t pds_fb_hmi_momentary_trigger(pds_comp_handle_t handle)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    hmi_momentary_ctx_t *ctx = (hmi_momentary_ctx_t *)handle;

    if (!ctx->settings.enabled) return ESP_OK;

    ctx->_trigger_start_ms     = _now_ms();
    ctx->state.triggered       = true;
    ctx->state.last_trigger_ms = ctx->_trigger_start_ms;
    ctx->state.trigger_count++;
    return ESP_OK;
}

const pds_fb_hmi_momentary_state_t *pds_fb_hmi_momentary_get_state(pds_comp_handle_t handle)
{
    return handle ? &((hmi_momentary_ctx_t *)handle)->state : NULL;
}

esp_err_t pds_fb_hmi_momentary_get_settings(
    pds_comp_handle_t handle,
    pds_fb_hmi_momentary_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((hmi_momentary_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_hmi_momentary_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_hmi_momentary_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    memcpy(&((hmi_momentary_ctx_t *)handle)->settings, settings, sizeof(*settings));
    return ESP_OK;
}
