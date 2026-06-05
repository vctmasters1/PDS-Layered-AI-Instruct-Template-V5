/**
 * PDS Component — Addressable LED Output (led_addr)
 *
 * Drives a WS2812B or SK6812 addressable LED strip via the ESP32 RMT
 * peripheral (ESP-IDF led_strip driver).
 *
 * Bool input → ON: all LEDs set to configured color * brightness/100
 *              OFF: all LEDs cleared
 *
 * Pipeline type ID: 0x80
 */

#ifndef PDS_FB_LED_ADDR_H
#define PDS_FB_LED_ADDR_H

#include "pds_component_base.h"

/* ── LED type selection ── */
typedef enum {
    PDS_LED_TYPE_WS2812B = 0,   /**< RGB  (GRB wire order, 24-bit) */
    PDS_LED_TYPE_SK6812  = 1,   /**< RGBW (GRBW wire order, 32-bit) */
} pds_fb_led_type_t;

/* ── Settings ── */
typedef struct {
    int8_t   pin_data;          /**< RMT data pin */
    uint8_t  led_type;          /**< pds_fb_led_type_t cast to uint8_t */
    uint16_t num_leds;          /**< Strip length (number of LEDs) */
    uint8_t  color_r;           /**< Red   component (0–255) */
    uint8_t  color_g;           /**< Green component (0–255) */
    uint8_t  color_b;           /**< Blue  component (0–255) */
    uint8_t  color_w;           /**< White component (0–255, SK6812 only) */
    uint8_t  brightness;        /**< Global brightness scale 0–100 % */
    bool     enabled;
} pds_fb_led_addr_settings_t;

/* ── Runtime State ── */
typedef struct {
    bool active;                /**< true if strip is currently ON */
} pds_fb_led_addr_state_t;

/* ── API ── */
esp_err_t pds_fb_led_addr_init(
    const pds_fb_led_addr_settings_t *settings,
    pds_comp_handle_t *out_handle);

pds_comp_status_t pds_fb_led_addr_run(pds_comp_handle_t handle);

esp_err_t pds_fb_led_addr_connect_signal(pds_comp_handle_t handle, const float *signal_ptr);

const pds_fb_led_addr_state_t *pds_fb_led_addr_get_state(pds_comp_handle_t handle);
esp_err_t pds_fb_led_addr_get_settings(pds_comp_handle_t handle, pds_fb_led_addr_settings_t *out);
esp_err_t pds_fb_led_addr_set_settings(pds_comp_handle_t handle, const pds_fb_led_addr_settings_t *settings);

/** Clear the LED strip immediately. Called by ALL-STOP. */
void pds_fb_led_addr_safe_state(pds_comp_handle_t handle);

/**
 * Release the led_strip driver handle (pixel buffer + RMT channel).
 * Called by engine_teardown() before free(handle).
 */
void pds_fb_led_addr_destroy(pds_comp_handle_t handle);

#endif /* PDS_FB_LED_ADDR_H */
