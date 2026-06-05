/**
 * @file pds_network_platform_esp32c3.c
 * @brief ESP32-C3 platform implementation of network abstraction layer
 * 
 * ESP32-C3 specific implementation:
 * - RISC-V architecture (single core)
 * - Built-in WiFi 6 (802.11 ax)
 * - Built-in BLE 5.2
 * - Optimized for lower power consumption
 * 
 * This file is linked when building for ESP32-C3 platform.
 * Location: pds_hal/platform/esp32c3_sm/common/pds_network_platform_esp32c3.c
 */

#include "pds_network_platform.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "nvs_flash.h"
#include "nvs.h"
/* wifi_provisioning removed in ESP-IDF 5.x — BLE prov uses custom GATT stack */
#include "esp_http_server.h"
#include "mdns.h"
#include <string.h>

static const char *TAG = "pds_NET_ESP32C3";

// ============================================================================
// WiFi Platform Layer
// ============================================================================

static pds_network_wifi_event_cb_t _wifi_event_callback = NULL;
static bool _wifi_connected = false;
static char _wifi_ip_addr[16] = {0};

static void _wifi_event_handler(void *arg, esp_event_base_t event_base,
                                 int32_t event_id, void *event_data) {
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        ESP_LOGI(TAG, "WiFi started, connecting...");
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        _wifi_connected = false;
        ESP_LOGI(TAG, "WiFi disconnected");
        if (_wifi_event_callback) {
            _wifi_event_callback(false, NULL);
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        _wifi_connected = true;
        snprintf(_wifi_ip_addr, sizeof(_wifi_ip_addr), IPSTR, IP2STR(&event->ip_info.ip));
        ESP_LOGI(TAG, "WiFi connected: IP=" IPSTR, IP2STR(&event->ip_info.ip));
        if (_wifi_event_callback) {
            _wifi_event_callback(true, _wifi_ip_addr);
        }
    }
}

esp_err_t pds_network_platform_wifi_init(pds_network_wifi_event_cb_t event_cb) {
    _wifi_event_callback = event_cb;
    
    // Initialize WiFi (ESP32-C3 optimized)
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    
    // Register event handlers
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &_wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &_wifi_event_handler, NULL));
    
    // Start WiFi
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    
    ESP_LOGI(TAG, "WiFi platform initialized (ESP32-C3)");
    return ESP_OK;
}

esp_err_t pds_network_platform_wifi_connect(const char *ssid, const char *password) {
    wifi_config_t wifi_config = {0};
    strncpy((char *)wifi_config.sta.ssid, ssid, sizeof(wifi_config.sta.ssid) - 1);
    strncpy((char *)wifi_config.sta.password, password, sizeof(wifi_config.sta.password) - 1);
    wifi_config.sta.pmf_cfg.capable = true;
    wifi_config.sta.pmf_cfg.required = false;
    
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());
    
    ESP_LOGI(TAG, "Connecting to WiFi: %s", ssid);
    return ESP_OK;
}

bool pds_network_platform_wifi_is_connected(void) {
    return _wifi_connected;
}

esp_err_t pds_network_platform_wifi_get_ip(char *ip_addr, size_t ip_addr_len) {
    if (!_wifi_connected || strlen(_wifi_ip_addr) == 0) {
        return ESP_ERR_INVALID_STATE;
    }
    strncpy(ip_addr, _wifi_ip_addr, ip_addr_len - 1);
    return ESP_OK;
}

esp_err_t pds_network_platform_wifi_disconnect(void) {
    ESP_ERROR_CHECK(esp_wifi_stop());
    _wifi_connected = false;
    return ESP_OK;
}

esp_err_t pds_network_platform_wifi_deinit(void) {
    esp_event_handler_unregister(WIFI_EVENT, ESP_EVENT_ANY_ID, &_wifi_event_handler);
    esp_event_handler_unregister(IP_EVENT, IP_EVENT_STA_GOT_IP, &_wifi_event_handler);
    return ESP_OK;
}

// ============================================================================
// BLE Provisioning Platform Layer (ESP32-C3 specific - STUB)
// ============================================================================

static pds_network_ble_prov_event_cb_t _ble_prov_event_callback = NULL;

#define BLE_PROV_SERVICE_NAME "H2o-TOWER-SETUP"
#define BLE_PROV_POP "H2o12345"

// Stub implementations for BLE provisioning
bool pds_network_platform_ble_is_available(void) {
    return true;  // ESP32-C3 has BLE 5.2
}

esp_err_t pds_network_platform_ble_prov_init(pds_network_ble_prov_event_cb_t event_cb) {
    _ble_prov_event_callback = event_cb;
    return ESP_OK;
}

