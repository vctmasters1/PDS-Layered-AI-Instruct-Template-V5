/**
 * @file pds_https_config_handler.c
 * @brief HTTPS POST /config handler for runtime configuration uploads
 * 
 * Routes POST /config requests to appropriate handler based on packet type:
 * - PINMAP (hardware + variable mappings)
 * - LADDER (automation bytecode)
 * - USRSET (user settings)
 */

#include "esp_http_server.h"
#include "esp_log.h"
#include "pds_config_store.h"
#include "pds_telemetry_types.h"
#include "pds_usrset.h"
#include <string.h>

static const char *TAG = "PDS_CONFIG_HANDLER";

/**
 * Detect packet type from received buffer
 * 
 * Returns:
 *  0 = Unknown/invalid
 *  1 = PINMAP
 *  2 = LADDER
 *  3 = USRSET
 */
static uint8_t pds_detect_config_packet_type(const uint8_t *buffer, size_t length) {
    if (length < 4) return 0;
    
    // Check version field (first uint16)
    uint16_t version = *(const uint16_t *)buffer;
    if (version != 0x0001) {
        return 0;  // Invalid version
    }
    
    // PINMAP: size = 8 + (num_pins × 128)
    // Minimum: 8 + (1 × 128) = 136 bytes
    // Maximum: 8 + (32 × 128) = 4,104 bytes
    if (length >= 136 && length <= 4104) {
        // Check if size matches formula
        if ((length - 8) % 128 == 0) {
            uint8_t num_pins = (length - 8) / 128;
            if (num_pins >= 1 && num_pins <= 32) {
                return 1;  // PINMAP
            }
        }
    }
    
    // LADDER: size = 16 + payload (up to 4,112 bytes)
    // Minimum: 16 bytes
    // Maximum: 4,112 bytes
    if (length >= 16 && length <= 4112) {
        // Check if this looks like LADDER
        // bytecode_type field is at offset 2 (uint16)
        uint16_t bytecode_type = *(const uint16_t *)(buffer + 2);
        if (bytecode_type >= 1 && bytecode_type <= 3) {
            return 2;  // LADDER
        }
    }
    
    // USRSET: size = 8 + (num_settings × 36)
    // Minimum: 8 + (1 × 36) = 44 bytes
    // Maximum: 8 + (64 × 36) = 2,312 bytes
    if (length >= 44 && length <= 2312) {
        // Check if size matches formula
        if ((length - 8) % 36 == 0) {
            uint16_t num_settings = (length - 8) / 36;
            if (num_settings >= 1 && num_settings <= 64) {
                return 3;  // USRSET
            }
        }
    }
    
    return 0;  // Unknown
}

/**
 * Handle PINMAP upload
 */
static esp_err_t pds_handle_pinmap_upload(httpd_req_t *req, const uint8_t *buffer, size_t length) {
    ESP_LOGI(TAG, "Processing PINMAP upload: %u bytes", length);
    
    const pds_telconf_pinmap_t *pinmap = (const pds_telconf_pinmap_t *)buffer;
    
    // Validate
    if (pinmap->num_pins == 0 || pinmap->num_pins > PDS_TELCONF_PINMAP_MAX_PINS) {
        ESP_LOGE(TAG, "Invalid PINMAP pin count: %d", pinmap->num_pins);
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid pin count");
        return ESP_FAIL;
    }
    
    // Save to NVS
    esp_err_t ret = pds_config_save_pinmap(pinmap);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save PINMAP: %s", esp_err_to_name(ret));
        httpd_resp_send_500(req);
        return ret;
    }
    
    // Success response
    ESP_LOGI(TAG, "PINMAP accepted: %d pins", pinmap->num_pins);
    httpd_resp_sendstr(req, "{\"status\":\"ok\",\"type\":\"pinmap\",\"pins\":1}");
    return ESP_OK;
}

/**
 * Handle LADDER upload
 */
