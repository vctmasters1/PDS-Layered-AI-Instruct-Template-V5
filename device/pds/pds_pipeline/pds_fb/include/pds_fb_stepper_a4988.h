/**
 * PDS Function Block — A4988 Stepper Driver (fb_stepper_a4988)
 *
 * Velocity-mode stepper controller for the Allegro A4988 driver.
 * Generates STEP pulses via esp_timer, controls DIR/ENABLE GPIO pins,
 * and optionally drives MS1/MS2/MS3 microstep select pins.
 *
 * Accepts a connected float (speed_rpm) and optional bool (enable gate).
 * Positive speed = forward, negative = reverse.
 * Acceleration ramping is applied each run() tick.
 *
 * Pipeline example:
 *   fb_ref(speed_rpm=30) → fb_stepper_a4988(pin_step=4, pin_dir=5)
 *   fb_timer_cycle → fb_stepper_a4988._connect_enable  (run only during cycle window)
 *
 * HAL dependencies: pds_gpio
 * Pipeline type ID: 0x60
 */

#ifndef PDS_FB_STEPPER_A4988_H
#define PDS_FB_STEPPER_A4988_H

#include "pds_component_base.h"

/* ── User-Assignable Settings ── */
typedef struct {
    int8_t   pin_step;           /**< STEP pulse output pin (-1 = disabled) */
    int8_t   pin_dir;            /**< DIR direction pin (-1 = not connected) */
    int8_t   pin_enable;         /**< ENABLE active-low pin (-1 = always enabled) */
    int8_t   pin_ms1;            /**< MS1 microstep select (-1 = not wired) */
    int8_t   pin_ms2;            /**< MS2 microstep select (-1 = not wired) */
    int8_t   pin_ms3;            /**< MS3 microstep select (-1 = not wired) */

    uint16_t steps_per_rev;      /**< Full steps per motor revolution (typically 200) */
    uint8_t  microstep_divisor;  /**< 1, 2, 4, 8, or 16; also drives MS pins if wired */

    float    max_rpm;            /**< Maximum RPM clamp (> 0) */
    float    accel_rpm_s;        /**< Acceleration ramp in RPM/sec (0 = instant) */
    bool     invert_dir;         /**< Invert the DIR signal logic */
    bool     enabled;
} pds_fb_stepper_a4988_settings_t;

/* ── Runtime State (velocity mode) ── */
typedef struct {
    float    current_rpm;        /**< Actual ramped speed (positive = forward) */
    float    target_rpm;         /**< Last requested speed from pipeline */
    int32_t  step_count;         /**< Lifetime step pulse count */
    bool     running;            /**< True when step timer is active */
    bool     fault;              /**< Not used on A4988; reserved */
} pds_fb_stepper_a4988_state_t;

/* ── Position Mode ── */
/** Settings are identical to velocity — same hardware config, same struct. */
typedef pds_fb_stepper_a4988_settings_t pds_fb_stepper_a4988_position_settings_t;

typedef struct {
    float    done_f;             /**< 1.0f for one pipeline tick when move completes */
    int32_t  steps_remaining;   /**< Steps left in current move */
    bool     moving;             /**< True while a move is in progress */
} pds_fb_stepper_a4988_position_state_t;

/* ── API ── */
esp_err_t pds_fb_stepper_a4988_init(
    const pds_fb_stepper_a4988_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_stepper_a4988_run(pds_comp_handle_t handle);

esp_err_t pds_fb_stepper_a4988_stop(pds_comp_handle_t handle);

/** Connect an upstream float as target speed (RPM). */
esp_err_t pds_fb_stepper_a4988_connect_speed(
    pds_comp_handle_t handle, const float *speed_ptr);

/** Connect an upstream bool as software enable gate. */
esp_err_t pds_fb_stepper_a4988_connect_enable(
    pds_comp_handle_t handle, const bool *enable_ptr);

const pds_fb_stepper_a4988_state_t *pds_fb_stepper_a4988_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_stepper_a4988_get_settings(
    pds_comp_handle_t handle, pds_fb_stepper_a4988_settings_t *out);

esp_err_t pds_fb_stepper_a4988_set_settings(
    pds_comp_handle_t handle, const pds_fb_stepper_a4988_settings_t *settings);

/* ── Position Mode API ── */
esp_err_t pds_fb_stepper_a4988_position_init(
    const pds_fb_stepper_a4988_position_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_stepper_a4988_position_run(pds_comp_handle_t handle);

esp_err_t pds_fb_stepper_a4988_position_stop(pds_comp_handle_t handle);

/** Connect an upstream float as target steps (cast to int32; negative = reverse). */
esp_err_t pds_fb_stepper_a4988_position_connect_target(
    pds_comp_handle_t handle, const float *target_steps_ptr);

/** Connect an upstream float as trigger (rising edge starts move). */
esp_err_t pds_fb_stepper_a4988_position_connect_trigger(
    pds_comp_handle_t handle, const float *trigger_ptr);

const pds_fb_stepper_a4988_position_state_t *pds_fb_stepper_a4988_position_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_stepper_a4988_position_get_settings(
    pds_comp_handle_t handle, pds_fb_stepper_a4988_settings_t *out);

esp_err_t pds_fb_stepper_a4988_position_set_settings(
    pds_comp_handle_t handle, const pds_fb_stepper_a4988_settings_t *settings);

#endif /* PDS_FB_STEPPER_A4988_H */
