/**
 * PDS Component — ALL-STOP implementation
 */

#include "pds_fb_all_stop.h"
#include "driver/gpio.h"
#include "esp_timer.h"
#include <stdlib.h>
#include <string.h>
#include "esp_log.h"

/* Forward declarations — resolved at link time (pds_pipeline is a sibling
 * component that includes pds_fb; including pds_pipeline.h here would be
 * a circular component dependency). */
extern void pds_pipeline_engine_all_stop(void);
extern void pds_pipeline_engine_resume(void);

static const char *TAG = "all_stop";

typedef struct {
    pds_fb_all_stop_settings_t settings;
    pds_fb_all_stop_state_t    state;
    const float                *_trigger_ptr;    /**< Optional pipeline float input */
    uint32_t                   _debounce_start; /**< Tick of first trigger edge */
    bool                       _raw;            /**< Raw combined trigger (pre-debounce) */
    bool                       _debounced;      /**< Debounced trigger value */
} all_stop_ctx_t;

static inline uint32_t _now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000LL);
}

static esp_err_t _gpio_configure(const pds_fb_all_stop_settings_t *s)
{
    if (s->pin_input < 0) return ESP_OK;

    gpio_config_t cfg = {
        .pin_bit_mask = (1ULL << s->pin_input),
        .mode         = GPIO_MODE_INPUT,
        /* Pull toward safe (un-triggered) state */
        .pull_up_en   = s->active_low ? GPIO_PULLUP_ENABLE : GPIO_PULLUP_DISABLE,
        .pull_down_en = s->active_low ? GPIO_PULLDOWN_DISABLE : GPIO_PULLDOWN_ENABLE,
        .intr_type    = GPIO_INTR_DISABLE,
    };
    return gpio_config(&cfg);
}

/* ── API ── */

esp_err_t pds_fb_all_stop_init(
    const pds_fb_all_stop_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    all_stop_ctx_t *ctx = calloc(1, sizeof(all_stop_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));

    esp_err_t ret = _gpio_configure(settings);
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "GPIO configure failed pin=%d err=0x%x",
                 settings->pin_input, ret);
    }

    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_all_stop_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    all_stop_ctx_t *ctx = (all_stop_ctx_t *)handle;

    if (!ctx->settings.enabled) return PDS_COMP_IDLE;

    /* Gather raw trigger: GPIO pin OR pipeline input, either can trigger. */
    bool gpio_trig = false;
    if (ctx->settings.pin_input >= 0) {
        int level = gpio_get_level((gpio_num_t)ctx->settings.pin_input);
        gpio_trig = ctx->settings.active_low ? (level == 0) : (level == 1);
    }

    bool pipe_trig = ctx->_trigger_ptr ? (*ctx->_trigger_ptr >= 0.5f) : false;
    bool raw = gpio_trig || pipe_trig;

    /* Debounce */
    bool triggered;
    if (ctx->settings.debounce_ms == 0) {
        triggered = raw;
    } else {
        if (raw != ctx->_raw) {
            ctx->_raw           = raw;
            ctx->_debounce_start = _now_ms();
        }
        /* Commit new value only after debounce window */
        if ((_now_ms() - ctx->_debounce_start) >= ctx->settings.debounce_ms) {
            ctx->_debounced = ctx->_raw;
        }
        triggered = ctx->_debounced;
    }

    /* Act on transitions */
    if (triggered && !ctx->state.stopped) {
        ESP_LOGW(TAG, "ALL-STOP triggered (gpio=%d pipe=%d)", gpio_trig, pipe_trig);
        ctx->state.stopped = true;
        pds_pipeline_engine_all_stop();
    } else if (!triggered && ctx->state.stopped) {
        ESP_LOGI(TAG, "ALL-STOP released — resuming");
        ctx->state.stopped = false;
        pds_pipeline_engine_resume();
    }

    return ctx->state.stopped ? PDS_COMP_ACTIVE : PDS_COMP_IDLE;
}

esp_err_t pds_fb_all_stop_connect_trigger(pds_comp_handle_t handle, const float *trigger_ptr)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    ((all_stop_ctx_t *)handle)->_trigger_ptr = trigger_ptr;
    return ESP_OK;
}

const pds_fb_all_stop_state_t *pds_fb_all_stop_get_state(pds_comp_handle_t handle)
{
    if (!handle) return NULL;
    return &((all_stop_ctx_t *)handle)->state;
}

esp_err_t pds_fb_all_stop_get_settings(pds_comp_handle_t handle, pds_fb_all_stop_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((all_stop_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_all_stop_set_settings(pds_comp_handle_t handle, const pds_fb_all_stop_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    all_stop_ctx_t *ctx = (all_stop_ctx_t *)handle;
    memcpy(&ctx->settings, settings, sizeof(*settings));
    _gpio_configure(settings);
    return ESP_OK;
}
