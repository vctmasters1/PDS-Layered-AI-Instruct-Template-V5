/**
 * pds_http_server.c — HTTP REST API server (binary protocol)
 *
 * All endpoints use application/octet-stream (PROTOCOL.md).
 * No JSON — the Android app deserializes packed structs directly.
 *
 * POST /config body framing:
 *   [L1_len : uint32_t LE] [L1_bytes ...]
 *   [L2_len : uint32_t LE] [L2_bytes ...]
 *   [L3_len : uint32_t LE] [L3_bytes ...]
 *
 * On success the pipeline is reloaded without reboot.
 */

#include "pds_http_server.h"
#include "pds_nvs.h"
#include "pds_telemetry.h"
#include "esp_log.h"
#include <string.h>
#include <stdlib.h>

/* Forward declarations of pipeline engine (defined in pds_pipeline.c) */
extern esp_err_t pds_pipeline_engine_load(
    const uint8_t *l1, size_t l1_len,
    const uint8_t *l2, size_t l2_len,
    const uint8_t *l3, size_t l3_len);


static const char *TAG = "pds_http";

static httpd_handle_t _server = NULL;
static bool _running = false;

/* ── Private handler forward declarations ── */
static esp_err_t _handler_status(httpd_req_t *req);
static esp_err_t _handler_config_get(httpd_req_t *req);
static esp_err_t _handler_config_post(httpd_req_t *req);
static esp_err_t _handler_ping(httpd_req_t *req);

/* ── Custom handler registry ── */
#define MAX_CUSTOM_HANDLERS 8
typedef struct { char uri[128]; pds_http_handler_t fn; } _custom_t;
static _custom_t _custom[MAX_CUSTOM_HANDLERS];
static size_t    _custom_count = 0;

/* ── Public API ── */

esp_err_t PDS_HTTP_server_init(void) {
    if (_running) return ESP_OK;

    httpd_config_t cfg = HTTPD_DEFAULT_CONFIG();
    cfg.server_port      = PDS_HTTP_SERVER_PORT;
    cfg.max_open_sockets = PDS_HTTP_MAX_CONNECTIONS;
    cfg.stack_size       = PDS_HTTP_STACK_SIZE;

    esp_err_t ret = httpd_start(&_server, &cfg);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "httpd_start failed: %s", esp_err_to_name(ret));
        return ret;
    }

    httpd_uri_t uris[] = {
        { .uri = "/status", .method = HTTP_GET,  .handler = _handler_status,      .user_ctx = NULL },
        { .uri = "/config", .method = HTTP_GET,  .handler = _handler_config_get,  .user_ctx = NULL },
        { .uri = "/config", .method = HTTP_POST, .handler = _handler_config_post, .user_ctx = NULL },
        { .uri = "/ping",   .method = HTTP_GET,  .handler = _handler_ping,        .user_ctx = NULL },
    };
    for (size_t i = 0; i < sizeof(uris)/sizeof(uris[0]); i++) {
        httpd_register_uri_handler(_server, &uris[i]);
    }

    _running = true;
    ESP_LOGI(TAG, "HTTP server started on port %d", PDS_HTTP_SERVER_PORT);
    return ESP_OK;
}

esp_err_t PDS_HTTP_server_stop(void) {
    if (!_running || !_server) return ESP_OK;
    esp_err_t ret = httpd_stop(_server);
    if (ret == ESP_OK) { _running = false; _server = NULL; }
    return ret;
}

bool PDS_HTTP_server_is_running(void) { return _running; }

esp_err_t PDS_HTTP_server_register_handler(const char *uri_path, pds_http_handler_t handler) {
    if (!uri_path || !handler || _custom_count >= MAX_CUSTOM_HANDLERS)
        return ESP_ERR_INVALID_ARG;
    strncpy(_custom[_custom_count].uri, uri_path, sizeof(_custom[0].uri) - 1);
    _custom[_custom_count].fn = handler;
    _custom_count++;
    ESP_LOGI(TAG, "Custom handler registered: %s", uri_path);
    return ESP_OK;
}

