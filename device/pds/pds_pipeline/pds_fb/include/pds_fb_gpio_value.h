/**
 * PDS Function Block — GPIO Value Reference (gpio_value)
 *
 * Cross-pipeline reference to a gpio_input block in a sensor pipeline.
 * Reads the cached pre-debounced bool state — no GPIO hardware ownership.
 *
 * Pipeline role: source block — no upstream pipeline connection.
 * Output port 0: state.active_f (float: 100.0f when active, 0.0f when not).
 *
 * The pipeline engine's post-build wiring pass calls pds_fb_gpio_value_set_source()
 * to wire the live float pointer from the referenced gpio_input block's state.
 *
 * L3 struct: uint8_t pipeline_idx | uint8_t block_idx | bool enabled | 1 pad = 4 bytes (<BB?x)
 *
 * PDS_BLOCK_GPIO_VALUE = 0x32
 */

#ifndef PDS_FB_GPIO_VALUE_H
#define PDS_FB_GPIO_VALUE_H

#include "pds_component_base.h"

/* ── Settings (Layer 3) ── */
typedef struct {
    uint8_t pipeline_idx;  /**< Flat pipeline index (0-N) of the owning gpio_input pipeline */
    uint8_t block_idx;     /**< Block index within that pipeline */
    bool    enabled;       /**< false = output forced to 0.0f */
    uint8_t _pad;          /**< Padding to match <BB?x packer layout */
} pds_fb_gpio_value_settings_t;

/* ── Runtime State ── */
typedef struct {
    float active_f;  /**< Current state: 100.0f when active, 0.0f when not */
} pds_fb_gpio_value_state_t;

/* ── API ── */
esp_err_t pds_fb_gpio_value_init(
    const pds_fb_gpio_value_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_gpio_value_run(pds_comp_handle_t handle);

/**
 * @brief Wire this block to the live float pointer from the referenced gpio_input block.
 *        Called by the pipeline engine's post-build wiring pass.
 */
void pds_fb_gpio_value_set_source(pds_comp_handle_t handle, const float *src);

/**
 * @brief Return the pipeline_idx and block_idx stored in this block's settings.
 *        Used by the engine's post-build wiring pass.
 */
void pds_fb_gpio_value_get_ref(pds_comp_handle_t handle,
                                uint8_t *out_pipeline_idx,
                                uint8_t *out_block_idx);

const pds_fb_gpio_value_state_t *pds_fb_gpio_value_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_gpio_value_get_settings(
    pds_comp_handle_t handle,
    pds_fb_gpio_value_settings_t *out);

esp_err_t pds_fb_gpio_value_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_gpio_value_settings_t *settings);

#endif /* PDS_FB_GPIO_VALUE_H */
