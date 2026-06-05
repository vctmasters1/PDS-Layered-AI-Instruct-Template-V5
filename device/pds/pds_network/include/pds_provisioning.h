#ifndef PDS_PDS_PROVISIONING_H
#define PDS_PDS_PROVISIONING_H

#include "esp_err.h"
#include <stdbool.h>

/**
 * @brief WiFi Provisioning via BLE for H2o-Tower
 * 
 * Handles first-time WiFi setup using Bluetooth LE provisioning.
 * Device advertises as "H2o-TOWER-SETUP" and accepts WiFi credentials
 * from the Android app via BLE connection.
 * 
 * Provisioning Flow:
 * 1. Device boots, checks NVS for saved WiFi credentials
 * 2. If not found, enters provisioning mode (BLE advertisement)
 * 3. Android app connects via BLE
 * 4. Android sends WiFi SSID/password
 * 5. Device saves credentials to NVS
 * 6. Device connects to WiFi
 * 7. BLE provisioning stops, normal operation begins
 */

/**
 * @brief Check if device has been provisioned with WiFi credentials
 * 
 * @return true if WiFi credentials exist in NVS
 */
bool pds_device_provisioning_is_provisioned(void);

/**
 * @brief Start BLE provisioning mode
 * 
 * Starts BLE advertisement as "H2o-TOWER-SETUP" and waits for
 * Android app to send WiFi credentials.
 * 
 * This function blocks until provisioning is complete or times out.
 * 
 * @return ESP_OK on successful provisioning
 */
esp_err_t pds_device_provisioning_start(void);

/**
 * @brief Reset provisioning (erase saved WiFi credentials)
 * 
 * Use this to force device back into provisioning mode.
 * Useful for testing or moving device to new network.
 * 
 * @return ESP_OK on success
 */
esp_err_t pds_device_provisioning_reset(void);

/**
 * @brief Get provisioning service name for BLE advertisement
 * 
 * @return Service name string
 */
const char* pds_device_provisioning_get_service_name(void);

#endif // pds_PROVISIONING_H


