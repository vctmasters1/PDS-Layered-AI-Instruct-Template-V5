#ifndef PDS_PDS_ADC_H
#define PDS_PDS_ADC_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"
#include "pds_types.h"

/**
 * H20-Tower ADC Abstraction Layer
 * 
 * Platform-agnostic interface for ADC operations.
 * Implementations are platform-specific in platform/{chip}/{hwver}/
 */

// Note: ADC attenuation and width types are defined in pds_types.h (pds_adc_atten_t, pds_adc_width_t)
// This ensures consistency across all components

/**
 * Initialize ADC subsystem
 * @return ESP_OK on success
 */
esp_err_t PDS_ADC_init(void);

/**
 * Configure ADC channel
 * @param channel ADC channel number
 * @param atten Attenuation (voltage range)
 * @param width Resolution in bits
 * @return ESP_OK on success
 */
esp_err_t PDS_ADC_configure(uint32_t channel, pds_adc_atten_t atten, pds_adc_width_t width);

/**
 * Read ADC value (single sample)
 * @param channel ADC channel number
 * @return ADC value (0 to max based on width), or negative on error
 */
int PDS_ADC_read(uint32_t channel);

/**
 * Read ADC value (averaged over multiple samples)
 * @param channel ADC channel number
 * @param samples Number of samples to average
 * @return Averaged ADC value, or negative on error
 */
int PDS_ADC_read_average(uint32_t channel, uint32_t samples);

/**
 * Calibrate ADC offset and gain
 * @param channel ADC channel number
 * @return ESP_OK on success
 */
esp_err_t PDS_ADC_calibrate(uint32_t channel);

/**
 * Convert raw ADC value to voltage (mV)
 * @param channel ADC channel number
 * @param raw_value Raw ADC reading
 * @return Voltage in millivolts
 */
int PDS_ADC_raw_to_mv(uint32_t channel, int raw_value);

#endif // PDS_ADC_H


