/**
 * PDS Function Block — GPIO Input (fb_gpio_input)
 *
 * Reads a digital input pin with optional debounce and polarity inversion.
 * Exposes state.active as a bool signal for downstream pipeline connection.
 *
 * Pipeline examples:
 *   fb_gpio_input → fb_timer_countdown → fb_gpio_output
 *   (float switch trips → valve runs for 30 s)
 *
 *   fb_gpio_input → fb_ref → fb_timer_countdown → fb_gpio_output
 *                 ↘ fb_gpio_output  (fan-out: both alarm LED and timer)
 *
 * HAL dependencies: pds_gpio
 * Pipeline type ID: 0x30
 */

#ifndef PDS_FB_GPIO_INPUT_H
#define PDS_FB_GPIO_INPUT_H

#include "pds_component_base.h"

/*
 * Struct layout (12 bytes, natural alignment on ESP32):
 *   offset  0  int8_t   pin_input
 *   offset  1  int8_t   pin_power
 *   offset  2  uint16_t debounce_ms
 *   offset  4  uint16_t settling_time_ms
 *   offset  6  uint16_t sample_interval_ms
 *   offset  8  bool     active_low
 *   offset  9  bool     power_active_low
 *   offset 10  bool     enabled
 *   offset 11  [1 pad byte]
 */
typedef struct {
    int8_t   pin_input;           /**< GPIO input pin number (-1 = disabled) */
    int8_t   pin_power;           /**< Power-enable GPIO (-1 = always on) */
    uint16_t debounce_ms;         /**< Debounce window in ms — used in always-on mode (0 = none) */
    uint16_t settling_time_ms;    /**< ms to wait after power-on before reading */
    uint16_t sample_interval_ms;  /**< Poll period when power-gated (0 = every tick) */
    bool     active_low;          /**< true = GPIO low means active (NC switch, pull-up) */
    bool     power_active_low;    /**< true = drive LOW to turn sensor on */
    bool     enabled;
} pds_fb_gpio_input_settings_t;

typedef enum {
    GI_PHASE_IDLE     = 0,
    GI_PHASE_SETTLING = 1,
    GI_PHASE_READING  = 2,
} pds_fb_gpio_input_phase_t;

/* ── Runtime State ── */
typedef struct {
    bool     active;            /**< Current debounced logic state — connect downstream */
    float    active_f;          /**< Float mirror: 100.0f when active, 0.0f when not */
    uint32_t last_change_tick;  /**< Tick of last confirmed state change */
    uint32_t change_count;      /**< Lifetime edge count */
    bool     sample_valid;      /**< false until first read completes (power-gated mode) */
} pds_fb_gpio_input_state_t;

/* ── API ── */
esp_err_t pds_fb_gpio_input_init(
    const pds_fb_gpio_input_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_gpio_input_run(pds_comp_handle_t handle);

const pds_fb_gpio_input_state_t *pds_fb_gpio_input_get_state(
    pds_comp_handle_t handle);

esp_err_t pds_fb_gpio_input_get_settings(
    pds_comp_handle_t handle,
    pds_fb_gpio_input_settings_t *out);

esp_err_t pds_fb_gpio_input_set_settings(
    pds_comp_handle_t handle,
    const pds_fb_gpio_input_settings_t *settings);

#endif /* PDS_FB_GPIO_INPUT_H */
