/**
 * PDS Component — PID → PWM (pid_pwm)
 *
 * Generic PID controller that drives a PWM output pin.
 * Process variable is supplied by a connected upstream state pointer.
 * An optional enable gate (connected bool) inhibits output when false.
 *
 * Pipeline example:
 *   sensor_ec → analog_limit → pid_pwm(pin_pwm=motor) 
 *   timer_cycle → pid_pwm._connect_enable  (run PID only during active window)
 *
 * HAL dependencies: pds_pwm
 */

#ifndef PDS_FB_PID_PWM_H
#define PDS_FB_PID_PWM_H

#include "pds_component_base.h"

/* ── User-Assignable Settings (BLE/WiFi accessible) ── */
typedef struct {
    int8_t   pin_pwm;               /**< PWM output pin */
    uint32_t pwm_frequency_hz;      /**< PWM carrier frequency */

    float    setpoint;              /**< Target process variable value */
    float    kp;                    /**< Proportional gain */
    float    ki;                    /**< Integral gain */
    float    kd;                    /**< Derivative gain */
    float    output_min;            /**< Min PID output clamped to (0–100 %) */
    float    output_max;            /**< Max PID output clamped to (0–100 %) */
    float    deadband;              /**< Ignore error smaller than this */
    uint16_t sample_interval_ms;    /**< PID recalculation interval */
    bool     reverse_acting;        /**< true = output decreases as PV rises */
    bool     enabled;
    float    count_rate_at_full;    /**< Real-world rate at 100 % duty (units/sec). 0 = disabled. */
} pds_fb_pid_pwm_settings_t;

/* ── Runtime State ── */
typedef struct {
    float    pv;                    /**< Last process variable value */
    float    error;                 /**< setpoint − pv */
    float    output_pct;            /**< PID output 0–100 % */
    float    count_rate;            /**< Derived: output_pct/100 × count_rate_at_full (units/sec) */
    float    integral;              /**< Accumulated integral */
    float    prev_error;            /**< Previous error for derivative */
    bool     in_deadband;
    uint32_t last_sample_tick;
} pds_fb_pid_pwm_state_t;

/* ── API ── */
esp_err_t pds_fb_pid_pwm_init(
    const pds_fb_pid_pwm_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_pid_pwm_run(pds_comp_handle_t handle);

/** Reset integral windup and derivative history. */
esp_err_t pds_fb_pid_pwm_reset(pds_comp_handle_t handle);

/** Zero the PWM output and reset PID state. Called by ALL-STOP. */
void pds_fb_pid_pwm_safe_state(pds_comp_handle_t handle);

/** Override setpoint at runtime without a full set_settings() call. */
esp_err_t pds_fb_pid_pwm_set_setpoint(pds_comp_handle_t handle, float setpoint);

/**
 * Connect an upstream float as the process variable.
 * e.g. &pds_comp_sensor_ph_get_state(s_ph)->ph_value
 */
esp_err_t pds_fb_pid_pwm_connect_pv(
    pds_comp_handle_t handle,
    const float *pv_ptr);

/**
 * Connect an upstream bool as an enable gate.
 * When *enable_ptr is false, PID output is zeroed and integral is held.
 * Pass NULL to run unconditionally (gated only by settings.enabled).
 */
esp_err_t pds_fb_pid_pwm_connect_enable(
    pds_comp_handle_t handle,
    const bool *enable_ptr);

const pds_fb_pid_pwm_state_t *pds_fb_pid_pwm_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_pid_pwm_get_settings(
    pds_comp_handle_t handle,
    pds_fb_pid_pwm_settings_t *out);

esp_err_t pds_fb_pid_pwm_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_pid_pwm_settings_t *settings);

#endif /* PDS_FB_PID_PWM_H */
