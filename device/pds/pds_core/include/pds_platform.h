/**
 * @file pds_platform.h
 * @brief Platform abstraction interface for PDS main loop
 *
 * Every supported platform provides exactly two functions:
 *   - pds_platform_init()   called once at boot from app_main()
 *   - pds_platform_loop()   called repeatedly from the main while(1) loop
 *
 * The implementation lives in:
 *   Device/pds/pds_hal/platform/<platform>/common/pds_platform_main.c
 *
 * Only one platform's common/ directory is compiled per build, so only
 * one implementation is ever linked — no #ifdefs needed in main.c.
 */

#ifndef PDS_PLATFORM_H
#define PDS_PLATFORM_H

#include "pds_types.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief One-time platform initialization called from app_main().
 *
 * Responsible for:
 *   - NVS / flash init
 *   - Pin table load and GPIO init
 *   - Network / WiFi / BLE bring-up
 *   - Any platform-specific peripheral setup
 *
 * @return PDS_OK on success, error code on failure (boot halts on hard errors).
 */
pds_err_t pds_platform_init(void);

/**
 * @brief Per-tick platform processing called from the main while(1) loop.
 *
 * Responsible for:
 *   - Delegating to the role's pds_process_action()
 *   - Platform watchdog / health checks
 *   - Any periodic platform-level work (telemetry flush, BLE notify, etc.)
 *
 * Should return quickly — heavy work must be delegated to FreeRTOS tasks.
 *
 * @return PDS_OK on success, error code logged but loop continues.
 */
pds_err_t pds_platform_loop(void);

#ifdef __cplusplus
}
#endif

#endif /* PDS_PLATFORM_H */
