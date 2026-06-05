/**
 * PDS Function Block — HMI Initiate (hmi_initiate)
 *
 * One-shot trigger controlled by the HMI (BLE/Wi-Fi/web app).
 * When the HMI sets confirm=true via set_settings(), the block outputs 1.0f
 * for exactly one pipeline tick, then automatically clears confirm.
 *
 * Designed for user-initiated routines (e.g. "Start Water Change") where a
 * momentary confirmation from the HMI kicks off a downstream pipeline action.
 *
 * Pipeline role: source block — no upstream connection.
 * Output port 0: state.active_f (1.0f on the tick confirm fires, else 0.0f).
 *
 * L3 struct: bool confirm | bool enabled = 2 bytes (<??)
 *
 * PDS_BLOCK_HMI_INITIATE = 0x0A
 */

#ifndef PDS_FB_HMI_INITIATE_H
#define PDS_FB_HMI_INITIATE_H

#include "pds_component_base.h"

/* ── Settings (Layer 3) ── */
typedef struct {
    bool confirm;  /**< Pulsed true by the HMI to trigger. Auto-clears after one tick. */
    bool enabled;  /**< false = output forced to 0.0f regardless of confirm */
} pds_fb_hmi_initiate_settings_t;

/* ── Runtime State ── */
typedef struct {
    float active_f;  /**< 1.0f for one tick when confirm was set, then 0.0f */
} pds_fb_hmi_initiate_state_t;

/* ── API ── */
esp_err_t pds_fb_hmi_initiate_init(
    const pds_fb_hmi_initiate_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_hmi_initiate_run(pds_comp_handle_t handle);

const pds_fb_hmi_initiate_state_t *pds_fb_hmi_initiate_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_hmi_initiate_get_settings(
    pds_comp_handle_t handle,
    pds_fb_hmi_initiate_settings_t *out);

esp_err_t pds_fb_hmi_initiate_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_hmi_initiate_settings_t *settings);

#endif /* PDS_FB_HMI_INITIATE_H */
