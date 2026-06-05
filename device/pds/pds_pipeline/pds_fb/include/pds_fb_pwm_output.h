/**
 * PDS Component — PWM Output with Ratio (pwm_output)
 *
 * Accepts a float input (0–100 %, typically from a pid block) and drives
 * a PWM pin at  input × ratio/100  duty. The ratio field lets multiple
 * pwm_output blocks fan off one PID, each taking a different portion.
 *
 * count_rate output = effective_duty / 100 × count_rate_at_full
 *
 * Pipeline example:
 *   pid → pwm_output (nutrient A, ratio=30 %, pin=GPIO26)
 *       → pwm_output (nutrient B, ratio=25 %, pin=GPIO27)
 *       → pwm_output (water,      ratio=45 %, pin=GPIO14)
 */

#ifndef PDS_FB_PWM_OUTPUT_H
#define PDS_FB_PWM_OUTPUT_H

#include "pds_component_base.h"

/* ── Settings ── */
typedef struct {
    int8_t   pin_pwm;               /**< PWM output pin */
    uint32_t pwm_frequency_hz;      /**< PWM carrier frequency */
    float    ratio;                 /**< This output's share of the PID signal (0–100 %).
                                     *   effective_duty = input_pct × ratio / 100 */
    float    func_min;              /**< Functional minimum duty % (0–100). If effective_duty > 0 but
                                     *   < func_min the output snaps to 0 (prevents pump stall). 0 = disabled. */
    float    func_max;              /**< Functional maximum duty % (0–100). Hard cap per pump. 100 = no limit. */
    float    count_rate_at_full;    /**< Real-world rate at 100 % effective duty (units/sec). 0 = disabled. */
    bool     enabled;
} pds_fb_pwm_output_settings_t;

/* ── Runtime State ── */
typedef struct {
    float    input_pct;             /**< Last received PID output (0–100 %) */
    float    pwm_duty;              /**< Actual duty written to pin (input × ratio/100) */
    float    count_rate;            /**< pwm_duty/100 × count_rate_at_full */
} pds_fb_pwm_output_state_t;

/* ── API ── */
esp_err_t pds_fb_pwm_output_init(
    const pds_fb_pwm_output_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_pwm_output_run(pds_comp_handle_t handle);

esp_err_t pds_fb_pwm_output_connect_value(pds_comp_handle_t handle, const float *value_ptr);
esp_err_t pds_fb_pwm_output_connect_enable(pds_comp_handle_t handle, const bool *enable_ptr);

const pds_fb_pwm_output_state_t *pds_fb_pwm_output_get_state(pds_comp_handle_t handle);
esp_err_t pds_fb_pwm_output_get_settings(pds_comp_handle_t handle, pds_fb_pwm_output_settings_t *out);
esp_err_t pds_fb_pwm_output_set_settings(pds_comp_handle_t handle, const pds_fb_pwm_output_settings_t *settings);

/** Zero the PWM output. Called by ALL-STOP. */
void pds_fb_pwm_output_safe_state(pds_comp_handle_t handle);

#endif /* PDS_FB_PWM_OUTPUT_H */
