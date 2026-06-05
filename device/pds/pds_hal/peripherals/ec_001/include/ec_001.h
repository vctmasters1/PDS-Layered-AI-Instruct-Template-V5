/* ec_001.h — Analog EC/PPM probe HAL driver (rev 001)
 *
 * Primitive hardware operations for an analog EC (electrical conductivity)
 * electrode connected to the ESP32 built-in ADC. No calibration, no scaling,
 * no power management — this layer owns only ADC configuration and raw ADC reads.
 *
 * Power GPIO management is handled by pds_pwr_group (caller's responsibility).
 * Registry telemetry integration is handled by pds_adc_reg_register_ext() (caller).
 *
 * Protocol:
 *   1. ec_001_configure() — configure the ADC channel once at block init
 *   2. Power-on + settling managed by pds_pwr_group (fb block)
 *   3. ec_001_read_raw() — averaged raw ADC counts after settling
 *   4. ec_001_raw_to_mv() — convert raw count to millivolts for calibration
 *
 * Use in pds_fb_sensor_ec.c only.
 */

#ifndef EC_001_H
#define EC_001_H

#include "esp_err.h"
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Configure the ESP32 ADC channel for an EC/PPM probe.
 *
 * Sets 11 dB attenuation (0–2450 mV range) and 12-bit width.
 * Call once during block init.
 *
 * @param adc_channel  ESP32 ADC channel number (matches GPIO on ADC1)
 * @return ESP_OK, or an error from PDS_ADC_configure()
 */
esp_err_t ec_001_configure(uint8_t adc_channel);

/**
 * Read oversampled raw ADC counts from the EC/PPM probe input.
 *
 * Caller must ensure the probe is powered and settled before calling.
 *
 * @param adc_channel  ESP32 ADC channel number
 * @param count        Number of ADC samples to average (1–64)
 * @param out_raw      [out] Averaged raw ADC count
 * @return ESP_OK, or a negative error if PDS_ADC_read() fails
 */
esp_err_t ec_001_read_raw(uint8_t adc_channel, uint8_t count, int32_t *out_raw);

/**
 * Convert a raw ADC count to millivolts.
 *
 * Uses the platform ADC calibration curve (ESP-IDF adc_cali).
 *
 * @param adc_channel  ESP32 ADC channel number
 * @param raw          Raw ADC count from ec_001_read_raw()
 * @return Millivolts, or -1 if calibration unavailable
 */
int ec_001_raw_to_mv(uint8_t adc_channel, int32_t raw);

#ifdef __cplusplus
}
#endif
#endif /* EC_001_H */
