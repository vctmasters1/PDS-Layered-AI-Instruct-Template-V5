/**
 * PDS Function Block — Quadrature Encoder (fb_encoder)
 *
 * Polls two GPIO inputs (A + B) each pipeline tick to decode quadrature
 * position. Optional index pin (Z) resets or marks position zero.
 *
 * Pipeline type IDs:
 *   0xA1 — encoder_position: outputs state.position_f (float cast of int32 count)
 *   0xA2 — encoder_velocity: outputs state.velocity_rpm
 *
 * HAL dependencies: pds_hal.h (PDS_GPIO_configure, PDS_GPIO_read)
 */

#ifndef PDS_FB_ENCODER_H
#define PDS_FB_ENCODER_H

#include "pds_component_base.h"
#include <stdint.h>
#include <stdbool.h>

/*
 * Struct layout (20 bytes, natural alignment on ESP32):
 *   offset  0  int8_t   pin_a
 *   offset  1  int8_t   pin_b
 *   offset  2  int8_t   pin_index
 *   offset  3  [1 pad byte]
 *   offset  4  float    counts_per_rev
 *   offset  8  uint16_t velocity_interval_ms
 *   offset 10  bool     active_low
 *   offset 11  bool     reset_on_index
 *   offset 12  bool     invert_direction
 *   offset 13  bool     enabled
 *   offset 14  [2 pad bytes]
 */
typedef struct {
    int8_t   pin_a;                /**< Quadrature channel A input (-1 = disabled) */
    int8_t   pin_b;                /**< Quadrature channel B input (-1 = disabled) */
    int8_t   pin_index;            /**< Index / Z pulse input (-1 = not used) */
    int8_t   _pad0;
    float    counts_per_rev;       /**< Encoder counts per full revolution (used for RPM) */
    uint16_t velocity_interval_ms; /**< Window over which RPM is averaged (ms, 0 = per-tick) */
    bool     active_low;           /**< Invert A/B/Z logic (true = active-low) */
    bool     reset_on_index;       /**< Reset position counter to 0 on Z pulse */
    bool     invert_direction;     /**< Negate the quadrature direction */
    bool     enabled;
} pds_fb_encoder_settings_t;

/* ── Runtime State ── */
typedef struct {
    int32_t  position;         /**< Cumulative quadrature count */
    float    position_f;       /**< Float cast of position — connect downstream */
    float    velocity_rpm;     /**< Revolutions per minute (computed over velocity_interval_ms) */
    float    index_f;          /**< 1.0f for one tick when Z fires, then 0.0f */
    uint32_t read_count;
    uint32_t error_count;
    bool     index_seen;       /**< True for one tick after index pulse */
    bool     valid;            /**< False until first successful read */
} pds_fb_encoder_state_t;

/* ── API ── */
esp_err_t pds_fb_encoder_init(
    const pds_fb_encoder_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_encoder_run(pds_comp_handle_t handle);

const pds_fb_encoder_state_t *pds_fb_encoder_get_state(pds_comp_handle_t handle);

esp_err_t pds_fb_encoder_get_settings(
    pds_comp_handle_t handle,
    pds_fb_encoder_settings_t *out);

esp_err_t pds_fb_encoder_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_encoder_settings_t *settings);

/** Reset the position counter to zero. Can be called externally or on Z pulse. */
void pds_fb_encoder_reset_position(pds_comp_handle_t handle);

#endif /* PDS_FB_ENCODER_H */
