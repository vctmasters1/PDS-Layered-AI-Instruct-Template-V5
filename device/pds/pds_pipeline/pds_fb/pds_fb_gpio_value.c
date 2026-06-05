/**
 * PDS Function Block — GPIO Value Reference implementation
 *
 * Source block: no pipeline input. Holds a pointer to an upstream gpio_input
 * block's active_f output, set by the engine's post-build wiring pass.
 */

#include "pds_fb_gpio_value.h"
#include <stdlib.h>
#include <string.h>

typedef struct {
    pds_fb_gpio_value_settings_t settings;
    pds_fb_gpio_value_state_t    state;
    const float                 *src;  /**< Live pointer to upstream gpio_input active_f */
} gpio_value_ctx_t;

/* ------------------------------------------------------------------ */

esp_err_t pds_fb_gpio_value_init(
    const pds_fb_gpio_value_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    gpio_value_ctx_t *ctx = calloc(1, sizeof(gpio_value_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));
    /* src is set later by the engine's post-build wiring pass */
    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_gpio_value_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    gpio_value_ctx_t *ctx = (gpio_value_ctx_t *)handle;

    if (!ctx->settings.enabled || !ctx->src) {
        ctx->state.active_f = 0.0f;
        return PDS_COMP_IDLE;
    }

    ctx->state.active_f = *ctx->src;
    return (ctx->state.active_f != 0.0f) ? PDS_COMP_ACTIVE : PDS_COMP_IDLE;
}

void pds_fb_gpio_value_set_source(pds_comp_handle_t handle, const float *src)
{
    if (handle) ((gpio_value_ctx_t *)handle)->src = src;
}

void pds_fb_gpio_value_get_ref(pds_comp_handle_t handle,
                                uint8_t *out_pipeline_idx,
                                uint8_t *out_block_idx)
{
    if (!handle) return;
    const gpio_value_ctx_t *ctx = (const gpio_value_ctx_t *)handle;
    if (out_pipeline_idx) *out_pipeline_idx = ctx->settings.pipeline_idx;
    if (out_block_idx)    *out_block_idx    = ctx->settings.block_idx;
}

const pds_fb_gpio_value_state_t *pds_fb_gpio_value_get_state(pds_comp_handle_t handle)
{
    return handle ? &((const gpio_value_ctx_t *)handle)->state : NULL;
}

esp_err_t pds_fb_gpio_value_get_settings(
    pds_comp_handle_t handle,
    pds_fb_gpio_value_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((const gpio_value_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_gpio_value_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_gpio_value_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    memcpy(&((gpio_value_ctx_t *)handle)->settings, settings, sizeof(*settings));
    return ESP_OK;
}
