#ifndef PDS_PDS_MDNS_H
#define PDS_PDS_MDNS_H

#include "esp_err.h"
#include <stdbool.h>

/**
 * H20-Tower Aeroponics Control System
 * mDNS Discovery Service
 * 
 * Registers device on local network for easy discovery via mDNS.
 * Device becomes accessible as "h2o-tower.local" on port 80.
 */

// mDNS Configuration
#define PDS_MDNS_INSTANCE_NAME             "H2O-Tower"
#define PDS_MDNS_SERVICE_NAME              "h2o-tower"
#define PDS_MDNS_SERVICE_TYPE              "_http"
#define PDS_MDNS_SERVICE_PROTO              "_tcp"
#define PDS_MDNS_SERVICE_PORT              80

/**
 * Initialize mDNS service
 * Registers device as "h2o-tower.local" on the network
 * 
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t PDS_MDNS_init(void);

/**
 * Start mDNS advertising
 * Called after WiFi connection is established
 * 
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t PDS_MDNS_start(void);

/**
 * Stop mDNS advertising
 * Called on WiFi disconnect or shutdown
 * 
 * @return ESP_OK on success, error code otherwise
 */
esp_err_t PDS_MDNS_stop(void);

/**
 * Check if mDNS is active
 * @return true if mDNS is advertising, false otherwise
 */
bool PDS_MDNS_is_active(void);

#endif // PDS_MDNS_H


