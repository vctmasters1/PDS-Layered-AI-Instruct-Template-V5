/**
 * PDS Function Block — Analog PH Sensor implementation
 *
 * Non-blocking state machine: IDLE → SETTLING → SAMPLING → IDLE.
 * Acquires PDS_PERIPH_MUTEX_ADC_PROBE before powering on; skips the tick
 * (returns IDLE) if the EC sensor currently holds the mutex.
 */

#include "pds_fb_sensor_ph.h"
#include "pds_periph_mutex.h"
#include "pds_fb_pwr_group.h"
#include "pds_tel_sink.h"
#include "ph_001.h"
#include "esp_log.h"
#include "esp_timer.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

static const char *TAG = "sensor_ph";

typedef enum {
    PH_PHASE_IDLE     = 0,
    PH_PHASE_SETTLING = 1,
    PH_PHASE_SAMPLING = 2,
} ph_phase_t;

typedef struct {
    pds_fb_sensor_ph_settings_t settings;
    pds_fb_sensor_ph_state_t    state;
    ph_phase_t                  phase;
    bool                        adc_ok;
} sensor_ph_ctx_t;

static inline uint32_t _now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000LL);
}

static float _calibrate(const sensor_ph_ctx_t *ctx, int32_t raw)
{
    float V      = (float)ph_001_raw_to_mv(ctx->settings.adc_channel, raw) / 1000.0f;
    float V_span = ctx->settings.Vmax - ctx->settings.Vmin;
    float s_span = ctx->settings.scale_max - ctx->settings.scale_min;
    if (V_span < 1e-6f && V_span > -1e-6f) return ctx->settings.scale_min;
    float norm = (V - ctx->settings.Vmin) / V_span;
    return ctx->settings.scale_min + norm * s_span;
}

/* ── Init ─────────────────────────────────────────────────────────────────── */

esp_err_t pds_fb_sensor_ph_init(
    const pds_fb_sensor_ph_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    sensor_ph_ctx_t *ctx = calloc(1, sizeof(sensor_ph_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));
    ctx->state.ph = -999.0f;   /* sentinel until first successful read */

    if (settings->pin_power >= 0) {
        esp_err_t ret = pds_pwr_group_register(
            (int8_t)settings->pin_power, settings->power_active_low);
        if (ret != ESP_OK) {
            free(ctx);
            return ret;
        }
    }

    esp_err_t ret = ph_001_configure(settings->adc_channel);
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "ADC ch%u config failed (%s) — block disabled",
                 (unsigned)settings->adc_channel, esp_err_to_name(ret));
        ctx->adc_ok = false;
    } else {
        ctx->adc_ok = true;
    }

    if (ctx->adc_ok) {
        pds_tel_slot_t slot = {
            .kind = PDS_TEL_PERIPH,
            .pin  = (uint8_t)settings->adc_channel,
        };
        snprintf(slot.label, sizeof(slot.label), "PH%u", (unsigned)settings->adc_channel);
        strncpy(slot.periph.field, "ph", sizeof(slot.periph.field) - 1);
        slot.periph.pin       = (uint8_t)settings->adc_channel;
        slot.periph.value     = &ctx->state.ph;
        slot.periph.voltage_v = &ctx->state.voltage_v;
        pds_tel_sink_register(&slot);
    }

    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

/* ── Run (non-blocking tick) ─────────────────────────────────────────────── */

