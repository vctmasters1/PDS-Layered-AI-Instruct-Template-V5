#include "pds_fb_encoder_mapped.h"
#include "pds_tel_sink.h"
#include "pds_hal.h"
#include "esp_log.h"
#include "esp_attr.h"
#include <stdlib.h>
#include <math.h>
#include <string.h>

static const char *TAG = "enc_mapped";

/* Gray-code quadrature transition table (same logic as encoder_quadrature) */
static const int8_t IRAM_ATTR s_quad_table[16] = {
     0, -1, +1,  2,
    +1,  0,  2, -1,
    -1,  2,  0, +1,
     2, +1, -1,  0,
};

typedef struct {
    pds_fb_encoder_mapped_settings_t settings;
    pds_fb_encoder_mapped_state_t    state;
    volatile int32_t                 position;  /* ISR-maintained count */
    uint8_t                          prev_ab;
    bool                             hw_ok;
    float                           *_target_float;  /* control_point target (NULL = not wired) */
    /* Settle-save tracking — detect 10 s of no change then push to server */
    float    _settle_value;      /* mapped_value at last ack (or init) */
    uint32_t _last_change_ms;    /* esp_log_timestamp() when value last changed */
    bool     _settle_pending;    /* true when value changed since last ack */
} encoder_mapped_ctx_t;

/* Forward declaration */
static void IRAM_ATTR _encoder_isr(void *arg);

/* ── ISR ─────────────────────────────────────────────────────────────────── */
static void IRAM_ATTR _encoder_isr(void *arg)
{
    encoder_mapped_ctx_t *ctx = (encoder_mapped_ctx_t *)arg;
    const pds_fb_encoder_mapped_settings_t *s = &ctx->settings;

    bool a = (PDS_GPIO_read((uint32_t)s->pin_a) > 0) ^ s->active_low;
    bool b = (PDS_GPIO_read((uint32_t)s->pin_b) > 0) ^ s->active_low;

    uint8_t cur_ab = (uint8_t)((a ? 2u : 0u) | (b ? 1u : 0u));
    uint8_t idx    = (uint8_t)((ctx->prev_ab << 2) | cur_ab);
    int8_t  delta  = s_quad_table[idx & 0x0Fu];

    if (delta != 0 && delta != 2)
        ctx->position += s->invert_direction ? -delta : delta;
    ctx->prev_ab = cur_ab;
}

/* ── GPIO setup — called on init and every settings update ──────────────── */
static esp_err_t _apply_settings(encoder_mapped_ctx_t *ctx)
{
    const pds_fb_encoder_mapped_settings_t *s = &ctx->settings;

    if (s->pin_a < 0 || s->pin_b < 0) { ctx->hw_ok = false; return ESP_ERR_INVALID_ARG; }

    pds_gpio_pull_t pull = (pds_gpio_pull_t)s->pull;
    PDS_GPIO_configure((uint32_t)s->pin_a, PDS_GPIO_MODE_INPUT, pull);
    PDS_GPIO_configure((uint32_t)s->pin_b, PDS_GPIO_MODE_INPUT, pull);

    if (s->pin_index >= 0)
        PDS_GPIO_configure((uint32_t)s->pin_index, PDS_GPIO_MODE_INPUT, pull);

    if (s->pin_gnd >= 0) {
        PDS_GPIO_configure((uint32_t)s->pin_gnd, PDS_GPIO_MODE_OUTPUT, (pds_gpio_pull_t)0);
        PDS_GPIO_write((uint32_t)s->pin_gnd, 0);
    }

    ctx->hw_ok = true;

    /* Seed prev_ab, then register ISRs (must follow gpio_config which resets intr_type) */
    bool a = (PDS_GPIO_read((uint32_t)s->pin_a) > 0) ^ s->active_low;
    bool b = (PDS_GPIO_read((uint32_t)s->pin_b) > 0) ^ s->active_low;
    ctx->prev_ab = (uint8_t)((a ? 2u : 0u) | (b ? 1u : 0u));
    PDS_GPIO_set_interrupt((uint32_t)s->pin_a, PDS_GPIO_INTR_ANYEDGE, _encoder_isr, ctx);
    PDS_GPIO_set_interrupt((uint32_t)s->pin_b, PDS_GPIO_INTR_ANYEDGE, _encoder_isr, ctx);

    return ESP_OK;
}

/* ── Linear map helper ───────────────────────────────────────────────────── */
static float _apply_map(const pds_fb_encoder_mapped_settings_t *s, float pos)
{
    float in_range = s->map_in_max - s->map_in_min;
    float t = (in_range != 0.0f) ? (pos - s->map_in_min) / in_range : 0.0f;
    if (s->clamp)
        t = fmaxf(0.0f, fminf(1.0f, t));
    return s->map_out_min + t * (s->map_out_max - s->map_out_min);
}