static esp_err_t pds_handle_ladder_upload(httpd_req_t *req, const uint8_t *buffer, size_t length) {
    ESP_LOGI(TAG, "Processing LADDER upload: %u bytes", length);
    
    const pds_telconf_ladder_t *ladder = (const pds_telconf_ladder_t *)buffer;
    
    // Validate
    if (ladder->payload_size > 4096) {
        ESP_LOGE(TAG, "Invalid LADDER payload size: %lu", ladder->payload_size);
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Payload too large");
        return ESP_FAIL;
    }
    
    if (ladder->bytecode_type < 1 || ladder->bytecode_type > 3) {
        ESP_LOGE(TAG, "Invalid bytecode type: %d", ladder->bytecode_type);
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid bytecode type");
        return ESP_FAIL;
    }
    
    // Save to NVS
    esp_err_t ret = pds_config_save_ladder(ladder);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save LADDER: %s", esp_err_to_name(ret));
        httpd_resp_send_500(req);
        return ret;
    }
    
    // Success response
    ESP_LOGI(TAG, "LADDER accepted: %lu bytes, type=%d", ladder->payload_size, ladder->bytecode_type);
    httpd_resp_sendstr(req, "{\"status\":\"ok\",\"type\":\"ladder\",\"bytes\":1}");
    return ESP_OK;
}

/**
 * Handle USRSET upload
 */
static esp_err_t pds_handle_usrset_upload(httpd_req_t *req, const uint8_t *buffer, size_t length) {
    ESP_LOGI(TAG, "Processing USRSET upload: %u bytes", length);
    
    const pds_telconf_usrset_t *usrset = (const pds_telconf_usrset_t *)buffer;
    
    // Validate
    if (usrset->num_settings > 64) {
        ESP_LOGE(TAG, "Invalid USRSET setting count: %d", usrset->num_settings);
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Too many settings");
        return ESP_FAIL;
    }

    // Apply to runtime registry (also saves to NVS internally)
    esp_err_t ret = ESP_OK;
    if (pds_usrset_is_initialized()) {
        ret = pds_usrset_apply_packet(usrset);
        if (ret != ESP_OK) {
            ESP_LOGW(TAG, "pds_usrset_apply_packet warning: %s", esp_err_to_name(ret));
            /* Non-fatal: fall through to raw NVS save as backup */
        }
    } else {
        /* Registry not initialised yet — persist raw packet only */
        ret = pds_config_save_usrset(usrset);
    }

    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save USRSET: %s", esp_err_to_name(ret));
        httpd_resp_send_500(req);
        return ret;
    }

    ESP_LOGI(TAG, "USRSET accepted: %d settings", usrset->num_settings);
    httpd_resp_sendstr(req, "{\"status\":\"ok\",\"type\":\"usrset\",\"settings\":1}");
    return ESP_OK;
}

/**
 * Main POST /config handler
 * 
 * This handler is called to process configuration uploads from HMI.
 * It detects the packet type and routes to appropriate handler.
 * 
 * Call this from your HTTPS server setup.
 */
esp_err_t pds_https_config_post_handler(httpd_req_t *req) {
    // Max buffer size (LADDER max is 4,112 bytes)
    uint8_t buffer[4112];
    
    // Receive entire request body
    int ret = httpd_req_recv(req, (char *)buffer, sizeof(buffer));
    
    if (ret < 0) {
        ESP_LOGE(TAG, "Failed to receive config data");
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }
    
    if (ret == 0) {
        ESP_LOGE(TAG, "Empty config upload");
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Empty body");
        return ESP_FAIL;
    }
    
    size_t length = ret;
    ESP_LOGI(TAG, "Received config packet: %u bytes", length);
    
    // Detect packet type
    uint8_t packet_type = pds_detect_config_packet_type(buffer, length);
    
    switch (packet_type) {
        case 1:  // PINMAP
            return pds_handle_pinmap_upload(req, buffer, length);
        case 2:  // LADDER
            return pds_handle_ladder_upload(req, buffer, length);
        case 3:  // USRSET
            return pds_handle_usrset_upload(req, buffer, length);
        default:
            ESP_LOGE(TAG, "Unknown config packet type (size=%u)", length);
            httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Unknown packet type");
            return ESP_FAIL;
    }
}
