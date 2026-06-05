#ifndef PDS_PDS_GPIO_H
#define PDS_PDS_GPIO_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"
#include "pds_types.h"

/**
 * H20-Tower GPIO Abstraction Layer
 * 
 * Platform-agnostic interface for GPIO operations.
 * Implementations are platform-specific in platform/{chip}/{hwver}/
 */

// GPIO pin modes
typedef enum {
    PDS_GPIO_MODE_INPUT = 0,
    PDS_GPIO_MODE_OUTPUT = 1,
    PDS_GPIO_MODE_INPUT_OUTPUT = 2,
} pds_gpio_mode_t;

// GPIO pull configurations
typedef enum {
    PDS_GPIO_PULL_NONE = 0,
    PDS_GPIO_PULL_UP = 1,
    PDS_GPIO_PULL_DOWN = 2,
} pds_gpio_pull_t;

// Note: pds_gpio_intr_t is defined in pds_types.h (complete definition with HIGH_LEVEL and LOW_LEVEL)

/**
 * Initialize GPIO subsystem
 * @return ESP_OK on success
 */
esp_err_t PDS_GPIO_init(void);

/**
 * Configure a GPIO pin
 * @param pin GPIO pin number
 * @param mode GPIO mode (input, output, etc.)
 * @param pull Pull configuration (up, down, none)
 * @return ESP_OK on success
 */
esp_err_t PDS_GPIO_configure(uint32_t pin, pds_gpio_mode_t mode, pds_gpio_pull_t pull);

/**
 * Set GPIO pin output level
 * @param pin GPIO pin number
 * @param level 0 for low, 1 for high
 * @return ESP_OK on success
 */
esp_err_t PDS_GPIO_write(uint32_t pin, uint32_t level);

/**
 * Read GPIO pin input level
 * @param pin GPIO pin number
 * @return 0 or 1, or negative on error
 */
int PDS_GPIO_read(uint32_t pin);

/**
 * Get the last driven output level for an output-configured GPIO.
 * Uses an internal cache updated by PDS_GPIO_write(), since GPIO_MODE_OUTPUT
 * does not enable the input buffer and gpio_get_level() would return 0.
 * @param pin GPIO pin number
 * @return 0 or 1 (last written level)
 */
int PDS_GPIO_get_output_level(uint32_t pin);

/**
 * Set GPIO interrupt handler
 * @param pin GPIO pin number
 * @param intr_type Interrupt type
 * @param handler Callback function
 * @param arg User data for callback
 * @return ESP_OK on success
 */
esp_err_t PDS_GPIO_set_interrupt(uint32_t pin, pds_gpio_intr_t intr_type, 
                                  void (*handler)(void *), void *arg);

/**
 * Disable GPIO interrupt
 * @param pin GPIO pin number
 * @return ESP_OK on success
 */
esp_err_t PDS_GPIO_disable_interrupt(uint32_t pin);

#endif // PDS_GPIO_H


