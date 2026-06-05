/* hx711.h — HX711 24-bit load-cell ADC bit-bang driver
 *
 * Two-wire bit-bang protocol. The 24+N clock burst (~50–80 µs) runs inside a
 * portMUX critical section for microsecond timing accuracy.
 *
 * This driver calls driver/gpio.h directly — the HX711 requires coordinated
 * CLK/DOUT toggling that is incompatible with the GPIO registry pre-sweep model.
 * Use in pds_fb_hx711.c only.
 */

#ifndef HX711_H
#define HX711_H

#include "esp_err.h"
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Configure HX711 CLK and DOUT GPIO pins.
 *   CLK  — push-pull output, initially low (device active, not powered-down)
 *   DOUT — floating input with pull-up (HX711 open-drain output)
 *
 * Call once during block init.
 *
 * @param pin_clk  GPIO CLK / PD_SCK output pin (-1 to skip)
 * @param pin_dat  GPIO DOUT input pin (-1 to skip)
 */
void hx711_configure_pins(int pin_clk, int pin_dat);

/**
 * Poll whether the HX711 has a conversion result ready.
 * DOUT goes low when data is ready.
 *
 * @param pin_dat  DOUT GPIO pin
 * @return true if data is ready (DOUT low)
 */
bool hx711_data_ready(int pin_dat);

/**
 * Read 24-bit raw value from HX711.
 *
 * Call only after hx711_data_ready() returns true.
 * Disables interrupts on this core for ~50–80 µs.
 * Extra clock pulses after the 24 data bits select gain for the NEXT conversion:
 *   gain=128 → 1 extra pulse  (25 total) — channel A, highest sensitivity
 *   gain=32  → 2 extra pulses (26 total) — channel B
 *   gain=64  → 3 extra pulses (27 total) — channel A, lower sensitivity
 *
 * @param pin_clk  GPIO CLK output pin
 * @param pin_dat  GPIO DOUT input pin
 * @param gain     128, 64, or 32
 * @return Sign-extended 24-bit two's-complement value
 */
int32_t hx711_read_raw(int pin_clk, int pin_dat, uint8_t gain);

#ifdef __cplusplus
}
#endif
#endif /* HX711_H */
