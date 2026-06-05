/**
 * PDS Function Block — HMI Toggle (hmi_toggle)
 *
 * Virtual latching switch controlled by the HMI (BLE/Wi-Fi/web app).
 * ON stays ON until the HMI sets it OFF. No hardware pin.
 *
 * Pipeline role: source block — no upstream connection.
 * Output port 0: state.active_f (100.0f = ON, 0.0f = OFF)
 *   Consumers test >= 0.5f to avoid epsilon false-positives.
 *
 * The HMI updates the state by calling set_settings() with value = true/false.
 * This travels through the standard pipeline settings channel (BLE/Wi-Fi).
 * value is a persistent setting — serialised to NVS via the L3 blob so the
 * toggle state survives a device reboot.
 *
 * PDS_BLOCK_HMI_TOGGLE = 0x04
 *
 * HAL dependencies: none
 */

#ifndef PDS_FB_HMI_TOGGLE_H
#define PDS_FB_HMI_TOGGLE_H

#include "pds_component_base.h"

/* ── User-Assignable Settings (BLE/Wi-Fi accessible) ── */
typedef struct {
    bool value;     /**< Current toggle state: true = ON, false = OFF.
                     *   Written by the HMI via set_settings(). */
    bool enabled;   /**< false = output forced to 0.0f regardless of value */
} pds_fb_hmi_toggle_settings_t;

/* ── Runtime State ── */
typedef struct {
    float active_f; /**< Float mirror: 100.0f when ON, 0.0f when OFF.
                     *   Connect to float-input blocks (fan_float, led_addr, gpio_output …).
                     *   Consumers test >= 0.5f to avoid epsilon false-positives. */
} pds_fb_hmi_toggle_state_t;

/* ── API ── */
esp_err_t pds_fb_hmi_toggle_init(
    const pds_fb_hmi_toggle_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_hmi_toggle_run(pds_comp_handle_t handle);

const pds_fb_hmi_toggle_state_t *pds_fb_hmi_toggle_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_hmi_toggle_get_settings(
    pds_comp_handle_t handle,
    pds_fb_hmi_toggle_settings_t *out);

esp_err_t pds_fb_hmi_toggle_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_hmi_toggle_settings_t *settings);

#endif /* PDS_FB_HMI_TOGGLE_H */
