/**
 * @file pds_cloud_push.h
 * @brief Cloud telemetry push to WEB-HMI API
 *
 * After WiFi connects, call pds_cloud_push_start() once.
 * It reads api_url / device_id / device_token from NVS and spawns a
 * FreeRTOS task that periodically:
 *   1. Collects a telemetry snapshot (pds_telemetry_collect)
 *   2. POSTs it to  POST {api_url}/devices/{device_id}/telemetry
 *      with header  X-Device-Token: {device_token}
 *   3. Polls        GET  {api_url}/devices/{device_id}/pending-sync
 *      every CLOUD_SYNC_POLL_EVERY cycles
 *
 * NVS keys (namespace "pds_config", type NVS_TYPE_STR):
 *   api_url      — base API URL, no trailing slash
 *                  e.g. "http://192.168.1.80:3001/v1"  (LAN dev)
 *                       "https://your-app.up.railway.app/v1"  (production)
 *   device_id    — UUID from claim response (36 chars)
 *   device_token — 64-char hex secret from claim response
 *
 * If any NVS key is absent the task does not start and the device
 * remains offline in the HMI until NVS is provisioned and the device
 * reboots. No error is fatal — device continues to serve the local
 * HTTP API normally.
 */

#ifndef PDS_CLOUD_PUSH_H
#define PDS_CLOUD_PUSH_H

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Start the cloud push task.
 *
 * Call once after WiFi STA is connected.
 * Reads credentials from NVS. If any key is missing the function
 * returns ESP_ERR_NVS_NOT_FOUND and the task is not started —
 * this is not fatal; the rest of the firmware continues normally.
 *
 * @return ESP_OK            — task started successfully
 * @return ESP_ERR_NVS_NOT_FOUND — api_url / device_id / device_token
 *                                 not provisioned yet
 * @return ESP_ERR_NO_MEM    — FreeRTOS task creation failed
 */
esp_err_t pds_cloud_push_start(void);

/**
 * Stop the cloud push task if it is running.
 * Safe to call even if the task was never started.
 */
void pds_cloud_push_stop(void);

#ifdef __cplusplus
}
#endif

#endif /* PDS_CLOUD_PUSH_H */
