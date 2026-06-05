/**
 * @file pds_usrset.h
 * @brief Runtime registry for user-settable variables
 *
 * Bridges the compile-time role defaults (usrset_defaults.h) and the
 * runtime wire format (pds_telconf_usrset_t).  Provides get/set by name,
 * NVS load/save, and packet apply for HTTPS and BLE updates.
 *
 * Boot sequence:
 *   1. pds_usrset_init(defaults, count)   — load compiled-in role defaults
 *   2. pds_usrset_load_nvs()              — override with user-saved NVS values
 *   3. Role uses pds_usrset_get() in automation / pipeline logic
 *   4. HTTPS POST /settings or BLE write calls pds_usrset_apply_packet()
 *   5. pds_usrset_save_nvs() persists changes across reboots
 *
 * Variable names must be ≤ 31 chars (null-terminated in 32-byte field).
 * All values are float — integer variables use whole-number float values.
 * String-type settings (wifi_ssid, wifi_password, etc.) are handled by
 * pds_ble_provisioning, not by pds_usrset.
 */

#ifndef PDS_USRSET_H
#define PDS_USRSET_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"
#include "pds_telemetry_types.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * TYPES
 * ============================================================================ */

/**
 * Compile-time default entry.
 *
 * Role-generated usrset_defaults.h declares an array of these, which is
 * passed to pds_usrset_init() during device startup.
 */
typedef struct {
    const char *name;   /**< Variable name — must match label used by ladder logic / HMI */
    float       value;  /**< Default value on first boot or factory reset */
} pds_usrset_default_t;

/* ============================================================================
 * LIFECYCLE
 * ============================================================================ */

/**
 * Initialize the registry from compile-time role defaults.
 *
 * Call once, early in pds_platform_init(), BEFORE pds_usrset_load_nvs().
 * After this call, all variables exist in RAM at their default values.
 *
 * @param defaults  Array of default entries (usually from usrset_defaults.h)
 * @param count     Number of entries in defaults array
 * @return ESP_OK on success
 * @return ESP_ERR_INVALID_ARG if defaults is NULL or count is 0
 * @return ESP_ERR_NO_MEM if count exceeds PDS_USRSET_MAX_ENTRIES
 */
esp_err_t pds_usrset_init(const pds_usrset_default_t *defaults, uint16_t count);

/**
 * Load user-saved values from NVS, overriding compile-time defaults.
 *
 * Call after pds_usrset_init(). If no NVS data exists, the defaults from
 * pds_usrset_init() remain active — this is not an error.
 *
 * @return ESP_OK on success (or no NVS data found)
 * @return ESP_ERR_INVALID_STATE if pds_usrset_init() was not called first
 * @return ESP_ERR_* on NVS hardware failure
 */
esp_err_t pds_usrset_load_nvs(void);

/**
 * Persist current values to NVS.
 *
 * Call after pds_usrset_apply_packet() or any manual set that should
 * survive a reboot.
 *
 * @return ESP_OK on success
 * @return ESP_ERR_INVALID_STATE if not initialized
 * @return ESP_ERR_NVS_NOT_ENOUGH_SPACE if NVS is full
 */
esp_err_t pds_usrset_save_nvs(void);

/* ============================================================================
 * GET / SET
 * ============================================================================ */

/**
 * Get the current value of a named variable.
 *
 * @param name      Variable name (null-terminated, ≤ 31 chars)
 * @param out_value Output: current value
 * @return ESP_OK on success
 * @return ESP_ERR_NOT_FOUND if name is not registered
 * @return ESP_ERR_INVALID_ARG if name or out_value is NULL
 */
esp_err_t pds_usrset_get(const char *name, float *out_value);

/**
 * Set a variable value in RAM (does NOT auto-save to NVS).
 *
 * Call pds_usrset_save_nvs() separately to persist.
 *
 * @param name   Variable name (null-terminated, ≤ 31 chars)
 * @param value  New value
 * @return ESP_OK on success
 * @return ESP_ERR_NOT_FOUND if name is not registered
 * @return ESP_ERR_INVALID_ARG if name is NULL
 */
esp_err_t pds_usrset_set(const char *name, float value);

/* ============================================================================
 * WIRE FORMAT — HTTPS / BLE
 * ============================================================================ */

/**
 * Apply a received USRSET wire packet to the registry.
 *
 * Called by the HTTPS POST /settings handler and by the BLE GATT write
 * handler (when implemented). Updates in-RAM values for all entries in the
 * packet that exist in the registry, then saves to NVS.
 *
 * Unknown variable names in the packet are silently ignored.
 *
 * @param pkt  Received pds_telconf_usrset_t packet (version-validated)
 * @return ESP_OK on success
 * @return ESP_ERR_INVALID_ARG if pkt is NULL or version mismatch
 * @return ESP_ERR_INVALID_STATE if not initialized
 */
esp_err_t pds_usrset_apply_packet(const pds_telconf_usrset_t *pkt);

/**
 * Serialize current registry values into a wire packet.
 *
 * Used by GET /settings and BLE read to report current values to the HMI.
 *
 * @param pkt  Output packet — caller must provide a zeroed pds_telconf_usrset_t
 * @return ESP_OK on success
 * @return ESP_ERR_INVALID_ARG if pkt is NULL
 * @return ESP_ERR_INVALID_STATE if not initialized
 */
esp_err_t pds_usrset_to_packet(pds_telconf_usrset_t *pkt);

/* ============================================================================
 * BLE STUB
 * ============================================================================ */

/**
 * @note BLE integration (future)
 *
 * When pds_ble_provisioning implements GATT characteristics for user
 * settings, each characteristic write should call:
 *
 *   pds_usrset_set(var_name, new_float_value);
 *   pds_usrset_save_nvs();
 *
 * And each characteristic read should call:
 *
 *   pds_usrset_get(var_name, &value);
 *
 * The characteristic UUID ↔ var_name mapping is generated by the Role
 * tool (PDS-Role) alongside usrset_defaults.h.
 */

/* ============================================================================
 * UTILITY
 * ============================================================================ */

/**
 * Return the number of registered variables.
 *
 * @return count of entries currently in the registry
 */
uint16_t pds_usrset_count(void);

/**
 * Check if the registry has been initialized.
 *
 * @return true if pds_usrset_init() has been successfully called
 */
bool pds_usrset_is_initialized(void);

#ifdef __cplusplus
}
#endif

#endif /* PDS_USRSET_H */
