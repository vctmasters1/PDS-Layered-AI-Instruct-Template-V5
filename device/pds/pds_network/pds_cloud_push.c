/**
 * @file pds_cloud_push.c
 * @brief Cloud telemetry push task — device → WEB-HMI API
 *
 * Reads api_url / device_id / device_token from NVS, then on each
 * wake cycle:
 *   1. Collects a telemetry packet via pds_telemetry_collect()
 *   2. Serialises it to JSON
 *   3. POSTs to  POST {api_url}/devices/{device_id}/telemetry
 *      Header: X-Device-Token: {device_token}
 *   4. Every CLOUD_SYNC_POLL_EVERY cycles, polls
 *      GET {api_url}/devices/{device_id}/pending-sync
 *
 * JSON body format (matches WEB-HMI API expectations):
 * {
 *   "deviceTimestampUnix": <uint32>,
 *   "deviceUptimeMs":      <uint32>,
 *   "packetId":            <uint16>,
 *   "statusFlags":         <uint8>,
 *   "snapshot": {
 *     "adcReadings": [ { "pin", "rawValue", "voltage",
 *                        "calibratedValue", "label" }, ... ],
 *     "pwmOutputs":  [ { "pin", "dutyCycle", "frequency", "label" }, ... ],
 *     "gpioStates":  [ { "pin", "state", "label" }, ... ]
 *   }
 * }
 */

#include "pds_cloud_push.h"
#include "pds_usrset.h"
#include "pds_telemetry.h"
#include "pds_telemetry_types.h"
#include "pds_pwm.h"
#include "pds_gpio.h"
#include "pds_pipeline.h"
#include "esp_app_format.h"
#include "esp_log.h"
#include "esp_http_client.h"
#include "esp_https_ota.h"
#include "esp_crt_bundle.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "cJSON.h"
#include <string.h>
#include <stdio.h>

/* Resolved at link time — avoids circular component dependencies */
extern esp_err_t pds_device_nvs_write_blob(const char *key, const uint8_t *buf, size_t len);
extern esp_err_t pds_pipeline_engine_load(
    const uint8_t *l1, size_t l1_len,
    const uint8_t *l2, size_t l2_len,
    const uint8_t *l3, size_t l3_len);
extern esp_err_t pds_pipeline_engine_apply_settings(const uint8_t *l3, size_t l3_len);

static const char *TAG = "pds_CLOUD";

/* ── Timing ─────────────────────────────────────────────────────────────── */
#ifdef CONFIG_PDS_DEV_MODE
/** DEV MODE: fast polling — 1 s telemetry, every push checks pipeline. */
#  define CLOUD_PUSH_INTERVAL_MS    1000u
#  define CLOUD_SYNC_POLL_EVERY     1u
#  define CLOUD_PIPELINE_POLL_EVERY 1u
#  define CLOUD_COMMAND_POLL_EVERY  1u
#else
/** Telemetry push interval (milliseconds). 30 s = 2 pushes/min. */
#  define CLOUD_PUSH_INTERVAL_MS   30000u
/** Poll pending-sync every N telemetry pushes (30 s × 5 = every 2.5 min). */
#  define CLOUD_SYNC_POLL_EVERY      5u
/** Poll pending-pipeline every N telemetry pushes (30 s × 4 = every 2 min). */
#  define CLOUD_PIPELINE_POLL_EVERY  4u
/** Poll pending-command every N telemetry pushes (30 s × 2 = every 60 s). */
#  define CLOUD_COMMAND_POLL_EVERY   2u
#endif
/** HTTP request timeout in milliseconds. */
#define CLOUD_HTTP_TIMEOUT_MS    10000

/* ── Reconnect watchdog ──────────────────────────────────────────────────── *
 * If every telemetry push fails for CLOUD_MAX_CONSEC_FAILS consecutive cycles,
 * the network stack is stuck (stale ARP, dead WiFi, etc.). esp_restart() is
 * the only reliable recovery short of a hardware reset.
 * DEV:  300 cycles × 1 s  = ~5 min before restart.
 * PROD:  60 cycles × 30 s = ~30 min before restart. */
#ifdef CONFIG_PDS_DEV_MODE
#  define CLOUD_MAX_CONSEC_FAILS   300u
#else
#  define CLOUD_MAX_CONSEC_FAILS    60u
#endif

/* ── NVS keys ────────────────────────────────────────────────────────────── */
#define CLOUD_NVS_NS           "pds_config"
#define CLOUD_NVS_KEY_API_URL  "api_url"
#define CLOUD_NVS_KEY_DEV_ID   "device_id"
#define CLOUD_NVS_KEY_DEV_TOK  "device_token"
#define CLOUD_NVS_KEY_BOARD    "board"
#define CLOUD_NVS_KEY_HWREV    "hwrev"
#define CLOUD_NVS_KEY_ROLE     "role"