/* ── init ────────────────────────────────────────────────────────────────── */
esp_err_t pds_fb_encoder_mapped_init(
    const pds_fb_encoder_mapped_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    encoder_mapped_ctx_t *ctx = calloc(1, sizeof(encoder_mapped_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    ctx->settings = *settings;

    esp_err_t err = _apply_settings(ctx);
    if (err != ESP_OK)
        ESP_LOGW(TAG, "GPIO setup failed (%d); block will idle", err);

    ctx->state.mapped_value = _apply_map(settings, 0.0f);
    ctx->state.position_f   = 0.0f;
    ctx->state.valid        = false;
    ctx->_settle_value      = ctx->state.mapped_value;
    ctx->_last_change_ms    = 0;
    ctx->_settle_pending    = false;

    if (ctx->hw_ok) {
        pds_tel_slot_t slot = {
            .kind = PDS_TEL_PERIPH,
            .pin  = (uint8_t)settings->pin_a,
        };
        char label[PDS_TEL_SINK_LABEL_SIZE];
        snprintf(label, sizeof(label), "periph:%d:mapped", settings->pin_a);
        strncpy(slot.label,        label,    sizeof(slot.label)        - 1);
        strncpy(slot.periph.field, "mapped", sizeof(slot.periph.field) - 1);
        slot.periph.pin   = (uint8_t)settings->pin_a;
        slot.periph.value = &ctx->state.mapped_value;
        pds_tel_sink_register(&slot);
    }

    *out_handle = ctx;
    return ESP_OK;
}

/* ── run — read ISR-maintained position, compute map ────────────────────── */
pds_comp_status_t pds_fb_encoder_mapped_run(pds_comp_handle_t handle)
{
    encoder_mapped_ctx_t *ctx = (encoder_mapped_ctx_t *)handle;
    if (!ctx->settings.enabled || !ctx->hw_ok) return PDS_COMP_IDLE;

    const pds_fb_encoder_mapped_settings_t *s = &ctx->settings;

    if (s->pin_index >= 0) {
        bool z = (PDS_GPIO_read((uint32_t)s->pin_index) > 0) ^ s->active_low;
        if (z && s->reset_on_index)
            ctx->position = 0;
    }

    ctx->state.position_f   = (float)ctx->position;
    ctx->state.mapped_value = _apply_map(s, ctx->state.position_f);
    ctx->state.read_count++;
    ctx->state.valid = true;

    /* Write control_point target if wired */
    if (ctx->_target_float) {
        *ctx->_target_float = ctx->state.mapped_value;
        /* Settle tracking: reset 10 s window on each change */
        if (ctx->state.mapped_value != ctx->_settle_value) {
            ctx->_last_change_ms = esp_log_timestamp();
            ctx->_settle_pending = true;
        }
    }

    return PDS_COMP_ACTIVE;
}

/* ── state / settings accessors ─────────────────────────────────────────── */
const pds_fb_encoder_mapped_state_t *pds_fb_encoder_mapped_get_state(pds_comp_handle_t handle)
{
    return &((encoder_mapped_ctx_t *)handle)->state;
}

esp_err_t pds_fb_encoder_mapped_get_settings(
    pds_comp_handle_t handle,
    pds_fb_encoder_mapped_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    *out = ((encoder_mapped_ctx_t *)handle)->settings;
    return ESP_OK;
}

esp_err_t pds_fb_encoder_mapped_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_encoder_mapped_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    encoder_mapped_ctx_t *ctx = (encoder_mapped_ctx_t *)handle;
    ctx->settings = *settings;
    return _apply_settings(ctx);
}

void pds_fb_encoder_mapped_reset_position(pds_comp_handle_t handle)
{
    if (!handle) return;
    encoder_mapped_ctx_t *ctx = (encoder_mapped_ctx_t *)handle;
    ctx->position           = 0;
    ctx->state.position_f   = 0.0f;
    ctx->state.mapped_value = _apply_map(&ctx->settings, 0.0f);
}

void pds_fb_encoder_mapped_set_target(pds_comp_handle_t handle, float *target_ptr)
{
    if (!handle) return;
    encoder_mapped_ctx_t *ctx = (encoder_mapped_ctx_t *)handle;
    ctx->_target_float = target_ptr;
    /* Sync settle baseline to the L3's current setpoint. If the server pushed a
     * different value than the encoder's physical position, run() will detect
     * the mismatch on the next tick and trigger a settle-save. */
    if (target_ptr)
        ctx->_settle_value = *target_ptr;
}

/* ── Settle-save API ─────────────────────────────────────────────────────── */

#define ENCODER_SETTLE_MS 10000u  /* 10 s no-movement before flagging as settled */

esp_err_t pds_fb_encoder_mapped_poll_settle(pds_comp_handle_t handle, float *out_value)
{
    if (!handle || !out_value) return ESP_ERR_INVALID_ARG;
    encoder_mapped_ctx_t *ctx = (encoder_mapped_ctx_t *)handle;
    if (!ctx->_settle_pending) return ESP_ERR_NOT_FOUND;
    if (!ctx->_target_float)  return ESP_ERR_NOT_FOUND;
    /* uint32 subtraction wraps correctly, handles esp_log_timestamp() rollover */
    if ((esp_log_timestamp() - ctx->_last_change_ms) < ENCODER_SETTLE_MS) return ESP_ERR_NOT_FOUND;
    *out_value = ctx->state.mapped_value;
    return ESP_OK;
}

void pds_fb_encoder_mapped_ack_settle(pds_comp_handle_t handle)
{
    if (!handle) return;
    encoder_mapped_ctx_t *ctx = (encoder_mapped_ctx_t *)handle;
    ctx->_settle_value   = ctx->state.mapped_value;
    ctx->_settle_pending = false;
}
