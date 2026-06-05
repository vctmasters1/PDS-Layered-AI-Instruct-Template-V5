/**
 * PDS Function Block — DHT22 / AM2302 pipeline lifecycle
 *
 * Hardware protocol is in pds_hal/peripherals/dht22/dht22.c.
 * This file owns: block init/run/settings/state and telemetry registration.
 */

#include "pds_fb_dht22.h"
#include "pds_tel_sink.h"
#include "dht22.h"   /* pds_hal/peripherals/dht22 */
#include "esp_timer.h"
#include <stdlib.h>
#include <string.h>
#include "esp_log.h"

static const char *TAG = "dht22";

typedef struct {
    pds_fb_dht22_settings_t settings;
    pds_fb_dht22_state_t    state;
} dht22_ctx_t;

/* ── API ──────────────────────────────────────────────────────────────────── */

esp_err_t pds_fb_dht22_init(
    const pds_fb_dht22_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    dht22_ctx_t *ctx = calloc(1, sizeof(dht22_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));

    if (settings->pin_data >= 0) {
        dht22_configure_pin((int)settings->pin_data);
    }

    /* Initialize to sentinel — telemetry will report -999.0 until first good read */
    ctx->state.temperature = -999.0f;
    ctx->state.humidity    = -999.0f;

    *out_handle = (pds_comp_handle_t)ctx;

    /* Register telemetry slots — dedup in sink prevents double-register from
     * sensor_dht22_temp + sensor_dht22_humid blocks sharing the same pin. */
    if (settings->pin_data >= 0) {
        char lbl_t[PDS_TEL_SINK_LABEL_SIZE];
        char lbl_h[PDS_TEL_SINK_LABEL_SIZE];
        snprintf(lbl_t, sizeof(lbl_t), "dht22:%d:temp",  settings->pin_data);
        snprintf(lbl_h, sizeof(lbl_h), "dht22:%d:humid", settings->pin_data);

        pds_tel_slot_t st = { .kind = PDS_TEL_PERIPH, .pin = (uint8_t)settings->pin_data };
        strncpy(st.label,        lbl_t,  sizeof(st.label)        - 1);
        strncpy(st.periph.field, "temp", sizeof(st.periph.field) - 1);
        st.periph.pin   = (uint8_t)settings->pin_data;
        st.periph.value = &ctx->state.temperature;
        pds_tel_sink_register(&st);

        pds_tel_slot_t sh = { .kind = PDS_TEL_PERIPH, .pin = (uint8_t)settings->pin_data };
        strncpy(sh.label,        lbl_h,   sizeof(sh.label)        - 1);
        strncpy(sh.periph.field, "humid", sizeof(sh.periph.field) - 1);
        sh.periph.pin   = (uint8_t)settings->pin_data;
        sh.periph.value = &ctx->state.humidity;
        pds_tel_sink_register(&sh);
    }

    return ESP_OK;
}

pds_comp_status_t pds_fb_dht22_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    dht22_ctx_t *ctx = (dht22_ctx_t *)handle;

    if (!ctx->settings.enabled || ctx->settings.pin_data < 0) return PDS_COMP_IDLE;

    uint32_t now_ms = (uint32_t)(esp_timer_get_time() / 1000LL);

    /* Enforce sample interval (default ≥ 2000 ms) */
    if (ctx->state.valid &&
        (now_ms - ctx->state.last_read_ms) < ctx->settings.sample_interval_ms) {
        return ctx->state.valid ? PDS_COMP_ACTIVE : PDS_COMP_IDLE;
    }

    float temp  = ctx->state.temperature;
    float humid = ctx->state.humidity;

    esp_err_t ret = dht22_read((int)ctx->settings.pin_data, &temp, &humid);

    if (ret == ESP_OK) {
        ctx->state.temperature  = temp;
        ctx->state.humidity     = humid;
        ctx->state.valid        = true;
        ctx->state.last_read_ms = now_ms;
        ctx->state.read_count++;
        ESP_LOGD(TAG, "pin%d: %.1f°C  %.1f%%RH", ctx->settings.pin_data, temp, humid);
    } else {
        ctx->state.error_count++;
        /* Write sentinel so telemetry reports -999 (failed/disconnected) */
        ctx->state.temperature = -999.0f;
        ctx->state.humidity    = -999.0f;
        ctx->state.valid       = false;
    }

    return ctx->state.valid ? PDS_COMP_ACTIVE : PDS_COMP_IDLE;
}

const pds_fb_dht22_state_t *pds_fb_dht22_get_state(pds_comp_handle_t handle)
{
    if (!handle) return NULL;
    return &((dht22_ctx_t *)handle)->state;
}

esp_err_t pds_fb_dht22_get_settings(
    pds_comp_handle_t handle,
    pds_fb_dht22_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((dht22_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_dht22_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_dht22_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    dht22_ctx_t *ctx = (dht22_ctx_t *)handle;
    memcpy(&ctx->settings, settings, sizeof(*settings));

    if (settings->pin_data >= 0) {
        dht22_configure_pin((int)settings->pin_data);
    }
    return ESP_OK;
}
