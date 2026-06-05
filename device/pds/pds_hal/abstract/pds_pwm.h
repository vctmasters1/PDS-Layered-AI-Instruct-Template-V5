#ifndef PDS_PDS_PWM_H
#define PDS_PDS_PWM_H

#include <stdint.h>
#include "esp_err.h"

/**
 * H20-Tower PWM Abstraction Layer
 * 
 * Platform-agnostic interface for PWM operations.
 * Implementations are platform-specific in platform/{chip}/{hwver}/
 */

// PWM channel identifiers
typedef uint32_t PDS_PWM_channel_t;

/**
 * Initialize PWM subsystem
 * @return ESP_OK on success
 */
esp_err_t PDS_PWM_init(void);

/**
 * Setup PWM channel
 * @param channel PWM channel number/pin
 * @param frequency_hz Target frequency in Hz
 * @param duty_resolution Resolution in bits (e.g., 8-16 bits)
 * @return ESP_OK on success
 */
esp_err_t PDS_PWM_setup_channel(PDS_PWM_channel_t channel, uint32_t frequency_hz, uint32_t duty_resolution);

/**
 * Set PWM duty cycle
 * @param channel PWM channel number/pin
 * @param duty Duty value (0 to max based on resolution)
 * @return ESP_OK on success
 */
esp_err_t PDS_PWM_set_duty(PDS_PWM_channel_t channel, uint32_t duty);

/**
 * Set PWM duty cycle as percentage
 * @param channel PWM channel number/pin
 * @param duty_percent Duty percentage (0-100)
 * @return ESP_OK on success
 */
esp_err_t PDS_PWM_set_duty_percent(PDS_PWM_channel_t channel, uint32_t duty_percent);

/**
 * Set PWM frequency
 * @param channel PWM channel number/pin
 * @param frequency_hz New frequency in Hz
 * @return ESP_OK on success
 */
esp_err_t PDS_PWM_set_frequency(PDS_PWM_channel_t channel, uint32_t frequency_hz);

/**
 * Start PWM output on channel
 * @param channel PWM channel number/pin
 * @return ESP_OK on success
 */
esp_err_t PDS_PWM_start(PDS_PWM_channel_t channel);

/**
 * Stop PWM output on channel
 * @param channel PWM channel number/pin
 * @return ESP_OK on success
 */
esp_err_t PDS_PWM_stop(PDS_PWM_channel_t channel);

/**
 * Get current duty cycle for channel
 * @param channel PWM channel number/pin
 * @return Current duty value, or negative on error
 */
int PDS_PWM_get_duty(PDS_PWM_channel_t channel);

/**
 * Get current duty cycle for channel as a percentage (0-100).
 * Uses the same 13-bit scale as PDS_PWM_set_duty_percent().
 * @param channel PWM channel number/pin
 * @return Duty percent (0-100), or 0 if channel is not configured
 */
int PDS_PWM_get_duty_percent(PDS_PWM_channel_t channel);

/**
 * Get current frequency for channel
 * @param channel PWM channel number/pin
 * @return Frequency in Hz, or 0 on error
 */
uint32_t PDS_PWM_get_frequency(PDS_PWM_channel_t channel);

#endif // PDS_PWM_H