/* ── Buffer sizes ────────────────────────────────────────────────────── */
#define CLOUD_API_URL_MAX    128   /* URL including /v1            */
#define CLOUD_DEV_ID_MAX      40   /* UUID 36 chars + NUL          */
#define CLOUD_TOKEN_MAX       66   /* 64 hex chars + NUL           */
#define CLOUD_BOARD_MAX       32   /* e.g. "esp32_node32s"          */
#define CLOUD_HWREV_MAX       16   /* e.g. "hwrev_001"              */
#define CLOUD_ROLE_MAX        16   /* e.g. "AERO-005"               */
/* Worst-case JSON: header (128 B) + 22 ADC*~120 + 6 PWM*~80 + 22 GPIO*~80 ≈ 4.5 KB */
#define CLOUD_JSON_MAX      5120

/* In dev mode: TLS cert check is skipped — allows plain http:// on the local rig.
 * In production: cert is validated against the CMN CA bundle — Railway's chain is trusted. */
#ifdef CONFIG_PDS_DEV_MODE
#  define CLOUD_SKIP_CERT  true
#else
#  define CLOUD_SKIP_CERT  false
#endif

/* ── Module state ────────────────────────────────────────────────────── */
static char s_api_url[CLOUD_API_URL_MAX]   = {0};
static char s_device_id[CLOUD_DEV_ID_MAX]  = {0};
static char s_token[CLOUD_TOKEN_MAX]       = {0};
static char s_board[CLOUD_BOARD_MAX]       = {0};
static char s_hwrev[CLOUD_HWREV_MAX]       = {0};
static char s_role[CLOUD_ROLE_MAX]         = {0};
static TaskHandle_t s_task_handle          = NULL;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** Read a NVS_TYPE_STR value from the pds_config namespace. */
static esp_err_t _nvs_read_str(const char *key, char *out, size_t out_size)
{
    nvs_handle_t h;
    esp_err_t ret = nvs_open(CLOUD_NVS_NS, NVS_READONLY, &h);
    if (ret != ESP_OK) {
        return ret;
    }
    size_t len = out_size;
    ret = nvs_get_str(h, key, out, &len);
    nvs_close(h);
    return ret;
}

/** Minimal no-op HTTP event handler (required by esp_http_client). */
static esp_err_t _http_event_handler(esp_http_client_event_t *evt)
{
    (void)evt;
    return ESP_OK;
}

/* ── Telemetry serialisation ─────────────────────────────────────────────── */

/**
 * Convert a collected telemetry packet into the JSON "snapshot" object.
 * Caller owns the returned cJSON node (cJSON_Delete when done).
 */
static cJSON *_build_snapshot(const pds_teldata_packet_t *pkt)
{
    cJSON *snapshot = cJSON_CreateObject();
    if (!snapshot) {
        return NULL;
    }

    /* ADC readings */
    cJSON *adcs = cJSON_CreateArray();
    for (int i = 0; i < pkt->header.num_adc_readings; i++) {
        const pds_teldata_adc_reading_t *r = &pkt->adc_readings[i];
        cJSON *e = cJSON_CreateObject();
        cJSON_AddNumberToObject(e, "pin",             r->pin_number);
        cJSON_AddNumberToObject(e, "rawValue",        r->raw_value);
        cJSON_AddNumberToObject(e, "voltage",         (double)r->voltage);
        cJSON_AddNumberToObject(e, "calibratedValue", (double)r->calibrated_value);
        cJSON_AddStringToObject(e, "label",           r->label);
        cJSON_AddItemToArray(adcs, e);
    }
    cJSON_AddItemToObject(snapshot, "adcReadings", adcs);

    /* PWM outputs */
    cJSON *pwms = cJSON_CreateArray();
    for (int i = 0; i < pkt->header.num_pwm_outputs; i++) {
        const pds_teldata_pwm_state_t *p = &pkt->pwm_outputs[i];
        cJSON *e = cJSON_CreateObject();
        cJSON_AddNumberToObject(e, "pin",       p->pin_number);
        cJSON_AddNumberToObject(e, "dutyCycle", p->duty_cycle);
        cJSON_AddNumberToObject(e, "frequency", p->frequency);
        cJSON_AddStringToObject(e, "label",     p->label);
        cJSON_AddItemToArray(pwms, e);
    }
    cJSON_AddItemToObject(snapshot, "pwmOutputs", pwms);

    /* GPIO states */
    cJSON *gpios = cJSON_CreateArray();
    for (int i = 0; i < pkt->header.num_gpio_states; i++) {
        const pds_teldata_gpio_state_t *g = &pkt->gpio_states[i];
        cJSON *e = cJSON_CreateObject();
        cJSON_AddNumberToObject(e, "pin",   g->pin_number);
        cJSON_AddNumberToObject(e, "state", g->state);
        cJSON_AddStringToObject(e, "label", g->label);
        cJSON_AddItemToArray(gpios, e);
    }
    cJSON_AddItemToObject(snapshot, "gpioStates", gpios);

    /* Timer states */
    cJSON *timers = cJSON_CreateArray();
    for (int i = 0; i < pkt->num_timer_states; i++) {
        const pds_teldata_timer_state_t *t = &pkt->timer_states[i];
        cJSON *e = cJSON_CreateObject();
        cJSON_AddNumberToObject(e, "timerId",   t->timer_id);
        cJSON_AddBoolToObject  (e, "active",    t->active != 0);
        cJSON_AddNumberToObject(e, "value",     t->value);
        cJSON_AddNumberToObject(e, "elapsedMs", t->elapsed_ms);
        cJSON_AddStringToObject(e, "label",     t->label);
        cJSON_AddItemToArray(timers, e);
    }
    cJSON_AddItemToObject(snapshot, "timerStates", timers);

    /* Peripheral sensor readings (DHT22 temp/humid, etc.) */
    cJSON *periphs = cJSON_CreateArray();
    for (int i = 0; i < pkt->num_periph_readings; i++) {
        const pds_teldata_periph_reading_t *p = &pkt->periph_readings[i];
        cJSON *e = cJSON_CreateObject();
        cJSON_AddNumberToObject(e, "pin",     p->pin);
        cJSON_AddStringToObject(e, "field",   p->field);
        cJSON_AddNumberToObject(e, "value",   p->value);
        cJSON_AddNumberToObject(e, "voltage", p->voltage);
        cJSON_AddStringToObject(e, "label",   p->label);
        cJSON_AddItemToArray(periphs, e);
    }
    cJSON_AddItemToObject(snapshot, "peripheralReadings", periphs);

    return snapshot;
}

