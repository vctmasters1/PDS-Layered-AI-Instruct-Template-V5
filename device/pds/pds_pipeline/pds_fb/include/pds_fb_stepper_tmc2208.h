/**
 * PDS Function Block — TMC2208 Stepper Driver (fb_stepper_tmc2208)
 *
 * Velocity-mode stepper controller for the Trinamic TMC2208 driver.
 * Functionally identical to the TMC2209 block with two differences:
 *   - No stallGuard / CoolStep (TMC2209-only features)
 *   - UART pin is labelled PDN_UART on the TMC2208 datasheet
 *
 * All UART configuration registers (GCONF, CHOPCONF, IHOLD_IRUN)
 * are compatible with TMC2209 code; this block reuses the same
 * register map and only omits TMC2209-specific StallGuard registers.
 *
 * Pipeline example:
 *   fb_ref(speed_rpm=60) → fb_stepper_tmc2208(pin_step=4, pin_dir=5, pin_uart=6)
 *
 * HAL dependencies: pds_gpio, pds_uart
 * Pipeline type ID: 0x64
 */

#ifndef PDS_FB_STEPPER_TMC2208_H
#define PDS_FB_STEPPER_TMC2208_H

#include "pds_component_base.h"

/* ── User-Assignable Settings ── */
typedef struct {
    int8_t   pin_step;           /**< STEP pulse output pin (-1 = disabled) */
    int8_t   pin_dir;            /**< DIR direction pin (-1 = not connected) */
    int8_t   pin_enable;         /**< ENABLE active-low pin (-1 = always enabled) */
    int8_t   pin_uart;           /**< PDN_UART pin (-1 = standalone mode) */

    uint16_t steps_per_rev;      /**< Full steps per motor revolution (typically 200) */
    uint16_t microstep_divisor;  /**< 8, 16, 32, 64, 128, or 256 (UART-programmed) */

    uint16_t run_current_ma;     /**< Run current in mA (clamped to driver max) */
    uint16_t hold_current_ma;    /**< Hold current in mA (0 = power-down after idle) */

    float    max_rpm;            /**< Maximum RPM clamp (> 0) */
    float    accel_rpm_s;        /**< Acceleration ramp in RPM/sec (0 = instant) */
    bool     stealthchop;        /**< true = StealthChop, false = SpreadCycle */
    bool     invert_dir;         /**< Invert the DIR signal logic */
    bool     enabled;
} pds_fb_stepper_tmc2208_settings_t;

/* ── Runtime State ── */
typedef struct {
    float    current_rpm;        /**< Actual ramped speed (positive = forward) */
    float    target_rpm;         /**< Last requested speed from pipeline */
    int32_t  step_count;         /**< Lifetime step pulse count */
    bool     running;            /**< True when step timer is active */
    bool     uart_configured;    /**< True after successful UART init */
} pds_fb_stepper_tmc2208_state_t;

/* ── Position Mode ── */
typedef pds_fb_stepper_tmc2208_settings_t pds_fb_stepper_tmc2208_position_settings_t;

typedef struct {
    float    done_f;             /**< 1.0f for one pipeline tick when move completes */
    int32_t  steps_remaining;   /**< Steps left in current move */
    bool     moving;             /**< True while a move is in progress */
} pds_fb_stepper_tmc2208_position_state_t;

/* ── API ── */
esp_err_t pds_fb_stepper_tmc2208_init(
    const pds_fb_stepper_tmc2208_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_stepper_tmc2208_run(pds_comp_handle_t handle);

esp_err_t pds_fb_stepper_tmc2208_stop(pds_comp_handle_t handle);

/** Connect an upstream float as target speed (RPM). */
esp_err_t pds_fb_stepper_tmc2208_connect_speed(
    pds_comp_handle_t handle, const float *speed_ptr);

/** Connect an upstream bool as software enable gate. */
esp_err_t pds_fb_stepper_tmc2208_connect_enable(
    pds_comp_handle_t handle, const bool *enable_ptr);

const pds_fb_stepper_tmc2208_state_t *pds_fb_stepper_tmc2208_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_stepper_tmc2208_get_settings(
    pds_comp_handle_t handle, pds_fb_stepper_tmc2208_settings_t *out);

esp_err_t pds_fb_stepper_tmc2208_set_settings(
    pds_comp_handle_t handle, const pds_fb_stepper_tmc2208_settings_t *settings);

/* ── Position Mode API ── */
esp_err_t pds_fb_stepper_tmc2208_position_init(
    const pds_fb_stepper_tmc2208_position_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_stepper_tmc2208_position_run(pds_comp_handle_t handle);

esp_err_t pds_fb_stepper_tmc2208_position_stop(pds_comp_handle_t handle);

esp_err_t pds_fb_stepper_tmc2208_position_connect_target(
    pds_comp_handle_t handle, const float *target_steps_ptr);

esp_err_t pds_fb_stepper_tmc2208_position_connect_trigger(
    pds_comp_handle_t handle, const float *trigger_ptr);

const pds_fb_stepper_tmc2208_position_state_t *pds_fb_stepper_tmc2208_position_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_stepper_tmc2208_position_get_settings(
    pds_comp_handle_t handle, pds_fb_stepper_tmc2208_settings_t *out);

esp_err_t pds_fb_stepper_tmc2208_position_set_settings(
    pds_comp_handle_t handle, const pds_fb_stepper_tmc2208_settings_t *settings);

#endif /* PDS_FB_STEPPER_TMC2208_H */
