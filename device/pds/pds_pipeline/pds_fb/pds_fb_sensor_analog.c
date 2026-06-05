/**
 * PDS Function Block — Analog Sensor implementation
 */

#include "pds_fb_sensor_analog.h"
#include "pds_fb_pwr_group.h"
#include "pds_tel_sink.h"
#include "pds_adc_registry.h"   /* see pds_hal/registries/AI-INSTRUCT.md */
#include "pds_gpio.h"
#include "esp_log.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include "esp_timer.h"

typedef enum {
    SA_PHASE_IDLE     = 0,
    SA_PHASE_SETTLING = 1,
    SA_PHASE_SAMPLING = 2,
} sensor_analog_phase_t;

typedef struct {
    pds_fb_sensor_analog_settings_t settings;
    pds_fb_sensor_analog_state_t    state;
    sensor_analog_phase_t           phase;
    bool                            adc_ok;   /**< false if ADC channel failed to configure */
} sensor_analog_ctx_t;

static inline uint32_t _now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000LL);
}

static esp_err_t _apply_settings(sensor_analog_ctx_t *ctx)
{
    /* Optional power GPIO — register with the shared power-group coordinator.
     * This configures the GPIO as output and drives it to the inactive (OFF)
     * level.  Multiple blocks sharing the same pin are handled safely. */
    if (ctx->settings.pin_power >= 0) {
        esp_err_t ret = pds_pwr_group_register(
            (int8_t)ctx->settings.pin_power,
            ctx->settings.power_active_low);
        if (ret != ESP_OK) return ret;
    }

    /* Register with ADC registry — configures hardware and stores read/to_mv backends.
     * The registry pre-sweeps all channels before each pipeline tick. */
    char _label[16];
    snprintf(_label, sizeof(_label), "ADC%u", (unsigned)ctx->settings.adc_channel);
    return pds_adc_reg_register(ctx->settings.adc_channel,
                                PDS_ADC_ATTEN_DB_11, PDS_ADC_WIDTH_BIT_12,
                                PDS_ADC_read, PDS_ADC_raw_to_mv, _label);
}

static float _calibrate(const sensor_analog_ctx_t *ctx, int32_t raw)
{
    /* Convert via registry — uses the backend registered at init (e.g. PDS_ADC_raw_to_mv). */
    float V          = (float)pds_adc_reg_raw_to_mv(ctx->settings.adc_channel, (int)raw) / 1000.0f;
    float V_span     = ctx->settings.Vmax - ctx->settings.Vmin;
    float scale_span = ctx->settings.scale_max - ctx->settings.scale_min;

    if (V_span < 1e-6f && V_span > -1e-6f) return ctx->settings.scale_min;

    float norm = (V - ctx->settings.Vmin) / V_span;
    return ctx->settings.scale_min + norm * scale_span;
}

/* ------------------------------------------------------------------ */

esp_err_t pds_fb_sensor_analog_init(
    const pds_fb_sensor_analog_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    sensor_analog_ctx_t *ctx = calloc(1, sizeof(sensor_analog_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));

    esp_err_t ret = _apply_settings(ctx);
    if (ret != ESP_OK) {
        ESP_LOGW("fb_sensor_analog",
                 "ADC channel %u config failed (%s) — block disabled",
                 (unsigned)settings->adc_channel, esp_err_to_name(ret));
        ctx->adc_ok = false;
        *out_handle = (pds_comp_handle_t)ctx;
        return ESP_OK;   /* non-fatal: pipeline continues without this sensor */
    }
    ctx->adc_ok = true;

    /* Register live-state pointers with the telemetry sink. */
    if (ctx->adc_ok) {
        pds_tel_slot_t slot = {
            .kind = PDS_TEL_ADC,
            .pin  = (uint8_t)settings->adc_channel,
            .adc  = {
                .value       = &ctx->state.value,
                .raw         = &ctx->state.raw_adc,
                .adc_channel = settings->adc_channel,
            },
        };
        snprintf(slot.label, sizeof(slot.label), "ADC%u", (unsigned)settings->adc_channel);
        pds_tel_sink_register(&slot);
    }

    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_sensor_analog_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    sensor_analog_ctx_t *ctx = (sensor_analog_ctx_t *)handle;

    if (!ctx->adc_ok)            return PDS_COMP_IDLE;
    if (!ctx->settings.enabled)  return PDS_COMP_IDLE;

    uint32_t now = _now_ms();

    /* ── IDLE: gate on sample interval ────────────────────────────────────────── */
    if (ctx->phase == SA_PHASE_IDLE) {
        if (ctx->state.sample_valid &&
            (now - ctx->state.last_sample_tick) < ctx->settings.sample_interval_ms) {
            return PDS_COMP_ACTIVE;   /* holding last value; not time to re-sample */
        }
        if (ctx->settings.pin_power >= 0) {
            pds_pwr_group_acquire((int8_t)ctx->settings.pin_power);
            ctx->phase = SA_PHASE_SETTLING;
        } else {
            ctx->phase = SA_PHASE_SAMPLING;
        }
    }

    /* ── SETTLING: wait for power supply to stabilise ────────────────────────── */
    if (ctx->phase == SA_PHASE_SETTLING) {
        if (ctx->settings.settling_time_ms > 0) {
            uint32_t on_tick = pds_pwr_group_on_tick((int8_t)ctx->settings.pin_power);
            if ((now - on_tick) < ctx->settings.settling_time_ms) {
                return PDS_COMP_ACTIVE;   /* still settling — revisit next tick */
            }
        }
        ctx->phase = SA_PHASE_SAMPLING;
    }

    /* ── SAMPLING ──────────────────────────────────────────────────────────── */
    {
        uint8_t count = ctx->settings.oversample_count;
        if (count < 1)  count = 1;
        if (count > 64) count = 64;

        /* Read via registry — backend-agnostic (ESP32 ADC, ADS1115, etc.). */
        int32_t raw = 0;
        esp_err_t _ret = pds_adc_reg_read(ctx->settings.adc_channel, count, &raw, NULL);

        /* Release power hold — pwr_group turns GPIO off when refcount hits 0. */
        if (ctx->settings.pin_power >= 0) {
            pds_pwr_group_release((int8_t)ctx->settings.pin_power);
        }

        ctx->phase = SA_PHASE_IDLE;

        if (_ret != ESP_OK) return PDS_COMP_ERROR;

        ctx->state.raw_adc          = raw;
        ctx->state.value            = _calibrate(ctx, raw);
        ctx->state.last_sample_tick = now;
        ctx->state.sample_valid     = true;
        return PDS_COMP_ACTIVE;
    }
}

const pds_fb_sensor_analog_state_t *pds_fb_sensor_analog_get_state(
    pds_comp_handle_t handle)
{
    if (!handle) return NULL;
    return &((sensor_analog_ctx_t *)handle)->state;
}

esp_err_t pds_fb_sensor_analog_get_settings(
    pds_comp_handle_t handle,
    pds_fb_sensor_analog_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((sensor_analog_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_sensor_analog_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_sensor_analog_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    sensor_analog_ctx_t *ctx = (sensor_analog_ctx_t *)handle;
    memcpy(&ctx->settings, settings, sizeof(*settings));
    return _apply_settings(ctx);
}
