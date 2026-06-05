/**
 * @file pds_config_store.h
 * @brief NVS storage handlers for runtime configuration (PINMAP, LADDER, USRSET)
 * 
 * Provides persistent storage and retrieval of runtime configurations:
 * - PDS_TELCONF_PINMAP (hardware + variable mappings)
 * - PDS_TELCONF_LADDER (automation bytecode)
 * - PDS_TELCONF_USRSET (user settings)
 * 
 * All data stored in NVS partition with CRC32 validation.
 * 
 * See DEVICE_STORAGE_ALLOCATION.md for storage strategy.
 */

#ifndef PDS_CONFIG_STORE_H
#define PDS_CONFIG_STORE_H

#include <stdint.h>
#include <stddef.h>
#include "esp_err.h"
#include "pds_telemetry_types.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * NVS namespace for PDS runtime configs
 */
#define PDS_CONFIG_NAMESPACE "pds_config"

/**
 * NVS key names for each configuration type
 */
#define PDS_CONFIG_KEY_PINMAP   "pinmap"
#define PDS_CONFIG_KEY_LADDER   "ladder"
#define PDS_CONFIG_KEY_USRSET   "usrset"
#define PDS_CONFIG_KEY_PINMAP_CRC "pinmap_crc"
#define PDS_CONFIG_KEY_LADDER_CRC "ladder_crc"
#define PDS_CONFIG_KEY_USRSET_CRC "usrset_crc"

/**
 * Statistics for NVS usage
 */
typedef struct {
    size_t used_entries;        /**< Number of used entries */
    size_t free_entries;        /**< Number of free entries */
    size_t total_entries;       /**< Total available entries */
    size_t namespace_count;     /**< Number of namespaces */
} pds_config_stats_t;

/**
 * Initialize NVS flash storage for runtime configurations
 * 
 * Must be called early in device startup, before loading configs.
 * Initializes NVS flash if not already done.
 * 
 * @return ESP_OK on success
 * @return ESP_ERR_NVS_NOT_INITIALIZED if NVS flash init fails
 * @return other esp_err_t on error
 */
esp_err_t pds_config_store_init(void);

/* ============================================================================
 * PINMAP STORAGE
 * ============================================================================ */

/**
 * Save PINMAP configuration to NVS
 * 
 * Stores PDS_TELCONF_PINMAP and its CRC32 checksum.
 * All data is validated before storage.
 * 
 * @param pinmap Pointer to PINMAP config (must be valid)
 * @return ESP_OK on success
 * @return ESP_ERR_INVALID_ARG if pinmap is NULL or invalid
 * @return ESP_ERR_NVS_NOT_ENOUGH_SPACE if NVS is full
 * @return other esp_err_t on error
 */
esp_err_t pds_config_save_pinmap(const pds_telconf_pinmap_t *pinmap);

/**
 * Load PINMAP configuration from NVS
 * 
 * Retrieves PDS_TELCONF_PINMAP and validates checksum.
 * If checksum fails, returns ESP_ERR_INVALID_CRC.
 * 
 * @param pinmap Pointer to buffer for PINMAP config
 * @return ESP_OK on success (checksum valid)
 * @return ESP_ERR_NVS_NOT_FOUND if no PINMAP in storage
 * @return ESP_ERR_INVALID_CRC if checksum doesn't match
 * @return other esp_err_t on error
 */
esp_err_t pds_config_load_pinmap(pds_telconf_pinmap_t *pinmap);

/**
 * Check if PINMAP exists in NVS
 * 
 * @return true if PINMAP is stored and valid
 * @return false otherwise
 */
bool pds_config_has_pinmap(void);

/**
 * Erase PINMAP from NVS
 * 
 * @return ESP_OK on success
 * @return other esp_err_t on error
 */
esp_err_t pds_config_erase_pinmap(void);

/* ============================================================================
 * LADDER STORAGE
 * ============================================================================ */

/**
 * Save LADDER bytecode to NVS
 * 
 * Stores PDS_TELCONF_LADDER and its CRC32 checksum.
 * All data is validated before storage.
 * 
 * @param ladder Pointer to LADDER config (must be valid)
 * @return ESP_OK on success
 * @return ESP_ERR_INVALID_ARG if ladder is NULL or invalid
 * @return ESP_ERR_NVS_NOT_ENOUGH_SPACE if NVS is full
 * @return other esp_err_t on error
 */
esp_err_t pds_config_save_ladder(const pds_telconf_ladder_t *ladder);

/**
 * Load LADDER bytecode from NVS
 * 
 * Retrieves PDS_TELCONF_LADDER and validates checksum.
 * If checksum fails, returns ESP_ERR_INVALID_CRC.
 * 
 * @param ladder Pointer to buffer for LADDER config
 * @return ESP_OK on success (checksum valid)
 * @return ESP_ERR_NVS_NOT_FOUND if no LADDER in storage
 * @return ESP_ERR_INVALID_CRC if checksum doesn't match
 * @return other esp_err_t on error
 */
