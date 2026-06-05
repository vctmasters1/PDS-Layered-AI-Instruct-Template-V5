/* dht22.h — DHT22 / AM2302 single-wire bit-bang driver
 *
 * Hardware protocol: proprietary one-wire, ~3 ms critical section per read.
 * The caller must wait ≥ 2 s between reads on the same pin (sensor requirement).
 *
 * This driver calls driver/gpio.h directly — the DHT22 protocol requires
 * pin direction toggling mid-read which is incompatible with the GPIO registry
 * pre-sweep model.  Use in pds_fb_dht22.c only.
 */

#ifndef DHT22_H
#define DHT22_H

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Configure a GPIO pin for DHT22 use (floating input with pull-up).
 * Call once during block init. Not required before every read.
 *
 * @param pin  GPIO number
 */
void dht22_configure_pin(int pin);

/**
 * Perform one DHT22 / AM2302 read.
 *
 * Disables interrupts on the current core for ~3 ms during bit sampling.
 *
 * @param pin      GPIO data pin
 * @param temp_c   [out] Temperature in °C
 * @param humid    [out] Relative humidity in %
 * @return ESP_OK, ESP_ERR_INVALID_CRC, or ESP_ERR_TIMEOUT
 */
esp_err_t dht22_read(int pin, float *temp_c, float *humid);

#ifdef __cplusplus
}
#endif
#endif /* DHT22_H */
