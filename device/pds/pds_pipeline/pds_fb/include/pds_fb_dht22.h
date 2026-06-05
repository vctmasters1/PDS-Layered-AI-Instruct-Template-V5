/**
 * PDS Function Block — DHT22 / AM2302 Sensor (pds_fb_dht22)
 *
 * Single-wire bit-bang driver for the DHT22 temperature + humidity sensor.
 * One C implementation, two pipeline block type IDs:
 *
 *   PDS_BLOCK_SENSOR_DHT22_TEMP  (0x02) — port 0 output: state.temperature (°C)
 *   PDS_BLOCK_SENSOR_DHT22_HUMID (0x03) — port 0 output: state.humidity (%RH)
 *
 * Both type IDs use the same init/run/settings functions; only output_ptr differs.
 * Two separate block instances (one per pipeline) each perform their own read.
 * Set sample_interval_ms ≥ 2000 — DHT22 requires ≥ 2 s between reads.
 *
 * Pipeline examples:
 *   sensor_dht22_temp  → pid → pwm_output          (temp control loop)
 *   sensor_dht22_humid → limit_high → all_stop      (humidity safety shutdown)
 *
 * HAL dependencies: driver/gpio.h, esp_timer.h
 * Pipeline type IDs: 0x02 (temp), 0x03 (humid)
 */

#ifndef PDS_FB_DHT22_H
#define PDS_FB_DHT22_H

#include "pds_component_base.h"

/* ── Settings ── */
typedef struct {
    int8_t   pin_data;          /**< DHT22 single-wire data pin */
    uint16_t sample_interval_ms;/**< Read interval in ms (min 2000) */
    bool     enabled;
} pds_fb_dht22_settings_t;

/* ── Runtime State ── */
typedef struct {
    float    temperature;       /**< Last valid temperature reading (°C) — port 0 of sensor_dht22_temp */
    float    humidity;          /**< Last valid relative humidity (%RH)  — port 0 of sensor_dht22_humid */
    bool     valid;             /**< true if at least one successful read has occurred */
    uint32_t read_count;        /**< Successful read count */
    uint32_t error_count;       /**< CRC or timeout error count */
    uint32_t last_read_ms;      /**< Timestamp of last successful read */
} pds_fb_dht22_state_t;

/* ── API ── */
esp_err_t pds_fb_dht22_init(
    const pds_fb_dht22_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_dht22_run(pds_comp_handle_t handle);

const pds_fb_dht22_state_t *pds_fb_dht22_get_state(pds_comp_handle_t handle);

esp_err_t pds_fb_dht22_get_settings(
    pds_comp_handle_t handle,
    pds_fb_dht22_settings_t *out);

esp_err_t pds_fb_dht22_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_dht22_settings_t *settings);

#endif /* PDS_FB_DHT22_H */
