#include "pds_fb_encoder_quadrature.h"
#include "pds_tel_sink.h"
#include "pds_hal.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_attr.h"
#include <stdlib.h>
#include <string.h>

static const char *TAG = "enc_quad";

/* Forward declaration — _encoder_isr is defined after _apply_settings */
static void IRAM_ATTR _encoder_isr(void *arg);

/* Full 4-state Gray-code quadrature transition table.
 * Index = (prev_a << 1 | prev_b) << 2 | (cur_a << 1 | cur_b).
 * Value: +1 = CW step, -1 = CCW step, 0 = no change, 2 = error (skipped state).
 * IRAM_ATTR: must be accessible from ISR context. */
static const int8_t IRAM_ATTR s_quad_table[16] = {
     0, -1, +1,  2,   /* prev=00: 00=same, 01=CCW, 10=CW, 11=skip */
    +1,  0,  2, -1,   /* prev=01: 00=CW,  01=same, 10=skip, 11=CCW */
    -1,  2,  0, +1,   /* prev=10: 00=CCW, 01=skip, 10=same, 11=CW  */
     2, +1, -1,  0,   /* prev=11: 00=skip, 01=CW, 10=CCW, 11=same  */
};

typedef struct {
    pds_fb_encoder_quadrature_settings_t settings;
    pds_fb_encoder_quadrature_state_t    state;
    uint8_t                              prev_ab;
    int32_t                              count_snapshot;
    uint32_t                             velocity_tick_ms;
    bool                                 hw_ok;
} encoder_quadrature_ctx_t;

/* ── Apply settings: configure GPIO pins ─────────────────────────────────── */
static esp_err_t _apply_settings(encoder_quadrature_ctx_t *ctx)
{
    const pds_fb_encoder_quadrature_settings_t *s = &ctx->settings;

    if (s->pin_a < 0 || s->pin_b < 0) {
        ESP_LOGW(TAG, "pin_a or pin_b not configured");
        ctx->hw_ok = false;
        return ESP_ERR_INVALID_ARG;
    }

    pds_gpio_pull_t pull = (pds_gpio_pull_t)s->pull;  /* 0=none, 1=up, 2=down */
    PDS_GPIO_configure((uint32_t)s->pin_a, PDS_GPIO_MODE_INPUT, pull);
    PDS_GPIO_configure((uint32_t)s->pin_b, PDS_GPIO_MODE_INPUT, pull);

    if (s->pin_index >= 0) {
        PDS_GPIO_configure((uint32_t)s->pin_index, PDS_GPIO_MODE_INPUT, pull);
    }

    /* Drive pin_gnd LOW to provide virtual encoder GND (if wired to a GPIO) */
    if (s->pin_gnd >= 0) {
        PDS_GPIO_configure((uint32_t)s->pin_gnd, PDS_GPIO_MODE_OUTPUT, (pds_gpio_pull_t)0);
        PDS_GPIO_write((uint32_t)s->pin_gnd, 0);
    }

    ctx->hw_ok = true;

    /* Seed prev_ab from current state, then register ISRs.
     * Must run AFTER gpio_config() since that resets intr_type to DISABLE. */
    bool a = (PDS_GPIO_read((uint32_t)s->pin_a) > 0) ^ s->active_low;
    bool b = (PDS_GPIO_read((uint32_t)s->pin_b) > 0) ^ s->active_low;
    ctx->prev_ab = (uint8_t)((a ? 2u : 0u) | (b ? 1u : 0u));
    PDS_GPIO_set_interrupt((uint32_t)s->pin_a, PDS_GPIO_INTR_ANYEDGE, _encoder_isr, ctx);
    PDS_GPIO_set_interrupt((uint32_t)s->pin_b, PDS_GPIO_INTR_ANYEDGE, _encoder_isr, ctx);

    return ESP_OK;
}

/* ── ISR: runs on every A or B edge, maintains position counter ──────────── */
static void IRAM_ATTR _encoder_isr(void *arg)
{
    encoder_quadrature_ctx_t *ctx = (encoder_quadrature_ctx_t *)arg;
    const pds_fb_encoder_quadrature_settings_t *s = &ctx->settings;

    bool a = (PDS_GPIO_read((uint32_t)s->pin_a) > 0) ^ s->active_low;
    bool b = (PDS_GPIO_read((uint32_t)s->pin_b) > 0) ^ s->active_low;

    uint8_t cur_ab = (uint8_t)((a ? 2u : 0u) | (b ? 1u : 0u));
    uint8_t idx    = (uint8_t)((ctx->prev_ab << 2) | cur_ab);
    int8_t  delta  = s_quad_table[idx & 0x0Fu];

    if (delta == 2) {
        ctx->state.error_count++;
    } else if (delta != 0) {
        ctx->state.position += s->invert_direction ? -delta : delta;
    }
    ctx->prev_ab = cur_ab;
}

