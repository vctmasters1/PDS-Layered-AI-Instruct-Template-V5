/**
 * PDS Function Block — Delay (0x0B) implementation
 *
 * Rising-edge-triggered one-shot delay timer.
 * On a rising edge at input port 0: starts counting. After delay_ms elapses,
 * output (active_f) fires 1.0f for exactly one tick, then returns to 0.0f.
 *
 * One-shot: re-triggers only on a new rising edge after the previous fire.
 * While timing: input going low does NOT reset the timer.
 */

#include "pds_fb_delay.h"
#include <stdlib.h>
#include <string.h>
#include "esp_timer.h"

typedef struct {
    pds_fb_delay_settings_t  settings;
    pds_fb_delay_state_t     state;
    const float             *_input_ptr;   /**< Upstream trigger float (>= 0.5 = active) */
    bool                     _prev_input;  /**< Previous-tick input value for edge detection */
    uint32_t                 _start_tick;  /**< ms timestamp when timer started */
    bool                     _timing;      /**< true while waiting for delay to expire */
} delay_ctx_t;

static inline uint32_t _now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000LL);
}

/* ── API ──────────────────────────────────────────────────────────────────── */

esp_err_t pds_fb_delay_init(
    const pds_fb_delay_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    delay_ctx_t *ctx = calloc(1, sizeof(delay_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));
    ctx->_timing     = false;
    ctx->_prev_input = false;
    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_delay_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    delay_ctx_t *ctx = (delay_ctx_t *)handle;

    /* Disabled or no input wired → output 0 */
    if (!ctx->settings.enabled || !ctx->_input_ptr) {
        ctx->state.active_f = 0.0f;
        return PDS_COMP_IDLE;
    }

    bool cur = (*ctx->_input_ptr >= 0.5f);

    /* Rising-edge detection: start timer if not already timing */
    if (cur && !ctx->_prev_input && !ctx->_timing) {
        ctx->_start_tick = _now_ms();
        ctx->_timing     = true;
    }

    ctx->_prev_input = cur;

    /* Check if delay has elapsed */
    if (ctx->_timing && (_now_ms() - ctx->_start_tick >= ctx->settings.delay_ms)) {
        ctx->state.active_f = 100.0f;
        ctx->_timing        = false;
        return PDS_COMP_ACTIVE;
    }

    ctx->state.active_f = 0.0f;
    return PDS_COMP_IDLE;
}

void pds_fb_delay_connect_input(pds_comp_handle_t handle, const float *input_ptr)
{
    if (!handle) return;
    delay_ctx_t *ctx   = (delay_ctx_t *)handle;
    ctx->_input_ptr    = input_ptr;
    ctx->_prev_input   = input_ptr ? (*input_ptr >= 0.5f) : false;
}

const pds_fb_delay_state_t *pds_fb_delay_get_state(pds_comp_handle_t handle)
{
    if (!handle) return NULL;
    return &((delay_ctx_t *)handle)->state;
}

esp_err_t pds_fb_delay_get_settings(pds_comp_handle_t handle, pds_fb_delay_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((delay_ctx_t *)handle)->settings, sizeof(pds_fb_delay_settings_t));
    return ESP_OK;
}

esp_err_t pds_fb_delay_set_settings(pds_comp_handle_t handle, const pds_fb_delay_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    memcpy(&((delay_ctx_t *)handle)->settings, settings, sizeof(pds_fb_delay_settings_t));
    return ESP_OK;
}