/* ── Telemetry push ──────────────────────────────────────────────────────── */

static bool _push_telemetry(void)
{
    /* 1. Collect */
    pds_teldata_packet_t pkt;
    if (pds_telemetry_collect(&pkt) != ESP_OK) {
        ESP_LOGW(TAG, "telemetry collect failed — skipping push");
        return false;
    }

    /* 2. Serialise to JSON */
    cJSON *root = cJSON_CreateObject();
    if (!root) {
        return false;
    }
    cJSON_AddNumberToObject(root, "deviceTimestampUnix", pkt.header.timestamp_unix);
    cJSON_AddNumberToObject(root, "deviceUptimeMs",      pkt.header.timestamp_ms);
    cJSON_AddNumberToObject(root, "packetId",            pkt.header.packet_id);
    cJSON_AddNumberToObject(root, "statusFlags",         pkt.header.status_flags);

    /* Hardware identity — read from NVS at start, included on every push so the
     * HMI API can backfill device records provisioned before the schema change. */
    if (s_board[0])    cJSON_AddStringToObject(root, "board",    s_board);
    if (s_hwrev[0])    cJSON_AddStringToObject(root, "hwrev",    s_hwrev);
    if (s_role[0])     cJSON_AddStringToObject(root, "role",     s_role);
    /* Firmware version — baked into binary at compile time via PROJECT_VER (CMake). */
    cJSON_AddStringToObject(root, "firmwareVersion", esp_app_get_description()->version);

    cJSON *snapshot = _build_snapshot(&pkt);
    if (snapshot) {
        cJSON_AddItemToObject(root, "snapshot", snapshot);
    }

    char *body = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (!body) {
        return false;
    }

    /* 3. POST */
    char url[CLOUD_API_URL_MAX + CLOUD_DEV_ID_MAX + 32];
    snprintf(url, sizeof(url), "%s/devices/%s/telemetry", s_api_url, s_device_id);

    esp_http_client_config_t cfg = {
        .url                         = url,
        .method                      = HTTP_METHOD_POST,
        .event_handler               = _http_event_handler,
        .timeout_ms                  = CLOUD_HTTP_TIMEOUT_MS,
        .crt_bundle_attach           = esp_crt_bundle_attach,
        .skip_cert_common_name_check = CLOUD_SKIP_CERT,
    };

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) {
        free(body);
        return false;
    }

    esp_http_client_set_header(client, "Content-Type",  "application/json");
    esp_http_client_set_header(client, "X-Device-Token", s_token);
    esp_http_client_set_post_field(client, body, (int)strlen(body));

    esp_err_t err = esp_http_client_perform(client);
    bool success = false;
    if (err == ESP_OK) {
        int status = esp_http_client_get_status_code(client);
        if (status == 200 || status == 201) {
            ESP_LOGI(TAG, "Telemetry pushed (HTTP %d, pkt#%u)", status, pkt.header.packet_id);
            success = true;
        } else {
            ESP_LOGW(TAG, "Telemetry push got HTTP %d", status);
        }
    } else {
        ESP_LOGE(TAG, "Telemetry push error: %s", esp_err_to_name(err));
    }

    esp_http_client_cleanup(client);
    free(body);
    return success;
}

/* ── Pending-sync poll ───────────────────────────────────────────────────── */

/** Buffer size for pending-sync response body. */
#define CLOUD_SYNC_RESP_MAX  256

/** OTA HTTP event handler — injects X-Device-Token on connect so HMI API can
 *  authenticate the download request via verifyDeviceToken middleware. */
static esp_err_t _ota_http_event_handler(esp_http_client_event_t *evt)
{
    if (evt->event_id == HTTP_EVENT_ON_CONNECTED) {
        esp_http_client_set_header(evt->client, "X-Device-Token", s_token);
    }
    return ESP_OK;
}

