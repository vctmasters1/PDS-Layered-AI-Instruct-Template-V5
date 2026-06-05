/**
 * PDS Function Block — Sensor Value Reference (sensor_value)
 *
 * Cross-pipeline sensor reference. Reads from a global sensor slot registry
 * populated by sensor_analog and dht22 blocks during pipeline build.
 *
 * Pipeline role: source block — no upstream pipeline connection.
 * Output port 0: state.value (float copy of the referenced sensor reading).
 *
 * The pipeline engine's post-build wiring pass calls pds_fb_sensor_value_set_source()
 * to wire the live float pointer from the sensor registry slot indexed by
 * settings.sensor_index.
 *
 * L3 struct: uint8_t sensor_index | bool enabled = 2 bytes (<B?)
 *
 * PDS_BLOCK_SENSOR_VALUE = 0x51
 */

#ifndef PDS_FB_SENSOR_VALUE_H
#define PDS_FB_SENSOR_VALUE_H

#include "pds_component_base.h"

/* ── Settings (Layer 3) ── */
typedef struct {
    uint8_t sensor_index;  /**< Index into the global sensor slot registry */
    bool    enabled;       /**< false = output forced to 0.0f */
} pds_fb_sensor_value_settings_t;

/* ── Runtime State ── */
typedef struct {
    float value;  /**< Current sensor reading (0.0f if unresolved or disabled) */
} pds_fb_sensor_value_state_t;

/* ── API ── */
esp_err_t pds_fb_sensor_value_init(
    const pds_fb_sensor_value_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_sensor_value_run(pds_comp_handle_t handle);

/**
 * @brief Wire this block to a live float pointer from the sensor slot registry.
 *        Called by the pipeline engine's post-build wiring pass.
 *
 * @param handle  sensor_value block handle.
 * @param src     Pointer to the upstream sensor's float output field.
 */
void pds_fb_sensor_value_set_source(pds_comp_handle_t handle, const float *src);

/**
 * @brief Return the sensor_index stored in this block's settings.
 *        Used by the engine's post-build wiring pass.
 */
uint8_t pds_fb_sensor_value_get_sensor_index(pds_comp_handle_t handle);

const pds_fb_sensor_value_state_t *pds_fb_sensor_value_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_sensor_value_get_settings(
    pds_comp_handle_t handle,
    pds_fb_sensor_value_settings_t *out);

esp_err_t pds_fb_sensor_value_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_sensor_value_settings_t *settings);

#endif /* PDS_FB_SENSOR_VALUE_H */
