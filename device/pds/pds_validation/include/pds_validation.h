#ifndef PDS_PDS_VALIDATION_H
#define PDS_PDS_VALIDATION_H

#include "pds_types.h"
#include "esp_err.h"

/**
 * H20-Tower Aeroponics Control System
 * Input Validation Layer
 * 
 * Validates all incoming configuration and commands to ensure
 * safety, correctness, and prevent device crashes.
 */

/**
 * Validate a pin definition
 * @param pin Pointer to pin definition to validate
 * @return ESP_OK if valid, ESP_ERR_INVALID_ARG if invalid
 */
esp_err_t pds_device_validate_pin(const pds_pin_def_t *pin);

/**
 * Validate a condition
 * @param condition Pointer to condition to validate
 * @param max_pins Maximum number of pins in system (for bounds checking)
 * @return ESP_OK if valid, ESP_ERR_INVALID_ARG if invalid
 */
esp_err_t pds_device_validate_condition(const pds_condition_t *condition, uint8_t max_pins);

/**
 * Validate an action
 * @param action Pointer to action to validate
 * @param max_pins Maximum number of pins in system
 * @return ESP_OK if valid, ESP_ERR_INVALID_ARG if invalid
 */
esp_err_t pds_device_validate_action(const pds_action_t *action, uint8_t max_pins);

/**
 * Validate a timer configuration
 * @param timer Pointer to timer configuration to validate
 * @return ESP_OK if valid, ESP_ERR_INVALID_ARG if invalid
 */
esp_err_t pds_device_validate_timer(const pds_timer_config_t *timer);

/**
 * Validate a telemetry packet header
 * @param header Pointer to telemetry header to validate
 * @return ESP_OK if valid, ESP_ERR_INVALID_ARG if invalid
 */
esp_err_t pds_device_validate_telemetry_header(const pds_TELDATA_header_t *header);

/**
 * Validate a configuration packet from Android
 * @param config Pointer to config packet to validate
 * @param max_pins Maximum number of pins in system
 * @return ESP_OK if valid, ESP_ERR_INVALID_ARG if invalid
 */
esp_err_t pds_device_validate_config_packet(const pds_TELCONF_packet_t *config, uint8_t max_pins);

/**
 * Validate PWM duty cycle value
 * @param duty_cycle Value to validate (0-1000 for 0%-100%)
 * @return ESP_OK if valid, ESP_ERR_INVALID_ARG if invalid
 */
esp_err_t pds_device_validate_pwm_duty(uint16_t duty_cycle);

/**
 * Validate GPIO state value
 * @param state Value to validate (0 or 1)
 * @return ESP_OK if valid, ESP_ERR_INVALID_ARG if invalid
 */
esp_err_t pds_device_validate_gpio_state(uint8_t state);

/**
 * Validate ADC value range
 * @param value Value to validate
 * @param min_value Minimum allowed value
 * @param max_value Maximum allowed value
 * @return ESP_OK if valid, ESP_ERR_INVALID_ARG if invalid
 */
esp_err_t pds_device_validate_adc_range(uint16_t value, uint16_t min_value, uint16_t max_value);

#endif // pds_VALIDATION_H


