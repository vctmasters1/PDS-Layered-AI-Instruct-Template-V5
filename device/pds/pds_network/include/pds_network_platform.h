#ifndef PDS_NETWORK_PLATFORM_H
#define PDS_NETWORK_PLATFORM_H

/**
 * @file pds_network_platform.h
 * @brief Platform abstraction layer for H2o-Tower network connectivity
 * 
 * This header defines the platform-specific interfaces that pds_network
 * layer uses for:
 * - WiFi connectivity (via platform-specific drivers)
 * - BLE provisioning (via platform-specific BLE stack)
 * - HTTPS server (via platform-specific TLS/HTTP stack)
 * - mDNS discovery (via platform-specific mDNS implementation)
 * 
 * Each platform (ESP32, ESP32-C3, EFR32) provides concrete implementations
 * of these interfaces in their respective platform directories.
 * 
 * Architecture:
 * 
 *   Application Layer (h2o_role_*)
 *        |
 *   pds_network layer (generic, platform-agnostic)
 *        |
 *   pds_network_platform layer (platform abstraction)
 *        |
 *   Platform-specific implementations
 *        |
 *   Hardware (WiFi, Bluetooth, Ethernet, etc.)
 * 
 * This design allows pds_network to remain generic and portable while
 * delegating platform-specific concerns to platform layers.
 */

