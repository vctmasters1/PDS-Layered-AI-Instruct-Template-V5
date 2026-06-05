/**
 * PDS Function Block — Encoder Mapped (fb_encoder_mapped)
 *
 * Reads a quadrature encoder and applies a linear map from the raw
 * position count to a configurable engineering-value range.
 *
 * Pipeline type ID:
 *   0xA3 — encoder_mapped: outputs state.mapped_value
 *
 * Typical use: adjustment wheel → temperature setpoint, speed reference,
 * position target — anything that needs an encoder count → float mapping.
 *
 * HAL dependencies: pds_hal.h
 */

#ifndef PDS_FB_ENCODER_MAPPED_H
#define PDS_FB_ENCODER_MAPPED_H

#include "pds_component_base.h"
#include <stdint.h>
#include <stdbool.h>

/*
 * Struct layout (40 bytes, natural alignment on ESP32):
 * ── Hardware ──
 *   offset  0  int8_t   pin_a
 *   offset  1  int8_t   pin_b
 *   offset  2  int8_t   pin_index         (-1 = not used)
 *   offset  3  uint8_t  pull              (0=none, 1=pull-up, 2=pull-down)
 *   offset  4  float    counts_per_rev
 *   offset  8  uint16_t velocity_interval_ms
 *   offset 10  bool     active_low
 *   offset 11  bool     reset_on_index
 *   offset 12  bool     invert_direction
 *   offset 13  bool     enabled
 *   offset 14  int8_t   pin_gnd         (-1 = not used; drive LOW for virtual encoder GND)
 *   offset 15  [1 pad]
 * ── Map parameters ──
 *   offset 16  float    map_in_min        (encoder count at output minimum)
 *   offset 20  float    map_in_max        (encoder count at output maximum)
 *   offset 24  float    map_out_min       (output value when position == map_in_min)
 *   offset 28  float    map_out_max       (output value when position == map_in_max)
 *   offset 32  bool     clamp             (clamp output to [map_out_min, map_out_max])
 *   offset 33  [3 pad]
 * ── Control point ──
 *   offset 36  uint8_t  target_pipeline_idx  (L1 pipeline index; 0xFF = not assigned)
 *   offset 37  uint8_t  target_block_idx     (block index within target pipeline)
 *   offset 38  uint8_t  target_field_idx     (field index in target block L3 settings)
 *   offset 39  [1 pad]
 * Total: 40 bytes
 */
typedef struct {
    /* Hardware */
    int8_t   pin_a;
    int8_t   pin_b;
    int8_t   pin_index;
    uint8_t  pull;             /**< GPIO bias: 0=none, 1=pull-up, 2=pull-down (all encoder pins) */
    float    counts_per_rev;
    uint16_t velocity_interval_ms;
    bool     active_low;
    bool     reset_on_index;
    bool     invert_direction;
    bool     enabled;
    int8_t   pin_gnd;  /**< Drive LOW as virtual GND for encoder (-1 = not used) */
    uint8_t  _pad1;
    /* Linear map */
    float    map_in_min;
    float    map_in_max;
    float    map_out_min;
    float    map_out_max;
    bool     clamp;
    uint8_t  _pad2[3];
    /* Control point — the variable this encoder physically drives */
    uint8_t  target_pipeline_idx;  /**< L1 pipeline index of target block (0xFF = not assigned) */
    uint8_t  target_block_idx;     /**< Block index within target pipeline */
    uint8_t  target_field_idx;     /**< Field index in target block L3 settings */
    uint8_t  _pad3;
} pds_fb_encoder_mapped_settings_t;

/* ── Runtime State ── */
typedef struct {
    float    mapped_value;   /**< Linear-mapped output — connect downstream */
    float    position_f;     /**< Raw position count (for debugging) */
    uint32_t read_count;
    bool     valid;
} pds_fb_encoder_mapped_state_t;

/* ── API ── */
esp_err_t pds_fb_encoder_mapped_init(
    const pds_fb_encoder_mapped_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_encoder_mapped_run(pds_comp_handle_t handle);

const pds_fb_encoder_mapped_state_t *pds_fb_encoder_mapped_get_state(pds_comp_handle_t handle);

esp_err_t pds_fb_encoder_mapped_get_settings(
    pds_comp_handle_t handle,
    pds_fb_encoder_mapped_settings_t *out);

esp_err_t pds_fb_encoder_mapped_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_encoder_mapped_settings_t *settings);

/** Reset the encoder position to zero. */
void pds_fb_encoder_mapped_reset_position(pds_comp_handle_t handle);

/**
 * Wire the encoder's mapped_value to a float field in another block's settings.
 * Called by the pipeline engine post-build when settings.target_pipeline_idx != 0xFF.
 * After each successful run(), if mapped_value changes, the target float is updated.
 */
void pds_fb_encoder_mapped_set_target(pds_comp_handle_t handle, float *target_ptr);

/**
 * Check if this encoder has a settled control-point value ready to save.
 * A value is "settled" when it has not changed for ≥10 s and the encoder is
 * wired to a control-point target (set_target was called).
 *
 * Returns ESP_OK with *out_value set to the current mapped_value when settled.
 * Returns ESP_ERR_NOT_FOUND when nothing is pending or the settle window has
 * not yet elapsed.
 * Call pds_fb_encoder_mapped_ack_settle() after the value is saved.
 */
esp_err_t pds_fb_encoder_mapped_poll_settle(pds_comp_handle_t handle, float *out_value);

/**
 * Acknowledge that the settled value has been saved. Clears the pending flag
 * and updates the internal baseline to the current mapped_value.
 */
void pds_fb_encoder_mapped_ack_settle(pds_comp_handle_t handle);

#endif /* PDS_FB_ENCODER_MAPPED_H */
