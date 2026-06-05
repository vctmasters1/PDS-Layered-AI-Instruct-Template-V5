/**
 * PDS Function Block — Analog Sensor (fb_sensor_analog)
 *
 * Generic ADC → calibrated float output.
 * Reads an ADC channel, oversamples, applies 2-point linear calibration,
 * and exposes state.value for downstream pipeline connection.
 *
 * Use this for any analog input that doesn't need domain-specific logic
 * (thermistor, light sensor, voltage rail, custom probe, etc.).
 * For pH/EC/PSI with integrated dosing or compensation, use pds_comp_sensor_*.
 *
 * Pipeline example:
 *   fb_sensor_analog → fb_limit_analog._connect_pv(&sensor.state.value)
 *   fb_sensor_analog → fb_pid_pwm._connect_pv(&sensor.state.value)
 *
 * HAL dependencies: pds_adc, pds_gpio (optional power pin)
 */

#ifndef PDS_FB_SENSOR_ANALOG_H
#define PDS_FB_SENSOR_ANALOG_H

#include "pds_component_base.h"

/* ── User-Assignable Settings (BLE/WiFi accessible) ── */
/*
 * Struct layout (28 bytes, verified against natural alignment on ESP32 / Xtensa-LX7):
 *   offset  0  uint8_t  adc_channel
 *   offset  1  int8_t   pin_power
 *   offset  2  uint16_t sample_interval_ms
 *   offset  4  uint8_t  oversample_count
 *   offset  5  bool     power_active_low
 *   offset  6  uint16_t settling_time_ms      ← uses the 2 bytes that were implicit padding
 *   offset  8  float    Vmin
 *   offset 12  float    Vmax
 *   offset 16  float    scale_min
 *   offset 20  float    scale_max
 *   offset 24  bool     enabled
 *   offset 25  [3 pad bytes]
 */
typedef struct {
    uint8_t  adc_channel;           /**< ADC channel number */
    int8_t   pin_power;             /**< GPIO to enable sensor power (-1 = always on) */
    uint16_t sample_interval_ms;    /**< Group/block sample period (ms) */
    uint8_t  oversample_count;      /**< Number of reads to average (1–64) */
    bool     power_active_low;      /**< true = drive LOW to turn sensor on */
    uint16_t settling_time_ms;      /**< ms to wait after power-on before sampling */
    float    Vmin;                  /**< Voltage (V) at low calibration point */
    float    Vmax;                  /**< Voltage (V) at high calibration point */
    float    scale_min;             /**< Engineering value at low cal point */
    float    scale_max;             /**< Engineering value at high cal point */
    bool     enabled;
} pds_fb_sensor_analog_settings_t;

/* ── Runtime State ── */
typedef struct {
    float    value;                 /**< Calibrated output — connect to downstream */
    int32_t  raw_adc;               /**< Last raw ADC reading (averaged) */
    uint32_t last_sample_tick;      /**< Tick of last successful sample */
    bool     sample_valid;          /**< False until first sample completes */
} pds_fb_sensor_analog_state_t;

/* ── API ── */
esp_err_t pds_fb_sensor_analog_init(
    const pds_fb_sensor_analog_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_sensor_analog_run(pds_comp_handle_t handle);

const pds_fb_sensor_analog_state_t *pds_fb_sensor_analog_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_sensor_analog_get_settings(
    pds_comp_handle_t handle,
    pds_fb_sensor_analog_settings_t *out);

esp_err_t pds_fb_sensor_analog_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_sensor_analog_settings_t *settings);

#endif /* PDS_FB_SENSOR_ANALOG_H */
