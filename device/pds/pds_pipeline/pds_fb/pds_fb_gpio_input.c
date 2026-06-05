#include "pds_fb_gpio_input.h"
#include "pds_fb_pwr_group.h"
#include "pds_tel_sink.h"
#include "pds_gpio_registry.h"   /* see pds_hal/registries/AI-INSTRUCT.md */
#include "esp_timer.h"
#include <stdlib.h>
#include <stdio.h>

typedef struct {
    pds_fb_gpio_input_settings_t settings;
    pds_fb_gpio_input_state_t    state;
    pds_fb_gpio_input_phase_t    phase;
    uint32_t                     last_poll_tick;   /**< for sample_interval in power-gated mode */
    /* always-on debounce tracking */
    uint32_t                     debounce_start_ms;
    bool                         debounce_pending;
    bool                         pending_state;
} pds_fb_gpio_input_ctx_t;

esp_err_t pds_fb_gpio_input_init(
    const pds_fb_gpio_input_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    pds_fb_gpio_input_ctx_t *ctx = calloc(1, sizeof(pds_fb_gpio_input_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;
    ctx->settings = *settings;

    if (settings->pin_input >= 0) {
        /* active_low=true  → NC switch / pull-up  (pin HIGH at rest)
         * active_low=false → NO switch / pull-down (pin LOW  at rest) */
        pds_gpio_pull_t pull = settings->active_low ? PDS_GPIO_PULL_UP : PDS_GPIO_PULL_DOWN;
        /* Register with GPIO registry — configures hardware and enables pre-sweep at tick start. */
        char _label[16]; snprintf(_label, sizeof(_label), "GPIO%d", settings->pin_input);
        pds_gpio_reg_register((uint32_t)settings->pin_input, PDS_GPIO_MODE_INPUT, pull,
                              settings->active_low, PDS_GPIO_read, NULL, _label);
    }

    /* Register power pin with the shared power-group coordinator. */
    if (settings->pin_power >= 0) {
        pds_pwr_group_register((int8_t)settings->pin_power, settings->power_active_low);
    }

    /* Register live-state pointer with the telemetry sink. */
    if (settings->pin_input >= 0) {
        pds_tel_slot_t slot = {
            .kind = PDS_TEL_GPIO,
            .pin  = (uint8_t)settings->pin_input,
            .gpio = { .active = &ctx->state.active, .is_input = true },
        };
        snprintf(slot.label, sizeof(slot.label), "GPIO%d", settings->pin_input);
        pds_tel_sink_register(&slot);
    }

    *out_handle = ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_gpio_input_run(pds_comp_handle_t handle)
{
    pds_fb_gpio_input_ctx_t *ctx = (pds_fb_gpio_input_ctx_t *)handle;
    if (!ctx->settings.enabled || ctx->settings.pin_input < 0) return PDS_COMP_IDLE;

    uint32_t now_ms = (uint32_t)(esp_timer_get_time() / 1000LL);

    /* ── Power-gated mode ─────────────────────────────────────────────────── */
    if (ctx->settings.pin_power >= 0) {

        if (ctx->phase == GI_PHASE_IDLE) {
            /* Gate on sample_interval when we already have a valid reading. */
            if (ctx->state.sample_valid && ctx->settings.sample_interval_ms > 0 &&
                (now_ms - ctx->last_poll_tick) < ctx->settings.sample_interval_ms) {
                return PDS_COMP_ACTIVE;
            }
            pds_pwr_group_acquire((int8_t)ctx->settings.pin_power);
            ctx->phase = GI_PHASE_SETTLING;
        }

        if (ctx->phase == GI_PHASE_SETTLING) {
            if (ctx->settings.settling_time_ms > 0) {
                uint32_t on_tick = pds_pwr_group_on_tick((int8_t)ctx->settings.pin_power);
                if ((now_ms - on_tick) < ctx->settings.settling_time_ms) {
                    return PDS_COMP_ACTIVE;   /* still settling */
                }
            }
            ctx->phase = GI_PHASE_READING;
        }

        /* GI_PHASE_READING */
        {
            /* Direct read in power-gated mode (power just settled). */
            bool raw     = (bool)pds_gpio_reg_read((uint32_t)ctx->settings.pin_input);
            bool logical = ctx->settings.active_low ? !raw : raw;

            if (logical != ctx->state.active) {
                ctx->state.active   = logical;
                ctx->state.active_f = logical ? 100.0f : 0.0f;
                ctx->state.last_change_tick = now_ms;
                ctx->state.change_count++;
            }
            ctx->state.sample_valid = true;
            ctx->last_poll_tick     = now_ms;
            pds_pwr_group_release((int8_t)ctx->settings.pin_power);
            ctx->phase = GI_PHASE_IDLE;
            return PDS_COMP_ACTIVE;
        }
    }

    /* ── Always-on mode: edge-detection with debounce ───────────────────────── */
    /* Use value pre-sampled by pds_gpio_reg_refresh_inputs() at tick start. */
    bool raw = pds_gpio_reg_get_cached((uint32_t)ctx->settings.pin_input);
    bool logical = ctx->settings.active_low ? !raw : raw;

    if (ctx->settings.debounce_ms == 0) {
        /* No debounce — accept immediately */
        if (logical != ctx->state.active) {
            ctx->state.active   = logical;
            ctx->state.active_f = logical ? 100.0f : 0.0f;
            ctx->state.last_change_tick = now_ms;
            ctx->state.change_count++;
        }
    } else {
        /* Debounce: start timer on any change, commit after stable period */
        if (logical != ctx->pending_state || !ctx->debounce_pending) {
            ctx->pending_state     = logical;
            ctx->debounce_start_ms = now_ms;
            ctx->debounce_pending  = true;
        }
        if (ctx->debounce_pending &&
            (now_ms - ctx->debounce_start_ms) >= ctx->settings.debounce_ms)
        {
            if (ctx->pending_state != ctx->state.active) {
                ctx->state.active   = ctx->pending_state;
                ctx->state.active_f = ctx->pending_state ? 100.0f : 0.0f;
                ctx->state.last_change_tick = now_ms;
                ctx->state.change_count++;
            }
            ctx->debounce_pending = false;
        }
    }

    return PDS_COMP_IDLE;
}

const pds_fb_gpio_input_state_t *pds_fb_gpio_input_get_state(pds_comp_handle_t handle)
{
    return &((pds_fb_gpio_input_ctx_t *)handle)->state;
}

esp_err_t pds_fb_gpio_input_get_settings(
    pds_comp_handle_t handle,
    pds_fb_gpio_input_settings_t *out)
{
    *out = ((pds_fb_gpio_input_ctx_t *)handle)->settings;
    return ESP_OK;
}

esp_err_t pds_fb_gpio_input_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_gpio_input_settings_t *settings)
{
    pds_fb_gpio_input_ctx_t *ctx = (pds_fb_gpio_input_ctx_t *)handle;
    ctx->settings = *settings;
    if (settings->pin_input >= 0) {
        pds_gpio_pull_t pull = settings->active_low ? PDS_GPIO_PULL_UP : PDS_GPIO_PULL_DOWN;
        char _label[16]; snprintf(_label, sizeof(_label), "GPIO%d", settings->pin_input);
        pds_gpio_reg_register((uint32_t)settings->pin_input, PDS_GPIO_MODE_INPUT, pull,
                              settings->active_low, PDS_GPIO_read, NULL, _label);
    }
    if (settings->pin_power >= 0) {
        pds_pwr_group_register((int8_t)settings->pin_power, settings->power_active_low);
    }
    return ESP_OK;
}
