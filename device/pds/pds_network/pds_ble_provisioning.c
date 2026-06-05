#include "pds_ble_provisioning.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <string.h>

static const char *TAG = "PDS_BLE_PROV";

// BLE state - stub implementation
static bool _ble_active = false;
static bool _ble_connected = false;
static bool _connect_requested = false;
static char _received_ssid[PDS_BLE_SSID_MAX] = {0};
static char _received_password[PDS_BLE_PASSWORD_MAX] = {0};
static size_t _ssid_len = 0;
static size_t _password_len = 0;
static pds_ble_callback_t _event_callback = NULL;

// Stub: Initialize BLE provisioning - TODO: implement full BLE stack
esp_err_t PDS_BLE_provisioning_init(pds_ble_callback_t callback) {
    ESP_LOGI(TAG, "Initializing BLE provisioning (STUB)");
    _event_callback = callback;
    _ble_active = false;
    return ESP_OK;
}

bool PDS_BLE_provisioning_is_active(void) {
    return _ble_active;
}

/* NOTE: Full BLE stack init (bluedroid, GAP, GATT) is Phase 2.
 * The stub above is sufficient for the build. */

esp_err_t PDS_BLE_provisioning_stop(void) {
    if (!_ble_active) {
        return ESP_OK;
    }
    ESP_LOGI(TAG, "Stopping BLE provisioning (stub)");
    /* Phase 2: esp_ble_gap_stop_advertising(); */
    _ble_connected = false;
    _ble_active = false;
    return ESP_OK;
}

size_t PDS_BLE_provisioning_get_ssid(char *buffer, size_t buffer_size) {
    if (!buffer || buffer_size == 0) {
        return 0;
    }
    size_t copy_len = (_ssid_len < buffer_size) ? _ssid_len : buffer_size - 1;
    if (copy_len > 0) {
        memcpy(buffer, _received_ssid, copy_len);
    }
    buffer[copy_len] = '\0';
    return copy_len;
}

size_t PDS_BLE_provisioning_get_password(char *buffer, size_t buffer_size) {
    if (!buffer || buffer_size == 0) {
        return 0;
    }
    size_t copy_len = (_password_len < buffer_size) ? _password_len : buffer_size - 1;
    if (copy_len > 0) {
        memcpy(buffer, _received_password, copy_len);
    }
    buffer[copy_len] = '\0';
    return copy_len;
}

bool PDS_BLE_provisioning_connect_requested(void) {
    return _connect_requested;
}

void PDS_BLE_provisioning_clear_connect_request(void) {
    _connect_requested = false;
}

/* Phase 2: private GAP/GATT event handlers will be added here
 * once esp_gap_ble_api.h and esp_gatts_api.h are included. */


