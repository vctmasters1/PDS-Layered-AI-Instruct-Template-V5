/**
 * @file pds_https_api.h
 * @brief HTTPS REST API server for device configuration and telemetry
 * 
 * Provides HTTP endpoints:
 * - GET /status   - Current telemetry (sensor readings, actuator states)
 * - GET /config   - Current pin configuration
 * - GET /settings - Current user settings (pds_telconf_usrset_t binary)
 * - POST /config  - Update pin configuration
 * - POST /command - Execute one-off command
 * - GET /ping     - Health check
 * 
 * All data endpoints use binary serialization (not JSON).
 * Runs on port 8443 with self-signed certificate (TLS 1.2+).
 */

#ifndef PDS_HTTPS_API_H
#define PDS_HTTPS_API_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"
#include "pds_telemetry_types.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * HTTPS server configuration
 */
typedef struct {
    uint16_t port;                  /**< Server port (default 8443) */
    const char* cert_pem;           /**< Self-signed certificate PEM (or NULL to generate) */
    const char* key_pem;            /**< Private key PEM (or NULL to generate) */
    uint16_t max_open_sockets;      /**< Max concurrent connections (default 4) */
    uint16_t response_timeout_ms;   /**< Response timeout in ms (default 5000) */
} pds_https_server_config_t;

/**
 * Request handler callback type
 * 
 * Called when client connects to endpoint. Handler should:
 * - Read request body if present
 * - Perform operation (read sensor, update config, etc.)
 * - Write response via pds_https_api_send_response()
 * 
 * @param method HTTP method (GET, POST, etc.)
 * @param path Request path (e.g., "/status")
 * @param body Request body buffer (NULL for GET)
 * @param body_len Request body length
 * @param user_data User context data
 * @return HTTP status code (200, 400, 500, etc.)
 */
typedef int (*pds_https_request_handler_t)(
    const char* method,
    const char* path,
    const uint8_t* body,
    size_t body_len,
    void* user_data
);

/**
 * Initialize HTTPS server
 * 
 * Must be called once during device startup.
 * Generates self-signed certificate if not provided.
 * Starts listening on configured port.
 * 
 * @param config Server configuration
 * @return ESP_OK on success, ESP_ERR_* on failure
 */
esp_err_t pds_https_api_init(const pds_https_server_config_t* config);

/**
 * Register handler for GET /status endpoint
 * 
 * Handler receives telemetry request and should:
 * 1. Call pds_telemetry_collect() to get current state
 * 2. Serialize via pds_telemetry_serialize()
 * 3. Call pds_https_api_send_response() with binary data
 * 
 * @param handler Callback function
 * @param user_data Context data passed to handler
 * @return ESP_OK on success
 */
esp_err_t pds_https_api_register_status_handler(
    pds_https_request_handler_t handler,
    void* user_data
);

/**
 * Register handler for GET /config endpoint
 * 
 * Handler should:
 * 1. Build pds_telconf_full_config_t from current pin table
 * 2. Serialize to binary
 * 3. Call pds_https_api_send_response()
 * 
 * @param handler Callback function
 * @param user_data Context data passed to handler
 * @return ESP_OK on success
 */
esp_err_t pds_https_api_register_config_get_handler(
    pds_https_request_handler_t handler,
    void* user_data
);

/**
 * Register handler for POST /config endpoint
 * 
 * Handler receives pds_telconf_packet_t in request body:
 * 1. Validate packet via pds_telconf_packet_validate()
 * 2. Apply configuration change
 * 3. Save to NVS if successful
 * 4. Call pds_https_api_send_response() with status
 * 
 * @param handler Callback function
 * @param user_data Context data passed to handler
 * @return ESP_OK on success
 */
esp_err_t pds_https_api_register_config_post_handler(
    pds_https_request_handler_t handler,
    void* user_data
);

/**
 * Register handler for POST /command endpoint
 * 
 * Handler receives raw command data and should parse/execute.
 * Typically used for one-off commands outside config flow.
 * 
 * @param handler Callback function
 * @param user_data Context data passed to handler
 * @return ESP_OK on success
 */
esp_err_t pds_https_api_register_command_handler(
    pds_https_request_handler_t handler,
    void* user_data
);

/**
 * Send HTTP response to client
 * 
 * Called by handlers to send response data.
 * Automatically sets:
 * - Content-Length header
 * - Content-Type based on response_type
 * - Connection: close
 * 
 * @param status_code HTTP status (200, 400, 500, etc.)
 * @param response_type Content type ("application/octet-stream", "application/json", etc.)
 * @param body Response body buffer (can be NULL for status-only response)
 * @param body_len Response body length
 * @return ESP_OK on success
 */
esp_err_t pds_https_api_send_response(
    int status_code,
    const char* response_type,
    const uint8_t* body,
    size_t body_len
);

/**
 * Send text response (convenience wrapper)
 * 
 * Automatically sets Content-Type: text/plain
 * 
 * @param status_code HTTP status code
 * @param text Response text (null-terminated)
 * @return ESP_OK on success
 */
esp_err_t pds_https_api_send_text_response(
    int status_code,
    const char* text
);

/**
 * Send JSON response (convenience wrapper)
 * 
 * Automatically sets Content-Type: application/json
 * 
 * @param status_code HTTP status code
 * @param json_str JSON string (null-terminated)
 * @return ESP_OK on success
 */
esp_err_t pds_https_api_send_json_response(
    int status_code,
    const char* json_str
);

/**
 * Send binary response (convenience wrapper)
 * 
 * Automatically sets Content-Type: application/octet-stream
 * 
 * @param status_code HTTP status code
 * @param data Binary data buffer
 * @param data_len Data length in bytes
 * @return ESP_OK on success
 */
esp_err_t pds_https_api_send_binary_response(
    int status_code,
    const uint8_t* data,
    size_t data_len
);

/**
 * Get server uptime in seconds
 * 
 * @return Uptime since server started
 */
uint32_t pds_https_api_get_uptime_seconds(void);

/**
 * Get total requests handled
 * 
 * @return Request count
 */
uint32_t pds_https_api_get_request_count(void);

/**
 * Stop HTTPS server and cleanup
 * 
 * @return ESP_OK on success
 */
esp_err_t pds_https_api_stop(void);

/**
 * Shutdown HTTPS server and release all resources
 * 
 * @return ESP_OK on success
 */
esp_err_t pds_https_api_deinit(void);

#ifdef __cplusplus
}
#endif

#endif /* PDS_HTTPS_API_H */
