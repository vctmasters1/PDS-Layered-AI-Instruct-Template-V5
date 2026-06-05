#include "pds_mdns.h"
#include "esp_log.h"
#include "mdns.h"
#include <string.h>

static const char *TAG = "pds_MDNS";

static bool _mdns_initialized = false;
static bool _mdns_active = false;

esp_err_t PDS_MDNS_init(void) {
    if (_mdns_initialized) {
        ESP_LOGW(TAG, "mDNS already initialized");
        return ESP_OK;
    }
    
    ESP_LOGI(TAG, "Initializing mDNS");
    
    esp_err_t ret = mdns_init();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to initialize mDNS: %s", esp_err_to_name(ret));
        return ret;
    }
    
    // Set hostname
    ret = mdns_hostname_set(PDS_MDNS_SERVICE_NAME);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to set hostname: %s", esp_err_to_name(ret));
        return ret;
    }
    
    // Set instance name (for display in mDNS browsers)
    ret = mdns_instance_name_set(PDS_MDNS_INSTANCE_NAME);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to set instance name: %s", esp_err_to_name(ret));
        return ret;
    }
    
    _mdns_initialized = true;
    ESP_LOGI(TAG, "mDNS initialized. Hostname: %s.local", PDS_MDNS_SERVICE_NAME);
    
    return ESP_OK;
}

esp_err_t PDS_MDNS_start(void) {
    if (!_mdns_initialized) {
        return PDS_MDNS_init();
    }
    
    if (_mdns_active) {
        ESP_LOGW(TAG, "mDNS already active");
        return ESP_OK;
    }
    
    ESP_LOGI(TAG, "Starting mDNS advertising");
    
    // Register HTTP service
    esp_err_t ret = mdns_service_add(
        PDS_MDNS_INSTANCE_NAME,
        PDS_MDNS_SERVICE_TYPE,
        PDS_MDNS_SERVICE_PROTO,
        PDS_MDNS_SERVICE_PORT,
        NULL,
        0
    );
    
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to add mDNS service: %s", esp_err_to_name(ret));
        return ret;
    }
    
    _mdns_active = true;
    ESP_LOGI(TAG, "mDNS service registered on %s.local:%d", PDS_MDNS_SERVICE_NAME, PDS_MDNS_SERVICE_PORT);
    
    return ESP_OK;
}

esp_err_t PDS_MDNS_stop(void) {
    if (!_mdns_active) {
        return ESP_OK;
    }
    
    ESP_LOGI(TAG, "Stopping mDNS advertising");
    
    esp_err_t ret = mdns_service_remove(PDS_MDNS_SERVICE_TYPE, PDS_MDNS_SERVICE_PROTO);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to remove mDNS service: %s", esp_err_to_name(ret));
        return ret;
    }
    
    _mdns_active = false;
    return ESP_OK;
}

bool PDS_MDNS_is_active(void) {
    return _mdns_active;
}