esp_err_t pds_config_load_ladder(pds_telconf_ladder_t *ladder);

/**
 * Check if LADDER exists in NVS
 * 
 * @return true if LADDER is stored and valid
 * @return false otherwise
 */
bool pds_config_has_ladder(void);

/**
 * Erase LADDER from NVS
 * 
 * @return ESP_OK on success
 * @return other esp_err_t on error
 */
esp_err_t pds_config_erase_ladder(void);

/* ============================================================================
 * USER SETTINGS STORAGE
 * ============================================================================ */

/**
 * Save user settings to NVS
 * 
 * Stores PDS_TELCONF_USRSET and its CRC32 checksum.
 * All data is validated before storage.
 * 
 * @param usrset Pointer to user settings config (must be valid)
 * @return ESP_OK on success
 * @return ESP_ERR_INVALID_ARG if usrset is NULL or invalid
 * @return ESP_ERR_NVS_NOT_ENOUGH_SPACE if NVS is full
 * @return other esp_err_t on error
 */
esp_err_t pds_config_save_usrset(const pds_telconf_usrset_t *usrset);

/**
 * Load user settings from NVS
 * 
 * Retrieves PDS_TELCONF_USRSET and validates checksum.
 * If checksum fails, returns ESP_ERR_INVALID_CRC.
 * 
 * @param usrset Pointer to buffer for user settings
 * @return ESP_OK on success (checksum valid)
 * @return ESP_ERR_NVS_NOT_FOUND if no settings in storage
 * @return ESP_ERR_INVALID_CRC if checksum doesn't match
 * @return other esp_err_t on error
 */
esp_err_t pds_config_load_usrset(pds_telconf_usrset_t *usrset);

/**
 * Check if user settings exist in NVS
 * 
 * @return true if settings are stored and valid
 * @return false otherwise
 */
bool pds_config_has_usrset(void);

/**
 * Erase user settings from NVS
 * 
 * @return ESP_OK on success
 * @return other esp_err_t on error
 */
esp_err_t pds_config_erase_usrset(void);

/* ============================================================================
 * BULK OPERATIONS
 * ============================================================================ */

/**
 * Load all runtime configurations in one call
 * 
 * Loads PINMAP, LADDER, and USRSET from NVS.
 * Validates checksums for all. If any fails, that config is left untouched.
 * Returns bitmask of successfully loaded configs.
 * 
 * @param pinmap Output buffer for PINMAP (can be NULL)
 * @param ladder Output buffer for LADDER (can be NULL)
 * @param usrset Output buffer for user settings (can be NULL)
 * @return Bitmask: bit 0=PINMAP, bit 1=LADDER, bit 2=USRSET (1=loaded, 0=not found/invalid)
 */
uint8_t pds_config_load_all(
    pds_telconf_pinmap_t *pinmap,
    pds_telconf_ladder_t *ladder,
    pds_telconf_usrset_t *usrset
);

/**
 * Erase all runtime configurations (factory reset)
 * 
 * Removes PINMAP, LADDER, and USRSET from NVS.
 * Device will require re-provisioning.
 * 
 * @return ESP_OK on success
 * @return other esp_err_t on error
 */
esp_err_t pds_config_erase_all(void);

/**
 * Get NVS usage statistics
 * 
 * Returns information about NVS partition usage.
 * Useful for debugging storage issues.
 * 
 * @param stats Output pointer for statistics
 * @return ESP_OK on success
 * @return ESP_ERR_INVALID_ARG if stats is NULL
 */
esp_err_t pds_config_get_stats(pds_config_stats_t *stats);

/**
 * Format NVS partition (destructive)
 * 
 * Erases entire NVS partition and reinitializes.
 * **WARNING**: Deletes ALL NVS data (WiFi credentials, etc.)
 * 
 * @return ESP_OK on success
 * @return other esp_err_t on error
 */
esp_err_t pds_config_format_nvs(void);

/* ============================================================================
 * VALIDATION HELPERS
 * ============================================================================ */

/**
 * Validate PINMAP checksum
 * 
 * @param pinmap PINMAP config to validate
 * @return true if checksum is valid
 */
bool pds_config_validate_pinmap_crc(const pds_telconf_pinmap_t *pinmap);

/**
 * Validate LADDER checksum
 * 
 * @param ladder LADDER config to validate
 * @return true if checksum is valid
 */
bool pds_config_validate_ladder_crc(const pds_telconf_ladder_t *ladder);

/**
 * Validate user settings checksum
 * 
 * @param usrset User settings to validate
 * @return true if checksum is valid
 */
bool pds_config_validate_usrset_crc(const pds_telconf_usrset_t *usrset);

/**
 * Compute CRC32 for binary data
 * 
 * Used to generate/validate config checksums.
 * 
 * @param data Pointer to data
 * @param length Length of data in bytes
 * @return CRC32 checksum
 */
uint32_t pds_config_crc32(const uint8_t *data, size_t length);

#ifdef __cplusplus
}
#endif

#endif /* PDS_CONFIG_STORE_H */
