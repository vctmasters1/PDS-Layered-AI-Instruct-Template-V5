#ifndef PDS_PDS_HTTPS_SERVER_H
#define PDS_PDS_HTTPS_SERVER_H

#include "esp_err.h"
#include "pds_types.h"
#include "pds_telemetry_types.h"

/**
 * @brief HTTPS REST API server for H2o-Tower
 * 
 * Provides RESTful endpoints for Android app to poll device status
 * and send configuration commands.
 * 
 * Endpoints:
 * - GET  /status   → Returns current telemetry (binary pds_TELDATA_packet_t)
 * - GET  /config   → Returns current configuration (binary pds_TELCONF_full_config_t)
 * - GET  /settings → Returns current user settings (binary pds_telconf_usrset_t)
 * - POST /config   → Updates configuration (binary pds_TELCONF_packet_t)
 * - POST /command  → Executes one-off command (binary)
 * - GET  /ping     → Health check (JSON)
 * 
 * Security: TLS with self-signed certificate (cert pinning on Android)
 * Discovery: mDNS service "_H2o-https._tcp.local."
 */

// Default HTTPS server port
#ifndef pds_HTTPS_SERVER_PORT
#define pds_HTTPS_SERVER_PORT 8443
#endif

// Protocol version
#define pds_PROTOCOL_VERSION 0x0001

// Maximum configuration payload
#ifndef pds_TELEMETRY_MAX_PAYLOAD
#define pds_TELEMETRY_MAX_PAYLOAD 2048
#endif

/**
 * @brief Full configuration structure (for GET /config response)
 *
 * NOTE: Pin assignments are NOT part of this struct.
 * Pins are Layer 2 (hw_vars blobs) in the pipeline engine — assigned
 * dynamically per function block, not as a compile-time static table.
 */
typedef struct __attribute__((packed)) {
    uint16_t version;
    uint8_t reserved[2];
} pds_TELCONF_full_config_t;

/**
 * @brief Initialize HTTPS server and start listening
 * 
 * Starts HTTPS server on configured port, registers URI handlers,
 * and starts mDNS service for device discovery.
 * 
 * @return ESP_OK on success
 */
esp_err_t pds_device_https_server_init(void);

/**
 * @brief Stop HTTPS server
 * 
 * @return ESP_OK on success
 */
esp_err_t pds_device_https_server_stop(void);

#endif // pds_HTTPS_SERVER_H


