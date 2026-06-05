#include "pds_provisioning.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "nvs_flash.h"
#include "nvs.h"
#include <string.h>

static const char *TAG = "pds_PROV";

// NVS key for provisioning status
#define NVS_NAMESPACE "pds_prov"
#define NVS_KEY_PROVISIONED "provisioned"

// BLE service name
#define pds_PROV_SERVICE_NAME "H2o-TOWER-SETUP"

// Proof of Possession (simple PIN for security)
#define pds_PROV_POP "H2O12345"

bool pds_device_provisioning_is_provisioned(void) {
    // Check NVS for provisioning flag
    nvs_handle_t nvs;
    esp_err_t ret = nvs_open(NVS_NAMESPACE, NVS_READONLY, &nvs);
    if (ret != ESP_OK) {
        ESP_LOGD(TAG, "NVS namespace not found, device not provisioned");
        return false;
    }

    uint8_t provisioned = 0;
    ret = nvs_get_u8(nvs, NVS_KEY_PROVISIONED, &provisioned);
    nvs_close(nvs);

    if (ret != ESP_OK || provisioned != 1) {
        ESP_LOGD(TAG, "Provisioning flag not set");
        return false;
    }

    // Also check if WiFi credentials actually exist
    wifi_config_t wifi_cfg;
    ret = esp_wifi_get_config(WIFI_IF_STA, &wifi_cfg);
    if (ret != ESP_OK) {
        ESP_LOGD(TAG, "WiFi config not found");
        return false;
    }

    if (strlen((char *)wifi_cfg.sta.ssid) == 0) {
        ESP_LOGD(TAG, "WiFi SSID empty");
        return false;
    }

    ESP_LOGI(TAG, "Device is provisioned with SSID: %s", wifi_cfg.sta.ssid);
    return true;
}

esp_err_t pds_device_provisioning_start(void) {
    /* BLE provisioning retired — SoftAP provisioning in pds_wifi.c handles setup */
    ESP_LOGW(TAG, "pds_device_provisioning_start: BLE provisioning removed, use SoftAP");
    return ESP_ERR_NOT_SUPPORTED;
}

esp_err_t pds_device_provisioning_reset(void) {
    ESP_LOGI(TAG, "Resetting provisioning");

    // Erase WiFi credentials
    esp_err_t ret = esp_wifi_restore();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to restore WiFi: %s", esp_err_to_name(ret));
        return ret;
    }

    // Clear provisioning flag in NVS
    nvs_handle_t nvs;
    ret = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &nvs);
    if (ret == ESP_OK) {
        nvs_erase_key(nvs, NVS_KEY_PROVISIONED);
        nvs_commit(nvs);
        nvs_close(nvs);
    }

    ESP_LOGI(TAG, "Provisioning reset complete. Device will re-enter setup mode on next boot.");
    return ESP_OK;
}

const char* pds_device_provisioning_get_service_name(void) {
    return pds_PROV_SERVICE_NAME;
}

/* BLE provisioning event handler removed — SoftAP replaces BLE provisioning */

