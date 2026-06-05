#include "pds_https_server.h"
#include "pds_mdns.h"
#include "pds_telemetry.h"
#include "mdns.h"
#include "pds_usrset.h"
#include "pds_validation.h"
#include "esp_https_server.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "pds_HTTPS";

// HTTPS server handle
static httpd_handle_t _server = NULL;

// Self-signed certificate (PEM format)
// In production, generate unique certificate per device
extern const unsigned char servercert_start[] asm("_binary_servercert_pem_start");
extern const unsigned char servercert_end[]   asm("_binary_servercert_pem_end");
extern const unsigned char prvtkey_pem_start[] asm("_binary_prvtkey_pem_start");
extern const unsigned char prvtkey_pem_end[]   asm("_binary_prvtkey_pem_end");

// Forward declarations
static esp_err_t _handler_get_status(httpd_req_t *req);
static esp_err_t _handler_get_config(httpd_req_t *req);
static esp_err_t _handler_get_settings(httpd_req_t *req);
static esp_err_t _handler_post_config(httpd_req_t *req);
static esp_err_t _handler_post_command(httpd_req_t *req);
static esp_err_t _handler_get_ping(httpd_req_t *req);

// URI handlers
static const httpd_uri_t _uri_get_status = {
    .uri       = "/status",
    .method    = HTTP_GET,
    .handler   = _handler_get_status,
    .user_ctx  = NULL
};

static const httpd_uri_t _uri_get_config = {
    .uri       = "/config",
    .method    = HTTP_GET,
    .handler   = _handler_get_config,
    .user_ctx  = NULL
};

static const httpd_uri_t _uri_get_settings = {
    .uri       = "/settings",
    .method    = HTTP_GET,
    .handler   = _handler_get_settings,
    .user_ctx  = NULL
};

static const httpd_uri_t _uri_post_config = {
    .uri       = "/config",
    .method    = HTTP_POST,
    .handler   = _handler_post_config,
    .user_ctx  = NULL
};

static const httpd_uri_t _uri_post_command = {
    .uri       = "/command",
    .method    = HTTP_POST,
    .handler   = _handler_post_command,
    .user_ctx  = NULL
};

static const httpd_uri_t _uri_get_ping = {
    .uri       = "/ping",
    .method    = HTTP_GET,
    .handler   = _handler_get_ping,
    .user_ctx  = NULL
};

// Start HTTPS server with embedded TLS cert, register URI handlers, start mDNS.
esp_err_t pds_device_https_server_init(void) {
    if (_server) {
        ESP_LOGW(TAG, "HTTPS server already running");
        return ESP_OK;
    }

    httpd_ssl_config_t conf = HTTPD_SSL_CONFIG_DEFAULT();
    conf.servercert     = servercert_start;
    conf.servercert_len = (size_t)(servercert_end - servercert_start);
    conf.prvtkey_pem    = prvtkey_pem_start;
    conf.prvtkey_len    = (size_t)(prvtkey_pem_end - prvtkey_pem_start);
    conf.port_secure    = pds_HTTPS_SERVER_PORT;

    esp_err_t ret = httpd_ssl_start(&_server, &conf);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "HTTPS server start failed: %s", esp_err_to_name(ret));
        return ret;
    }

    httpd_register_uri_handler(_server, &_uri_get_ping);
    httpd_register_uri_handler(_server, &_uri_get_status);
    httpd_register_uri_handler(_server, &_uri_get_config);
    httpd_register_uri_handler(_server, &_uri_get_settings);
    httpd_register_uri_handler(_server, &_uri_post_config);
    httpd_register_uri_handler(_server, &_uri_post_command);

    // Start mDNS (init is idempotent; add HTTPS service alongside existing HTTP entry)
    PDS_MDNS_init();
    mdns_service_add(NULL, "_H2o-https", "_tcp", pds_HTTPS_SERVER_PORT, NULL, 0);

    ESP_LOGI(TAG, "HTTPS server listening on port %d", pds_HTTPS_SERVER_PORT);
    return ESP_OK;
}

esp_err_t pds_device_https_server_stop(void) {
    if (_server) {
        httpd_ssl_stop(_server);
        _server = NULL;
        ESP_LOGI(TAG, "HTTPS server stopped");
    }
    return ESP_OK;
}

static esp_err_t _handler_get_status(httpd_req_t *req) {
    ESP_LOGD(TAG, "GET /status");

    // Collect current telemetry
    pds_teldata_packet_t packet;
    esp_err_t ret = pds_telemetry_collect(&packet);
    if (ret != ESP_OK) {
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }

    // Serialize to binary using new telemetry API
    uint8_t buffer[2048];
    size_t bytes_written = 0;
    ret = pds_telemetry_serialize(&packet, buffer, sizeof(buffer), &bytes_written);
    if (ret != ESP_OK) {
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }

    // Send binary response
    httpd_resp_set_type(req, "application/octet-stream");
    httpd_resp_send(req, (const char *)buffer, bytes_written);

    return ESP_OK;
}

