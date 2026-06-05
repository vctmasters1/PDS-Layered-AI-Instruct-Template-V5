/**
 * @file main.c
 * @brief Platform-agnostic application entry point for PDS firmware.
 *
 * This file contains NO platform-specific logic. All initialization and
 * per-tick work is delegated to the platform implementation:
 *
 *   Device/pds/pds_hal/platform/<platform>/common/pds_platform_main.c
 *
 * The build system selects exactly one platform's common/ directory,
 * so only one pds_platform_main.c is ever compiled and linked.
 *
 * To add a new platform:
 *   1. Create Device/pds/pds_hal/platform/<name>/common/pds_platform_main.c
 *   2. Implement pds_platform_init() and pds_platform_loop()
 *   3. Nothing else changes.
 */

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "pds_platform.h"

void app_main(void)
{
    /* One-time platform + role initialization */
    pds_platform_init();

    /* Main loop — platform decides tick rate internally */
    while (1) {
        pds_platform_loop();
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

