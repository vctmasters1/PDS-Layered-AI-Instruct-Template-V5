#ifndef PDS_PDS_NVS_H
#define PDS_PDS_NVS_H

#include "pds_types.h"
#include "esp_err.h"

/**
 * H20-Tower Aeroponics Control System
 * Non-Volatile Storage (NVS) Management
 * 
 * Persists pin configurations, timer settings, and calibration data
 * to flash memory for recovery after power cycles.
 */

// NVS namespace for this application
#define pds_NVS_NAMESPACE "pds_config"

// NVS keys
#define pds_NVS_KEY_PIN_TABLE     "pin_table"
#define pds_NVS_KEY_TIMER_TABLE   "timer_table"
#define pds_NVS_KEY_CONFIG_VERSION "config_version"
#define pds_NVS_KEY_ADC_CALIBRATION "adc_calib"

/* 3-layer pipeline blob keys */
#define PDS_NVS_KEY_PIPELINE  "pipeline"
#define PDS_NVS_KEY_HW_VARS   "hw_vars"
#define PDS_NVS_KEY_SETTINGS  "settings"

/* WiFi credential keys */
#define PDS_NVS_KEY_WIFI_SSID "wifi_ssid"
#define PDS_NVS_KEY_WIFI_PASS "wifi_pass"

/* Cloud push credential keys (NVS_TYPE_STR, written at claim / NVS flash time) */
#define PDS_NVS_KEY_API_URL      "api_url"      /**< WEB-HMI API base URL, no trailing slash */
#define PDS_NVS_KEY_DEVICE_ID    "device_id"    /**< UUID from POST /v1/devices/register    */
#define PDS_NVS_KEY_DEVICE_TOKEN "device_token" /**< 64-char hex from claim response        */

/**
 * Initialize NVS subsystem
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t pds_device_nvs_init(void);

/**
 * Load pin configuration from NVS
 * @param pin_table Output: array to load pin definitions into
 * @param max_pins Size of pin_table array
 * @param pins_loaded Output: number of pins loaded
 * @return ESP_OK on success, error code otherwise (ESP_ERR_NVS_NOT_FOUND if no saved config)
 */
esp_err_t pds_device_nvs_load_pins(pds_pin_def_t *pin_table, uint8_t max_pins, uint8_t *pins_loaded);

/**
 * Save pin configuration to NVS
 * @param pin_table Array of pin definitions to save
 * @param pin_count Number of pins to save
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t pds_device_nvs_save_pins(const pds_pin_def_t *pin_table, uint8_t pin_count);

/**
 * Load ADC calibration data from NVS
 * @param calib_data Output buffer for calibration data
 * @param calib_size Size of calibration data
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t pds_device_nvs_load_adc_calibration(void *calib_data, uint32_t calib_size);

/**
 * Save ADC calibration data to NVS
 * @param calib_data Calibration data to save
 * @param calib_size Size of calibration data
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t pds_device_nvs_save_adc_calibration(const void *calib_data, uint32_t calib_size);

/**
 * Save a custom key-value pair to NVS
 * @param key NVS key (max 15 characters)
 * @param value Pointer to value
 * @param size Size of value in bytes
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t pds_device_nvs_save_blob(const char *key, const void *value, uint32_t size);

/**
 * Load a custom key-value pair from NVS
 * @param key NVS key to retrieve
 * @param value Output buffer
 * @param size Size of output buffer (will be updated with actual size read)
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t pds_device_nvs_load_blob(const char *key, void *value, uint32_t *size);

/**
 * Read a blob from NVS, allocating the buffer. Caller must free *out_buf.
 * Returns ESP_ERR_NVS_NOT_FOUND if key absent, ESP_ERR_NO_MEM if alloc fails.
 */
esp_err_t pds_device_nvs_read_blob(const char *key, uint8_t **out_buf, size_t *out_len);

/**
 * Write a blob to NVS (convenience alias for pds_device_nvs_save_blob).
 */
esp_err_t pds_device_nvs_write_blob(const char *key, const uint8_t *buf, size_t len);

/**
 * Read a null-terminated string from NVS into caller-provided buffer.
 */
esp_err_t pds_device_nvs_read_str(const char *key, char *buf, size_t buf_len);

/**
 * Write a null-terminated string to NVS.
 */
esp_err_t pds_device_nvs_write_str(const char *key, const char *value);

/**
 * Clear all H2o configuration from NVS
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t pds_device_nvs_clear_all(void);

/**
 * Get NVS storage statistics for debugging
 * @param total_size Output: total NVS size in bytes
 * @param used_size Output: used NVS size in bytes
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t pds_device_nvs_get_stats(uint32_t *total_size, uint32_t *used_size);

#endif // pds_NVS_H


