/**
 * PDS Function Block — Fan / Distribute (float) (fb_fan_float)
 *
 * Reads one upstream float pointer and writes the same value to up to
 * PDS_FAN_FLOAT_MAX_OUTPUTS downstream float pointers simultaneously.
 * This lets a single sensor reading drive N parallel processing branches
 * without separate ADC reads.
 *
 * Connection model:
 *   - connect_input()   — wire the upstream source
 *   - connect_output()  — wire each downstream destination (up to MAX)
 *   - run()             — copies *input to each registered output pointer
 *
 * Pipeline type ID: 0x70
 */

#ifndef PDS_FB_FAN_FLOAT_H
#define PDS_FB_FAN_FLOAT_H

#include "pds_component_base.h"

#define PDS_FAN_FLOAT_MAX_OUTPUTS 8

/* ── Settings (Layer 3) ── */
typedef struct {
    bool enabled;               /**< Enable/disable this block */
} pds_fb_fan_float_settings_t;

/* ── Runtime State ── */
typedef struct {
    float    value;             /**< Last distributed value (readable by downstream via get_state) */
} pds_fb_fan_float_state_t;

/* ── Handle ── */
typedef struct {
    pds_fb_fan_float_settings_t settings;
    pds_fb_fan_float_state_t    state;
} pds_fb_fan_float_t;

/**
 * @brief Allocate and initialise an fb_fan_float block (heap).
 *
 * @param settings     Initial settings.
 * @param out_handle   Receives the allocated handle.
 * @return ESP_OK, or ESP_ERR_NO_MEM.
 */
esp_err_t pds_fb_fan_float_init(const pds_fb_fan_float_settings_t *settings,
                                 pds_comp_handle_t *out_handle);

/**
 * @brief Execute one pipeline tick — copies *input to all registered outputs.
 */
pds_comp_status_t pds_fb_fan_float_run(pds_comp_handle_t handle);

/**
 * @brief Wire the upstream float source to this fan block's input.
 *
 * @param handle  Fan block handle.
 * @param src     Pointer to upstream block's float output field.
 */
void pds_fb_fan_float_connect_input(pds_comp_handle_t handle, const float *src);

/**
 * @brief Wire one downstream float pointer as an output of this fan block.
 *
 * @param handle   Fan block handle.
 * @param port     Output index (0 .. PDS_FAN_FLOAT_MAX_OUTPUTS-1).
 * @param dest     Pointer to the downstream block's float input field.
 * @return ESP_OK, ESP_ERR_INVALID_ARG if port out of range.
 */
esp_err_t pds_fb_fan_float_connect_output(pds_comp_handle_t handle, uint8_t port, float *dest);

/**
 * @brief Apply new settings at runtime (BLE/WiFi remote-config).
 */
void pds_fb_fan_float_set_settings(pds_comp_handle_t handle,
                                    const pds_fb_fan_float_settings_t *settings);

/**
 * @brief Read current runtime state.
 */
const pds_fb_fan_float_state_t *pds_fb_fan_float_get_state(pds_comp_handle_t handle);

#endif /* PDS_FB_FAN_FLOAT_H */
