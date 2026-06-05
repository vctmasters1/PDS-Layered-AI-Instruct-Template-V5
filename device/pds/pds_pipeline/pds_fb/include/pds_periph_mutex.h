/**
 * pds_periph_mutex — Non-blocking peripheral mutual exclusion
 *
 * A lightweight group-based try-lock for peripheral-sourced pipeline blocks
 * that share a physical hardware resource. No RTOS primitives — all functions
 * are O(1), single-threaded, safe to call from the pipeline tick task.
 *
 * Usage pattern:
 *   // At IDLE → POWER_ON transition:
 *   if (!pds_periph_mutex_try_acquire(PDS_PERIPH_MUTEX_ADC_PROBE, ctx)) {
 *       return PDS_COMP_IDLE;   // retry next tick — non-blocking
 *   }
 *   pds_pwr_group_acquire(pin_power);  // now safe to power on
 *   ...
 *   // After ADC read is complete:
 *   pds_pwr_group_release(pin_power);
 *   pds_periph_mutex_release(PDS_PERIPH_MUTEX_ADC_PROBE, ctx);
 */

#ifndef PDS_PERIPH_MUTEX_H
#define PDS_PERIPH_MUTEX_H

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Mutex group identifiers. Add new shared resources here as needed. */
typedef enum {
    PDS_PERIPH_MUTEX_ADC_PROBE = 0,  /**< Shared analog probe circuit (PH + EC probes) */
    PDS_PERIPH_MUTEX_GROUP_COUNT,    /**< Sentinel — total number of groups */
} pds_periph_mutex_group_t;

/**
 * Attempt to acquire a mutex group (non-blocking).
 *
 * @param group  The resource group to acquire.
 * @param owner  Caller's unique identity (use the block's ctx pointer).
 * @return true  Group acquired (or already held by this owner).
 * @return false Group is currently held by a different owner — skip this tick.
 */
bool pds_periph_mutex_try_acquire(pds_periph_mutex_group_t group, void *owner);

/**
 * Release a mutex group.
 *
 * No-op if the caller is not the current owner.
 *
 * @param group  The resource group to release.
 * @param owner  Must match the owner passed to try_acquire.
 */
void pds_periph_mutex_release(pds_periph_mutex_group_t group, void *owner);

/**
 * Query whether this owner currently holds the group.
 *
 * @param group  The group to query.
 * @param owner  The owner to check.
 * @return true  if owner currently holds the group.
 */
bool pds_periph_mutex_is_held_by(pds_periph_mutex_group_t group, void *owner);

#ifdef __cplusplus
}
#endif

#endif /* PDS_PERIPH_MUTEX_H */
