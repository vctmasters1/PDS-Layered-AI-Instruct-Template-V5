#ifndef PDS_PDS_PINS_H
#define PDS_PDS_PINS_H

#include "pds_types.h"
#include "esp_err.h"

/**
 * H20-Tower Aeroponics Control System
 * Pin Configuration and Management
 * 
 * Provides pin initialization and management functions.
 */

// Maximum number of pins in the system
#define PDS_MAX_PINS  16

// Global pin definition table
extern pds_pin_def_t pds_global_pin_def_table[PDS_MAX_PINS];
extern uint8_t pds_global_pin_count;

/**
 * Initialize all pins based on the pin definition table
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t pds_device_pins_init(void);

/**
 * Update pin configuration at runtime
 * @param pin_index Index in the pin definition table
 * @param new_config New configuration for the pin
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t pds_device_pins_update(uint8_t pin_index, const pds_pin_def_t *new_config);

/**
 * Read ADC value from a pin
 * @param pin_number GPIO pin number
 * @param reading Output parameter for ADC reading
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t pds_device_pins_read_adc(uint8_t pin_number, pds_adc_reading_t *reading);

/**
 * Set PWM duty cycle
 * @param pin_number GPIO pin number
 * @param duty_cycle Duty cycle (0-1000 for 0.0%-100.0%)
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t pds_device_pins_set_pwm(uint8_t pin_number, uint16_t duty_cycle);

/**
 * Read GPIO input state
 * @param pin_number GPIO pin number
 * @param state Output parameter for GPIO state
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t pds_device_pins_read_gpio(uint8_t pin_number, uint8_t *state);

/**
 * Set GPIO output state
 * @param pin_number GPIO pin number
 * @param state State to set (0 or 1)
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t pds_device_pins_set_gpio(uint8_t pin_number, uint8_t state);

#endif // pds_PINS_H


