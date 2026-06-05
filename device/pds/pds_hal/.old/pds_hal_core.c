/**
 * PDS Hardware Abstraction Layer - Core Implementation
 * 
 * Provides initialization and capability query functions.
 * This file implements the platform-agnostic portions of pds_hal.h
 */

#include "pds_hal.h"
#include "pds_hal_config.h"
#include "esp_log.h"
#include <string.h>

static const char* TAG = "PDS_HAL";

/* No global HAL init — each pipeline block (fb_*) initialises its own
 * peripherals during its init callback using the Layer 2 pin assignments.
 * pds_hal_core.c only provides platform capability queries. */

/**
 * Deinitialize all HAL subsystems
 * 
 * Deinitializes in reverse order of initialization.
 */
esp_err_t pds_hal_deinit(void)
{
    /* No-op: peripherals are owned by pipeline blocks; teardown happens
     * in pds_pipeline_engine_teardown() via each block's cleanup path. */
    ESP_LOGI(TAG, "pds_hal_deinit: no-op (blocks own their peripherals)");
    
    /* Motor driver (uses PWM and GPIO) */
    #if PDS_HAL_HAS_MOTOR_DRV8833
    // Note: Motor driver may not have a deinit function yet
    // This is a placeholder for future implementation
    #endif
    
    /* Pin Management */
    #if PDS_HAL_HAS_PINS
    // Note: Pin management may not have a deinit function yet
    // This is a placeholder for future implementation
    #endif
    
    /* SPI */
    #if PDS_HAL_HAS_SPI
    // Note: SPI may not have a deinit function yet
    // This is a placeholder for future implementation
    #endif
    
    /* PWM */
    #if PDS_HAL_HAS_PWM
    // Note: PWM may not have a deinit function yet
    // This is a placeholder for future implementation
    #endif
    
    /* ADC */
    #if PDS_HAL_HAS_ADC
    // Note: ADC may not have a deinit function yet
    // This is a placeholder for future implementation
    #endif
    
    /* GPIO (last, as others depend on it) */
    #if PDS_HAL_HAS_GPIO
    // Note: GPIO may not have a deinit function yet
    // This is a placeholder for future implementation
    #endif
    
    ESP_LOGI(TAG, "PDS HAL deinitialization complete");
    return ESP_OK;
}

/* ============================================================================
 * CAPABILITY QUERIES
 * ============================================================================ */

bool pds_hal_is_available(const char* subsystem_name)
{
    if (subsystem_name == NULL) {
        return false;
    }
    
    /* Case-insensitive comparison */
    #define STRCMP_CASE_INSENSITIVE(a, b) (strcasecmp((a), (b)) == 0)
    
    if (STRCMP_CASE_INSENSITIVE(subsystem_name, "ADC")) {
        return PDS_HAL_HAS_ADC;
    }
    if (STRCMP_CASE_INSENSITIVE(subsystem_name, "PWM")) {
        return PDS_HAL_HAS_PWM;
    }
    if (STRCMP_CASE_INSENSITIVE(subsystem_name, "GPIO")) {
        return PDS_HAL_HAS_GPIO;
    }
    if (STRCMP_CASE_INSENSITIVE(subsystem_name, "SPI")) {
        return PDS_HAL_HAS_SPI;
    }
    if (STRCMP_CASE_INSENSITIVE(subsystem_name, "MOTOR_DRV8833")) {
        return PDS_HAL_HAS_MOTOR_DRV8833;
    }
    if (STRCMP_CASE_INSENSITIVE(subsystem_name, "PINS")) {
        return PDS_HAL_HAS_PINS;
    }
    
    #undef STRCMP_CASE_INSENSITIVE
    
    return false;
}

const char* pds_hal_get_platform(void)
{
    return TARGET_PLATFORM;
}

const char* pds_hal_get_hwrev(void)
{
    return "n/a";  /* hwrev concept removed — roles are now runtime-loaded pipelines */
}

/* Subsystem init weak stubs removed — pds_hal_init() calls PDS_ADC_init(),
 * PDS_GPIO_init(), PDS_PWM_init() directly, which are implemented in the
 * platform-specific .c files. SPI and motor init require parameters and are
 * called directly by the blocks or board-specific code that owns the config. */
