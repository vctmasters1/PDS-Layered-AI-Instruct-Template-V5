/**
 * PDS Component — PWM Output with Ratio implementation
 */

#include "pds_fb_pwm_output.h"
#include "pds_tel_sink.h"
#include "pds_pwm_registry.h"   /* see pds_hal/registries/AI-INSTRUCT.md */
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include "esp_log.h"

static const char *TAG = "pwm_output";

#define PWM_OUTPUT_RESOLUTION_BITS  8u

typedef struct {
    pds_fb_pwm_output_settings_t settings;
    pds_fb_pwm_output_state_t    state;
    const float *_value_ptr;
    const bool  *_enable_ptr;
} pwm_output_ctx_t;

static esp_err_t _apply_settings(pwm_output_ctx_t *ctx)
{
    if (ctx->settings.pin_pwm < 0) return ESP_OK;

    ESP_LOGI(TAG, "GPIO%d → PWM @ %"PRIu32"Hz  ratio=%.1f%%",
             ctx->settings.pin_pwm, ctx->settings.pwm_frequency_hz, ctx->settings.ratio);

    /* Register with PWM registry — configures LEDC channel and stores set/get backends. */
    char _label[16];
    snprintf(_label, sizeof(_label), "PWM%d", ctx->settings.pin_pwm);
    return pds_pwm_reg_register(
        (uint32_t)ctx->settings.pin_pwm,
        ctx->settings.pwm_frequency_hz,
        PWM_OUTPUT_RESOLUTION_BITS,
        PDS_PWM_set_duty_percent,
        PDS_PWM_get_duty_percent,
        _label);
}

/* ------------------------------------------------------------------ */

esp_err_t pds_fb_pwm_output_init(
    const pds_fb_pwm_output_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    pwm_output_ctx_t *ctx = calloc(1, sizeof(pwm_output_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));

    esp_err_t ret = _apply_settings(ctx);
    if (ret != ESP_OK) { free(ctx); return ret; }

    /* Register live-state pointer with the telemetry sink. */
    if (settings->pin_pwm >= 0) {
        pds_tel_slot_t slot = {
            .kind = PDS_TEL_PWM,
            .pin  = (uint8_t)settings->pin_pwm,
            .pwm  = {
                .duty_pct = &ctx->state.pwm_duty,
                .freq_hz  = settings->pwm_frequency_hz,
            },
        };
        snprintf(slot.label, sizeof(slot.label), "PWM%d", settings->pin_pwm);
        pds_tel_sink_register(&slot);
    }

    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_pwm_output_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    pwm_output_ctx_t *ctx = (pwm_output_ctx_t *)handle;

    /* Disabled → drive hardware to zero immediately (matches switch_output paradigm). */
    if (!ctx->settings.enabled) {
        pds_fb_pwm_output_safe_state(handle);
        return PDS_COMP_IDLE;
    }

    /* Gate closed or no input: zero the output. */
    if ((ctx->_enable_ptr && !(*ctx->_enable_ptr)) || !ctx->_value_ptr) {
        if (ctx->settings.pin_pwm >= 0) {
            pds_pwm_reg_set_duty((uint32_t)ctx->settings.pin_pwm, 0u);
        }
        ctx->state.input_pct  = 0.0f;
        ctx->state.pwm_duty   = 0.0f;
        ctx->state.count_rate = 0.0f;
        return PDS_COMP_IDLE;
    }

    float input = *ctx->_value_ptr;
    ctx->state.input_pct = input;

    /* Clamp ratio to [0, 100]. */
    float ratio = ctx->settings.ratio;
    if (ratio < 0.0f)   ratio = 0.0f;
    if (ratio > 100.0f) ratio = 100.0f;

    float duty = (input * ratio) / 100.0f;
    if (duty < 0.0f)   duty = 0.0f;
    if (duty > 100.0f) duty = 100.0f;

    /* Apply functional bounds. func_max caps the duty; func_min snaps sub-threshold
     * duty to 0 to prevent pump stall at too-low PWM. */
    if (duty > ctx->settings.func_max) duty = ctx->settings.func_max;
    if (duty > 0.0f && ctx->settings.func_min > 0.0f && duty < ctx->settings.func_min) duty = 0.0f;

    ctx->state.pwm_duty = duty;
    ctx->state.count_rate = (ctx->settings.count_rate_at_full > 0.0f)
        ? (duty / 100.0f) * ctx->settings.count_rate_at_full
        : 0.0f;

    if (ctx->settings.pin_pwm >= 0) {
        pds_pwm_reg_set_duty((uint32_t)ctx->settings.pin_pwm, (uint32_t)duty);
    }

    return PDS_COMP_ACTIVE;
}

esp_err_t pds_fb_pwm_output_connect_value(pds_comp_handle_t handle, const float *value_ptr)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    ((pwm_output_ctx_t *)handle)->_value_ptr = value_ptr;
    return ESP_OK;
}

esp_err_t pds_fb_pwm_output_connect_enable(pds_comp_handle_t handle, const bool *enable_ptr)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    ((pwm_output_ctx_t *)handle)->_enable_ptr = enable_ptr;
    return ESP_OK;
}

const pds_fb_pwm_output_state_t *pds_fb_pwm_output_get_state(pds_comp_handle_t handle)
{
    if (!handle) return NULL;
    return &((pwm_output_ctx_t *)handle)->state;
}

esp_err_t pds_fb_pwm_output_get_settings(pds_comp_handle_t handle, pds_fb_pwm_output_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((pwm_output_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_pwm_output_set_settings(pds_comp_handle_t handle, const pds_fb_pwm_output_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    pwm_output_ctx_t *ctx = (pwm_output_ctx_t *)handle;
    memcpy(&ctx->settings, settings, sizeof(*settings));
    _apply_settings(ctx);
    return ESP_OK;
}

void pds_fb_pwm_output_safe_state(pds_comp_handle_t handle)
{
    if (!handle) return;
    pwm_output_ctx_t *ctx = (pwm_output_ctx_t *)handle;
    ctx->state.input_pct  = 0.0f;
    ctx->state.pwm_duty   = 0.0f;
    ctx->state.count_rate = 0.0f;
    if (ctx->settings.pin_pwm >= 0) {
        pds_pwm_reg_set_duty((uint32_t)ctx->settings.pin_pwm, 0u);
    }
}
