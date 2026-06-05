#include <stdlib.h>
#include <string.h>
#include "esp_log.h"
#include "pds_fb_fan_float.h"

static const char *TAG = "fb_fan_float";

/* Private context — heap-allocated in _init() */
typedef struct {
    pds_fb_fan_float_settings_t settings;
    pds_fb_fan_float_state_t    state;
    const float                *input;                          /**< Source pointer wired by pipeline engine */
    float                      *outputs[PDS_FAN_FLOAT_MAX_OUTPUTS]; /**< Destination pointers */
    uint8_t                     out_count;                      /**< Number of registered outputs */
} pds_fb_fan_float_ctx_t;

/* ── Lifecycle ─────────────────────────────────────────────────────────────── */

esp_err_t pds_fb_fan_float_init(const pds_fb_fan_float_settings_t *settings,
                                 pds_comp_handle_t *out_handle)
{
    pds_fb_fan_float_ctx_t *ctx = calloc(1, sizeof(*ctx));
    if (!ctx) {
        ESP_LOGE(TAG, "init: out of memory");
        return ESP_ERR_NO_MEM;
    }
    if (settings) ctx->settings = *settings;
    else          ctx->settings.enabled = true;

    ctx->state.value = 0.0f;
    ctx->input       = NULL;
    ctx->out_count   = 0;
    memset(ctx->outputs, 0, sizeof(ctx->outputs));

    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

/* ── Run ───────────────────────────────────────────────────────────────────── */

pds_comp_status_t pds_fb_fan_float_run(pds_comp_handle_t handle)
{
    pds_fb_fan_float_ctx_t *ctx = (pds_fb_fan_float_ctx_t *)handle;
    if (!ctx || !ctx->settings.enabled || !ctx->input) return PDS_COMP_IDLE;

    ctx->state.value = *ctx->input;
    for (uint8_t i = 0; i < ctx->out_count; i++) {
        if (ctx->outputs[i]) *ctx->outputs[i] = ctx->state.value;
    }
    return PDS_COMP_ACTIVE;
}

/* ── Wiring ────────────────────────────────────────────────────────────────── */

void pds_fb_fan_float_connect_input(pds_comp_handle_t handle, const float *src)
{
    pds_fb_fan_float_ctx_t *ctx = (pds_fb_fan_float_ctx_t *)handle;
    if (ctx) ctx->input = src;
}

esp_err_t pds_fb_fan_float_connect_output(pds_comp_handle_t handle, uint8_t port, float *dest)
{
    pds_fb_fan_float_ctx_t *ctx = (pds_fb_fan_float_ctx_t *)handle;
    if (!ctx || port >= PDS_FAN_FLOAT_MAX_OUTPUTS) return ESP_ERR_INVALID_ARG;
    ctx->outputs[port] = dest;
    /* Track highest registered port so run() stays tight */
    if (port >= ctx->out_count) ctx->out_count = port + 1;
    return ESP_OK;
}

/* ── Settings ──────────────────────────────────────────────────────────────── */

void pds_fb_fan_float_set_settings(pds_comp_handle_t handle,
                                    const pds_fb_fan_float_settings_t *settings)
{
    pds_fb_fan_float_ctx_t *ctx = (pds_fb_fan_float_ctx_t *)handle;
    if (ctx && settings) ctx->settings = *settings;
}

/* ── State ─────────────────────────────────────────────────────────────────── */

const pds_fb_fan_float_state_t *pds_fb_fan_float_get_state(pds_comp_handle_t handle)
{
    pds_fb_fan_float_ctx_t *ctx = (pds_fb_fan_float_ctx_t *)handle;
    return ctx ? &ctx->state : NULL;
}
