/**
 * @file pds_https_api.c
 * @brief HTTPS REST API server implementation
 * 
 * Provides HTTP/HTTPS endpoints for device control and monitoring.
 * Uses esp_https_server for TLS and request handling.
 * Implements handlers for telemetry, configuration, and commands.
 */

#include "pds_https_api.h"
#include "pds_https_server.h"
#include "esp_log.h"
#include <string.h>
#include <time.h>

static const char *TAG = "PDS_HTTPS_API";

/**
 * HTTPS server state
 */
typedef struct {
    bool initialized;
    uint32_t uptime_seconds;
    uint32_t request_count;
    pds_https_request_handler_t status_handler;
    void* status_user_data;
    pds_https_request_handler_t config_get_handler;
    void* config_get_user_data;
    pds_https_request_handler_t config_post_handler;
    void* config_post_user_data;
    pds_https_request_handler_t command_handler;
    void* command_user_data;
} https_api_state_t;

static https_api_state_t g_https_api = {0};

esp_err_t pds_https_api_init(const pds_https_server_config_t* config) {
    if (!config) {
        return ESP_ERR_INVALID_ARG;
    }
    
    if (g_https_api.initialized) {
        ESP_LOGW(TAG, "HTTPS API already initialized");
        return ESP_OK;
    }
    
    ESP_LOGI(TAG, "Starting HTTPS server on port %u", config->port);

    // Delegate to the concrete HTTPS server implementation in pds_https_server.c
    esp_err_t ret = pds_device_https_server_init();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "pds_device_https_server_init failed: %s", esp_err_to_name(ret));
        return ret;
    }
    
    g_https_api.initialized = true;
    g_https_api.request_count = 0;
    
    ESP_LOGI(TAG, "HTTPS API ready");
    return ESP_OK;
}

esp_err_t pds_https_api_register_status_handler(
    pds_https_request_handler_t handler,
    void* user_data
) {
    if (!handler) {
        return ESP_ERR_INVALID_ARG;
    }
    
    g_https_api.status_handler = handler;
    g_https_api.status_user_data = user_data;
    
    ESP_LOGI(TAG, "Registered GET /status handler");
    return ESP_OK;
}

esp_err_t pds_https_api_register_config_get_handler(
    pds_https_request_handler_t handler,
    void* user_data
) {
    if (!handler) {
        return ESP_ERR_INVALID_ARG;
    }
    
    g_https_api.config_get_handler = handler;
    g_https_api.config_get_user_data = user_data;
    
    ESP_LOGI(TAG, "Registered GET /config handler");
    return ESP_OK;
}

esp_err_t pds_https_api_register_config_post_handler(
    pds_https_request_handler_t handler,
    void* user_data
) {
    if (!handler) {
        return ESP_ERR_INVALID_ARG;
    }
    
    g_https_api.config_post_handler = handler;
    g_https_api.config_post_user_data = user_data;
    
    ESP_LOGI(TAG, "Registered POST /config handler");
    return ESP_OK;
}

esp_err_t pds_https_api_register_command_handler(
    pds_https_request_handler_t handler,
    void* user_data
) {
    if (!handler) {
        return ESP_ERR_INVALID_ARG;
    }
    
    g_https_api.command_handler = handler;
    g_https_api.command_user_data = user_data;
    
    ESP_LOGI(TAG, "Registered POST /command handler");
    return ESP_OK;
}

esp_err_t pds_https_api_send_response(
    int status_code,
    const char* response_type,
    const uint8_t* body,
    size_t body_len
) {
    // TODO Phase 2: Implement actual HTTP response sending
    // - Set status code
    // - Set Content-Type header
    // - Set Content-Length header
    // - Send body
    
    ESP_LOGD(TAG, "Sending HTTP %d response, type=%s, size=%zu",
             status_code, response_type, body_len);
    
    g_https_api.request_count++;
    return ESP_OK;
}

esp_err_t pds_https_api_send_text_response(
    int status_code,
    const char* text
) {
    if (!text) {
        return ESP_ERR_INVALID_ARG;
    }
    
    return pds_https_api_send_response(
        status_code,
        "text/plain",
        (const uint8_t*)text,
        strlen(text)
    );
}

esp_err_t pds_https_api_send_json_response(
    int status_code,
    const char* json_str
) {
    if (!json_str) {
        return ESP_ERR_INVALID_ARG;
    }
    
    return pds_https_api_send_response(
        status_code,
        "application/json",
        (const uint8_t*)json_str,
        strlen(json_str)
    );
}

esp_err_t pds_https_api_send_binary_response(
    int status_code,
    const uint8_t* data,
    size_t data_len
) {
    return pds_https_api_send_response(
        status_code,
        "application/octet-stream",
        data,
        data_len
    );
}

uint32_t pds_https_api_get_uptime_seconds(void) {
    if (!g_https_api.initialized) {
        return 0;
    }
    // TODO: Calculate from server start time
    return g_https_api.uptime_seconds;
}

uint32_t pds_https_api_get_request_count(void) {
    return g_https_api.request_count;
}

esp_err_t pds_https_api_stop(void) {
    if (!g_https_api.initialized) {
        return ESP_OK;
    }
    
    pds_device_https_server_stop();
    ESP_LOGI(TAG, "HTTPS API server stopped");
    return ESP_OK;
}

esp_err_t pds_https_api_deinit(void) {
    esp_err_t ret = pds_https_api_stop();
    if (ret != ESP_OK) {
        return ret;
    }
    
    memset(&g_https_api, 0, sizeof(https_api_state_t));
    ESP_LOGI(TAG, "HTTPS API server shutdown");
    return ESP_OK;
}