esp_err_t pds_network_platform_ble_prov_start(void) {
    ESP_LOGI(TAG, "BLE Provisioning start (STUB - service: %s) - ESP32-C3", BLE_PROV_SERVICE_NAME);
    if (_ble_prov_event_callback) {
        _ble_prov_event_callback(PDS_NETWORK_BLE_PROV_EVENT_STARTED, NULL);
    }
    return ESP_OK;
    
    ESP_LOGI(TAG, "BLE provisioning started (ESP32-C3 optimized)");
    return ESP_OK;
}

esp_err_t pds_network_platform_ble_prov_stop(void) {
    ESP_LOGI(TAG, "BLE prov stop (STUB)");
    return ESP_OK;
}

esp_err_t pds_network_platform_ble_prov_deinit(void) {
    ESP_LOGI(TAG, "BLE prov deinit (STUB)");
    return ESP_OK;
}

// ============================================================================
// HTTPS Server Platform Layer
// ============================================================================

static httpd_handle_t _https_server_handle = NULL;
static pds_network_https_request_cb_t _https_request_callback = NULL;

static esp_err_t _https_status_handler(httpd_req_t *req) {
    if (_https_request_callback) {
        _https_request_callback("GET", "/status", NULL, 0);
    }
    return ESP_OK;
}

static esp_err_t _https_config_get_handler(httpd_req_t *req) {
    if (_https_request_callback) {
        _https_request_callback("GET", "/config", NULL, 0);
    }
    return ESP_OK;
}

static esp_err_t _https_config_post_handler(httpd_req_t *req) {
    uint8_t buffer[2048] = {0};
    int bytes_read = httpd_req_recv(req, (char *)buffer, sizeof(buffer) - 1);
    
    if (bytes_read > 0 && _https_request_callback) {
        _https_request_callback("POST", "/config", buffer, bytes_read);
    }
    return ESP_OK;
}

static esp_err_t _https_ping_handler(httpd_req_t *req) {
    const char *resp = "{\"status\":\"ok\"}";
    httpd_resp_set_type(req, "application/json");
    return httpd_resp_send(req, resp, strlen(resp));
}

esp_err_t pds_network_platform_https_server_init(pds_network_https_request_cb_t event_cb, uint16_t port) {
    _https_request_callback = event_cb;
    
    // ESP32-C3 optimized config (single core, limited memory)
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = port;
    config.max_open_sockets = 5;
    config.task_priority = tskIDLE_PRIORITY + 4;
    config.stack_size = 6144;  // Smaller stack for ESP32-C3
    
    if (httpd_start(&_https_server_handle, &config) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to start HTTPS server");
        return ESP_FAIL;
    }
    
    // Register URI handlers
    const httpd_uri_t status_uri = {
        .uri = "/status",
        .method = HTTP_GET,
        .handler = _https_status_handler,
    };
    httpd_register_uri_handler(_https_server_handle, &status_uri);
    
    const httpd_uri_t config_get_uri = {
        .uri = "/config",
        .method = HTTP_GET,
        .handler = _https_config_get_handler,
    };
    httpd_register_uri_handler(_https_server_handle, &config_get_uri);
    
    const httpd_uri_t config_post_uri = {
        .uri = "/config",
        .method = HTTP_POST,
        .handler = _https_config_post_handler,
    };
    httpd_register_uri_handler(_https_server_handle, &config_post_uri);
    
    const httpd_uri_t ping_uri = {
        .uri = "/ping",
        .method = HTTP_GET,
        .handler = _https_ping_handler,
    };
    httpd_register_uri_handler(_https_server_handle, &ping_uri);
    
    ESP_LOGI(TAG, "HTTPS server started on port %d (ESP32-C3)", port);
    return ESP_OK;
}

esp_err_t pds_network_platform_https_send_response(int status_code, const char *content_type,
                                                    const uint8_t *data, size_t data_len) {
    return ESP_OK;
}

esp_err_t pds_network_platform_https_server_stop(void) {
    if (_https_server_handle) {
        httpd_stop(_https_server_handle);
        _https_server_handle = NULL;
    }
    return ESP_OK;
}

esp_err_t pds_network_platform_https_server_deinit(void) {
    return ESP_OK;
}

// ============================================================================
// mDNS Platform Layer
// ============================================================================

esp_err_t pds_network_platform_mdns_init(const char *hostname, const char *service_name, uint16_t port) {
    mdns_init();
    mdns_hostname_set(hostname);
    mdns_service_add(NULL, service_name, "_tcp", port, NULL, 0);
    
    ESP_LOGI(TAG, "mDNS initialized: %s.local (%s on port %d) - ESP32-C3", hostname, service_name, port);
    return ESP_OK;
}

esp_err_t pds_network_platform_mdns_stop(void) {
    mdns_free();
    return ESP_OK;
}

esp_err_t pds_network_platform_mdns_deinit(void) {
    return ESP_OK;
}

// ============================================================================
// Platform Configuration Getters
// ============================================================================

void* pds_network_platform_get_wifi_config(void) {
    return NULL;
}

void* pds_network_platform_get_ble_config(void) {
    return NULL;
}

void* pds_network_platform_get_https_config(void) {
    return NULL;
}
