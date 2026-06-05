/**
 * PDS Function Block — HMI Initiate implementation
 *
 * One-shot trigger: confirm=true → 1.0f output for one tick, then auto-clears.
 */

#include "pds_fb_hmi_initiate.h"
#include <stdlib.h>
#include <string.h>

typedef struct {
    pds_fb_hmi_initiate_settings_t settings;
    pds_fb_hmi_initiate_state_t    state;
} hmi_initiate_ctx_t;

/* ------------------------------------------------------------------ */

esp_err_t pds_fb_hmi_initiate_init(
    const pds_fb_hmi_initiate_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    hmi_initiate_ctx_t *ctx = calloc(1, sizeof(hmi_initiate_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));
    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_hmi_initiate_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    hmi_initiate_ctx_t *ctx = (hmi_initiate_ctx_t *)handle;

    if (!ctx->settings.enabled) {
        ctx->state.active_f = 0.0f;
        return PDS_COMP_IDLE;
    }

    if (ctx->settings.confirm) {
        ctx->state.active_f   = 1.0f;
        ctx->settings.confirm = false;  /* auto-clear: fires for exactly one tick */
        return PDS_COMP_ACTIVE;
    }

    ctx->state.active_f = 0.0f;
    return PDS_COMP_IDLE;
}

const pds_fb_hmi_initiate_state_t *pds_fb_hmi_initiate_get_state(pds_comp_handle_t handle)
{
    return handle ? &((const hmi_initiate_ctx_t *)handle)->state : NULL;
}

esp_err_t pds_fb_hmi_initiate_get_settings(
    pds_comp_handle_t handle,
    pds_fb_hmi_initiate_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((const hmi_initiate_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_hmi_initiate_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_hmi_initiate_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    memcpy(&((hmi_initiate_ctx_t *)handle)->settings, settings, sizeof(*settings));
    return ESP_OK;
}
