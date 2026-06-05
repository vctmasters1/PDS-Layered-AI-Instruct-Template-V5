/**
 * PDS Component — Switch Output implementation
 */

#include "pds_fb_switch_output.h"
#include "pds_tel_sink.h"
#include "pds_gpio_registry.h"   /* see pds_hal/registries/AI-INSTRUCT.md */
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include "esp_log.h"

static const char *TAG = "switch_output";

typedef struct {
    pds_fb_switch_output_settings_t settings;
    pds_fb_switch_output_state_t    state;
    const float *_signal_ptr;   /**< Connected upstream float (>= 0.5f = on) */
} switch_output_ctx_t;

static esp_err_t _apply_settings(switch_output_ctx_t *ctx)
{
    if (ctx->settings.pin_output < 0) return ESP_OK;

    /* Register with GPIO registry — configures hardware, tracks output state.
     * PDS_GPIO_get_output_level used as read_fn so cached state is readable. */
    char _label[16];
    snprintf(_label, sizeof(_label), "GPIO%d", ctx->settings.pin_output);
    esp_err_t ret = pds_gpio_reg_register(
        (uint32_t)ctx->settings.pin_output,
        PDS_GPIO_MODE_OUTPUT, PDS_GPIO_PULL_NONE,
        ctx->settings.active_low,
        PDS_GPIO_get_output_level, PDS_GPIO_write, _label);
    if (ret != ESP_OK) return ret;

    /* Drive inactive on (re)configure. */
    uint32_t inactive = ctx->settings.active_low ? 1u : 0u;
    return pds_gpio_reg_write((uint32_t)ctx->settings.pin_output, inactive);
}

static void _write(switch_output_ctx_t *ctx, bool on)
{
    if (ctx->settings.pin_output < 0) return;
    uint32_t level = (on != ctx->settings.active_low) ? 1u : 0u;
    pds_gpio_reg_write((uint32_t)ctx->settings.pin_output, level);
    if (on != ctx->state.output_state) {
        ESP_LOGI(TAG, "GPIO%d → %s", ctx->settings.pin_output, on ? "ON" : "OFF");
    }
    ctx->state.output_state = on;
}

/* ------------------------------------------------------------------ */

esp_err_t pds_fb_switch_output_init(
    const pds_fb_switch_output_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    switch_output_ctx_t *ctx = calloc(1, sizeof(switch_output_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));

    esp_err_t ret = _apply_settings(ctx);
    if (ret != ESP_OK) { free(ctx); return ret; }

    /* Register live-state pointer with the telemetry sink. */
    if (settings->pin_output >= 0) {
        pds_tel_slot_t slot = {
            .kind = PDS_TEL_GPIO,
            .pin  = (uint8_t)settings->pin_output,
            .gpio = { .active = &ctx->state.output_state, .is_input = false },
        };
        snprintf(slot.label, sizeof(slot.label), "GPIO%d", settings->pin_output);
        pds_tel_sink_register(&slot);
    }

    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_switch_output_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    switch_output_ctx_t *ctx = (switch_output_ctx_t *)handle;

    if (!ctx->settings.enabled) {
        _write(ctx, false);
        return PDS_COMP_IDLE;
    }

    /* If a signal is connected, follow it; otherwise hold last state.
     * Threshold >= 0.5f guards against float epsilon false-positives. */
    if (ctx->_signal_ptr) {
        bool desired = (*ctx->_signal_ptr >= 0.5f);
        if (desired != ctx->state.output_state) {
            _write(ctx, desired);
            return PDS_COMP_ACTIVE;
        }
    }

    return ctx->state.output_state ? PDS_COMP_ACTIVE : PDS_COMP_IDLE;
}

esp_err_t pds_fb_switch_output_force(pds_comp_handle_t handle, bool on)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    _write((switch_output_ctx_t *)handle, on);
    return ESP_OK;
}

esp_err_t pds_fb_switch_output_connect_signal(
    pds_comp_handle_t handle, const float *signal_ptr)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    ((switch_output_ctx_t *)handle)->_signal_ptr = signal_ptr;
    return ESP_OK;
}

const pds_fb_switch_output_state_t *pds_fb_switch_output_get_state(
    pds_comp_handle_t handle)
{
    if (!handle) return NULL;
    return &((switch_output_ctx_t *)handle)->state;
}

esp_err_t pds_fb_switch_output_get_settings(
    pds_comp_handle_t handle,
    pds_fb_switch_output_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((switch_output_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_switch_output_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_switch_output_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    switch_output_ctx_t *ctx = (switch_output_ctx_t *)handle;
    memcpy(&ctx->settings, settings, sizeof(*settings));
    return _apply_settings(ctx);
}