#include "esp_err.h"
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @defgroup pds_network_platform_callbacks Platform-Specific Callbacks
 * @{
 */

/**
 * @brief WiFi connection event callback type
 * 
 * Called when WiFi state changes (connected, disconnected, etc.)
 * 
 * @param connected true if WiFi connected, false if disconnected
 * @param ip_addr IP address (if connected), NULL otherwise
 */
typedef void (*pds_network_wifi_event_cb_t)(bool connected, const char *ip_addr);

/**
 * @brief BLE provisioning event callback type
 * 
 * Called during provisioning lifecycle
 * 
 * @param event_id Event type (started, credentials_received, success, failed, etc.)
 * @param event_data Event-specific data (e.g., error code)
 */
typedef void (*pds_network_ble_prov_event_cb_t)(int event_id, void *event_data);

/**
 * @brief HTTPS server event callback type
 * 
 * Called when HTTP requests are received
 * 
 * @param method HTTP method (GET, POST, etc.)
 * @param uri Request URI (e.g., "/status", "/config")
 * @param data Request body (POST data)
 * @param data_len Length of request body
 */
typedef void (*pds_network_https_request_cb_t)(const char *method, const char *uri,
                                               const uint8_t *data, size_t data_len);

/** @} */

/**
 * @defgroup pds_network_platform_wifi WiFi Platform Interface
 * @{
 */

/**
 * @brief Initialize platform WiFi subsystem
 * 
 * @param event_cb WiFi event callback
 * @return ESP_OK on success
 */
esp_err_t pds_network_platform_wifi_init(pds_network_wifi_event_cb_t event_cb);

/**
 * @brief Connect to WiFi network
 * 
 * @param ssid Network SSID
 * @param password Network password
 * @return ESP_OK on success
 */
esp_err_t pds_network_platform_wifi_connect(const char *ssid, const char *password);

/**
 * @brief Get current WiFi connection status
 * 
 * @return true if connected, false otherwise
 */
bool pds_network_platform_wifi_is_connected(void);

/**
 * @brief Get WiFi connection information
 * 
 * @param ip_addr Output buffer for IP address string (null-terminated)
 * @param ip_addr_len Length of ip_addr buffer
 * @return ESP_OK on success
 */
esp_err_t pds_network_platform_wifi_get_ip(char *ip_addr, size_t ip_addr_len);

/**
 * @brief Disconnect from WiFi
 * 
 * @return ESP_OK on success
 */
esp_err_t pds_network_platform_wifi_disconnect(void);

/**
 * @brief Deinitialize WiFi subsystem
 * 
 * @return ESP_OK on success
 */
esp_err_t pds_network_platform_wifi_deinit(void);

/** @} */

/**
 * @defgroup pds_network_platform_ble BLE Provisioning Platform Interface
 * @{
 */

/**
 * @brief BLE Provisioning event types
 */
typedef enum {
    PDS_NETWORK_BLE_PROV_EVENT_STARTED,           ///< BLE provisioning started
    PDS_NETWORK_BLE_PROV_EVENT_CREDENTIALS_RECV,  ///< WiFi credentials received
    PDS_NETWORK_BLE_PROV_EVENT_SUCCESS,           ///< WiFi connection successful
    PDS_NETWORK_BLE_PROV_EVENT_FAILED,            ///< WiFi connection failed
    PDS_NETWORK_BLE_PROV_EVENT_STOPPED,           ///< BLE provisioning stopped
} pds_network_ble_prov_event_t;

/**
 * @brief Check if BLE is available on this platform
 * 
 * @return true if BLE supported, false otherwise
 */
bool pds_network_platform_ble_is_available(void);

/**
 * @brief Initialize platform BLE provisioning subsystem
 * 
 * @param event_cb BLE provisioning event callback
 * @return ESP_OK on success
 */
esp_err_t pds_network_platform_ble_prov_init(pds_network_ble_prov_event_cb_t event_cb);

/**
 * @brief Start BLE provisioning advertisement
 * 
 * Advertises BLE service for WiFi credential provisioning.
 * Blocks until provisioning complete or timeout.
 * 
 * @return ESP_OK on success
 */
esp_err_t pds_network_platform_ble_prov_start(void);

/**
 * @brief Stop BLE provisioning advertisement
 * 
 * @return ESP_OK on success
 */
esp_err_t pds_network_platform_ble_prov_stop(void);

/**
 * @brief Deinitialize BLE provisioning subsystem
 * 
 * @return ESP_OK on success
 */
esp_err_t pds_network_platform_ble_prov_deinit(void);

/** @} */

/**
 * @defgroup pds_network_platform_https HTTPS Server Platform Interface
 * @{
 */

/**
 * @brief Initialize platform HTTPS server
 * 
 * @param event_cb HTTPS request event callback
 * @param port Server port (typically 8443)
 * @return ESP_OK on success
 */
esp_err_t pds_network_platform_https_server_init(pds_network_https_request_cb_t event_cb, uint16_t port);

/**
 * @brief Send HTTPS response
 * 
 * @param status_code HTTP status code (200, 404, 500, etc.)
 * @param content_type Content-Type header value
 * @param data Response body
 * @param data_len Length of response body
 * @return ESP_OK on success
 */
esp_err_t pds_network_platform_https_send_response(int status_code, const char *content_type,
                                                    const uint8_t *data, size_t data_len);

/**
 * @brief Stop HTTPS server
 * 
 * @return ESP_OK on success
 */
esp_err_t pds_network_platform_https_server_stop(void);

/**
 * @brief Deinitialize HTTPS server
 * 
 * @return ESP_OK on success
 */
esp_err_t pds_network_platform_https_server_deinit(void);

/** @} */

/**
 * @defgroup pds_network_platform_mdns mDNS Discovery Platform Interface
 * @{
 */

/**
 * @brief Initialize mDNS service
 * 
 * @param hostname Local hostname (e.g., "h2o-tower")
 * @param service_name Service name (e.g., "_h2o-https._tcp")
 * @param port Service port (e.g., 8443)
 * @return ESP_OK on success
 */
esp_err_t pds_network_platform_mdns_init(const char *hostname, const char *service_name, uint16_t port);

/**
 * @brief Stop mDNS service
 * 
 * @return ESP_OK on success
 */
esp_err_t pds_network_platform_mdns_stop(void);

/**
 * @brief Deinitialize mDNS service
 * 
 * @return ESP_OK on success
 */
esp_err_t pds_network_platform_mdns_deinit(void);

/** @} */

/**
 * @defgroup pds_network_platform_config Platform-Specific Configuration
 * @{
 */

/**
 * @brief Get platform-specific WiFi configuration
 * 
 * @return Pointer to platform config structure (platform-specific)
 */
void* pds_network_platform_get_wifi_config(void);

/**
 * @brief Get platform-specific BLE configuration
 * 
 * @return Pointer to platform config structure (platform-specific)
 */
void* pds_network_platform_get_ble_config(void);

/**
 * @brief Get platform-specific HTTPS configuration
 * 
 * @return Pointer to platform config structure (platform-specific)
 */
void* pds_network_platform_get_https_config(void);

/** @} */

#ifdef __cplusplus
}
#endif

#endif // PDS_NETWORK_PLATFORM_H
