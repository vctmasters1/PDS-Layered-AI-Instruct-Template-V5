/**
 * PDS Component — ALL-STOP (all_stop)
 *
 * System safety block. When triggered (physical pin or pipeline bool input),
 * calls pds_pipeline_engine_all_stop() which:
 *   1. Suppresses all pipeline ticks
 *   2. Calls safe_state() on every output block (zeros PWM, GPIO off,
 *      stepper free-wheel, LED strip clear, PID integral reset)
 *
 * When the trigger clears, calls pds_pipeline_engine_resume().
 *
 * This block always runs even when the engine is stopped, so it can
 * detect trigger release and auto-resume.
 *
 * Usage:
 *   - Assign pin_input to a physical E-STOP / safety button
 *   - Optionally wire a limit_high/limit_low output to port 0 for
 *     pipeline-driven automatic shutdown (e.g. flood sensor, overtemp)
 *   - active_low = true for normally-closed button (recommended) — trigger on LOW
 *
 * Pipeline type ID: 0x90
 */

#ifndef PDS_FB_ALL_STOP_H
#define PDS_FB_ALL_STOP_H

#include "pds_component_base.h"

/* ── Settings ── */
typedef struct {
    int8_t   pin_input;         /**< Physical trigger pin (-1 = disabled) */
    bool     active_low;        /**< GPIO polarity. true = NC button (pull-up, trigger on LOW) */
    uint16_t debounce_ms;       /**< Debounce window (ms). 0 = no debounce */
    bool     enabled;
} pds_fb_all_stop_settings_t;

/* ── Runtime State ── */
typedef struct {
    bool stopped;               /**< true = system currently in ALL-STOP */
} pds_fb_all_stop_state_t;

/* ── API ── */
esp_err_t pds_fb_all_stop_init(
    const pds_fb_all_stop_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_all_stop_run(pds_comp_handle_t handle);

/** Connect an upstream float as a software trigger (e.g. from limit_high). Fires when >= 0.5. */
esp_err_t pds_fb_all_stop_connect_trigger(pds_comp_handle_t handle, const float *trigger_ptr);

const pds_fb_all_stop_state_t *pds_fb_all_stop_get_state(pds_comp_handle_t handle);
esp_err_t pds_fb_all_stop_get_settings(pds_comp_handle_t handle, pds_fb_all_stop_settings_t *out);
esp_err_t pds_fb_all_stop_set_settings(pds_comp_handle_t handle, const pds_fb_all_stop_settings_t *settings);

#endif /* PDS_FB_ALL_STOP_H */