static void _poll_pending_sync(void)
{
    char url[CLOUD_API_URL_MAX + CLOUD_DEV_ID_MAX + 32];
    snprintf(url, sizeof(url), "%s/devices/%s/pending-sync", s_api_url, s_device_id);

    char resp_buf[CLOUD_SYNC_RESP_MAX];
    int  resp_len = 0;

    esp_http_client_config_t cfg = {
        .url                         = url,
        .method                      = HTTP_METHOD_GET,
        .event_handler               = _http_event_handler,
        .timeout_ms                  = CLOUD_HTTP_TIMEOUT_MS,
        .crt_bundle_attach           = esp_crt_bundle_attach,
        .skip_cert_common_name_check = CLOUD_SKIP_CERT,
    };

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) return;

    esp_http_client_set_header(client, "X-Device-Token", s_token);

    esp_err_t err = esp_http_client_open(client, 0);
    if (err != ESP_OK) {
        ESP_LOGD(TAG, "pending-sync open: %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return;
    }

    int content_len = (int)esp_http_client_fetch_headers(client);
    int status      = esp_http_client_get_status_code(client);
    ESP_LOGD(TAG, "pending-sync poll: HTTP %d", status);

    if (status == 200 && content_len > 0 && content_len < (int)sizeof(resp_buf)) {
        resp_len = esp_http_client_read(client, resp_buf, content_len);
        if (resp_len > 0) resp_buf[resp_len] = '\0';
    }

    esp_http_client_close(client);
    esp_http_client_cleanup(client);

    if (resp_len <= 0) return;

    cJSON *root = cJSON_Parse(resp_buf);
    if (!root) return;

    /* Force telemetry push if the cloud requested a sync flush */
    cJSON *pending_node = cJSON_GetObjectItemCaseSensitive(root, "pending");
    if (cJSON_IsTrue(pending_node)) {
        ESP_LOGI(TAG, "pending-sync: cloud requested log flush");
        _push_telemetry();
    }

    /* OTA firmware update when otaUrl is present and non-null */
    cJSON *ota_url_node = cJSON_GetObjectItemCaseSensitive(root, "otaUrl");
    cJSON *ota_ver_node = cJSON_GetObjectItemCaseSensitive(root, "otaVersion");
    const char *ota_url = cJSON_IsString(ota_url_node) ? ota_url_node->valuestring : NULL;
    const char *ota_ver = cJSON_IsString(ota_ver_node) ? ota_ver_node->valuestring : NULL;

    if (ota_url && ota_ver) {
        /* Copy URL and version before freeing the JSON tree */
        char ota_url_buf[512];
        char ota_ver_buf[32];
        strlcpy(ota_url_buf, ota_url, sizeof(ota_url_buf));
        strlcpy(ota_ver_buf, ota_ver, sizeof(ota_ver_buf));

        ESP_LOGI(TAG, "OTA update requested: version=%s url=%s", ota_ver_buf, ota_url_buf);
        cJSON_Delete(root);

        esp_http_client_config_t ota_cfg = {
            .url                         = ota_url_buf,
            .timeout_ms                  = 30000,
            .crt_bundle_attach           = esp_crt_bundle_attach,
            .skip_cert_common_name_check = CLOUD_SKIP_CERT,
            /* Attach device token so HMI API can authenticate the download request. */
            .event_handler               = _ota_http_event_handler,
        };
        esp_https_ota_config_t ota = { .http_config = &ota_cfg };
        esp_err_t ota_err = esp_https_ota(&ota);

        /* ACK result back to cloud */
        char ack_url[CLOUD_API_URL_MAX + CLOUD_DEV_ID_MAX + 32];
        snprintf(ack_url, sizeof(ack_url), "%s/devices/%s/ota/ack", s_api_url, s_device_id);
        cJSON *ack = cJSON_CreateObject();
        if (ack) {
            cJSON_AddStringToObject(ack, "status", ota_err == ESP_OK ? "ok" : "error");
            if (ota_err != ESP_OK) cJSON_AddStringToObject(ack, "error", esp_err_to_name(ota_err));
            char *ack_body = cJSON_PrintUnformatted(ack);
            cJSON_Delete(ack);
            if (ack_body) {
                esp_http_client_config_t ack_cfg = {
                    .url = ack_url, .method = HTTP_METHOD_POST,
                    .event_handler = _http_event_handler,
                    .timeout_ms = CLOUD_HTTP_TIMEOUT_MS,
                    .crt_bundle_attach = esp_crt_bundle_attach,
                    .skip_cert_common_name_check = CLOUD_SKIP_CERT,
                };
                esp_http_client_handle_t ack_client = esp_http_client_init(&ack_cfg);
                if (ack_client) {
                    esp_http_client_set_header(ack_client, "Content-Type", "application/json");
                    esp_http_client_set_header(ack_client, "X-Device-Token", s_token);
                    esp_http_client_set_post_field(ack_client, ack_body, (int)strlen(ack_body));
                    esp_http_client_perform(ack_client);
                    esp_http_client_cleanup(ack_client);
                }
                free(ack_body);
            }
        }

        if (ota_err == ESP_OK) {
            ESP_LOGI(TAG, "OTA success — rebooting");
            esp_restart();
        } else {
            ESP_LOGE(TAG, "OTA failed: %s", esp_err_to_name(ota_err));
        }
        return;
    }

    cJSON_Delete(root);
}

/* ── Pending-pipeline poll ───────────────────────────────────────────────── */

