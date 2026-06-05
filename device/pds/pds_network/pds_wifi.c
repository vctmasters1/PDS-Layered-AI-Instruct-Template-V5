#include "pds_wifi.h"
#include "pds_https_api.h"
#include "pds_http_server.h"
#include "pds_mdns.h"
#include "pds_cloud_push.h"
#include "nvs.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_netif_sntp.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_system.h"
#include "esp_http_server.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

static const char *TAG = "pds_WIFI";

/* -------------------------------------------------------------------------
 * SoftAP provisioning HTML pages
 * -----------------------------------------------------------------------*/
static const char _PROV_HTML[] =
    "<!DOCTYPE html><html><head><title>h2o-Tower WiFi Setup</title>"
    "<style>"
    "body{font-family:sans-serif;max-width:420px;margin:50px auto;padding:0 20px;background:#f5f5f5}"
    "h2{color:#0070c0}label{display:block;margin-top:12px;font-weight:bold}"
    "input{width:100%;padding:9px;margin-top:4px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px}"
    "button{width:100%;padding:11px;margin-top:18px;background:#0070c0;color:#fff;"
    "border:none;border-radius:4px;font-size:1em;cursor:pointer}"
    "</style></head><body>"
    "<h2>h2o-Tower WiFi Setup</h2>"
    "<p>Enter your home WiFi credentials to connect this device.</p>"
    "<form method='post' action='/provision'>"
    "<label>WiFi Network (SSID)<input type='text' name='ssid' required placeholder='MyNetwork'></label>"
    "<label>Password<input type='password' name='pass' placeholder='leave blank if open'></label>"
    "<button type='submit'>Save &amp; Connect</button>"
    "</form></body></html>";

static const char _PROV_OK_HTML[] =
    "<!DOCTYPE html><html><head><title>Saved</title></head><body>"
    "<h2 style='color:#0070c0'>Credentials saved!</h2>"
    "<p>The device is restarting and will connect to your WiFi network.<br>"
    "You can reconnect your phone to your normal WiFi.</p>"
    "</body></html>";

/* -------------------------------------------------------------------------
 * STA mode state
 * -----------------------------------------------------------------------*/
#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAIL_BIT      BIT1

static EventGroupHandle_t _wifi_event_group;
static int  _retry_num   = 0;
static bool _is_connected = false;
/* Set to true once the first successful connection has been established.
 * The disconnect handler uses this to decide whether to restart or just
 * set WIFI_FAIL_BIT (boot-time path). */
static bool _init_done = false;

/* Provisioning HTTP server handle */
static httpd_handle_t _prov_server = NULL;

/* -------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------*/

/** Returns true if an SSID has been saved to NVS by the WiFi driver. */
static bool _has_wifi_credentials(void)
{
    wifi_config_t cfg = {0};
    if (esp_wifi_get_config(WIFI_IF_STA, &cfg) != ESP_OK) {
        return false;
    }
    return cfg.sta.ssid[0] != '\0';
}

/**
 * Parse a URL-encoded field from a null-terminated form body.
 * Writes decoded value to 'out' (NUL-terminated). Returns 0 on success.
 */
static int _url_decode_field(const char *body, const char *key,
                              char *out, size_t out_size)
{
    char search[68];
    snprintf(search, sizeof(search), "%s=", key);
    const char *pos = strstr(body, search);
    if (!pos) {
        out[0] = '\0';
        return -1;
    }
    pos += strlen(search);
    size_t i = 0;
    while (i < out_size - 1 && *pos != '\0' && *pos != '&') {
        char c = *pos++;
        if (c == '+') {
            out[i++] = ' ';
        } else if (c == '%' && pos[0] != '\0' && pos[1] != '\0') {
            char hex[3] = { pos[0], pos[1], '\0' };
            out[i++] = (char)strtol(hex, NULL, 16);
            pos += 2;
        } else {
            out[i++] = c;
        }
    }
    out[i] = '\0';
    return 0;
}

/* -------------------------------------------------------------------------
 * SoftAP provisioning HTTP handlers
 * -----------------------------------------------------------------------*/

static esp_err_t _prov_get_handler(httpd_req_t *req)
{
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, _PROV_HTML, HTTPD_RESP_USE_STRLEN);
    return ESP_OK;
}

