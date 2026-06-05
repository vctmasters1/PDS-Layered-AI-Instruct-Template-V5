/**
 * PDS Function Block — HMI Momentary (hmi_momentary)
 *
 * Virtual momentary button triggered by the HMI (BLE/Wi-Fi/web app).
 * Output stays ON for pulse_ms milliseconds after a trigger, then returns to 0.0f.
 * No hardware pin.
 *
 * Pipeline role: source block — no upstream connection.
 * Output port 0: state.active_f (100.0f while pulse active, 0.0f otherwise)
 *   Consumers test >= 0.5f to avoid epsilon false-positives.
 *
 * The HMI fires the pulse by calling pds_fb_hmi_momentary_trigger().
 * This is typically invoked from the BLE or Wi-Fi command handler when
 * the pipeline engine resolves an HMI event to a specific block handle.
 *
 * PDS_BLOCK_HMI_MOMENTARY = 0x05
 *
 * HAL dependencies: esp_timer (millisecond timestamps only)
 */

#ifndef PDS_FB_HMI_MOMENTARY_H
#define PDS_FB_HMI_MOMENTARY_H

#include "pds_component_base.h"

/* ── User-Assignable Settings (BLE/Wi-Fi accessible) ── */
typedef struct {
    uint16_t pulse_ms;  /**< How long output stays ON after a trigger (ms, default 500) */
    bool     enabled;   /**< false = trigger() is a no-op, output stays 0.0f */
} pds_fb_hmi_momentary_settings_t;

/* ── Runtime State ── */
typedef struct {
    float    active_f;          /**< 100.0f while pulse is running, 0.0f otherwise.
                                 *   Connect to float-input blocks.
                                 *   Consumers test >= 0.5f. */
    bool     triggered;         /**< true while a pulse is in progress */
    uint32_t trigger_count;     /**< Lifetime trigger count (diagnostics) */
    uint32_t last_trigger_ms;   /**< Timestamp of most recent trigger (diagnostics) */
} pds_fb_hmi_momentary_state_t;

/* ── API ── */
esp_err_t pds_fb_hmi_momentary_init(
    const pds_fb_hmi_momentary_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_hmi_momentary_run(pds_comp_handle_t handle);

/**
 * Fire the momentary pulse.
 * Safe to call from any task (BLE handler, Wi-Fi handler, etc.).
 * Re-triggers restart the pulse timer.
 */
esp_err_t pds_fb_hmi_momentary_trigger(pds_comp_handle_t handle);

const pds_fb_hmi_momentary_state_t *pds_fb_hmi_momentary_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_hmi_momentary_get_settings(
    pds_comp_handle_t handle,
    pds_fb_hmi_momentary_settings_t *out);

esp_err_t pds_fb_hmi_momentary_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_hmi_momentary_settings_t *settings);

#endif /* PDS_FB_HMI_MOMENTARY_H */
