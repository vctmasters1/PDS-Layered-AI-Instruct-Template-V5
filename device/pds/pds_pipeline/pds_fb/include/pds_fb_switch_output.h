/**
 * PDS Component — Switch Output (switch_output)
 *
 * Drives a single GPIO output from a connected upstream bool signal.
 * This is the GPIO actuator half of the decomposed switch_* pipeline.
 *
 * Decomposition of existing bundled components:
 *   switch_cycle     = timer_cycle     + switch_output
 *   switch_countdown = timer_countdown + switch_output
 *   switch_countup   = timer_countup   + switch_output
 *
 * Pipeline example:
 *   timer_cycle → switch_output(pin=relay)
 *   analog_limit → switch_output(pin=alarm_led)
 *
 * HAL dependencies: pds_gpio
 */

#ifndef PDS_FB_SWITCH_OUTPUT_H
#define PDS_FB_SWITCH_OUTPUT_H

#include "pds_component_base.h"

/* ── User-Assignable Settings (BLE/WiFi accessible) ── */
typedef struct {
    int8_t   pin_output;        /**< GPIO output pin */
    bool     active_low;        /**< true = drive LOW to activate (relay coil to GND) */
    bool     enabled;
} pds_fb_switch_output_settings_t;

/* ── Runtime State ── */
typedef struct {
    bool output_state;          /**< Current physical GPIO level (after polarity) */
} pds_fb_switch_output_state_t;

/* ── API ── */
esp_err_t pds_fb_switch_output_init(
    const pds_fb_switch_output_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_switch_output_run(pds_comp_handle_t handle);

/** Force output regardless of connected signal. Re-arms normal operation after. */
esp_err_t pds_fb_switch_output_force(pds_comp_handle_t handle, bool on);

/**
 * Connect an upstream float as the drive signal.
 * >= 0.5f = on, < 0.5f = off. Guards against float epsilon false-positives.
 * e.g. &pds_fb_timer_cycle_get_state(s_timer)->active_f
 * Pass NULL to drive output from force() only.
 */
esp_err_t pds_fb_switch_output_connect_signal(
    pds_comp_handle_t handle,
    const float *signal_ptr);

const pds_fb_switch_output_state_t *pds_fb_switch_output_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_switch_output_get_settings(
    pds_comp_handle_t handle,
    pds_fb_switch_output_settings_t *out);

esp_err_t pds_fb_switch_output_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_switch_output_settings_t *settings);

#endif /* PDS_FB_SWITCH_OUTPUT_H */
