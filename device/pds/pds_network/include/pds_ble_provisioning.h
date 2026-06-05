#ifndef PDS_PDS_BLE_PROVISIONING_H
#define PDS_PDS_BLE_PROVISIONING_H

#include "esp_err.h"
#include <stdint.h>
#include <stdbool.h>

/**
 * H20-Tower Aeroponics Control System
 * Bluetooth Low Energy Provisioning
 * 
 * Handles BLE provisioning service for first-time WiFi credential setup.
 * Allows Android app to send WiFi SSID and password via BLE characteristics.
 */

// BLE Provisioning Service & Characteristic UUIDs (128-bit, standard BLE format)
#define PDS_BLE_PROV_SERVICE_UUID          "0000181c-0000-1000-8000-00805f9b34fb"
#define PDS_BLE_SSID_CHAR_UUID             "00002a3d-0000-1000-8000-00805f9b34fb"
#define PDS_BLE_PASSWORD_CHAR_UUID         "00002a3e-0000-1000-8000-00805f9b34fb"
#define PDS_BLE_CONNECT_CHAR_UUID          "00002a3f-0000-1000-8000-00805f9b34fb"

// String lengths
#define PDS_BLE_DEVICE_NAME_MAX            32
#define PDS_BLE_SSID_MAX                   32
#define PDS_BLE_PASSWORD_MAX               64

// BLE callback event types
typedef enum {
    PDS_BLE_EVENT_CONNECTED = 0,
    PDS_BLE_EVENT_DISCONNECTED = 1,
    PDS_BLE_EVENT_SSID_RECEIVED = 2,
    PDS_BLE_EVENT_PASSWORD_RECEIVED = 3,
    PDS_BLE_EVENT_CONNECT_REQUEST = 4
} pds_ble_event_t;

// BLE event callback function type
typedef void (*pds_ble_callback_t)(pds_ble_event_t event, void *data, size_t data_len);

/**
 * Initialize BLE provisioning service
 * Starts BLE advertising if no WiFi credentials found in NVS
 * 
 * @param callback Optional callback function for BLE events
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t PDS_BLE_provisioning_init(pds_ble_callback_t callback);

/**
 * Check if BLE provisioning is active
 * @return true if BLE is advertising for provisioning, false otherwise
 */
bool PDS_BLE_provisioning_is_active(void);

/**
 * Stop BLE provisioning and disconnect any connected client
 * Called after successful WiFi connection
 * 
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t PDS_BLE_provisioning_stop(void);

/**
 * Get the last received WiFi SSID from BLE characteristic
 * @param buffer Output buffer for SSID string
 * @param buffer_size Size of output buffer
 * @return Number of bytes written (0 if no SSID received)
 */
size_t PDS_BLE_provisioning_get_ssid(char *buffer, size_t buffer_size);

/**
 * Get the last received WiFi password from BLE characteristic
 * @param buffer Output buffer for password string
 * @param buffer_size Size of output buffer
 * @return Number of bytes written (0 if no password received)
 */
size_t PDS_BLE_provisioning_get_password(char *buffer, size_t buffer_size);

/**
 * Check if connect request was received (user clicked "Connect" in app)
 * @return true if connect request received, false otherwise
 */
bool PDS_BLE_provisioning_connect_requested(void);

/**
 * Clear connect request flag
 */
void PDS_BLE_provisioning_clear_connect_request(void);

#endif // pds_PROVISIONING_H