/* ── init ────────────────────────────────────────────────────────────────── */
esp_err_t pds_fb_encoder_quadrature_init(
    const pds_fb_encoder_quadrature_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    encoder_quadrature_ctx_t *ctx = calloc(1, sizeof(encoder_quadrature_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    ctx->settings = *settings;
    ctx->state.position_f   = 0.0f;
    ctx->state.velocity_rpm = 0.0f;
    ctx->state.index_f      = 0.0f;
    ctx->state.valid        = false;

    esp_err_t err = _apply_settings(ctx);
    if (err != ESP_OK) {
        /* keep ctx allocated; block will idle gracefully */
    }

    ctx->velocity_tick_ms = (uint32_t)(esp_timer_get_time() / 1000LL);
    ctx->count_snapshot   = 0;

    /* Register telemetry slots */
    if (ctx->hw_ok) {
        char label[PDS_TEL_SINK_LABEL_SIZE];
        pds_tel_slot_t slot = {
            .kind = PDS_TEL_PERIPH,
            .pin  = (uint8_t)settings->pin_a,
        };

        snprintf(label, sizeof(label), "periph:%d:position", settings->pin_a);
        strncpy(slot.label,        label,      sizeof(slot.label)        - 1);
        strncpy(slot.periph.field, "position", sizeof(slot.periph.field) - 1);
        slot.periph.pin   = (uint8_t)settings->pin_a;
        slot.periph.value = &ctx->state.position_f;
        pds_tel_sink_register(&slot);

        /* velocity slot — pin_b distinguishes it from position slot */
        snprintf(label, sizeof(label), "periph:%d:velocity_rpm", settings->pin_a);
        strncpy(slot.label,        label,        sizeof(slot.label)        - 1);
        strncpy(slot.periph.field, "velocity_rpm", sizeof(slot.periph.field) - 1);
        slot.periph.pin   = (uint8_t)settings->pin_b;
        slot.periph.value = &ctx->state.velocity_rpm;
        pds_tel_sink_register(&slot);
    }

    *out_handle = ctx;
    return ESP_OK;
}

/* ── run ─────────────────────────────────────────────────────────────────── */
pds_comp_status_t pds_fb_encoder_quadrature_run(pds_comp_handle_t handle)
{
    encoder_quadrature_ctx_t *ctx = (encoder_quadrature_ctx_t *)handle;

    if (!ctx->settings.enabled || !ctx->hw_ok) return PDS_COMP_IDLE;

    const pds_fb_encoder_quadrature_settings_t *s = &ctx->settings;

    /* Position is maintained by _encoder_isr — snapshot it here for telemetry */

    /* ── Index pin ───────────────────────────────────────────────────── */
    ctx->state.index_seen = false;
    ctx->state.index_f    = 0.0f;
    if (s->pin_index >= 0) {
        bool z = (PDS_GPIO_read((uint32_t)s->pin_index) > 0) ^ s->active_low;
        if (z) {
            ctx->state.index_seen = true;
            ctx->state.index_f    = 1.0f;
            if (s->reset_on_index) {
                ctx->state.position  = 0;
                ctx->count_snapshot  = 0;
            }
        }
    }

    ctx->state.position_f = (float)ctx->state.position;

    /* ── Velocity (RPM) ───────────────────────────────────────────────── */
    uint32_t now_ms   = (uint32_t)(esp_timer_get_time() / 1000LL);
    uint32_t interval = s->velocity_interval_ms ? s->velocity_interval_ms : 1000u;
    uint32_t elapsed  = now_ms - ctx->velocity_tick_ms;

    if (elapsed >= interval) {
        int32_t count_delta = ctx->state.position - ctx->count_snapshot;
        float   cpr         = (s->counts_per_rev > 0.0f) ? s->counts_per_rev : 1.0f;
        ctx->state.velocity_rpm = ((float)count_delta / (float)elapsed) * 60000.0f / cpr;
        ctx->count_snapshot     = ctx->state.position;
        ctx->velocity_tick_ms   = now_ms;
    }

    ctx->state.read_count++;
    ctx->state.valid = true;

    return PDS_COMP_ACTIVE;
}

/* ── state / settings accessors ─────────────────────────────────────────── */
const pds_fb_encoder_quadrature_state_t *pds_fb_encoder_quadrature_get_state(pds_comp_handle_t handle)
{
    return &((encoder_quadrature_ctx_t *)handle)->state;
}

esp_err_t pds_fb_encoder_quadrature_get_settings(
    pds_comp_handle_t handle,
    pds_fb_encoder_quadrature_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    *out = ((encoder_quadrature_ctx_t *)handle)->settings;
    return ESP_OK;
}

esp_err_t pds_fb_encoder_quadrature_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_encoder_quadrature_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    encoder_quadrature_ctx_t *ctx = (encoder_quadrature_ctx_t *)handle;
    ctx->settings = *settings;
    return _apply_settings(ctx);
}

void pds_fb_encoder_quadrature_reset_position(pds_comp_handle_t handle)
{
    if (!handle) return;
    encoder_quadrature_ctx_t *ctx = (encoder_quadrature_ctx_t *)handle;
    ctx->state.position   = 0;
    ctx->count_snapshot   = 0;
    ctx->state.position_f = 0.0f;
}
