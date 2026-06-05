#ifndef PDS_PDS_HTTP_SERVER_H
#define PDS_PDS_HTTP_SERVER_H

#include "esp_err.h"
#include "esp_http_server.h"
#include <stdint.h>
#include <stdbool.h>

/**
 * H2o-Tower HTTP REST API Server
 *
 * All endpoints use binary application/octet-stream (per PROTOCOL.md).
 * Do NOT use cJSON in endpoint handlers — the Android app deserializes
 * packed structs directly.
 *
 * Endpoints:
 *   GET  /status   → pds_teldata_packet_t   (binary, little-endian packed)
 *   GET  /config   → L2+L3 blobs from pds_l2/pds_l3 partitions (binary)
 *   POST /config   → receive binary blob → write to pds_l2/pds_l3 → reload pipeline
 *   GET  /ping     → "OK\n" plain text (health check only)
 *
 * Port: PDS_HTTP_SERVER_PORT (default 80)
 * Discovery: mDNS — see pds_https_server.c for _h2o-https._tcp
 */

#define PDS_HTTP_SERVER_PORT          80
#define PDS_HTTP_MAX_CONNECTIONS      4
#define PDS_HTTP_STACK_SIZE           4096

/**
 * Raw httpd handler signature — use esp_http_server.h types directly.
 * Handlers read/write binary via httpd_req_recv() and httpd_resp_send().
 */
typedef esp_err_t (*pds_http_handler_t)(httpd_req_t *req);

/** Initialize and start HTTP server. Registers built-in endpoints. */
esp_err_t PDS_HTTP_server_init(void);

/** Stop HTTP server. */
esp_err_t PDS_HTTP_server_stop(void);

/** @return true if server is running. */
bool PDS_HTTP_server_is_running(void);

/** Register an additional URI handler on the running server. */
esp_err_t PDS_HTTP_server_register_handler(const char *uri_path, pds_http_handler_t handler);

/** Unregister a URI handler. */
esp_err_t PDS_HTTP_server_unregister_handler(const char *uri_path);

#endif /* PDS_PDS_HTTP_SERVER_H */

