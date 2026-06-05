/**
 * PDS Component — Analog Limit (analog_limit)
 *
 * Float-input threshold comparator with hysteresis.
 * Reads a process variable from a connected upstream state pointer
 * and outputs a bool signal (state.tripped) when the threshold is crossed.
 *
 * Equivalent of: limit_high OR limit_low, determined by settings.trip_on_high.
 * Two instances can chain as limit_high → limit_low → downstream to gate a range.
 *
 * Pipeline example:
 *   sensor_ec → analog_limit(high) → analog_limit(low) → pid_pwm → motor
 *
 * HAL dependencies: none
 */

#ifndef PDS_FB_LIMIT_ANALOG_H
#define PDS_FB_LIMIT_ANALOG_H

#include "pds_component_base.h"

/* ── User-Assignable Settings (BLE/WiFi accessible) ── */
typedef struct {
    float    threshold;         /**< Trip point in engineering units */
    float    hysteresis;        /**< Deadband to prevent chatter at boundary */
    bool     trip_on_high;      /**< true = trip when pv > threshold (limit_high)
                                     false = trip when pv < threshold (limit_low) */
    bool     alarm_enabled;     /**< Expose alarm flag in state */
    bool     enabled;
} pds_fb_limit_analog_settings_t;

/* ── Runtime State ── */
typedef struct {
    bool     tripped;           /**< Current comparator output — connect downstream */
    float    tripped_f;         /**< Float mirror: 1.0f when tripped, 0.0f when not.
                                 *   Connect to float-input blocks (timer triggers, all_stop).
                                 *   Consumers test >= 0.5f to avoid epsilon false-positives. */
    bool     alarm_active;      /**< true if alarm_enabled and tripped */
    float    pv;                /**< Last seen process variable */
    uint32_t trip_count;        /**< Off→tripped transitions since reset */
    uint32_t last_trip_tick;
} pds_fb_limit_analog_state_t;

/* ── API ── */
esp_err_t pds_fb_limit_analog_init(
    const pds_fb_limit_analog_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_limit_analog_run(pds_comp_handle_t handle);

/** Reset trip counter. Does not change current tripped state. */
esp_err_t pds_fb_limit_analog_reset(pds_comp_handle_t handle);

/**
 * Connect an upstream float as the process variable source.
 * e.g. &pds_comp_sensor_ec_get_state(s_ec)->ec_value
 * Pass NULL to disconnect (state.tripped will not update).
 */
esp_err_t pds_fb_limit_analog_connect_pv(
    pds_comp_handle_t handle,
    const float *pv_ptr);

const pds_fb_limit_analog_state_t *pds_fb_limit_analog_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_limit_analog_get_settings(
    pds_comp_handle_t handle,
    pds_fb_limit_analog_settings_t *out);

esp_err_t pds_fb_limit_analog_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_limit_analog_settings_t *settings);

#endif /* PDS_FB_LIMIT_ANALOG_H */
