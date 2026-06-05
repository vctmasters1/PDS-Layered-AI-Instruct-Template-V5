/**
 * PDS Component — Naked PID (pid)
 *
 * Pure PID controller. Float PV input, optional bool enable gate.
 * Outputs output_pct (0–100 %). No pin / no PWM.
 *
 * Use this when one PID signal fans out to multiple pwm_output blocks
 * (e.g. EC pipeline dosing multiple nutrients from a single PID error).
 *
 * Pipeline example:
 *   sensor_ec → pid → [fan out] → pwm_output (nutrient A, ratio=30%)
 *                               → pwm_output (nutrient B, ratio=25%)
 *                               → pwm_output (nutrient C, ratio=25%)
 *                               → pwm_output (water,      ratio=20%)
 */

#ifndef PDS_FB_PID_H
#define PDS_FB_PID_H

#include "pds_component_base.h"

/* ── Settings ── */
typedef struct {
    float    setpoint;              /**< Target process variable */
    float    kp;                    /**< Proportional gain */
    float    ki;                    /**< Integral gain */
    float    kd;                    /**< Derivative gain */
    float    output_min;            /**< Min output clamp (0–100 %) */
    float    output_max;            /**< Max output clamp (0–100 %) */
    float    deadband;              /**< Ignore error smaller than this */
    uint16_t sample_interval_ms;    /**< PID recalculation interval */
    bool     reverse_acting;        /**< true = output decreases as PV rises */
    bool     enabled;
    uint8_t  _pad1;                 /**< Reserved — was setpoint_src_idx; use encoder_mapped control_point instead */
    uint8_t  _pad[3];               /**< Alignment padding — do not use */
} pds_fb_pid_settings_t;           /**< sizeof = 36 bytes */

/* ── Runtime State ── */
typedef struct {
    float    pv;
    float    error;
    float    output_pct;            /**< PID output 0–100 % */
    float    integral;
    float    prev_error;
    bool     in_deadband;
    uint32_t last_sample_tick;
} pds_fb_pid_state_t;

/* ── API ── */
esp_err_t pds_fb_pid_init(
    const pds_fb_pid_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_pid_run(pds_comp_handle_t handle);

esp_err_t pds_fb_pid_reset(pds_comp_handle_t handle);
esp_err_t pds_fb_pid_set_setpoint(pds_comp_handle_t handle, float setpoint);

esp_err_t pds_fb_pid_connect_pv(pds_comp_handle_t handle, const float *pv_ptr);
esp_err_t pds_fb_pid_connect_enable(pds_comp_handle_t handle, const bool *enable_ptr);
/** Return a mutable pointer to settings.setpoint; used by encoder_mapped control_point wiring. */
float *pds_fb_pid_get_setpoint_ptr(pds_comp_handle_t handle);

const pds_fb_pid_state_t *pds_fb_pid_get_state(pds_comp_handle_t handle);
esp_err_t pds_fb_pid_get_settings(pds_comp_handle_t handle, pds_fb_pid_settings_t *out);
esp_err_t pds_fb_pid_set_settings(pds_comp_handle_t handle, const pds_fb_pid_settings_t *settings);

#endif /* PDS_FB_PID_H */
