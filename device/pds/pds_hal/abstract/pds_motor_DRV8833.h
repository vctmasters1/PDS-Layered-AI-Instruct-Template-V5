#ifndef PDS_MOTOR_DRV8833_H
#define PDS_MOTOR_DRV8833_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"

/**
 * PDS DRV8833 Dual Motor Driver HAL
 * 
 * Platform-agnostic interface for the DRV8833 dual H-bridge motor driver.
 * Supports 2 independent motor channels with PWM-based speed control.
 * 
 * Control modes per channel:
 *   - COAST: Both inputs low (freewheel)
 *   - FORWARD: IN1 high, IN2 low
 *   - REVERSE: IN1 low, IN2 high
 *   - BRAKE: Both inputs high (hard stop)
 * 
 * Implementations: platform/{chip}/{hwrev}/common/pds_motor_DRV8833_{chip}.c
 */

// Motor channel identifiers
typedef enum {
    PDS_MOTOR_CHANNEL_A = 0,
    PDS_MOTOR_CHANNEL_B = 1,
} pds_motor_channel_t;

// Motor control modes
typedef enum {
    PDS_MOTOR_MODE_COAST = 0,      // Both pins LOW (freewheel)
    PDS_MOTOR_MODE_FORWARD = 1,    // IN1 HIGH, IN2 LOW
    PDS_MOTOR_MODE_REVERSE = 2,    // IN1 LOW, IN2 HIGH
    PDS_MOTOR_MODE_BRAKE = 3,      // Both pins HIGH (hard stop)
} pds_motor_mode_t;

// Motor control configuration
typedef struct {
    uint32_t pwm_frequency;         // PWM frequency in Hz (e.g., 5000)
    uint32_t pwm_resolution_bits;   // PWM resolution (e.g., 10 bits = 0-1023)
    bool enable_current_limiting;   // Enable current limiting features
} pds_motor_config_t;

/**
 * Initialize DRV8833 motor driver subsystem
 * @param config Configuration parameters (frequency, resolution, etc.)
 * @return ESP_OK on success, ESP_ERR_* on failure
 */
esp_err_t pds_motor_drv8833_init(const pds_motor_config_t *config);

/**
 * Set motor control mode (direction) for a channel
 * @param channel Motor channel (A or B)
 * @param mode Control mode (coast, forward, reverse, brake)
 * @return ESP_OK on success, ESP_ERR_* on failure
 */
esp_err_t pds_motor_set_mode(pds_motor_channel_t channel, pds_motor_mode_t mode);

/**
 * Set motor speed for a channel (raw value)
 * @param channel Motor channel (A or B)
 * @param speed Speed value (0 to max based on PWM resolution)
 * @return ESP_OK on success, ESP_ERR_* on failure
 */
esp_err_t pds_motor_set_speed(pds_motor_channel_t channel, uint32_t speed);

/**
 * Set motor speed as percentage (0-100%)
 * @param channel Motor channel (A or B)
 * @param percent Speed percentage (0-100)
 * @return ESP_OK on success, ESP_ERR_INVALID_ARG if percent > 100
 */
esp_err_t pds_motor_set_speed_percent(pds_motor_channel_t channel, uint32_t percent);

/**
 * Control motor with mode and speed in one call
 * @param channel Motor channel (A or B)
 * @param mode Control mode (coast, forward, reverse, brake)
 * @param speed Speed value (0 to max based on PWM resolution)
 * @return ESP_OK on success, ESP_ERR_* on failure
 */
esp_err_t pds_motor_control(pds_motor_channel_t channel, pds_motor_mode_t mode, uint32_t speed);

/**
 * Get current speed of a motor channel (raw value)
 * @param channel Motor channel (A or B)
 * @param speed Output parameter for current speed
 * @return ESP_OK on success, ESP_ERR_* on failure
 */
esp_err_t pds_motor_get_speed(pds_motor_channel_t channel, uint32_t *speed);

/**
 * Get current mode of a motor channel
 * @param channel Motor channel (A or B)
 * @param mode Output parameter for current mode
 * @return ESP_OK on success, ESP_ERR_* on failure
 */
esp_err_t pds_motor_get_mode(pds_motor_channel_t channel, pds_motor_mode_t *mode);

/**
 * Stop all motors (coast or brake)
 * @param stop_mode How to stop: coast (coast mode) or brake (hard stop)
 * @return ESP_OK on success, ESP_ERR_* on failure
 */
esp_err_t pds_motor_stop_all(pds_motor_mode_t stop_mode);

/**
 * Get PWM resolution in use (max speed value)
 * @return Maximum speed value based on PWM resolution
 */
uint32_t pds_motor_get_max_speed(void);

/**
 * Deinitialize DRV8833 motor driver subsystem
 * @return ESP_OK on success, ESP_ERR_* on failure
 */
esp_err_t pds_motor_drv8833_deinit(void);

#endif // PDS_MOTOR_DRV8833_H