esp_err_t PDS_HTTP_server_unregister_handler(const char *uri_path) {
    for (size_t i = 0; i < _custom_count; i++) {
        if (strcmp(_custom[i].uri, uri_path) == 0) {
            for (size_t j = i; j < _custom_count - 1; j++) _custom[j] = _custom[j+1];
            _custom_count--;
            return ESP_OK;
        }
    }
    return ESP_ERR_NOT_FOUND;
}

/* ── Handlers ── */

/*
 * GET /status — collect live telemetry and return as binary PDS_TELDATA_packet_t.
 * Max serialized size: 16 (header) + 22*42 (ADC) + 8*38 (PWM) + 22*34 (GPIO) = 1992 bytes.
 */
static esp_err_t _handler_status(httpd_req_t *req) {
    static uint8_t buf[2048];  /* static: avoid large stack frame on task */
    pds_teldata_packet_t packet;
    size_t written = 0;

    esp_err_t ret = pds_telemetry_collect(&packet);
    if (ret == ESP_OK) {
        ret = pds_telemetry_serialize(&packet, buf, sizeof(buf), &written);
    }

    httpd_resp_set_type(req, "application/octet-stream");

    if (ret != ESP_OK || written == 0) {
        ESP_LOGW(TAG, "GET /status: telemetry collect/serialize failed (%s), sending stub",
                 esp_err_to_name(ret));
        uint8_t stub[4] = {0};
        return httpd_resp_send(req, (const char *)stub, sizeof(stub));
    }

    ESP_LOGI(TAG, "GET /status: %zu bytes", written);
    return httpd_resp_send(req, (const char *)buf, (ssize_t)written);
}

/*
 * GET /config — return all three pipeline blobs concatenated:
 *   [L1_len:4LE][L1][L2_len:4LE][L2][L3_len:4LE][L3]
 * Returns 204 with body "NONE" if no pipeline is stored.
 */
static esp_err_t _handler_config_get(httpd_req_t *req) {
    uint8_t *l1 = NULL, *l2 = NULL, *l3 = NULL;
    size_t   l1_len = 0,  l2_len = 0,  l3_len = 0;

    esp_err_t r1 = pds_device_nvs_read_blob(PDS_NVS_KEY_PIPELINE, &l1, &l1_len);
    esp_err_t r2 = pds_device_nvs_read_blob(PDS_NVS_KEY_HW_VARS,  &l2, &l2_len);
    esp_err_t r3 = pds_device_nvs_read_blob(PDS_NVS_KEY_SETTINGS, &l3, &l3_len);

    if (r1 != ESP_OK || r2 != ESP_OK || r3 != ESP_OK) {
        free(l1); free(l2); free(l3);
        httpd_resp_set_status(req, "204 No Content");
        httpd_resp_set_type(req, "text/plain");
        return httpd_resp_sendstr(req, "NONE");
    }

    httpd_resp_set_type(req, "application/octet-stream");

    /* Send each layer prefixed with its 4-byte LE length */
    uint32_t len;
    len = (uint32_t)l1_len; httpd_resp_send_chunk(req, (char *)&len, 4);
    httpd_resp_send_chunk(req, (char *)l1, (ssize_t)l1_len);
    len = (uint32_t)l2_len; httpd_resp_send_chunk(req, (char *)&len, 4);
    httpd_resp_send_chunk(req, (char *)l2, (ssize_t)l2_len);
    len = (uint32_t)l3_len; httpd_resp_send_chunk(req, (char *)&len, 4);
    httpd_resp_send_chunk(req, (char *)l3, (ssize_t)l3_len);
    httpd_resp_send_chunk(req, NULL, 0); /* end chunked */

    free(l1); free(l2); free(l3);
    return ESP_OK;
}

