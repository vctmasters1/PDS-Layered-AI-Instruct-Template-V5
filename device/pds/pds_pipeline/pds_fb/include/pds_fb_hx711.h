/**
 * PDS Function Block — HX711 24-bit Load-Cell ADC (pds_fb_hx711)
 *
 * Two-wire bit-bang driver for the HX711 precision 24-bit ADC.
 * Typically used with load cells (strain-gauge bridges) for weight measurement.
 *
 *   PDS_BLOCK_SENSOR_HX711 (0xA0) — port 0 output: state.value (engineering units)
 *
 * Pins
 *   pin_clk — GPIO output driven as SCK / PD_SCK  (clock + power-down control)
 *   pin_dat — GPIO input reading DOUT              (data ready when LOW)
 *
 * Gain / channel selection — determined by the number of extra clock pulses
 * sent after the 24 data bits (sets the gain for the NEXT conversion):
 *   gain=128 → channel A, gain 128×  (25 total pulses)   ← default, most sensitive
 *   gain=64  → channel A, gain 64×   (27 total pulses)
 *   gain=32  → channel B, gain 32×   (26 total pulses)
 *
 * Output formula:
 *   value = (raw − tare_raw) × scale_factor + scale_offset
 *
 * Non-blocking: DOUT is polled each pipeline tick; the 24+N pulse read
 * executes in a ≈80 µs critical section only when data is ready.
 *
 * Pipeline type ID: 0xA0
 */

#ifndef PDS_FB_HX711_H
#define PDS_FB_HX711_H

#include "pds_component_base.h"

/* ── Settings (20 bytes, packed) ───────────────────────────────────────────
 *
 *   offset  0: int8_t   pin_clk            GPIO SCK / PD_SCK output
 *   offset  1: int8_t   pin_dat            DOUT input
 *   offset  2: uint8_t  gain               128 | 64 | 32
 *   offset  3: bool     enabled
 *   offset  4: uint16_t sample_interval_ms min ms between conversions
 *   offset  6: uint8_t[2] _pad
 *   offset  8: int32_t  tare_raw           raw zero-point (subtracted before scaling)
 *   offset 12: float    scale_factor       engineering units per raw count
 *   offset 16: float    scale_offset       engineering unit bias
 *
 * blob_packer fmt: '<bbB?Hxxiff'  = 20 bytes
 * ─────────────────────────────────────────────────────────────────────────── */
typedef struct {
    int8_t   pin_clk;            /**< offset  0: GPIO SCK/PD_SCK output */
    int8_t   pin_dat;            /**< offset  1: DOUT input */
    uint8_t  gain;               /**< offset  2: 128 | 64 | 32 */
    bool     enabled;            /**< offset  3 */
    uint16_t sample_interval_ms; /**< offset  4: min ms between conversions */
    uint8_t  _pad[2];            /**< offset  6 */
    int32_t  tare_raw;           /**< offset  8: raw zero-point (subtracted before scaling) */
    float    scale_factor;       /**< offset 12: engineering units per raw count */
    float    scale_offset;       /**< offset 16: engineering unit bias */
} pds_fb_hx711_settings_t;       /* 20 bytes */

/* ── Runtime State ────────────────────────────────────────────────────────── */
typedef struct {
    float    value;          /**< Scaled, tared engineering value — port 0 output */
    int32_t  raw;            /**< Last raw 24-bit signed reading */
    bool     valid;          /**< true after first successful read */
    uint32_t read_count;     /**< Successful conversion count */
    uint32_t error_count;    /**< Timeout / DOUT-stuck-high count */
    uint32_t last_read_ms;   /**< Timestamp of last successful read */
} pds_fb_hx711_state_t;

/* ── API ──────────────────────────────────────────────────────────────────── */

esp_err_t pds_fb_hx711_init(
    const pds_fb_hx711_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_hx711_run(pds_comp_handle_t handle);

const pds_fb_hx711_state_t *pds_fb_hx711_get_state(pds_comp_handle_t handle);

esp_err_t pds_fb_hx711_get_settings(
    pds_comp_handle_t handle,
    pds_fb_hx711_settings_t *out);

esp_err_t pds_fb_hx711_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_hx711_settings_t *settings);

#endif /* PDS_FB_HX711_H */
