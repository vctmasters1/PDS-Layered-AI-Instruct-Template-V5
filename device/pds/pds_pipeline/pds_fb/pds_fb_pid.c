/**
 * PDS Component — Naked PID implementation
 */

#include "pds_fb_pid.h"
#include <stdlib.h>
#include <string.h>
#include "esp_timer.h"

typedef struct {
    pds_fb_pid_settings_t settings;
    pds_fb_pid_state_t    state;
    const float *_pv_ptr;
    const bool  *_enable_ptr;
} pid_ctx_t;

static inline uint32_t _now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000LL);
}

/* ------------------------------------------------------------------ */

esp_err_t pds_fb_pid_init(
    const pds_fb_pid_settings_t *settings,
    pds_comp_handle_t *out_handle)
{
    if (!settings || !out_handle) return ESP_ERR_INVALID_ARG;

    pid_ctx_t *ctx = calloc(1, sizeof(pid_ctx_t));
    if (!ctx) return ESP_ERR_NO_MEM;

    memcpy(&ctx->settings, settings, sizeof(*settings));
    *out_handle = (pds_comp_handle_t)ctx;
    return ESP_OK;
}

pds_comp_status_t pds_fb_pid_run(pds_comp_handle_t handle)
{
    if (!handle) return PDS_COMP_FAULT;
    pid_ctx_t *ctx = (pid_ctx_t *)handle;

    if (!ctx->settings.enabled) {
        /* Disabled → zero output so downstream blocks see 0.0f. */
        ctx->state.output_pct = 0.0f;
        return PDS_COMP_IDLE;
    }
    if (ctx->_enable_ptr && !(*ctx->_enable_ptr)) {
        ctx->state.output_pct = 0.0f;
        return PDS_COMP_IDLE;
    }
    if (!ctx->_pv_ptr) return PDS_COMP_IDLE;

    uint32_t now = _now_ms();
    if ((now - ctx->state.last_sample_tick) < ctx->settings.sample_interval_ms) {
        return PDS_COMP_ACTIVE;
    }
    ctx->state.last_sample_tick = now;

    float pv    = *ctx->_pv_ptr;
    float setpoint = ctx->settings.setpoint;
    float error = setpoint - pv;
    if (ctx->settings.reverse_acting) error = -error;

    ctx->state.pv    = pv;
    ctx->state.error = error;

    if (error < ctx->settings.deadband && error > -ctx->settings.deadband) {
        ctx->state.in_deadband = true;
        return PDS_COMP_ACTIVE;
    }
    ctx->state.in_deadband = false;

    float dt = (float)ctx->settings.sample_interval_ms / 1000.0f;

    ctx->state.integral += error * dt;
    float max_integral = ctx->settings.output_max / (ctx->settings.ki > 0.0f ? ctx->settings.ki : 1.0f);
    if (ctx->state.integral >  max_integral) ctx->state.integral =  max_integral;
    if (ctx->state.integral < -max_integral) ctx->state.integral = -max_integral;

    float derivative = (dt > 0.0f) ? ((error - ctx->state.prev_error) / dt) : 0.0f;
    ctx->state.prev_error = error;

    float output = ctx->settings.kp * error
                 + ctx->settings.ki * ctx->state.integral
                 + ctx->settings.kd * derivative;

    if (output < ctx->settings.output_min) output = ctx->settings.output_min;
    if (output > ctx->settings.output_max) output = ctx->settings.output_max;

    ctx->state.output_pct = output;
    return PDS_COMP_ACTIVE;
}

esp_err_t pds_fb_pid_reset(pds_comp_handle_t handle)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    pid_ctx_t *ctx = (pid_ctx_t *)handle;
    ctx->state.integral    = 0.0f;
    ctx->state.prev_error  = 0.0f;
    ctx->state.in_deadband = false;
    return ESP_OK;
}

esp_err_t pds_fb_pid_set_setpoint(pds_comp_handle_t handle, float setpoint)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    ((pid_ctx_t *)handle)->settings.setpoint = setpoint;
    return ESP_OK;
}

esp_err_t pds_fb_pid_connect_pv(pds_comp_handle_t handle, const float *pv_ptr)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    ((pid_ctx_t *)handle)->_pv_ptr = pv_ptr;
    return ESP_OK;
}

esp_err_t pds_fb_pid_connect_enable(pds_comp_handle_t handle, const bool *enable_ptr)
{
    if (!handle) return ESP_ERR_INVALID_ARG;
    ((pid_ctx_t *)handle)->_enable_ptr = enable_ptr;
    return ESP_OK;
}

const pds_fb_pid_state_t *pds_fb_pid_get_state(pds_comp_handle_t handle)
{
    if (!handle) return NULL;
    return &((pid_ctx_t *)handle)->state;
}

float *pds_fb_pid_get_setpoint_ptr(pds_comp_handle_t handle)
{
    if (!handle) return NULL;
    return &((pid_ctx_t *)handle)->settings.setpoint;
}

esp_err_t pds_fb_pid_get_settings(pds_comp_handle_t handle, pds_fb_pid_settings_t *out)
{
    if (!handle || !out) return ESP_ERR_INVALID_ARG;
    memcpy(out, &((pid_ctx_t *)handle)->settings, sizeof(*out));
    return ESP_OK;
}

esp_err_t pds_fb_pid_set_settings(pds_comp_handle_t handle, const pds_fb_pid_settings_t *settings)
{
    if (!handle || !settings) return ESP_ERR_INVALID_ARG;
    memcpy(&((pid_ctx_t *)handle)->settings, settings, sizeof(*settings));
    return ESP_OK;
}