/*
 * POST /config — receive framed L1/L2/L3 blobs, persist to NVS, reload pipeline.
 *
 * Body format (binary, little-endian):
 *   [L1_len : uint32_t][L1_bytes ...]
 *   [L2_len : uint32_t][L2_bytes ...]
 *   [L3_len : uint32_t][L3_bytes ...]
 *
 * Limits: total body ≤ 192 KiB (3 × 64 KiB layers).
 * Response: 200 "OK" on success, 400/500 on error.
 */
#define _CONFIG_MAX_BODY  (192u * 1024u)

static esp_err_t _handler_config_post(httpd_req_t *req) {
    int body_len = req->content_len;
    if (body_len <= 0 || (size_t)body_len > _CONFIG_MAX_BODY) {
        ESP_LOGW(TAG, "POST /config: bad content_len=%d", body_len);
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Bad content length");
        return ESP_FAIL;
    }

    uint8_t *body = malloc((size_t)body_len);
    if (!body) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "OOM");
        return ESP_FAIL;
    }

    /* Receive entire body */
    int received = 0;
    while (received < body_len) {
        int r = httpd_req_recv(req, (char *)body + received, (size_t)(body_len - received));
        if (r <= 0) {
            free(body);
            httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Recv error");
            return ESP_FAIL;
        }
        received += r;
    }

    /* Parse framing */
    const uint8_t *p   = body;
    const uint8_t *end = body + body_len;

#define _READ_LAYER(name, ptr, len)                              \
    do {                                                          \
        if (p + 4 > end) { goto _bad_frame; }                    \
        uint32_t _sz;                                             \
        memcpy(&_sz, p, 4); p += 4;                              \
        if (p + _sz > end) { goto _bad_frame; }                  \
        (ptr) = p; (len) = _sz; p += _sz;                        \
    } while (0)

    const uint8_t *l1; size_t l1_len;
    const uint8_t *l2; size_t l2_len;
    const uint8_t *l3; size_t l3_len;

    _READ_LAYER("L1", l1, l1_len);
    _READ_LAYER("L2", l2, l2_len);
    _READ_LAYER("L3", l3, l3_len);

#undef _READ_LAYER

    /* Persist blobs to NVS */
    esp_err_t ret = pds_device_nvs_write_blob(PDS_NVS_KEY_PIPELINE, l1, l1_len);
    if (ret != ESP_OK) goto _nvs_err;
    ret = pds_device_nvs_write_blob(PDS_NVS_KEY_HW_VARS, l2, l2_len);
    if (ret != ESP_OK) goto _nvs_err;
    ret = pds_device_nvs_write_blob(PDS_NVS_KEY_SETTINGS, l3, l3_len);
    if (ret != ESP_OK) goto _nvs_err;

    /* Hot-reload pipeline engine (no reboot required) */
    ret = pds_pipeline_engine_load(l1, l1_len, l2, l2_len, l3, l3_len);
    free(body);
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "POST /config: pipeline_engine_load failed: %s", esp_err_to_name(ret));
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Pipeline load failed");
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "POST /config: pipeline updated and reloaded (L1=%u L2=%u L3=%u)",
             (unsigned)l1_len, (unsigned)l2_len, (unsigned)l3_len);
    return httpd_resp_sendstr(req, "OK");

_bad_frame:
    free(body);
    ESP_LOGW(TAG, "POST /config: malformed framing");
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Bad framing");
    return ESP_FAIL;

_nvs_err:
    free(body);
    ESP_LOGE(TAG, "POST /config: NVS write failed: %s", esp_err_to_name(ret));
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "NVS write failed");
    return ESP_FAIL;
}

/* GET /ping — plain text health check */
static esp_err_t _handler_ping(httpd_req_t *req) {
    httpd_resp_set_type(req, "text/plain");
    return httpd_resp_sendstr(req, "OK\n");
}

