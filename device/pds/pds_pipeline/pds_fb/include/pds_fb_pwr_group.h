/**
 * pds_fb_pwr_group — Shared power-pin coordinator
 *
 * Sensors that share a common power-enable GPIO register here at init.
 * Before sampling, each block calls pds_pwr_group_acquire(); when done
 * it calls pds_pwr_group_release().
 *
 * Semantics:
 *   - First acquire() drives GPIO ON and stamps the on-tick.
 *   - Subsequent acquire() calls from other blocks in the same group just
 *     increment the reference count — power stays on.
 *   - Each block waits independently until (now - on_tick) >= its own
 *     settling_time_ms before reading.
 *   - Last release() drives GPIO OFF.
 *
 * Result: the power supply stays on for the entire window that ANY block
 * in the group needs it, so all oversampling completes before it is cut.
 *
 * All functions are non-blocking and safe to call from the pipeline tick task.
 */

#ifndef PDS_FB_PWR_GROUP_H
#define PDS_FB_PWR_GROUP_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Maximum GPIO number supported (ESP32 family). */
#define PDS_PWR_GROUP_MAX_PINS  40

/**
 * Register a GPIO as a managed power pin.
 *
 * Configures the GPIO as output and drives it to the inactive (OFF) level.
 * Multiple blocks registering the same pin is safe — idempotent after the
 * first call.
 *
 * @param pin        GPIO number (0 … PDS_PWR_GROUP_MAX_PINS-1)
 * @param active_low true = drive LOW to turn sensor ON (most common)
 */
esp_err_t pds_pwr_group_register(int8_t pin, bool active_low);

/**
 * Acquire power for this pin.
 *
 * Increments the reference count.  If the count was zero, drives GPIO ON
 * and records the on-tick timestamp.
 */
void pds_pwr_group_acquire(int8_t pin);

/**
 * Release power for this pin.
 *
 * Decrements the reference count.  When it reaches zero, drives GPIO OFF.
 */
void pds_pwr_group_release(int8_t pin);

/**
 * Return the millisecond tick when power was last turned on.
 *
 * Used by each block to check whether its settling_time_ms has elapsed
 * since the supply was first raised for this sampling cycle.
 */
uint32_t pds_pwr_group_on_tick(int8_t pin);

/**
 * Reset all power-group state.
 *
 * Drives any currently-asserted pins to inactive and clears all slots.
 * Called by the pipeline engine during teardown / reconfiguration.
 */
void pds_pwr_group_clear(void);

#ifdef __cplusplus
}
#endif

#endif /* PDS_FB_PWR_GROUP_H */
