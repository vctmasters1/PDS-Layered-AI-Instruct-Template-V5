#include <stdlib.h>
#include <string.h>
#include "esp_log.h"
#include "pds_fb_fan_bool.h"

static const char *TAG = "fb_fan_bool";

/* Private context — heap-allocated in _init() */
typedef struct {
    pds_fb_fan_bool_settings_t settings;
    pds_fb_fan_bool_state_t    state;
    const float               *input;                           /**< Source float pointer (>= 0.5f = true) */
    bool                      *outputs[PDS_FAN_BOOL_MAX_OUTPUTS]; /**< Destination bool pointers */
    uint8_t                    out_count;                       /**< Number of registered outputs */
} pds_fb_fan_bool_ctx_t;

/* ── Lifecycle ─────────────────────────────────────────────────────────────── */

esp_err_t pds_fb_fan_bool_init(const pds_fb_fan_bool_settings_t *settings,
                                pds_comp_handle_t *out_handle)
{
    pds_fb_fan_bool_ctx_t *ctx = calloc(1, sizeof(*ctx));
    if (!ctx) {
        ESP_LOGE(TAG, "init: out of memory");
        return ESP_ERR_NO_MEM;
    }
    if (settings) ctx->settings = *settings;
    else          ctx->settings.enabled = true;

    ctx->state.value = false;
    ctx->input       = NULL;
    ctx->out_count   = 0;
    memset(ctx->outputs, 0, sizeof(ctx->outputs));

    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

/* ── Run ───────────────────────────────────────────────────────────────────── */

pds_comp_status_t pds_fb_fan_bool_run(pds_comp_handle_t handle)
{
    pds_fb_fan_bool_ctx_t *ctx = (pds_fb_fan_bool_ctx_t *)handle;
    if (!ctx || !ctx->settings.enabled || !ctx->input) return PDS_COMP_IDLE;

    /* Threshold >= 0.5f guards against float epsilon false-positives. */
    ctx->state.value = (*ctx->input >= 0.5f);
    for (uint8_t i = 0; i < ctx->out_count; i++) {
        if (ctx->outputs[i]) *ctx->outputs[i] = ctx->state.value;
    }
    return PDS_COMP_ACTIVE;
}

/* ── Wiring ────────────────────────────────────────────────────────────────── */

void pds_fb_fan_bool_connect_input(pds_comp_handle_t handle, const float *src)
{
    pds_fb_fan_bool_ctx_t *ctx = (pds_fb_fan_bool_ctx_t *)handle;
    if (ctx) ctx->input = src;
}

esp_err_t pds_fb_fan_bool_connect_output(pds_comp_handle_t handle, uint8_t port, bool *dest)
{
    pds_fb_fan_bool_ctx_t *ctx = (pds_fb_fan_bool_ctx_t *)handle;
    if (!ctx || port >= PDS_FAN_BOOL_MAX_OUTPUTS) return ESP_ERR_INVALID_ARG;
    ctx->outputs[port] = dest;
    if (port >= ctx->out_count) ctx->out_count = port + 1;
    return ESP_OK;
}

/* ── Settings ──────────────────────────────────────────────────────────────── */

void pds_fb_fan_bool_set_settings(pds_comp_handle_t handle,
                                   const pds_fb_fan_bool_settings_t *settings)
{
    pds_fb_fan_bool_ctx_t *ctx = (pds_fb_fan_bool_ctx_t *)handle;
    if (ctx && settings) ctx->settings = *settings;
}

/* ── State ─────────────────────────────────────────────────────────────────── */

const pds_fb_fan_bool_state_t *pds_fb_fan_bool_get_state(pds_comp_handle_t handle)
{
    pds_fb_fan_bool_ctx_t *ctx = (pds_fb_fan_bool_ctx_t *)handle;
    return ctx ? &ctx->state : NULL;
}
