/**
 * PDS Function Block — Sensor Value Reference implementation
 *
 * Source block: no pipeline input. Holds a pointer to an upstream sensor's
 * float output set by the engine's post-build wiring pass.
 */

#include "pds_fb_sensor_value.h"
#include <stdlib.h>
#include <string.h>

typedef struct {
    pds_fb_sensor_value_settings_t settings;
    pds_fb_sensor_value_state_t    state;
    const float                   *src;  /**< Live pointer to upstream sensor output */
} sensor_value_ctx_t;

/* ------------------------------------------------------------------ */

esp_err_t pds_fb_sensor_value_init(
    const pds_fb_sensor_value_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    sensor_value_ctx_t *ctx = calloc(1, sizeof(sensor_value_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));
    /* src is set later by the engine's post-build wiring pass */
    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_sensor_value_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    sensor_value_ctx_t *ctx = (sensor_value_ctx_t *)handle;

    if (!ctx->settings.enabled || !ctx->src) {
        ctx->state.value = 0.0f;
        return PDS_COMP_IDLE;
    }

    ctx->state.value = *ctx->src;
    return PDS_COMP_ACTIVE;
}

void pds_fb_sensor_value_set_source(pds_comp_handle_t handle, const float *src)
{
    if (handle) ((sensor_value_ctx_t *)handle)->src = src;
}

uint8_t pds_fb_sensor_value_get_sensor_index(pds_comp_handle_t handle)
{
    return handle ? ((const sensor_value_ctx_t *)handle)->settings.sensor_index : 0;
}

const pds_fb_sensor_value_state_t *pds_fb_sensor_value_get_state(pds_comp_handle_t handle)
{
    return handle ? &((const sensor_value_ctx_t *)handle)->state : NULL;
}

esp_err_t pds_fb_sensor_value_get_settings(
    pds_comp_handle_t handle,
    pds_fb_sensor_value_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((const sensor_value_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_sensor_value_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_sensor_value_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    memcpy(&((sensor_value_ctx_t *)handle)->settings, settings, sizeof(*settings));
    return ESP_OK;
}