static esp_err_t _handler_get_config(httpd_req_t *req) {
    ESP_LOGD(TAG, "GET /config");

    // Config packet: version header + reserved (pin assignments are L2 pipeline blobs, not this endpoint)
    pds_TELCONF_full_config_t config = {
        .version  = pds_PROTOCOL_VERSION,
        .reserved = {0, 0},
    };

    httpd_resp_set_type(req, "application/octet-stream");
    httpd_resp_send(req, (const char *)&config, sizeof(config));
    return ESP_OK;
}

static esp_err_t _handler_get_settings(httpd_req_t *req) {
    ESP_LOGD(TAG, "GET /settings");

    pds_telconf_usrset_t pkt = {0};
    esp_err_t ret = pds_usrset_to_packet(&pkt);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "pds_usrset_to_packet: %s", esp_err_to_name(ret));
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }

    size_t pkt_size = sizeof(pds_telconf_usrset_t) -
                      ((64u - pkt.num_settings) *
                       sizeof(pds_telconf_setting_entry_t));

    httpd_resp_set_type(req, "application/octet-stream");
    httpd_resp_send(req, (const char *)&pkt, (ssize_t)pkt_size);
    return ESP_OK;
}

static esp_err_t _handler_post_config(httpd_req_t *req) {
    ESP_LOGD(TAG, "POST /config (content length: %d)", req->content_len);

    if (req->content_len > pds_TELEMETRY_MAX_PAYLOAD) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Payload too large");
        return ESP_FAIL;
    }

    // Read request body
    uint8_t buffer[pds_TELEMETRY_MAX_PAYLOAD];
    int ret = httpd_req_recv(req, (char *)buffer, req->content_len);
    if (ret <= 0) {
        if (ret == HTTPD_SOCK_ERR_TIMEOUT) {
            httpd_resp_send_408(req);
        }
        return ESP_FAIL;
    }

    // Deserialize and validate configuration packet
    pds_telconf_packet_t config_packet;
    esp_err_t err = pds_telemetry_deserialize(buffer, ret, (pds_teldata_packet_t*)&config_packet);
    if (err != ESP_OK || !pds_telconf_packet_validate(&config_packet)) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid configuration format");
        return ESP_FAIL;
    }

    // Accept validated config packet — pipeline parameter changes go via PATCH /pipeline-settings (cloud)
    ESP_LOGI(TAG, "Config accepted: type=%u pin=%u value=%lu",
             config_packet.config_type, config_packet.target_pin,
             (unsigned long)config_packet.config_value);

    httpd_resp_set_status(req, "200 OK");
    httpd_resp_send(req, "OK", 2);
    return ESP_OK;
}

static esp_err_t _handler_post_command(httpd_req_t *req) {
    ESP_LOGD(TAG, "POST /command (content length: %d)", req->content_len);

    if (req->content_len > 256) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Command payload too large");
        return ESP_FAIL;
    }

    // Read command
    uint8_t buffer[256];
    int ret = httpd_req_recv(req, (char *)buffer, req->content_len);
    if (ret <= 0) {
        if (ret == HTTPD_SOCK_ERR_TIMEOUT) {
            httpd_resp_send_408(req);
        }
        return ESP_FAIL;
    }

    // Parse command (simple binary format: [command_type][pin][value])
    if (ret < 3) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid command");
        return ESP_FAIL;
    }

    uint8_t command_type = buffer[0];
    uint8_t target_pin = buffer[1];
    uint32_t value = 0;
    if (ret >= 6) {
        memcpy(&value, &buffer[2], sizeof(value));
    }

    ESP_LOGI(TAG, "Command: type=%u pin=%u value=%lu", command_type, target_pin, (unsigned long)value);
    // Commands received here are local LAN requests — cloud pipeline changes use PATCH /pipeline-settings.
    // Re-enable pipeline execution by routing through pds_process_action when a pipeline command API exists.
    (void)command_type; (void)target_pin; (void)value;

    httpd_resp_set_status(req, "200 OK");
    httpd_resp_send(req, "OK", 2);
    return ESP_OK;
}

static esp_err_t _handler_get_ping(httpd_req_t *req) {
    // Simple health check
    const char *response = "{\"status\":\"ok\",\"uptime\":%lu}";
    char buffer[64];
    snprintf(buffer, sizeof(buffer), response, esp_log_timestamp() / 1000);
    
    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, buffer, strlen(buffer));
    return ESP_OK;
}


