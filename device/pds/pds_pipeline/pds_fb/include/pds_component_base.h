/**
 * PDS Component Base — Shared types for all pds_components.
 *
 * Every component follows the same contract:
 *   1. A `_settings_t` struct holds all user-assignable parameters.
 *      Defaults are set by the Role Editor and baked into firmware,
 *      but the struct is also the unit of exchange over BLE/WiFi
 *      (settings packets read/write this struct directly).
 *   2. `_init()` configures HAL resources using the settings.
 *   3. `_run()` is called from the main loop — non-blocking,
 *      returns immediately after doing its slice of work.
 *   4. `_get_settings()` / `_set_settings()` provide runtime
 *      access for BLE/WiFi remote-config packets.
 */

#ifndef PDS_COMPONENT_BASE_H
#define PDS_COMPONENT_BASE_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"

/** Component status returned by _run() */
typedef enum {
    PDS_COMP_IDLE = 0,       /**< Nothing to do this tick */
    PDS_COMP_ACTIVE,         /**< Performed work */
    PDS_COMP_ERROR,          /**< Recoverable error occurred */
    PDS_COMP_FAULT,          /**< Non-recoverable fault — needs reinit */
} pds_comp_status_t;

/** Generic component handle (opaque per component type) */
typedef void *pds_comp_handle_t;

/**
 * CHAINING CONVENTION — passing live data between components
 *
 * When a component needs a continuous value produced by an upstream
 * component (e.g. EC sensor needs temperature from DHT22 for compensation),
 * it exposes a `_connect_<input>()` function that accepts a `const float *`
 * pointer to the upstream state field.
 *
 * Rules:
 *  - The pointer is stored in the component's PRIVATE ctx struct, NOT in
 *    settings_t (which must stay serializable/NVS-safe).
 *  - _set_settings() NEVER clobbers the connected pointer.
 *  - If the pointer is NULL, the component falls back to a built-in default
 *    (e.g. temp_reference_c from settings).
 *
 * Wiring (done by the role-generated pds_process_action.c after all inits):
 *
 *   pds_comp_sensor_dht22_init(&dht22_cfg, &s_dht22);
 *   pds_comp_sensor_ec_init(&ec_cfg, &s_ec);
 *   pds_comp_sensor_ec_connect_temp(s_ec,
 *       &pds_comp_sensor_dht22_get_state(s_dht22)->temp_c);
 *
 * run() order in pds_process_action() — upstream before downstream:
 *   1. pds_comp_sensor_dht22_run(s_dht22);   // produces temp_c
 *   2. pds_comp_sensor_ec_run(s_ec);          // consumes *temp_c via ptr
 *
 * The pointer is stable because component ctx is heap-allocated once in
 * _init() and never moved.
 */

#endif /* PDS_COMPONENT_BASE_H */
