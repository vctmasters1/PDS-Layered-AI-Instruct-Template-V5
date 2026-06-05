/**
 * PDS Function Block — HMI Run Routine (hmi_run_routine)
 *
 * Virtual one-shot routine trigger controlled by the HMI (BLE/Wi-Fi/web app).
 * The HMI starts the routine via pds_fb_hmi_run_routine_start(). The block
 * runs for duration_ms, then stops. It CANNOT be re-started while already
 * running — the caller must wait for completion or abort first.
 *
 * Pipeline role: source block — no upstream connection.
 * Output ports:
 *   port 0 — running_f:  1.0f while routine is executing, 0.0f otherwise
 *   port 1 — done_f:     1.0f for exactly ONE pipeline tick after completion,
 *                         then automatically resets to 0.0f. Use as a
 *                         rising-edge trigger for downstream timer_countdown,
 *                         all_stop, etc.
 *
 * Consumers test >= 0.5f to avoid epsilon false-positives.
 *
 * PDS_BLOCK_HMI_RUN_ROUTINE = 0x06
 *
 * HAL dependencies: esp_timer (millisecond timestamps only)
 */

#ifndef PDS_FB_HMI_RUN_ROUTINE_H
#define PDS_FB_HMI_RUN_ROUTINE_H

#include "pds_component_base.h"

/* ── User-Assignable Settings (BLE/Wi-Fi accessible) ── */
typedef struct {
    uint32_t duration_ms;   /**< How long the routine runs (ms). 0 = indefinite until abort. */
    bool     enabled;       /**< false = start() is a no-op, outputs stay 0.0f */
} pds_fb_hmi_run_routine_settings_t;

/* ── Runtime State ── */
typedef struct {
    float    running_f;         /**< 1.0f while routine is executing, 0.0f otherwise.
                                 *   port 0. Consumers test >= 0.5f. */
    float    done_f;            /**< 1.0f for one tick after routine completes normally.
                                 *   port 1. Use as a rising-edge trigger downstream. */
    bool     running;           /**< true while executing */
    uint32_t run_count;         /**< Lifetime completed-run count (diagnostics) */
    uint32_t last_start_ms;     /**< Timestamp of most recent start (diagnostics) */
    uint32_t remaining_ms;      /**< Approximate time left (0 if indefinite or idle) */
} pds_fb_hmi_run_routine_state_t;

/* ── API ── */
esp_err_t pds_fb_hmi_run_routine_init(
    const pds_fb_hmi_run_routine_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_hmi_run_routine_run(pds_comp_handle_t handle);

/**
 * Start the routine.
 * Returns ESP_ERR_INVALID_STATE if already running (caller must abort first).
 * Safe to call from any task (BLE handler, Wi-Fi handler, etc.).
 */
esp_err_t pds_fb_hmi_run_routine_start(pds_comp_handle_t handle);

/**
 * Abort a running routine immediately.
 * done_f is NOT set — abort is not normal completion.
 * No-op if not currently running.
 */
esp_err_t pds_fb_hmi_run_routine_abort(pds_comp_handle_t handle);

const pds_fb_hmi_run_routine_state_t *pds_fb_hmi_run_routine_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_hmi_run_routine_get_settings(
    pds_comp_handle_t handle,
    pds_fb_hmi_run_routine_settings_t *out);

esp_err_t pds_fb_hmi_run_routine_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_hmi_run_routine_settings_t *settings);

#endif /* PDS_FB_HMI_RUN_ROUTINE_H */