/** Maximum framed pipeline body the device will accept (192 KB = 3 × 64 KB). */
#define CLOUD_PIPELINE_MAX_BYTES  (192u * 1024u)

/**
 * POST pipeline/ack JSON back to the cloud.
 * status: "ok" or "error". err_msg may be NULL on success.
 */
static void _send_pipeline_ack(const char *status, const char *err_msg)
{
    char url[CLOUD_API_URL_MAX + CLOUD_DEV_ID_MAX + 48];
    snprintf(url, sizeof(url), "%s/devices/%s/pipeline/ack", s_api_url, s_device_id);

    cJSON *root = cJSON_CreateObject();
    if (!root) return;
    cJSON_AddStringToObject(root, "status", status);
    if (err_msg) cJSON_AddStringToObject(root, "error", err_msg);
    char *body = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (!body) return;

    esp_http_client_config_t cfg = {
        .url                         = url,
        .method                      = HTTP_METHOD_POST,
        .event_handler               = _http_event_handler,
        .timeout_ms                  = CLOUD_HTTP_TIMEOUT_MS,
        .crt_bundle_attach           = esp_crt_bundle_attach,
        .skip_cert_common_name_check = CLOUD_SKIP_CERT,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (client) {
        esp_http_client_set_header(client, "Content-Type",  "application/json");
        esp_http_client_set_header(client, "X-Device-Token", s_token);
        esp_http_client_set_post_field(client, body, (int)strlen(body));
        esp_http_client_perform(client);
        esp_http_client_cleanup(client);
    }
    free(body);
}

/* ── Pending-command poll ────────────────────────────────────────────────── */

/** Buffer for pending-command response body (small JSON). */
#define CLOUD_CMD_RESP_MAX  128

/**
 * Poll GET {api_url}/devices/{device_id}/pending-command.
 * 204 → nothing pending (common case, fast return).
 * 200 → JSON { "type": "pwm"|"gpio", "pin": N, "value": N }
 *        Apply immediately via HAL.
 */
static void _poll_pending_command(void)
{
    char url[CLOUD_API_URL_MAX + CLOUD_DEV_ID_MAX + 48];
    snprintf(url, sizeof(url), "%s/devices/%s/pending-command", s_api_url, s_device_id);

    char resp_buf[CLOUD_CMD_RESP_MAX];
    int  resp_len = 0;

    esp_http_client_config_t cfg = {
        .url                         = url,
        .method                      = HTTP_METHOD_GET,
        .event_handler               = _http_event_handler,
        .timeout_ms                  = CLOUD_HTTP_TIMEOUT_MS,
        .crt_bundle_attach           = esp_crt_bundle_attach,
        .skip_cert_common_name_check = CLOUD_SKIP_CERT,
    };

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) return;

    esp_http_client_set_header(client, "X-Device-Token", s_token);

    esp_err_t err = esp_http_client_open(client, 0);
    if (err != ESP_OK) {
        ESP_LOGD(TAG, "pending-command open: %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return;
    }

    int content_len = (int)esp_http_client_fetch_headers(client);
    int status      = esp_http_client_get_status_code(client);

    if (status == 204) {
        /* Nothing pending — fast path */
        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        return;
    }

    if (status == 200 && content_len > 0 && content_len < (int)sizeof(resp_buf)) {
        resp_len = esp_http_client_read(client, resp_buf, content_len);
        if (resp_len > 0) resp_buf[resp_len] = '\0';
    }

    esp_http_client_close(client);
    esp_http_client_cleanup(client);

    if (resp_len <= 0) return;

    cJSON *root = cJSON_Parse(resp_buf);
    if (!root) return;

    cJSON *type_node = cJSON_GetObjectItemCaseSensitive(root, "type");

    if (!cJSON_IsString(type_node)) {
        ESP_LOGW(TAG, "pending-command: missing or non-string 'type'");
        cJSON_Delete(root);
        return;
    }

    const char *type = type_node->valuestring;

    if (strcmp(type, "pwm") == 0 || strcmp(type, "gpio") == 0) {
        cJSON *pin_node   = cJSON_GetObjectItemCaseSensitive(root, "pin");
        cJSON *value_node = cJSON_GetObjectItemCaseSensitive(root, "value");
        if (!cJSON_IsNumber(pin_node) || !cJSON_IsNumber(value_node)) {
            ESP_LOGW(TAG, "pending-command: pwm/gpio requires numeric pin and value");
            cJSON_Delete(root);
            return;
        }
        int pin   = (int)pin_node->valuedouble;
        int value = (int)value_node->valuedouble;
        ESP_LOGI(TAG, "pending-command: type=%s pin=%d value=%d", type, pin, value);
        if (strcmp(type, "pwm") == 0) {
            PDS_PWM_set_duty((uint8_t)pin, (uint32_t)value);
        } else {
            PDS_GPIO_write((uint8_t)pin, (uint8_t)value);
        }

    } else if (strcmp(type, "hmi_toggle") == 0) {
        cJSON *pl_node  = cJSON_GetObjectItemCaseSensitive(root, "pipelineIndex");
        cJSON *blk_node = cJSON_GetObjectItemCaseSensitive(root, "blockIndex");
        cJSON *val_node = cJSON_GetObjectItemCaseSensitive(root, "value");
        if (!cJSON_IsNumber(pl_node) || !cJSON_IsNumber(blk_node) || !cJSON_IsBool(val_node)) {
            ESP_LOGW(TAG, "pending-command: hmi_toggle requires pipelineIndex, blockIndex, value(bool)");
            cJSON_Delete(root);
            return;
        }
        uint8_t pl_idx  = (uint8_t)pl_node->valuedouble;
        uint8_t blk_idx = (uint8_t)blk_node->valuedouble;
        bool    val     = cJSON_IsTrue(val_node);
        ESP_LOGI(TAG, "pending-command: hmi_toggle pl=%d blk=%d val=%d", pl_idx, blk_idx, (int)val);
        esp_err_t ret = pds_pipeline_engine_hmi_set_toggle(pl_idx, blk_idx, val);
        if (ret != ESP_OK) {
            ESP_LOGW(TAG, "hmi_set_toggle failed: 0x%x", ret);
        }

    } else if (strcmp(type, "hmi_momentary") == 0) {
        cJSON *pl_node  = cJSON_GetObjectItemCaseSensitive(root, "pipelineIndex");
        cJSON *blk_node = cJSON_GetObjectItemCaseSensitive(root, "blockIndex");
        if (!cJSON_IsNumber(pl_node) || !cJSON_IsNumber(blk_node)) {
            ESP_LOGW(TAG, "pending-command: hmi_momentary requires pipelineIndex and blockIndex");
            cJSON_Delete(root);
            return;
        }
        uint8_t pl_idx  = (uint8_t)pl_node->valuedouble;
        uint8_t blk_idx = (uint8_t)blk_node->valuedouble;
        ESP_LOGI(TAG, "pending-command: hmi_momentary pl=%d blk=%d", pl_idx, blk_idx);
        esp_err_t ret = pds_pipeline_engine_hmi_trigger_momentary(pl_idx, blk_idx);
        if (ret != ESP_OK) {
            ESP_LOGW(TAG, "hmi_trigger_momentary failed: 0x%x", ret);
        }

    } else {
        ESP_LOGW(TAG, "pending-command: unknown type '%s'", type);
    }

    cJSON_Delete(root);
}

/* ── Control-point settle push ───────────────────────────────────────────── */

/**
 * Callback invoked by pds_pipeline_engine_poll_cp_settle() for each encoder_mapped
 * block whose mapped_value has been stable for ≥10 s.
 * PATCHes PATCH {api_url}/devices/{device_id}/control-point with the new value.
 * Returns ESP_OK so the block's settle state is acknowledged on success.
 */
static esp_err_t _patch_control_point(uint8_t pl, uint8_t blk, uint8_t field, float value, void *ctx)
{
    (void)ctx;
    char url[CLOUD_API_URL_MAX + CLOUD_DEV_ID_MAX + 48];
    snprintf(url, sizeof(url), "%s/devices/%s/control-point", s_api_url, s_device_id);

    cJSON *body_json = cJSON_CreateObject();
    if (!body_json) return ESP_ERR_NO_MEM;
    cJSON_AddNumberToObject(body_json, "pipeline", pl);
    cJSON_AddNumberToObject(body_json, "block",    blk);
    cJSON_AddNumberToObject(body_json, "fieldIdx", field);
    cJSON_AddNumberToObject(body_json, "value",    (double)value);

    char *body = cJSON_PrintUnformatted(body_json);
    cJSON_Delete(body_json);
    if (!body) return ESP_ERR_NO_MEM;

    esp_http_client_config_t cfg = {
        .url                         = url,
        .method                      = HTTP_METHOD_PATCH,
        .event_handler               = _http_event_handler,
        .timeout_ms                  = CLOUD_HTTP_TIMEOUT_MS,
        .crt_bundle_attach           = esp_crt_bundle_attach,
        .skip_cert_common_name_check = CLOUD_SKIP_CERT,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) { free(body); return ESP_ERR_NO_MEM; }

    esp_http_client_set_header(client, "Content-Type",   "application/json");
    esp_http_client_set_header(client, "X-Device-Token", s_token);
    esp_http_client_set_post_field(client, body, (int)strlen(body));

    esp_err_t result = ESP_FAIL;
    esp_err_t err    = esp_http_client_perform(client);
    if (err == ESP_OK) {
        int status = esp_http_client_get_status_code(client);
        if (status == 200 || status == 204) {
            ESP_LOGI(TAG, "CP saved pl=%u blk=%u field=%u val=%.3f (HTTP %d)",
                     pl, blk, field, value, status);
            result = ESP_OK;
        } else {
            ESP_LOGW(TAG, "CP save HTTP %d (pl=%u blk=%u field=%u val=%.3f)",
                     status, pl, blk, field, value);
        }
    } else {
        ESP_LOGE(TAG, "CP save error: %s", esp_err_to_name(err));
    }

    esp_http_client_cleanup(client);
    free(body);
    return result;
}

/** Check all encoder_mapped blocks; POST any settled values to the server. */
static void _push_cp_settle(void)
{
    pds_pipeline_engine_poll_cp_settle(_patch_control_point, NULL);
}

/**
 * Poll GET {api_url}/devices/{device_id}/pending-pipeline.
 * 204 → nothing pending (common case, fast return).
 * 200 → framed binary body: [L1_len:4LE][L1][L2_len:4LE][L2][L3_len:4LE][L3]
 *        Parse, write to NVS, hot-reload pipeline engine, ACK.
 */
static void _poll_pending_pipeline(void)
{
    char url[CLOUD_API_URL_MAX + CLOUD_DEV_ID_MAX + 48];
    snprintf(url, sizeof(url), "%s/devices/%s/pending-pipeline", s_api_url, s_device_id);

    esp_http_client_config_t cfg = {
        .url                         = url,
        .method                      = HTTP_METHOD_GET,
        .timeout_ms                  = CLOUD_HTTP_TIMEOUT_MS,
        .crt_bundle_attach           = esp_crt_bundle_attach,
        .skip_cert_common_name_check = CLOUD_SKIP_CERT,
    };

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) return;

    esp_http_client_set_header(client, "X-Device-Token", s_token);

    /* Use streaming API so we can read an arbitrary-length binary body */
    esp_err_t err = esp_http_client_open(client, 0);
    if (err != ESP_OK) {
        ESP_LOGD(TAG, "pending-pipeline open: %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return;
    }

    int content_len = (int)esp_http_client_fetch_headers(client);
    int status      = esp_http_client_get_status_code(client);

    if (status == 204 || content_len == 0) {
        /* Nothing pending — common case */
        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        return;
    }

    if (status != 200 || content_len < 0 || (size_t)content_len > CLOUD_PIPELINE_MAX_BYTES) {
        ESP_LOGW(TAG, "pending-pipeline: HTTP %d, len=%d — skipping", status, content_len);
        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        return;
    }

    /* Allocate buffer and read body */
    uint8_t *buf = malloc((size_t)content_len);
    if (!buf) {
        ESP_LOGE(TAG, "pending-pipeline: OOM (%d bytes)", content_len);
        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        return;
    }

    int total_read = 0;
    while (total_read < content_len) {
        int r = esp_http_client_read(client, (char *)buf + total_read,
                                     content_len - total_read);
        if (r <= 0) break;
        total_read += r;
    }

    esp_http_client_close(client);
    esp_http_client_cleanup(client);

    if (total_read != content_len) {
        ESP_LOGW(TAG, "pending-pipeline: read %d/%d bytes", total_read, content_len);
        free(buf);
        return;
    }

    ESP_LOGI(TAG, "pending-pipeline: downloaded %d bytes — parsing", content_len);

    /* Parse framing: [len:4LE][bytes] × 3 */
    const uint8_t *p   = buf;
    const uint8_t *end = buf + content_len;

#define _LAYER(ptr, sz)                                   \
    do {                                                   \
        if (p + 4 > end) goto _bad_frame;                 \
        uint32_t _n; memcpy(&_n, p, 4); p += 4;          \
        if (p + _n > end) goto _bad_frame;                \
        (ptr) = p; (sz) = (size_t)_n; p += _n;           \
    } while (0)

    const uint8_t *l1; size_t l1_len;
    const uint8_t *l2; size_t l2_len;
    const uint8_t *l3; size_t l3_len;

    _LAYER(l1, l1_len);
    _LAYER(l2, l2_len);
    _LAYER(l3, l3_len);

#undef _LAYER

    ESP_LOGI(TAG, "pending-pipeline: L1=%u L2=%u L3=%u bytes",
             (unsigned)l1_len, (unsigned)l2_len, (unsigned)l3_len);

    /* Persist to NVS */
    esp_err_t r = pds_device_nvs_write_blob("pipeline", l1, l1_len);
    if (r != ESP_OK) {
        ESP_LOGE(TAG, "NVS write pipeline: %s", esp_err_to_name(r));
        _send_pipeline_ack("error", "NVS write pipeline failed");
        free(buf);
        return;
    }
    r = pds_device_nvs_write_blob("hw_vars", l2, l2_len);
    if (r != ESP_OK) {
        ESP_LOGE(TAG, "NVS write hw_vars: %s", esp_err_to_name(r));
        _send_pipeline_ack("error", "NVS write hw_vars failed");
        free(buf);
        return;
    }
    r = pds_device_nvs_write_blob("settings", l3, l3_len);
    if (r != ESP_OK) {
        ESP_LOGE(TAG, "NVS write settings: %s", esp_err_to_name(r));
        _send_pipeline_ack("error", "NVS write settings failed");
        free(buf);
        return;
    }

    /* Try a settings-only in-place update first (no teardown / rebuild).
     * apply_settings() succeeds only when the engine is loaded and the
     * pipeline version in L3 matches the running engine — i.e. L1 is
     * structurally identical to what is already running.  If it fails
     * (version mismatch, engine not loaded) fall through to full reload. */
    r = pds_pipeline_engine_apply_settings(l3, l3_len);
    if (r == ESP_OK) {
        free(buf);
        ESP_LOGI(TAG, "pending-pipeline: settings applied in-place (no teardown)");
        _send_pipeline_ack("ok", NULL);
        return;
    }

    /* Full structural reload (L1 changed or engine not yet loaded). */
    r = pds_pipeline_engine_load(l1, l1_len, l2, l2_len, l3, l3_len);
    free(buf);

    if (r != ESP_OK) {
        ESP_LOGW(TAG, "pending-pipeline: engine load failed: %s", esp_err_to_name(r));
        _send_pipeline_ack("error", esp_err_to_name(r));
    } else {
        ESP_LOGI(TAG, "pending-pipeline: pipeline reloaded successfully");
        _send_pipeline_ack("ok", NULL);
    }
    return;

_bad_frame:
    ESP_LOGE(TAG, "pending-pipeline: malformed framing — discarding");
    free(buf);
    _send_pipeline_ack("error", "bad framing");
}

/* ── FreeRTOS task ───────────────────────────────────────────────────────── */

static void _cloud_push_task(void *arg)
{
    (void)arg;
    uint32_t cycle = 0;
    uint32_t consec_fail = 0;

    ESP_LOGI(TAG, "Cloud push task started");
    ESP_LOGI(TAG, "  API:    %s", s_api_url);
    ESP_LOGI(TAG, "  Device: %s", s_device_id);

    for (;;) {
        if (_push_telemetry()) {
            consec_fail = 0;
        } else if (++consec_fail >= CLOUD_MAX_CONSEC_FAILS) {
            ESP_LOGE(TAG, "Network unreachable for %"PRIu32" consecutive cycles — rebooting",
                     consec_fail);
            esp_restart();
        }
        _push_cp_settle();  /* upload any settled encoder setpoints to the server */

        if ((++cycle % CLOUD_SYNC_POLL_EVERY) == 0) {
            _poll_pending_sync();
        }

        if ((cycle % CLOUD_PIPELINE_POLL_EVERY) == 0) {
            _poll_pending_pipeline();
        }

        if ((cycle % CLOUD_COMMAND_POLL_EVERY) == 0) {
            _poll_pending_command();
        }

#ifdef CONFIG_PDS_DEV_MODE
        vTaskDelay(pdMS_TO_TICKS(CLOUD_PUSH_INTERVAL_MS));
#else
        {
            float _push_ms = (float)CLOUD_PUSH_INTERVAL_MS;
            pds_usrset_get("cloud_push_interval_ms", &_push_ms);
            uint32_t push_delay_ms = (uint32_t)_push_ms;
            if (push_delay_ms < 1000u) push_delay_ms = 1000u;  /* floor 1 s */
            vTaskDelay(pdMS_TO_TICKS(push_delay_ms));
        }
#endif
    }
}

/* ── Public API ──────────────────────────────────────────────────────────── */

esp_err_t pds_cloud_push_start(void)
{
    if (s_task_handle != NULL) {
        ESP_LOGW(TAG, "Cloud push task already running");
        return ESP_OK;
    }

    /* Read credentials from NVS */
    esp_err_t r1 = _nvs_read_str(CLOUD_NVS_KEY_API_URL, s_api_url,   sizeof(s_api_url));
    esp_err_t r2 = _nvs_read_str(CLOUD_NVS_KEY_DEV_ID,  s_device_id, sizeof(s_device_id));
    esp_err_t r3 = _nvs_read_str(CLOUD_NVS_KEY_DEV_TOK, s_token,     sizeof(s_token));

    if (r1 != ESP_OK || r2 != ESP_OK || r3 != ESP_OK) {
        ESP_LOGW(TAG,
            "Cloud credentials not in NVS "
            "(api_url=%s device_id=%s device_token=%s) — cloud push disabled",
            esp_err_to_name(r1), esp_err_to_name(r2), esp_err_to_name(r3));
        return ESP_ERR_NVS_NOT_FOUND;
    }

    if (s_api_url[0] == '\0' || s_device_id[0] == '\0' || s_token[0] == '\0') {
        ESP_LOGW(TAG, "Cloud credentials are empty strings — cloud push disabled");
        return ESP_ERR_INVALID_STATE;
    }

    /* Read hardware identity (non-fatal — optional NVS keys) */
    _nvs_read_str(CLOUD_NVS_KEY_BOARD,   s_board,    sizeof(s_board));
    _nvs_read_str(CLOUD_NVS_KEY_HWREV,   s_hwrev,    sizeof(s_hwrev));
    _nvs_read_str(CLOUD_NVS_KEY_ROLE,    s_role,     sizeof(s_role));

    BaseType_t rc = xTaskCreate(
        _cloud_push_task,
        "cloud_push",
        9216,    /* stack: JSON + HTTP client buffers; increased from 6144 for 6-sink telemetry */
        NULL,
        5,       /* priority: below pipeline engine (default 10) */
        &s_task_handle
    );

    if (rc != pdPASS) {
        ESP_LOGE(TAG, "Failed to create cloud push task (no memory?)");
        return ESP_ERR_NO_MEM;
    }

    return ESP_OK;
}

void pds_cloud_push_stop(void)
{
    if (s_task_handle != NULL) {
        vTaskDelete(s_task_handle);
        s_task_handle = NULL;
        ESP_LOGI(TAG, "Cloud push task stopped");
    }
}
