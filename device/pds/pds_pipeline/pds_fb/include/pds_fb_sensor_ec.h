/**
 * PDS Function Block — Analog EC Sensor (pds_fb_sensor_ec)
 *
 * Power-gated analog EC (electrical conductivity) probe. Reads via ADC,
 * applies 2-point linear calibration (V → mS/cm), optional temperature
 * compensation, and exposes state.ec_ms_cm for downstream pipeline.
 *
 * Output unit: mS/cm. All scale_min/scale_max/alarm thresholds are in mS/cm.
 * The HMI converts mS/cm to the user's preferred display unit (PPM500/PPM700/CF).
 *
 * Pipeline block type ID: 0x0D
 *
 * Non-blocking state machine (identical to sensor_ph):
 *   IDLE      → interval elapses → try_acquire ADC_PROBE mutex
 *             → if held by PH: return IDLE (retry next tick)
 *   SETTLING  → power-on GPIO; wait (settling_time_s + response_time_s) * 1000 ms
 *   SAMPLING  → oversample ADC; apply calibration + temp comp; power-off; release mutex → IDLE
 *
 * Temperature compensation (optional):
 *   Connect a live temperature source via pds_fb_sensor_ec_connect_temp().
 *   If connected and temp_comp_enabled, applies:
 *     ec_corrected = ec_raw / (1 + temp_coeff/100 * (T - temp_reference_c))
 *   If not connected, uses settings.temp_reference_c (no correction applied).
 *
 * HAL dependencies: pds_adc_registry, pds_fb_pwr_group, pds_periph_mutex
 */

#ifndef PDS_FB_SENSOR_EC_H
#define PDS_FB_SENSOR_EC_H

#include "pds_component_base.h"

/**
 * Settings — packed by blob_packer into L3.
 *
 * Layout (48 bytes, natural alignment on ESP32 / Xtensa-LX7):
 *   offset  0  uint8   adc_channel       ADC GPIO channel number
 *   offset  1  int8    pin_power         Power-enable GPIO (-1 = always on)
 *   offset  2  uint16  sample_interval_s Sample period in seconds
 *   offset  4  uint8   oversample        ADC reads to average (1–64)
 *   offset  5  uint8   settling_time_s   Wait after power-on (seconds)
 *   offset  6  uint8   response_time_s   Additional probe response wait (seconds)
 *   offset  7  bool    power_active_low  true = drive LOW to enable power
 *   offset  8  float   Vmin              Voltage at scale_min (mS/cm low end)
 *   offset 12  float   Vmax              Voltage at scale_max (mS/cm high end)
 *   offset 16  float   scale_min         mS/cm value at Vmin (typically 0)
 *   offset 20  float   scale_max         mS/cm value at Vmax (typically 2.0 = 1000 PPM500)
 *   offset 24  bool    temp_comp_enabled Enable temperature compensation
 *   offset 25  [3 pad]
 *   offset 28  float   temp_coeff        Compensation coefficient (%/°C)
 *   offset 32  float   temp_reference_c  Reference temperature (°C, room temp ~25°C)
 *   offset 36  float   alarm_low         Low EC alarm threshold (mS/cm)
 *   offset 40  float   alarm_high        High EC alarm threshold (mS/cm)
 *   offset 44  bool    alarm_enabled
 *   offset 45  bool    enabled
 *   offset 46  [2 pad]
 *   Total: 48 bytes
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
    bool     temp_comp_enabled;
    /* 3 pad bytes (natural alignment) */
    float    temp_coeff;        /**< %/°C e.g. 2.0 for 2%/°C */
    float    temp_reference_c;  /**< Reference temp for compensation (°C) */
    float    alarm_low;
    float    alarm_high;
    bool     alarm_enabled;
    bool     enabled;
} pds_fb_sensor_ec_settings_t;

/** Runtime state — port 0 output: state.ec_ms_cm */
typedef struct {
    float    ec_ms_cm;         /**< Calibrated EC reading in mS/cm — connect to downstream */
    float    voltage_v;        /**< Raw sensor voltage at last sample (for logs) */
    int32_t  raw_adc;          /**< Last averaged raw ADC count */
    bool     alarm_active;     /**< true if ec_ms_cm outside [alarm_low, alarm_high] */
    bool     sample_valid;     /**< false until first successful read */
    uint32_t read_count;
    uint32_t error_count;
    uint32_t last_sample_tick; /**< ms timestamp of last successful sample */
} pds_fb_sensor_ec_state_t;

/* ── API ── */
esp_err_t pds_fb_sensor_ec_init(
    const pds_fb_sensor_ec_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_sensor_ec_run(pds_comp_handle_t handle);

/**
 * Connect a live temperature source for EC compensation.
 *
 * @param handle   EC block handle.
 * @param temp_ptr Pointer to a float updated each tick (e.g. &dht22_state.temperature).
 *                 Pass NULL to disconnect (falls back to temp_reference_c).
 */
void pds_fb_sensor_ec_connect_temp(pds_comp_handle_t handle, const float *temp_ptr);

const pds_fb_sensor_ec_state_t *pds_fb_sensor_ec_get_state(pds_comp_handle_t handle);

esp_err_t pds_fb_sensor_ec_get_settings(
    pds_comp_handle_t handle,
    pds_fb_sensor_ec_settings_t *out);

esp_err_t pds_fb_sensor_ec_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_sensor_ec_settings_t *settings);

#endif /* PDS_FB_SENSOR_EC_H */
