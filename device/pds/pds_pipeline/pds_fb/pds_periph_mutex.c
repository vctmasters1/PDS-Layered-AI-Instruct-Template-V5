/**
 * pds_periph_mutex — Non-blocking peripheral mutual exclusion implementation
 *
 * Internally a flat owner-pointer array indexed by group ID.
 * NULL means the group is free. Any non-NULL pointer is the current owner.
 * Single-threaded: no atomics needed (pipeline tick runs on one task).
 */

#include "pds_periph_mutex.h"
#include <stddef.h>

/* One slot per group — NULL = free, non-NULL = held by that owner. */
static void *g_owners[PDS_PERIPH_MUTEX_GROUP_COUNT];

bool pds_periph_mutex_try_acquire(pds_periph_mutex_group_t group, void *owner)
{
    if ((unsigned)group >= (unsigned)PDS_PERIPH_MUTEX_GROUP_COUNT) return false;
    if (g_owners[group] == NULL || g_owners[group] == owner) {
        g_owners[group] = owner;
        return true;
    }
    return false;
}

void pds_periph_mutex_release(pds_periph_mutex_group_t group, void *owner)
{
    if ((unsigned)group >= (unsigned)PDS_PERIPH_MUTEX_GROUP_COUNT) return;
    if (g_owners[group] == owner) {
        g_owners[group] = NULL;
    }
}

bool pds_periph_mutex_is_held_by(pds_periph_mutex_group_t group, void *owner)
{
    if ((unsigned)group >= (unsigned)PDS_PERIPH_MUTEX_GROUP_COUNT) return false;
    return g_owners[group] == owner;
}