pds_comp_status_t pds_fb_sensor_ph_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    sensor_ph_ctx_t *ctx = (sensor_ph_ctx_t *)handle;

    if (!ctx->adc_ok || !ctx->settings.enabled) return PDS_COMP_IDLE;

    uint32_t now         = _now_ms();
    uint32_t interval_ms = (uint32_t)ctx->settings.sample_interval_s * 1000UL;

    /* ── IDLE: gate on sample interval ──────────────────────────────────── */
    if (ctx->phase == PH_PHASE_IDLE) {
        if (ctx->state.sample_valid &&
            (now - ctx->state.last_sample_tick) < interval_ms) {
            return PDS_COMP_ACTIVE;   /* holding last value; not time to re-sample */
        }

        /* Acquire shared ADC-probe mutex — skip tick if EC sensor is active */
        if (!pds_periph_mutex_try_acquire(PDS_PERIPH_MUTEX_ADC_PROBE, ctx)) {
            return PDS_COMP_IDLE;   /* retry next tick — non-blocking */
        }

        /* Mutex acquired: power on and start settling */
        if (ctx->settings.pin_power >= 0) {
            pds_pwr_group_acquire((int8_t)ctx->settings.pin_power);
        }
        ctx->phase = PH_PHASE_SETTLING;
    }

    /* ── SETTLING: wait for circuit + probe to stabilise ────────────────── */
    if (ctx->phase == PH_PHASE_SETTLING) {
        uint32_t total_wait_ms = ((uint32_t)ctx->settings.settling_time_s +
                                  (uint32_t)ctx->settings.response_time_s) * 1000UL;
        if (total_wait_ms > 0 && ctx->settings.pin_power >= 0) {
            uint32_t on_tick = pds_pwr_group_on_tick((int8_t)ctx->settings.pin_power);
            if ((now - on_tick) < total_wait_ms) {
                return PDS_COMP_ACTIVE;   /* still settling — revisit next tick */
            }
        }
        ctx->phase = PH_PHASE_SAMPLING;
    }

    /* ── SAMPLING ────────────────────────────────────────────────────────── */
    {
        uint8_t count = ctx->settings.oversample;
        if (count < 1)  count = 1;
        if (count > 64) count = 64;

        int32_t raw  = 0;
        esp_err_t ret = ph_001_read_raw(ctx->settings.adc_channel, count, &raw);

        /* Power off and release mutex before returning (even on error) */
        if (ctx->settings.pin_power >= 0) {
            pds_pwr_group_release((int8_t)ctx->settings.pin_power);
        }
        pds_periph_mutex_release(PDS_PERIPH_MUTEX_ADC_PROBE, ctx);
        ctx->phase = PH_PHASE_IDLE;

        if (ret != ESP_OK) {
            ctx->state.error_count++;
            ctx->state.ph           = -999.0f;
            ctx->state.sample_valid = false;
            return PDS_COMP_ERROR;
        }

        ctx->state.raw_adc          = raw;
        ctx->state.voltage_v        = (float)ph_001_raw_to_mv(ctx->settings.adc_channel, raw) / 1000.0f;
        ctx->state.ph               = _calibrate(ctx, raw);
        ctx->state.last_sample_tick = now;
        ctx->state.sample_valid     = true;
        ctx->state.read_count++;

        if (ctx->settings.alarm_enabled) {
            ctx->state.alarm_active = (ctx->state.ph < ctx->settings.alarm_low ||
                                       ctx->state.ph > ctx->settings.alarm_high);
        } else {
            ctx->state.alarm_active = false;
        }

        ESP_LOGD(TAG, "ch%u: pH=%.2f (raw=%ld)",
                 (unsigned)ctx->settings.adc_channel,
                 ctx->state.ph, (long)raw);
        return PDS_COMP_ACTIVE;
    }
}

/* ── Accessors ───────────────────────────────────────────────────────────── */

const pds_fb_sensor_ph_state_t *pds_fb_sensor_ph_get_state(pds_comp_handle_t handle)
{
    if (!handle) return NULL;
    return &((sensor_ph_ctx_t *)handle)->state;
}

esp_err_t pds_fb_sensor_ph_get_settings(
    pds_comp_handle_t handle,
    pds_fb_sensor_ph_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((sensor_ph_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_sensor_ph_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_sensor_ph_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    sensor_ph_ctx_t *ctx = (sensor_ph_ctx_t *)handle;
    memcpy(&ctx->settings, settings, sizeof(*settings));
    if (settings->pin_power >= 0) {
        pds_pwr_group_register((int8_t)settings->pin_power, settings->power_active_low);
    }
    return ESP_OK;
}