static esp_err_t _prov_post_handler(httpd_req_t *req)
{
    char body[384] = {0};
    int recv_len = httpd_req_recv(req, body, sizeof(body) - 1);
    if (recv_len <= 0) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Empty body");
        return ESP_FAIL;
    }
    body[recv_len] = '\0';

    char ssid[33] = {0};
    char pass[65] = {0};
    _url_decode_field(body, "ssid", ssid, sizeof(ssid));
    _url_decode_field(body, "pass", pass, sizeof(pass));

    if (ssid[0] == '\0') {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "SSID is required");
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "Provisioning: saving SSID '%s'", ssid);

    /* Save to pds_config namespace — this is where pds_device_wifi_init
     * reads credentials from (wifi_ssid / wifi_pass keys). */
    nvs_handle_t nvs_h;
    esp_err_t err = nvs_open("pds_config", NVS_READWRITE, &nvs_h);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "NVS open failed: %s", esp_err_to_name(err));
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "NVS error");
        return ESP_FAIL;
    }
    nvs_set_str(nvs_h, "wifi_ssid", ssid);
    nvs_set_str(nvs_h, "wifi_pass", pass);
    nvs_commit(nvs_h);
    nvs_close(nvs_h);
    ESP_LOGI(TAG, "Provisioning: credentials committed to pds_config NVS");

    /* Send success page, then restart after a short delay so browser gets it */
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, _PROV_OK_HTML, HTTPD_RESP_USE_STRLEN);
    vTaskDelay(pdMS_TO_TICKS(600));
    esp_restart();
    return ESP_OK; /* unreachable */
}

/* -------------------------------------------------------------------------
 * SoftAP provisioning start  (blocks until restart)
 * -----------------------------------------------------------------------*/

static esp_err_t _start_softap_provisioning(void)
{
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    char ap_ssid[32];
    snprintf(ap_ssid, sizeof(ap_ssid), "h2o-tower-%02X%02X%02X",
             mac[3], mac[4], mac[5]);

    esp_netif_create_default_wifi_ap();

    wifi_config_t ap_cfg = {
        .ap = {
            .channel        = 1,
            .max_connection = 4,
            .authmode       = WIFI_AUTH_OPEN,
        }
    };
    strncpy((char *)ap_cfg.ap.ssid, ap_ssid, sizeof(ap_cfg.ap.ssid));
    ap_cfg.ap.ssid_len = (uint8_t)strlen(ap_ssid);

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap_cfg));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGW(TAG, "=========================================");
    ESP_LOGW(TAG, "NO WiFi credentials — provisioning mode");
    ESP_LOGW(TAG, "Connect to AP:  %s  (open)", ap_ssid);
    ESP_LOGW(TAG, "Browse to:      http://192.168.4.1");
    ESP_LOGW(TAG, "=========================================");

    httpd_config_t cfg = HTTPD_DEFAULT_CONFIG();
    cfg.server_port      = 80;
    cfg.max_open_sockets = 4;

    if (httpd_start(&_prov_server, &cfg) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to start provisioning HTTP server");
        return ESP_FAIL;
    }

    static const httpd_uri_t get_uri = {
        .uri     = "/",
        .method  = HTTP_GET,
        .handler = _prov_get_handler,
    };
    static const httpd_uri_t post_uri = {
        .uri     = "/provision",
        .method  = HTTP_POST,
        .handler = _prov_post_handler,
    };
    httpd_register_uri_handler(_prov_server, &get_uri);
    httpd_register_uri_handler(_prov_server, &post_uri);

    /* Block indefinitely — esp_restart() in POST handler exits the system */
    vTaskDelay(portMAX_DELAY);
    return ESP_OK; /* unreachable */
}

/* -------------------------------------------------------------------------
 * STA event handler
 * -----------------------------------------------------------------------*/

/** Scan and log every visible AP — helps diagnose reason=210 by showing
 *  exactly what authmode the target AP is advertising. */
