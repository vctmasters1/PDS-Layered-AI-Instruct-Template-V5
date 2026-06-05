/**
 * PDS Function Block — HX711 24-bit Load-Cell ADC pipeline lifecycle
 *
 * Hardware protocol (bit-bang CLK/DOUT) is in pds_hal/peripherals/hx711/hx711.c.
 * This file owns: block init/run/settings/state.
 */

#include "pds_fb_hx711.h"
#include "hx711.h"   /* pds_hal/peripherals/hx711 */
#include "esp_timer.h"
#include <stdlib.h>
#include <string.h>
#include "esp_log.h"

static const char *TAG = "hx711";

typedef struct {
    pds_fb_hx711_settings_t settings;
    pds_fb_hx711_state_t    state;
} hx711_ctx_t;

/* ── API ──────────────────────────────────────────────────────────────────── */

esp_err_t pds_fb_hx711_init(
    const pds_fb_hx711_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    hx711_ctx_t *ctx = calloc(1, sizeof(hx711_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));
    hx711_configure_pins((int)settings->pin_clk, (int)settings->pin_dat);

    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_hx711_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    hx711_ctx_t *ctx = (hx711_ctx_t *)handle;

    if (!ctx->settings.enabled ||
        ctx->settings.pin_clk < 0 ||
        ctx->settings.pin_dat < 0) {
        return PDS_COMP_IDLE;
    }

    uint32_t now_ms = (uint32_t)(esp_timer_get_time() / 1000LL);

    /* Gate on sample_interval_ms */
    if (ctx->state.valid &&
        (now_ms - ctx->state.last_read_ms) < ctx->settings.sample_interval_ms) {
        return PDS_COMP_ACTIVE;
    }

    /* Poll DOUT — goes low when a conversion result is ready */
    if (!hx711_data_ready((int)ctx->settings.pin_dat)) {
        /* Not ready yet — return and check again next tick */
        return ctx->state.valid ? PDS_COMP_ACTIVE : PDS_COMP_IDLE;
    }

    int32_t raw = hx711_read_raw(
        (int)ctx->settings.pin_clk,
        (int)ctx->settings.pin_dat,
        ctx->settings.gain);

    ctx->state.raw   = raw;
    ctx->state.value = (float)(raw - ctx->settings.tare_raw)
                       * ctx->settings.scale_factor
                       + ctx->settings.scale_offset;
    ctx->state.valid        = true;
    ctx->state.last_read_ms = now_ms;
    ctx->state.read_count++;

    ESP_LOGD(TAG, "pin%d/%d: raw=%ld  value=%.4f",
             ctx->settings.pin_clk, ctx->settings.pin_dat,
             (long)raw, (double)ctx->state.value);

    return PDS_COMP_ACTIVE;
}

const pds_fb_hx711_state_t *pds_fb_hx711_get_state(pds_comp_handle_t handle)
{
    if (!handle) return NULL;
    return &((hx711_ctx_t *)handle)->state;
}

esp_err_t pds_fb_hx711_get_settings(
    pds_comp_handle_t handle,
    pds_fb_hx711_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((hx711_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_hx711_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_hx711_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    hx711_ctx_t *ctx = (hx711_ctx_t *)handle;
    memcpy(&ctx->settings, settings, sizeof(*settings));
    hx711_configure_pins((int)settings->pin_clk, (int)settings->pin_dat);
    return ESP_OK;
}
