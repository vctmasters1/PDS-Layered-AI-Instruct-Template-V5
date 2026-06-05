/**
 * PDS Function Block — Analog PH Sensor (pds_fb_sensor_ph)
 *
 * Power-gated analog pH electrode. Reads via ADC, applies 2-point linear
 * calibration (V → pH units), and exposes state.ph for downstream pipeline.
 *
 * Pipeline block type ID: 0x0C
 *
 * Non-blocking state machine:
 *   IDLE      → interval elapses → try_acquire ADC_PROBE mutex
 *             → if held by EC: return IDLE (retry next tick)
 *   SETTLING  → power-on GPIO; wait (settling_time_s + response_time_s) * 1000 ms
 *   SAMPLING  → oversample ADC; power-off; release mutex → IDLE
 *
 * HAL dependencies: pds_adc_registry, pds_fb_pwr_group, pds_periph_mutex
 */

#ifndef PDS_FB_SENSOR_PH_H
#define PDS_FB_SENSOR_PH_H

#include "pds_component_base.h"

/**
 * Settings — packed by blob_packer into L3.
 *
 * Layout (36 bytes, natural alignment on ESP32 / Xtensa-LX7):
 *   offset  0  uint8   adc_channel       ADC GPIO channel number
 *   offset  1  int8    pin_power         Power-enable GPIO (-1 = always on)
 *   offset  2  uint16  sample_interval_s Sample period in seconds
 *   offset  4  uint8   oversample        ADC reads to average (1–64)
 *   offset  5  uint8   settling_time_s   Wait after power-on (seconds)
 *   offset  6  uint8   response_time_s   Additional probe response wait (seconds)
 *   offset  7  bool    power_active_low  true = drive LOW to enable power
 *   offset  8  float   Vmin              Voltage at scale_min (pH low end)
 *   offset 12  float   Vmax              Voltage at scale_max (pH high end)
 *   offset 16  float   scale_min         pH value at Vmin (typically 0.0)
 *   offset 20  float   scale_max         pH value at Vmax (typically 14.0)
 *   offset 24  float   alarm_low         Low pH alarm threshold
 *   offset 28  float   alarm_high        High pH alarm threshold
 *   offset 32  bool    alarm_enabled
 *   offset 33  bool    enabled
 *   offset 34  [2 pad bytes]
 *   Total: 36 bytes
 */
typedef struct {
    uint8_t  adc_channel;
    int8_t   pin_power;
    uint16_t sample_interval_s;
    uint8_t  oversample;
    uint8_t  settling_time_s;
    uint8_t  response_time_s;
    bool     power_active_low;
    float    Vmin;
    float    Vmax;
    float    scale_min;
    float    scale_max;
    float    alarm_low;
    float    alarm_high;
    bool     alarm_enabled;
    bool     enabled;
} pds_fb_sensor_ph_settings_t;

/** Runtime state — port 0 output: state.ph */
typedef struct {
    float    ph;               /**< Calibrated pH reading — connect to downstream */
    float    voltage_v;        /**< Raw sensor voltage at last sample (for logs) */
    int32_t  raw_adc;          /**< Last averaged raw ADC count */
    bool     alarm_active;     /**< true if ph outside [alarm_low, alarm_high] */
    bool     sample_valid;     /**< false until first successful read */
    uint32_t read_count;
    uint32_t error_count;
    uint32_t last_sample_tick; /**< ms timestamp of last successful sample */
} pds_fb_sensor_ph_state_t;

/* ── API ── */
esp_err_t pds_fb_sensor_ph_init(
    const pds_fb_sensor_ph_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_sensor_ph_run(pds_comp_handle_t handle);

const pds_fb_sensor_ph_state_t *pds_fb_sensor_ph_get_state(pds_comp_handle_t handle);

esp_err_t pds_fb_sensor_ph_get_settings(
    pds_comp_handle_t handle,
    pds_fb_sensor_ph_settings_t *out);

esp_err_t pds_fb_sensor_ph_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_sensor_ph_settings_t *settings);

#endif /* PDS_FB_SENSOR_PH_H */
