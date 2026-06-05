#ifndef PDS_PDS_WIFI_H
#define PDS_PDS_WIFI_H

#include <stdbool.h>
#include "esp_err.h"
#include <stdint.h>

/**
 * H20-Tower Aeroponics Control System
 * WiFi Communication
 * 
 * Handles WiFi connection and data transmission.
 */

// WiFi configuration
#define PDS_WIFI_SSID "H2OTower"
#define PDS_WIFI_PASS "aeroponics2025"
#define PDS_WIFI_MAX_RETRY 15

// UDP configuration
// Telemetry is broadcast on 5555; config is received on 5556
#define pds_UDP_TELEMETRY_PORT 5555
#define pds_UDP_CONFIG_PORT    5556
#define pds_UDP_BROADCAST_IP "255.255.255.255"

/**
 * Initialize WiFi subsystem and connect to network
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t pds_device_wifi_init(void);

/**
 * Send telemetry data via UDP
 * @param data Buffer containing serialized telemetry
 * @param length Length of data buffer
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t pds_device_wifi_send_telemetry(const uint8_t *data, size_t length);

/**
 * Check for and receive configuration packet
 * @param buffer Output buffer for received data
 * @param buffer_size Size of output buffer
 * @param bytes_received Number of bytes received
 * @return ESP_OK if data received, ESP_ERR_NOT_FOUND if no data, error otherwise
 */
esp_err_t pds_device_wifi_receive_config(uint8_t *buffer, size_t buffer_size, size_t *bytes_received);

/**
 * Get WiFi connection status
 * @return true if connected, false otherwise
 */
bool pds_device_wifi_is_connected(void);

#endif // PDS_WIFI_H