static void _debug_scan_aps(void)
{
    wifi_scan_config_t scfg = {
        .ssid        = NULL,   /* scan all SSIDs */
        .bssid       = NULL,
        .channel     = 0,      /* all channels */
        .show_hidden = false,
        .scan_type   = WIFI_SCAN_TYPE_ACTIVE,
    };
    if (esp_wifi_scan_start(&scfg, true /* block */ ) != ESP_OK) {
        ESP_LOGW(TAG, "scan failed");
        return;
    }
    uint16_t count = 0;
    esp_wifi_scan_get_ap_num(&count);
    if (count == 0) { ESP_LOGW(TAG, "scan: no APs found"); return; }
    wifi_ap_record_t *recs = calloc(count, sizeof(wifi_ap_record_t));
    if (!recs) return;
    esp_wifi_scan_get_ap_records(&count, recs);
    for (uint16_t i = 0; i < count; i++) {
        ESP_LOGI(TAG, "SCAN  SSID='%s'  ch=%d  rssi=%d  authmode=%d",
                 (char *)recs[i].ssid, recs[i].primary,
                 recs[i].rssi, (int)recs[i].authmode);
    }
    free(recs);
}

static void _wifi_sta_event_handler(void *arg, esp_event_base_t event_base,
                                    int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        wifi_event_sta_disconnected_t *disc = (wifi_event_sta_disconnected_t *)event_data;
        ESP_LOGW(TAG, "Disconnected, reason=%d", disc->reason);
        if (_retry_num < PDS_WIFI_MAX_RETRY) {
            esp_wifi_connect();
            _retry_num++;
            ESP_LOGI(TAG, "Retry %d/%d", _retry_num, PDS_WIFI_MAX_RETRY);
        } else if (_init_done) {
            /* Runtime disconnect — WiFi stack is stuck; restart to recover. */
            ESP_LOGE(TAG, "WiFi reconnect failed after %d retries — rebooting", PDS_WIFI_MAX_RETRY);
            esp_restart();
        } else {
            xEventGroupSetBits(_wifi_event_group, WIFI_FAIL_BIT);
        }
        _is_connected = false;
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *ev = (ip_event_got_ip_t *)event_data;
        ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&ev->ip_info.ip));
        _retry_num    = 0;
        _is_connected = true;
        xEventGroupSetBits(_wifi_event_group, WIFI_CONNECTED_BIT);

        /* Start SNTP on first connection — syncs system clock from pool.ntp.org.
         * esp_sntp_init() is idempotent; safe to call on reconnect. */
        esp_sntp_config_t sntp_cfg = ESP_NETIF_SNTP_DEFAULT_CONFIG("pool.ntp.org");
        esp_netif_sntp_init(&sntp_cfg);
        ESP_LOGI(TAG, "SNTP sync started (pool.ntp.org)");
    }
}

/* -------------------------------------------------------------------------
 * Public API
 * -----------------------------------------------------------------------*/

