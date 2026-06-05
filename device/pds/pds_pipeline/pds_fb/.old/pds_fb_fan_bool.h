/**
 * PDS Function Block — Fan / Distribute (bool) (fb_fan_bool)
 *
 * Reads one upstream bool pointer and writes the same value to up to
 * PDS_FAN_BOOL_MAX_OUTPUTS downstream bool pointers simultaneously.
 *
 * Connection model:
 *   - connect_input()   — wire the upstream source
 *   - connect_output()  — wire each downstream destination (up to MAX)
 *   - run()             — copies *input to each registered output pointer
 *
 * Pipeline type ID: 0x71
 */

#ifndef PDS_FB_FAN_BOOL_H
#define PDS_FB_FAN_BOOL_H

#include "pds_component_base.h"

#define PDS_FAN_BOOL_MAX_OUTPUTS 8

/* ── Settings (Layer 3) ── */
typedef struct {
    bool enabled;               /**< Enable/disable this block */
} pds_fb_fan_bool_settings_t;

/* ── Runtime State ── */
typedef struct {
    bool     value;             /**< Last distributed value */
} pds_fb_fan_bool_state_t;

/* ── Handle ── */
typedef struct {
    pds_fb_fan_bool_settings_t settings;
    pds_fb_fan_bool_state_t    state;
} pds_fb_fan_bool_t;

/**
 * @brief Allocate and initialise an fb_fan_bool block (heap).
 *
 * @param settings     Initial settings.
 * @param out_handle   Receives the allocated handle.
 * @return ESP_OK, or ESP_ERR_NO_MEM.
 */
esp_err_t pds_fb_fan_bool_init(const pds_fb_fan_bool_settings_t *settings,
                                pds_comp_handle_t *out_handle);

/**
 * @brief Execute one pipeline tick — copies *input to all registered outputs.
 */
pds_comp_status_t pds_fb_fan_bool_run(pds_comp_handle_t handle);

/**
 * @brief Wire the upstream float source to this fan block's input.
 * >= 0.5f = true, < 0.5f = false. Guards against float epsilon false-positives.
 */
void pds_fb_fan_bool_connect_input(pds_comp_handle_t handle, const float *src);

/**
 * @brief Wire one downstream bool pointer as an output of this fan block.
 *
 * @param handle   Fan block handle.
 * @param port     Output index (0 .. PDS_FAN_BOOL_MAX_OUTPUTS-1).
 * @param dest     Pointer to the downstream block's bool input field.
 * @return ESP_OK, ESP_ERR_INVALID_ARG if port out of range.
 */
esp_err_t pds_fb_fan_bool_connect_output(pds_comp_handle_t handle, uint8_t port, bool *dest);

/**
 * @brief Apply new settings at runtime.
 */
void pds_fb_fan_bool_set_settings(pds_comp_handle_t handle,
                                   const pds_fb_fan_bool_settings_t *settings);

/**
 * @brief Read current runtime state.
 */
const pds_fb_fan_bool_state_t *pds_fb_fan_bool_get_state(pds_comp_handle_t handle);

#endif /* PDS_FB_FAN_BOOL_H */
