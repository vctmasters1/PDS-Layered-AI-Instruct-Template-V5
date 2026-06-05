/**
 * PDS Function Block — TB6600 Stepper Driver (fb_stepper_tb6600)
 *
 * Velocity-mode stepper controller for the TB6600 driver module.
 * STEP/DIR/ENABLE pins only — microstepping is configured by the
 * physical DIP switches on the TB6600 module.
 * Set microstep_divisor to match the DIP switch configuration so
 * the firmware can calculate the correct step frequency.
 *
 * Pipeline example:
 *   fb_ref(speed_rpm=30) → fb_stepper_tb6600(pin_step=4, pin_dir=5)
 *
 * HAL dependencies: pds_gpio
 * Pipeline type ID: 0x62
 */

#ifndef PDS_FB_STEPPER_TB6600_H
#define PDS_FB_STEPPER_TB6600_H

#include "pds_component_base.h"

/* ── User-Assignable Settings ── */
typedef struct {
    int8_t   pin_step;           /**< STEP pulse output pin (-1 = disabled) */
    int8_t   pin_dir;            /**< DIR direction pin (-1 = not connected) */
    int8_t   pin_enable;         /**< ENABLE active-low pin (-1 = always enabled) */

    uint16_t steps_per_rev;      /**< Full steps per motor revolution (typically 200) */
    uint8_t  microstep_divisor;  /**< Must match TB6600 DIP switch (1/2/4/8/16/32) */

    float    max_rpm;            /**< Maximum RPM clamp (> 0) */
    float    accel_rpm_s;        /**< Acceleration ramp in RPM/sec (0 = instant) */
    bool     invert_dir;         /**< Invert the DIR signal logic */
    bool     enabled;
} pds_fb_stepper_tb6600_settings_t;

/* ── Runtime State ── */
typedef struct {
    float    current_rpm;        /**< Actual ramped speed (positive = forward) */
    float    target_rpm;         /**< Last requested speed from pipeline */
    int32_t  step_count;         /**< Lifetime step pulse count */
    bool     running;            /**< True when step timer is active */
} pds_fb_stepper_tb6600_state_t;

/* ── Position Mode ── */
typedef pds_fb_stepper_tb6600_settings_t pds_fb_stepper_tb6600_position_settings_t;

typedef struct {
    float    done_f;             /**< 1.0f for one pipeline tick when move completes */
    int32_t  steps_remaining;   /**< Steps left in current move */
    bool     moving;             /**< True while a move is in progress */
} pds_fb_stepper_tb6600_position_state_t;

/* ── API ── */
esp_err_t pds_fb_stepper_tb6600_init(
    const pds_fb_stepper_tb6600_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_stepper_tb6600_run(pds_comp_handle_t handle);

esp_err_t pds_fb_stepper_tb6600_stop(pds_comp_handle_t handle);

/** Connect an upstream float as target speed (RPM). */
esp_err_t pds_fb_stepper_tb6600_connect_speed(
    pds_comp_handle_t handle, const float *speed_ptr);

/** Connect an upstream bool as software enable gate. */
esp_err_t pds_fb_stepper_tb6600_connect_enable(
    pds_comp_handle_t handle, const bool *enable_ptr);

const pds_fb_stepper_tb6600_state_t *pds_fb_stepper_tb6600_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_stepper_tb6600_get_settings(
    pds_comp_handle_t handle, pds_fb_stepper_tb6600_settings_t *out);

esp_err_t pds_fb_stepper_tb6600_set_settings(
    pds_comp_handle_t handle, const pds_fb_stepper_tb6600_settings_t *settings);

/* ── Position Mode API ── */
esp_err_t pds_fb_stepper_tb6600_position_init(
    const pds_fb_stepper_tb6600_position_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_stepper_tb6600_position_run(pds_comp_handle_t handle);

esp_err_t pds_fb_stepper_tb6600_position_stop(pds_comp_handle_t handle);

esp_err_t pds_fb_stepper_tb6600_position_connect_target(
    pds_comp_handle_t handle, const float *target_steps_ptr);

esp_err_t pds_fb_stepper_tb6600_position_connect_trigger(
    pds_comp_handle_t handle, const float *trigger_ptr);

const pds_fb_stepper_tb6600_position_state_t *pds_fb_stepper_tb6600_position_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_stepper_tb6600_position_get_settings(
    pds_comp_handle_t handle, pds_fb_stepper_tb6600_settings_t *out);

esp_err_t pds_fb_stepper_tb6600_position_set_settings(
    pds_comp_handle_t handle, const pds_fb_stepper_tb6600_settings_t *settings);

#endif /* PDS_FB_STEPPER_TB6600_H */
