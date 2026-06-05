/**
 * PDS Component — Addressable LED Output implementation
 *
 * Uses ESP-IDF led_strip driver (requires esp_driver_rmt + esp-idf-led-strip
 * component in CMakeLists.txt REQUIRES).
 */

#include "pds_fb_led_addr.h"
#include "led_strip.h"
#include <stdlib.h>
#include <string.h>
#include "esp_log.h"

static const char *TAG = "led_addr";

typedef struct {
    pds_fb_led_addr_settings_t settings;
    pds_fb_led_addr_state_t    state;
    led_strip_handle_t         strip;
    const float               *_signal_ptr;
} led_addr_ctx_t;

/* ── Helpers ── */

static uint8_t _scale(uint8_t value, uint8_t brightness_pct)
{
    if (brightness_pct == 0)   return 0;
    if (brightness_pct >= 100) return value;
    return (uint8_t)((uint32_t)value * brightness_pct / 100u);
}

static esp_err_t _strip_init(led_addr_ctx_t *ctx)
{
    if (ctx->settings.pin_data < 0 || ctx->settings.num_leds == 0) return ESP_OK;

    led_strip_config_t strip_cfg = {
        .strip_gpio_num          = (int)ctx->settings.pin_data,
        .max_leds                = ctx->settings.num_leds,
        .color_component_format  = (ctx->settings.led_type == PDS_LED_TYPE_SK6812)
                                   ? LED_STRIP_COLOR_COMPONENT_FMT_GRBW
                                   : LED_STRIP_COLOR_COMPONENT_FMT_GRB,
        .led_model               = (ctx->settings.led_type == PDS_LED_TYPE_SK6812)
                                   ? LED_MODEL_SK6812
                                   : LED_MODEL_WS2812,
        .flags.invert_out        = false,
    };

    led_strip_rmt_config_t rmt_cfg = {
        .clk_src       = RMT_CLK_SRC_DEFAULT,
        .resolution_hz = 10 * 1000 * 1000,  /* 10 MHz */
        .flags.with_dma = false,
    };

    esp_err_t ret = led_strip_new_rmt_device(&strip_cfg, &rmt_cfg, &ctx->strip);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "led_strip_new_rmt_device failed: %s", esp_err_to_name(ret));
        ctx->strip = NULL;
        return ret;
    }

    led_strip_clear(ctx->strip);
    ESP_LOGI(TAG, "GPIO%d: %s × %u LEDs ready",
             ctx->settings.pin_data,
             ctx->settings.led_type == PDS_LED_TYPE_SK6812 ? "SK6812" : "WS2812B",
             ctx->settings.num_leds);
    return ESP_OK;
}

static void _strip_deinit(led_addr_ctx_t *ctx)
{
    if (ctx->strip) {
        led_strip_del(ctx->strip);
        ctx->strip = NULL;
    }
}

static void _write_color(led_addr_ctx_t *ctx, bool on)
{
    if (!ctx->strip) return;

    if (!on) {
        led_strip_clear(ctx->strip);
        led_strip_refresh(ctx->strip);
        return;
    }

    uint8_t r = _scale(ctx->settings.color_r, ctx->settings.brightness);
    uint8_t g = _scale(ctx->settings.color_g, ctx->settings.brightness);
    uint8_t b = _scale(ctx->settings.color_b, ctx->settings.brightness);
    uint8_t w = _scale(ctx->settings.color_w, ctx->settings.brightness);

    for (uint16_t i = 0; i < ctx->settings.num_leds; i++) {
        if (ctx->settings.led_type == PDS_LED_TYPE_SK6812) {
            led_strip_set_pixel_rgbw(ctx->strip, i, r, g, b, w);
        } else {
            led_strip_set_pixel(ctx->strip, i, r, g, b);
        }
    }
    led_strip_refresh(ctx->strip);
}

/* ── API ── */

esp_err_t pds_fb_led_addr_init(
    const pds_fb_led_addr_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    led_addr_ctx_t *ctx = calloc(1, sizeof(led_addr_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));

    esp_err_t ret = _strip_init(ctx);
    if (ret != ESP_OK) { free(ctx); return ret; }

    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_led_addr_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    led_addr_ctx_t *ctx = (led_addr_ctx_t *)handle;

    if (!ctx->settings.enabled) {
        if (ctx->state.active) { _write_color(ctx, false); ctx->state.active = false; }
        return PDS_COMP_IDLE;
    }

    bool on = ctx->_signal_ptr ? (*ctx->_signal_ptr >= 0.5f) : false;

    if (on != ctx->state.active) {
        _write_color(ctx, on);
        ctx->state.active = on;
    }

    return on ? PDS_COMP_ACTIVE : PDS_COMP_IDLE;
}

esp_err_t pds_fb_led_addr_connect_signal(pds_comp_handle_t handle, const float *signal_ptr)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    ((led_addr_ctx_t *)handle)->_signal_ptr = signal_ptr;
    return ESP_OK;
}

const pds_fb_led_addr_state_t *pds_fb_led_addr_get_state(pds_comp_handle_t handle)
{
    if (!handle) return NULL;
    return &((led_addr_ctx_t *)handle)->state;
}

esp_err_t pds_fb_led_addr_get_settings(pds_comp_handle_t handle, pds_fb_led_addr_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((led_addr_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

void pds_fb_led_addr_destroy(pds_comp_handle_t handle)
{
    if (!handle) return;
    _strip_deinit((led_addr_ctx_t *)handle);
}

esp_err_t pds_fb_led_addr_set_settings(pds_comp_handle_t handle, const pds_fb_led_addr_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    led_addr_ctx_t *ctx = (led_addr_ctx_t *)handle;

    bool reinit = (settings->pin_data  != ctx->settings.pin_data  ||
                   settings->led_type  != ctx->settings.led_type  ||
                   settings->num_leds  != ctx->settings.num_leds);

    memcpy(&ctx->settings, settings, sizeof(*settings));

    if (reinit) {
        _strip_deinit(ctx);
        _strip_init(ctx);
        ctx->state.active = false;
    }

    return ESP_OK;
}

void pds_fb_led_addr_safe_state(pds_comp_handle_t handle)
{
    if (!handle) return;
    led_addr_ctx_t *ctx = (led_addr_ctx_t *)handle;
    _write_color(ctx, false);
    ctx->state.active = false;
}
