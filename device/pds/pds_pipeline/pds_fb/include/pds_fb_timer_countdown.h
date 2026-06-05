/**
 * PDS Component — Timer Countdown (timer_countdown)
 *
 * One-shot countdown timer with no GPIO output.
 * Activated by a software call or a connected upstream bool signal
 * (rising-edge triggered). state.active is true while counting down.
 *
 * Decomposed equivalent of: switch_countdown minus the GPIO pins.
 *
 * Pipeline example:
 *   switch_limit → timer_countdown → switch_output
 *   (float switch trips → valve runs for 30 s)
 *
 * HAL dependencies: none (esp_timer only)
 */

#ifndef PDS_FB_TIMER_COUNTDOWN_H
#define PDS_FB_TIMER_COUNTDOWN_H

#include "pds_component_base.h"

/* ── User-Assignable Settings (BLE/WiFi accessible) ── */
typedef struct {
    uint32_t duration_ms;       /**< How long active stays true after trigger */
    bool     retrigger;         /**< true = restart if trigger fires again while active */
    bool     any_edge;          /**< true = trigger on ANY state change (rising OR falling edge) */
    uint32_t cooldown_ms;       /**< Min time between activations */
    bool     enabled;
} pds_fb_timer_countdown_settings_t;

/* ── Runtime State ── */
typedef struct {
    bool     active;            /**< true while countdown is running (bool mirror) */
    float    active_f;          /**< Float mirror: 100.0f when active, 0.0f when not.
                                 *   Connect to float-input blocks (pwm_output, fan_float).
                                 *   Consumers test >= 0.5f to avoid epsilon false-positives. */
    uint32_t remaining_ms;      /**< Approximate time left */
    uint32_t trigger_count;     /**< Lifetime trigger count */
    uint32_t last_trigger_tick;
} pds_fb_timer_countdown_state_t;

/* ── API ── */
esp_err_t pds_fb_timer_countdown_init(
    const pds_fb_timer_countdown_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_timer_countdown_run(pds_comp_handle_t handle);

/** Software trigger — same effect as a rising edge on the connected signal. */
esp_err_t pds_fb_timer_countdown_trigger(pds_comp_handle_t handle);

/** Cancel a running countdown immediately. */
esp_err_t pds_fb_timer_countdown_cancel(pds_comp_handle_t handle);

/**
 * Connect an upstream float signal as the trigger source.
 * Rising edge (false→true, i.e. crossing >= 0.5) on *trigger_ptr fires the countdown.
 * Pass NULL to disconnect (software-trigger only).
 */
esp_err_t pds_fb_timer_countdown_connect_trigger(
    pds_comp_handle_t handle,
    const float *trigger_ptr);

const pds_fb_timer_countdown_state_t *pds_fb_timer_countdown_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_timer_countdown_get_settings(
    pds_comp_handle_t handle,
    pds_fb_timer_countdown_settings_t *out);

esp_err_t pds_fb_timer_countdown_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_timer_countdown_settings_t *settings);

#endif /* PDS_FB_TIMER_COUNTDOWN_H */