esp_err_t pds_device_wifi_init(void)
{
    ESP_LOGI(TAG, "Initializing WiFi and HTTPS API");
    _wifi_event_group = xEventGroupCreate();
    _is_connected     = false;

    /* WiFi driver init — common to both AP and STA paths */
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    ESP_ERROR_CHECK(esp_netif_init());
    wifi_init_config_t wifi_cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&wifi_cfg));

    /* Start HTTPS API on port 8443 — must be after esp_netif_init() */
    pds_https_server_config_t https_config = {
        .port                = 8443,
        .cert_pem            = NULL,
        .key_pem             = NULL,
        .max_open_sockets    = 4,
        .response_timeout_ms = 5000,
    };
    esp_err_t ret = pds_https_api_init(&https_config);
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "HTTPS API init failed: %s (continuing)", esp_err_to_name(ret));
    }

    /* Wipe stale WiFi driver NVS (from previous runs) so the auto-upgrade
     * warning "Password length matches WPA2 standards, threshold → WPA2"
     * doesn't fire from old cached config before we set ours. */
    esp_wifi_restore();

    /* Read pds_config NVS BEFORE setting any WiFi mode.
     * This avoids the driver loading stale config from its own NVS namespace
     * when esp_wifi_set_mode is called. */
    char _pds_ssid[33] = {0};
    char _pds_pass[65] = {0};
    {
        nvs_handle_t _wh;
        if (nvs_open("pds_config", NVS_READONLY, &_wh) == ESP_OK) {
            size_t _sl = sizeof(_pds_ssid), _pl = sizeof(_pds_pass);
            nvs_get_str(_wh, "wifi_ssid", _pds_ssid, &_sl);
            nvs_get_str(_wh, "wifi_pass", _pds_pass, &_pl);
            nvs_close(_wh);
        }
    }

    if (_pds_ssid[0] == '\0') {
        ESP_LOGW(TAG, "No saved credentials — entering SoftAP provisioning");
        esp_wifi_set_mode(WIFI_MODE_STA);
        return _start_softap_provisioning(); /* never returns — restarts */
    }

    /* ---------- STA mode: connect with saved credentials ---------- */
    ESP_LOGI(TAG, "Saved credentials found — connecting in STA mode");
    esp_netif_create_default_wifi_sta();

    esp_event_handler_instance_t inst_any_id;
    esp_event_handler_instance_t inst_got_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, &_wifi_sta_event_handler, NULL, &inst_any_id));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, &_wifi_sta_event_handler, NULL, &inst_got_ip));

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));

    /* Set config — threshold is OPEN when no password is present (open AP),
     * WPA2_PSK when password is set. Setting OPEN with a password triggers
     * a driver auto-upgrade to WPA2, which then rejects OPEN APs (reason=210).
     * sae_pwe_h2e=BOTH keeps compatibility if the router is WPA2/WPA3 mixed. */
    {
        wifi_config_t _wcfg = {0};
        strncpy((char *)_wcfg.sta.ssid,     _pds_ssid, sizeof(_wcfg.sta.ssid) - 1);
        strncpy((char *)_wcfg.sta.password,  _pds_pass, sizeof(_wcfg.sta.password) - 1);
        _wcfg.sta.threshold.authmode = (_pds_pass[0] != '\0')
                                       ? WIFI_AUTH_WPA2_PSK
                                       : WIFI_AUTH_OPEN;
        _wcfg.sta.sae_pwe_h2e        = WPA3_SAE_PWE_BOTH;
        _wcfg.sta.pmf_cfg.required   = false;
        ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &_wcfg));
        ESP_LOGI(TAG, "WiFi creds set: SSID='%s' auth=%s",
                 _pds_ssid, (_pds_pass[0] != '\0') ? "WPA2" : "OPEN");

        wifi_config_t _chk = {0};
        esp_wifi_get_config(WIFI_IF_STA, &_chk);
        ESP_LOGI(TAG, "Effective config: threshold=%d  sae_pwe=%d  pmf_req=%d",
                 (int)_chk.sta.threshold.authmode,
                 (int)_chk.sta.sae_pwe_h2e,
                 (int)_chk.sta.pmf_cfg.required);
    }

    ESP_ERROR_CHECK(esp_wifi_start());

    /* Init mDNS while we wait for IP */
    ret = PDS_MDNS_init();
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "mDNS init failed: %s", esp_err_to_name(ret));
    }

    EventBits_t bits = xEventGroupWaitBits(_wifi_event_group,
                                           WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
                                           pdFALSE, pdFALSE, portMAX_DELAY);

    if (bits & WIFI_CONNECTED_BIT) {
        ESP_LOGI(TAG, "WiFi connected");
        _init_done = true;

        ret = PDS_HTTP_server_init();
        if (ret == ESP_OK) {
            ESP_LOGI(TAG, "HTTP server started on port 80");
        } else {
            ESP_LOGW(TAG, "HTTP server failed: %s", esp_err_to_name(ret));
        }

        ret = PDS_MDNS_start();
        if (ret == ESP_OK) {
            ESP_LOGI(TAG, "mDNS registered: h2o-tower.local");
        }

        /* Start cloud push — reads api_url/device_id/device_token from NVS.
         * Not fatal if credentials are absent (device not yet claimed). */
        ret = pds_cloud_push_start();
        if (ret == ESP_ERR_NVS_NOT_FOUND) {
            ESP_LOGW(TAG, "Cloud push: credentials not provisioned — device will show offline in HMI");
        } else if (ret != ESP_OK) {
            ESP_LOGW(TAG, "Cloud push start failed: %s", esp_err_to_name(ret));
        }

        return ESP_OK;
    }

    ESP_LOGE(TAG, "Failed to connect to WiFi after %d retries — rebooting in 5 s", PDS_WIFI_MAX_RETRY);
    vTaskDelay(pdMS_TO_TICKS(5000));  /* brief pause so log is visible before restart */
    esp_restart();
}

bool pds_device_wifi_is_connected(void)
{
    return _is_connected;
}

