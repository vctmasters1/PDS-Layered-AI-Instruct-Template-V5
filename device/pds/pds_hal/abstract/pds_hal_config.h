#ifndef PDS_HAL_CONFIG_H
#define PDS_HAL_CONFIG_H

/**
 * PDS HAL Configuration
 *
 * Enables/disables HAL subsystems based on target platform.
 * PDS_HAL_HAS_* flags are set by CMakeLists.txt via target_compile_definitions.
 */

/* ============================================================================
 * PLATFORM IDENTIFIER (Set by CMakeLists.txt)
 * ============================================================================ */

#ifndef TARGET_PLATFORM
#define TARGET_PLATFORM "UNKNOWN"
#endif

/* ============================================================================
 * SUBSYSTEM AVAILABILITY FLAGS
 * 
 * Set by CMakeLists.txt based on platform capabilities.
 * Format: PDS_HAL_HAS_{SUBSYSTEM}
 * 
 * Example CMakeLists.txt:
 *   if(IDF_TARGET STREQUAL "esp32c3")
 *       target_compile_definitions(pds_hal PRIVATE
 *           -DPDS_HAL_HAS_ADC=1
 *           -DPDS_HAL_HAS_PWM=1
 *           -DPDS_HAL_HAS_GPIO=1
 *           -DPDS_HAL_HAS_SPI=1
 *           -DPDS_HAL_HAS_MOTOR_DRV8833=1
 *           -DPDS_HAL_HAS_PINS=1
 *       )
 *   elseif(IDF_TARGET STREQUAL "esp32")
 *       target_compile_definitions(pds_hal PRIVATE
 *           -DPDS_HAL_HAS_ADC=1
 *           -DPDS_HAL_HAS_PWM=1
 *           -DPDS_HAL_HAS_GPIO=1
 *           -DPDS_HAL_HAS_SPI=1
 *           -DPDS_HAL_HAS_MOTOR_DRV8833=0
 *       )
 *   endif()
 * ============================================================================ */

#ifndef PDS_HAL_HAS_ADC
#define PDS_HAL_HAS_ADC 1
#endif

#ifndef PDS_HAL_HAS_PWM
#define PDS_HAL_HAS_PWM 1
#endif

#ifndef PDS_HAL_HAS_GPIO
#define PDS_HAL_HAS_GPIO 1
#endif

#ifndef PDS_HAL_HAS_SPI
#define PDS_HAL_HAS_SPI 1
#endif

#ifndef PDS_HAL_HAS_MOTOR_DRV8833
#define PDS_HAL_HAS_MOTOR_DRV8833 0
#endif

#ifndef PDS_HAL_HAS_PINS
#define PDS_HAL_HAS_PINS 0
#endif

/* ============================================================================
 * DEBUG/LOGGING FLAGS (Optional)
 * ============================================================================ */

#ifndef PDS_HAL_DEBUG_LOG
#define PDS_HAL_DEBUG_LOG 0  /* Set to 1 for verbose HAL debug output */
#endif

#endif  // PDS_HAL_CONFIG_H
