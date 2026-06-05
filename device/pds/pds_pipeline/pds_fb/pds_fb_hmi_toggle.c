/**
 * PDS Function Block — HMI Toggle implementation
 *
 * No HAL interaction — pure logic block.
 * run() mirrors settings.value → state.active_f each tick.
 */

#include "pds_fb_hmi_toggle.h"
#include <stdlib.h>
#include <string.h>

typedef struct {
    pds_fb_hmi_toggle_settings_t settings;
    pds_fb_hmi_toggle_state_t    state;
} hmi_toggle_ctx_t;

/* ------------------------------------------------------------------ */

esp_err_t pds_fb_hmi_toggle_init(
    const pds_fb_hmi_toggle_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    hmi_toggle_ctx_t *ctx = calloc(1, sizeof(hmi_toggle_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));
    ctx->state.active_f = (settings->enabled && settings->value) ? 100.0f : 0.0f;

    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_hmi_toggle_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    hmi_toggle_ctx_t *ctx = (hmi_toggle_ctx_t *)handle;

    if (!ctx->settings.enabled) {
        ctx->state.active_f = 0.0f;
        return PDS_COMP_IDLE;
    }

    ctx->state.active_f = ctx->settings.value ? 100.0f : 0.0f;
    return ctx->settings.value ? PDS_COMP_ACTIVE : PDS_COMP_IDLE;
}

const pds_fb_hmi_toggle_state_t *pds_fb_hmi_toggle_get_state(pds_comp_handle_t handle)
{
    return handle ? &((hmi_toggle_ctx_t *)handle)->state : NULL;
}

esp_err_t pds_fb_hmi_toggle_get_settings(
    pds_comp_handle_t handle,
    pds_fb_hmi_toggle_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((hmi_toggle_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_hmi_toggle_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_hmi_toggle_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    memcpy(&((hmi_toggle_ctx_t *)handle)->settings, settings, sizeof(*settings));
    return ESP_OK;
}
