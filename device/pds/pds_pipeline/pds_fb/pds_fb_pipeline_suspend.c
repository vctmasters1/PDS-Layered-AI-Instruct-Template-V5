/**
 * PDS Function Block — Pipeline Suspend implementation
 */

#include "pds_fb_pipeline_suspend.h"
#include <stdlib.h>
#include <string.h>

/* Forward declaration — resolved at link time (avoids circular component dep). */
extern void pds_pipeline_engine_suspend_pipeline(uint8_t idx);

typedef struct {
    pds_fb_pipeline_suspend_settings_t settings;
    pds_fb_pipeline_suspend_state_t    state;
    const float                        *_trigger_ptr;
    bool                               _prev;   /**< Edge detector */
} pipeline_suspend_ctx_t;

/* ------------------------------------------------------------------ */

esp_err_t pds_fb_pipeline_suspend_init(
    const pds_fb_pipeline_suspend_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;
    pipeline_suspend_ctx_t *ctx = calloc(1, sizeof(pipeline_suspend_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;
    memcpy(&ctx->settings, settings, sizeof(*settings));
    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_pipeline_suspend_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    pipeline_suspend_ctx_t *ctx = (pipeline_suspend_ctx_t *)handle;

    float sig = ctx->_trigger_ptr ? *ctx->_trigger_ptr : 0.0f;
    ctx->state.trigger_f = sig;

    bool current = (sig >= 0.5f);
    if (ctx->settings.enabled && current && !ctx->_prev) {
        /* Rising edge — suspend the target */
        pds_pipeline_engine_suspend_pipeline(ctx->settings.pipeline_index);
    }
    ctx->_prev = current;

    return PDS_COMP_IDLE;
}

esp_err_t pds_fb_pipeline_suspend_connect_trigger(
    pds_comp_handle_t handle,
    const float *trigger_ptr)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    pipeline_suspend_ctx_t *ctx = (pipeline_suspend_ctx_t *)handle;
    ctx->_trigger_ptr = trigger_ptr;
    ctx->_prev = trigger_ptr ? (*trigger_ptr >= 0.5f) : false;
    return ESP_OK;
}

const pds_fb_pipeline_suspend_state_t *pds_fb_pipeline_suspend_get_state(
    pds_comp_handle_t handle)
{
    return handle ? &((pipeline_suspend_ctx_t *)handle)->state : NULL;
}

esp_err_t pds_fb_pipeline_suspend_get_settings(
    pds_comp_handle_t handle,
    pds_fb_pipeline_suspend_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((pipeline_suspend_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_pipeline_suspend_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_pipeline_suspend_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    memcpy(&((pipeline_suspend_ctx_t *)handle)->settings, settings, sizeof(*settings));
    return ESP_OK;
}
