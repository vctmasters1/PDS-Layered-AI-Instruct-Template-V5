#ifndef PDS_HAL_H
#define PDS_HAL_H

/**
 * PDS Hardware Abstraction Layer (HAL) - Main Header
 * 
 * This is the primary include file for PDS HAL subsystems.
 * It automatically includes platform-specific and feature-specific headers
 * based on the build configuration from pds_hal_config.h.
 * 
 * Instead of including individual headers like:
 *   #include "pds_adc.h"
 *   #include "pds_pwm.h"
 *   #include "pds_gpio.h"
 * 
 * Simply include this file:
 *   #include "pds_hal.h"
 * 
 * All appropriate subsystems will be automatically included.
 */

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"

/* Load platform configuration and capability flags */
#include "pds_hal_config.h"

/* ============================================================================
 * CONDITIONAL SUBSYSTEM INCLUDES
 * ============================================================================ */

/**
 * ADC (Analog-to-Digital Converter)
 * 
 * Provides single-channel ADC reading with configurable:
 * - Attenuation (voltage range: 0-1.1V, 0-1.5V, 0-2.2V, 0-3.9V)
 * - Resolution (8, 10, 12, 13 bits)
 * 
 * Typical use: Water level sensors, temperature sensors, moisture sensors
 */
#if PDS_HAL_HAS_ADC
#include "pds_adc.h"
#endif

/**
 * PWM (Pulse-Width Modulation)
 * 
 * Provides PWM output for:
 * - Fan speed control
 * - LED brightness (timing-based)
 * - Actuator control (solenoids, motors via driver ICs)
 * - Frequency range: 1 Hz - 80 MHz (platform dependent)
 * - Resolution: 8-16 bits typically
 * 
 * Typical use: Pump speed, solenoid valve timing, RGB LED intensity
 */
#if PDS_HAL_HAS_PWM
#include "pds_pwm.h"
#endif

/**
 * GPIO (General-Purpose Input/Output)
 * 
 * Provides digital I/O for:
 * - Relay control (High/Low output)
 * - Button/switch reading (input)
 * - Interrupt-driven edge detection
 * - Pull-up/pull-down configuration
 * 
 * Typical use: Pump on/off, alarm output, button debouncing
 */
#if PDS_HAL_HAS_GPIO
#include "pds_gpio.h"
#endif

/**
 * SPI (Serial Peripheral Interface)
 * 
 * Provides SPI master communication for:
 * - External ADC/DAC chips
 * - EEPROM/Flash storage
 * - Display controllers (SPI-based)
 * - Sensor modules with SPI interface
 * 
 * Typical use: SD card, external sensors, memory expansion
 */
#if PDS_HAL_HAS_SPI
#include "pds_spi.h"
#endif

/**
 * DRV8833 Motor Driver
 * 
 * Provides dual H-bridge motor control:
 * - 2 independent motor channels
 * - Speed control via PWM (0-100%)
 * - Direction control (forward/reverse/coast/brake)
 * - Current limiting (hardware built-in ~2A per channel)
 * 
 * Typical use: Mist pump, nutrient pump, circulation pump
 */
#if PDS_HAL_HAS_MOTOR_DRV8833
#include "pds_motor_DRV8833.h"
#endif

/* ============================================================================
 * PLATFORM CAPABILITY QUERIES
 * ============================================================================ */

/**
 * Query whether a subsystem is available on this platform
 * 
 * @param subsystem_name String name of subsystem (e.g., "ADC", "PWM", "SPI")
 * @return true if available, false otherwise
 */
bool pds_hal_is_available(const char* subsystem_name);

/**
 * Get build platform identifier
 *
 * @return Platform name string (e.g., "ESP32C3")
 */
const char* pds_hal_get_platform(void);

#endif  // PDS_HAL_H
