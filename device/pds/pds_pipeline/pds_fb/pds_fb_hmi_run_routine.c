/**
 * PDS Function Block — HMI Run Routine implementation
 *
 * duration_ms == 0 means indefinite: runs until abort().
 * done_f is raised for exactly one pipeline tick on normal completion,
 * then cleared by the next run() call.
 */

#include "pds_fb_hmi_run_routine.h"
#include "esp_timer.h"
#include <stdlib.h>
#include <string.h>

typedef struct {
    pds_fb_hmi_run_routine_settings_t settings;
    pds_fb_hmi_run_routine_state_t    state;
    uint32_t _start_ms;         /**< esp_timer snapshot when start() was called */
    bool     _done_pending;     /**< true → next run() should raise done_f for one tick */
} hmi_run_routine_ctx_t;

static inline uint32_t _now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000LL);
}

/* ------------------------------------------------------------------ */

esp_err_t pds_fb_hmi_run_routine_init(
    const pds_fb_hmi_run_routine_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    hmi_run_routine_ctx_t *ctx = calloc(1, sizeof(hmi_run_routine_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));
    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_hmi_run_routine_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    hmi_run_routine_ctx_t *ctx = (hmi_run_routine_ctx_t *)handle;

    /* Emit done_f for exactly one tick after normal completion. */
    if (ctx->_done_pending) {
        ctx->_done_pending      = false;
        ctx->state.done_f       = 1.0f;
        ctx->state.running_f    = 0.0f;
        ctx->state.remaining_ms = 0;
        return PDS_COMP_IDLE;
    }

    /* Clear done_f the tick after it was raised. */
    ctx->state.done_f = 0.0f;

    if (!ctx->settings.enabled || !ctx->state.running) {
        ctx->state.running_f    = 0.0f;
        ctx->state.remaining_ms = 0;
        return PDS_COMP_IDLE;
    }

    /* Indefinite run (duration_ms == 0): active until abort(). */
    if (ctx->settings.duration_ms == 0) {
        ctx->state.running_f    = 1.0f;
        ctx->state.remaining_ms = 0;
        return PDS_COMP_ACTIVE;
    }

    /* Timed run: check for expiry. */
    uint32_t elapsed = _now_ms() - ctx->_start_ms;
    if (elapsed >= ctx->settings.duration_ms) {
        ctx->state.running      = false;
        ctx->state.running_f    = 0.0f;
        ctx->state.remaining_ms = 0;
        ctx->state.run_count++;
        ctx->_done_pending      = true;   /* done_f raised next tick */
        return PDS_COMP_IDLE;
    }

    ctx->state.running_f    = 1.0f;
    ctx->state.remaining_ms = ctx->settings.duration_ms - elapsed;
    return PDS_COMP_ACTIVE;
}

esp_err_t pds_fb_hmi_run_routine_start(pds_comp_handle_t handle)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    hmi_run_routine_ctx_t *ctx = (hmi_run_routine_ctx_t *)handle;

    if (!ctx->settings.enabled) return ESP_OK;
    if (ctx->state.running)     return ESP_ERR_INVALID_STATE;  /* must abort first */

    ctx->_start_ms            = _now_ms();
    ctx->state.running        = true;
    ctx->state.last_start_ms  = ctx->_start_ms;
    ctx->state.done_f         = 0.0f;
    ctx->_done_pending        = false;
    return ESP_OK;
}

esp_err_t pds_fb_hmi_run_routine_abort(pds_comp_handle_t handle)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    hmi_run_routine_ctx_t *ctx = (hmi_run_routine_ctx_t *)handle;

    ctx->state.running      = false;
    ctx->state.running_f    = 0.0f;
    ctx->state.done_f       = 0.0f;
    ctx->state.remaining_ms = 0;
    ctx->_done_pending      = false;
    return ESP_OK;
}

const pds_fb_hmi_run_routine_state_t *pds_fb_hmi_run_routine_get_state(
    pds_comp_handle_t handle)
{
    return handle ? &((hmi_run_routine_ctx_t *)handle)->state : NULL;
}

esp_err_t pds_fb_hmi_run_routine_get_settings(
    pds_comp_handle_t handle,
    pds_fb_hmi_run_routine_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((hmi_run_routine_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_hmi_run_routine_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_hmi_run_routine_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    memcpy(&((hmi_run_routine_ctx_t *)handle)->settings, settings, sizeof(*settings));
    return ESP_OK;
}
