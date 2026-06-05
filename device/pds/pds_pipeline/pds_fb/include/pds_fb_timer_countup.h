/**
 * PDS Component — Timer Countup (timer_countup)
 *
 * Accumulates trigger events or held-input time.
 * state.active goes true when the count reaches the threshold.
 * No GPIO output — connect state.active to a downstream component.
 *
 * Decomposed equivalent of: switch_countup minus the GPIO pins.
 *
 * Pipeline example:
 *   switch_limit → timer_countup → switch_output
 *   (after float switch trips 5× → open drain valve)
 *
 * HAL dependencies: none (esp_timer only)
 */

#ifndef PDS_FB_TIMER_COUNTUP_H
#define PDS_FB_TIMER_COUNTUP_H

#include "pds_component_base.h"

typedef enum {
    PDS_TIMER_COUNTUP_EVENTS,       /**< Count discrete rising edges */
    PDS_TIMER_COUNTUP_HOLD_TIME_MS, /**< Accumulate ms while trigger is true */
} pds_fb_timer_countup_mode_t;

/* ── User-Assignable Settings (BLE/WiFi accessible) ── */
typedef struct {
    pds_fb_timer_countup_mode_t mode;
    uint32_t threshold;         /**< Events or ms required to activate */
    bool     auto_reset;        /**< Reset counter after threshold reached */
    uint32_t hold_duration_ms;  /**< How long active stays true (0 = latched until reset) */
    bool     enabled;
} pds_fb_timer_countup_settings_t;

/* ── Runtime State ── */
typedef struct {
    bool     active;            /**< true when threshold reached (bool mirror) */
    float    active_f;          /**< Float mirror: 100.0f when active, 0.0f when not.
                                 *   Connect to float-input blocks (pwm_output, fan_float).
                                 *   Consumers test >= 0.5f to avoid epsilon false-positives. */
    uint32_t current_count;     /**< Events counted or ms accumulated */
    uint32_t trigger_count;     /**< Lifetime threshold-reach count */
    bool     threshold_reached;
    uint32_t activate_tick;     /**< Tick when active last went true (for hold_duration) */
} pds_fb_timer_countup_state_t;

/* ── API ── */
esp_err_t pds_fb_timer_countup_init(
    const pds_fb_timer_countup_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_timer_countup_run(pds_comp_handle_t handle);

/** Reset counter to zero and deactivate. */
esp_err_t pds_fb_timer_countup_reset(pds_comp_handle_t handle);

/**
 * Connect an upstream float signal as the count/hold source.
 * EVENTS mode: counts rising edges (false→true, i.e. crossing >= 0.5).
 * HOLD_TIME_MS mode: accumulates ms while *trigger_ptr >= 0.5.
 * Pass NULL to disconnect (software-only counting via manual state writes).
 */
esp_err_t pds_fb_timer_countup_connect_trigger(
    pds_comp_handle_t handle,
    const float *trigger_ptr);

const pds_fb_timer_countup_state_t *pds_fb_timer_countup_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_timer_countup_get_settings(
    pds_comp_handle_t handle,
    pds_fb_timer_countup_settings_t *out);

esp_err_t pds_fb_timer_countup_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_timer_countup_settings_t *settings);

#endif /* PDS_FB_TIMER_COUNTUP_H */
