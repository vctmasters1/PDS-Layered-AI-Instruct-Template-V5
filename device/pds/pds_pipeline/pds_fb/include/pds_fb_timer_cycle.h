/**
 * PDS Component — Timer Cycle (timer_cycle)
 *
 * Generates a repeating on/off signal with configurable timing.
 * No GPIO output — state.active is the chainable signal, intended
 * to enable downstream components (pid_pwm, switch_cycle, etc.)
 *
 * Pipeline example:
 *   timer_cycle → pid_pwm._connect_enable(&timer.state.active)
 *
 * HAL dependencies: none (esp_timer only)
 */

#ifndef PDS_FB_TIMER_CYCLE_H
#define PDS_FB_TIMER_CYCLE_H

#include "pds_component_base.h"

/* ── User-Assignable Settings (BLE/WiFi accessible) ── */
typedef struct {
    uint32_t on_duration_ms;    /**< How long active stays true per cycle */
    uint32_t off_duration_ms;   /**< How long active stays false per cycle */
    uint32_t initial_delay_ms;  /**< Delay before first activation */
    uint32_t max_on_count;      /**< Max ON cycles (0 = unlimited) */
    bool     enabled;
} pds_fb_timer_cycle_settings_t;

/* ── Runtime State ── */
typedef struct {
    bool     active;            /**< Current signal state (bool mirror) */
    float    active_f;          /**< Float mirror: 100.0f when active, 0.0f when not.
                                 *   Connect to float-input blocks (pwm_output, fan_float).
                                 *   Consumers test >= 0.5f to avoid epsilon false-positives. */
    uint32_t cycle_count;       /**< Number of ON phases completed */
    uint32_t total_on_ms;       /**< Cumulative ON time (ms) */
    uint32_t next_toggle_tick;  /**< Tick of next scheduled toggle */
    bool     initialized;       /**< Set on first run(); arms initial delay */
    uint32_t elapsed_ms;        /**< ms elapsed in current ON or OFF phase */
} pds_fb_timer_cycle_state_t;

/* ── API ── */
esp_err_t pds_fb_timer_cycle_init(
    const pds_fb_timer_cycle_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_timer_cycle_run(pds_comp_handle_t handle);

/** Force signal to a specific state and re-arm the scheduler. */
esp_err_t pds_fb_timer_cycle_force(pds_comp_handle_t handle, bool active);

const pds_fb_timer_cycle_state_t *pds_fb_timer_cycle_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_timer_cycle_get_settings(
    pds_comp_handle_t handle,
    pds_fb_timer_cycle_settings_t *out);

esp_err_t pds_fb_timer_cycle_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_timer_cycle_settings_t *settings);

#endif /* PDS_FB_TIMER_CYCLE_H */
