/**
 * @file pds_platform_main.c
 * @brief Shared platform implementation of pds_platform_init() / pds_platform_loop()
 *        for all ESP32-family targets (esp32, esp32c3, esp32s3).
 *
 * This file is compiled once per target via CMakeLists.txt. No target-specific
 * code lives here — peripheral differences are handled inside the HAL drivers.
 */

#include <stdlib.h>
#include <string.h>
#include <inttypes.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_err.h"
#include "esp_timer.h"
#include "nvs_flash.h"
#include "esp_partition.h"

#include "pds_platform.h"
#include "pds_types.h"
#include "pds_adc_registry.h"   /* pre-sweep: pds_adc_reg_refresh_all()   */
#include "pds_gpio_registry.h" /* pre-sweep: pds_gpio_reg_refresh_inputs() */

/* ── Forward declarations — resolved at link time ──────────────────────────
 * Using externs instead of includes avoids circular component dependencies:
 *   pds_hal → pds_pipeline → pds_fb → pds_hal  (would be circular)
 */
extern esp_err_t pds_device_nvs_init(void);
extern esp_err_t pds_device_nvs_read_blob(const char *key, uint8_t **out_buf, size_t *out_len);
extern esp_err_t pds_device_nvs_write_blob(const char *key, const uint8_t *buf, size_t len);
extern esp_err_t pds_telemetry_init(void);
extern esp_err_t pds_device_wifi_init(void);
extern esp_err_t pds_role_init(void);    /* generated per-role: usrset defaults + telemetry provider */extern esp_err_t pds_ui_init(const uint8_t *l4_blob, size_t l4_len);  /* pds_ui — OLED/display */
extern void      pds_ui_tick(void);
extern esp_err_t pds_pipeline_engine_load(
    const uint8_t *l1, size_t l1_len,
    const uint8_t *l2, size_t l2_len,
    const uint8_t *l3, size_t l3_len);
extern void     pds_pipeline_engine_tick(void);
extern uint32_t pds_pipeline_engine_get_update_rate_ms(void);
extern bool     pds_pipeline_engine_is_loaded(void);

#ifndef TARGET_PLATFORM
#define TARGET_PLATFORM "ESP32"
#endif

static const char *TAG = "PDS_PLATFORM_" TARGET_PLATFORM;

#define DEFAULT_TICK_RATE_MS 1000u

static uint32_t s_tick_rate_ms = DEFAULT_TICK_RATE_MS;
static int64_t  s_last_tick_us = 0;

/* ── Raw partition fallback ───────────────────────────────────────────────── */
/*
 * Try to read a length-prefixed blob from a raw data partition.
 * Format: [uint32_t LE length][blob bytes...]
 * Written by headless_flash.py --l1l2l3.
 * On success, seeds NVS so subsequent boots go the fast path.
 */
static esp_err_t _read_raw_partition(const char *part_name, const char *nvs_key,
                                      uint8_t **out_buf, size_t *out_len)
{
    const esp_partition_t *p = esp_partition_find_first(
        ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY, part_name);
    if (!p) {
        ESP_LOGW(TAG, "Raw partition '%s' not found", part_name);
        return ESP_ERR_NOT_FOUND;
    }

    uint32_t data_len = 0;
    esp_err_t ret = esp_partition_read(p, 0, &data_len, sizeof(data_len));
    if (ret != ESP_OK || data_len == 0 || data_len > p->size - sizeof(data_len)) {
        ESP_LOGW(TAG, "Raw partition '%s': bad length header (0x%08" PRIx32 ")", part_name, data_len);
        return ESP_ERR_INVALID_SIZE;
    }

    uint8_t *buf = malloc(data_len);
    if (!buf) return ESP_ERR_NO_MEM;

    ret = esp_partition_read(p, sizeof(data_len), buf, data_len);
    if (ret != ESP_OK) {
        free(buf);
        return ret;
    }

    /* Seed NVS so next boot skips the raw-partition read */
    esp_err_t nvs_ret = pds_device_nvs_write_blob(nvs_key, buf, data_len);
    if (nvs_ret == ESP_OK) {
        ESP_LOGI(TAG, "Seeded NVS key '%s' from raw partition '%s' (%"PRIu32" B)",
                 nvs_key, part_name, data_len);
    } else {
        ESP_LOGW(TAG, "NVS seed for '%s' failed: %s (continuing anyway)", nvs_key, esp_err_to_name(nvs_ret));
    }

    *out_buf = buf;
    *out_len = (size_t)data_len;
    return ESP_OK;
}

/* ── pds_platform_init ────────────────────────────────────────────────────── */

pds_err_t pds_platform_init(void)
{
    ESP_LOGI(TAG, "Platform init starting...");

    /* NVS flash — must be first */
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "NVS partition worn/versioned — erasing and reinitialising");
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);
    ESP_ERROR_CHECK(pds_device_nvs_init());

    /* Telemetry subsystem (HTTP /status) */
    pds_telemetry_init();

    /* Role init — loads usrset defaults and registers the telemetry provider.
     * pds_role_init() is defined in the role-generated pds_process_action.c,
     * compiled from Device/pds/pds_hal/platform/<target>/<hwrev>/<role>/. */
    ret = pds_role_init();
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "pds_role_init: %s — continuing", esp_err_to_name(ret));
    }

    /* Load 3-layer pipeline blobs: NVS first, fall back to raw partitions */
    uint8_t *l1 = NULL, *l2 = NULL, *l3 = NULL;
    size_t   l1_len = 0,  l2_len = 0,  l3_len = 0;

    esp_err_t r1 = pds_device_nvs_read_blob("pipeline", &l1, &l1_len);
    esp_err_t r2 = pds_device_nvs_read_blob("hw_vars",  &l2, &l2_len);
    esp_err_t r3 = pds_device_nvs_read_blob("settings", &l3, &l3_len);

    if (r1 != ESP_OK || r2 != ESP_OK || r3 != ESP_OK) {
        ESP_LOGI(TAG, "NVS pipeline missing — trying raw partitions (pds_l1/l2/l3)");
        free(l1); free(l2); free(l3);
        l1 = l2 = l3 = NULL; l1_len = l2_len = l3_len = 0;
        r1 = _read_raw_partition("pds_l1", "pipeline", &l1, &l1_len);
        r2 = _read_raw_partition("pds_l2", "hw_vars",  &l2, &l2_len);
        r3 = _read_raw_partition("pds_l3", "settings", &l3, &l3_len);
    }

    if (r1 == ESP_OK && r2 == ESP_OK && r3 == ESP_OK) {
        ret = pds_pipeline_engine_load(l1, l1_len, l2, l2_len, l3, l3_len);
        if (ret == ESP_OK) {
            s_tick_rate_ms = pds_pipeline_engine_get_update_rate_ms();
            ESP_LOGI(TAG, "Pipeline loaded — tick rate: %lums", (unsigned long)s_tick_rate_ms);
        } else {
            ESP_LOGW(TAG, "Pipeline load failed: %s — waiting for fresh upload", esp_err_to_name(ret));
        }
    } else {
        ESP_LOGI(TAG, "No pipeline in NVS — waiting for upload via HTTP");
    }

    free(l1);
    free(l2);
    free(l3);

    /* UI subsystem (OLED and other display devices) — conditional on L4 blob presence.
     * Must be called AFTER pipeline load so telemetry sinks are registered first.
     * Raw partition takes priority over NVS: L4 has no cloud-push path (unlike L1-L3),
     * so the raw partition is the only update mechanism and must always win. */
    uint8_t *l4 = NULL;
    size_t   l4_len = 0;
    esp_err_t r4 = _read_raw_partition("pds_l4", "ui_params", &l4, &l4_len);
    if (r4 != ESP_OK) {
        r4 = pds_device_nvs_read_blob("ui_params", &l4, &l4_len);
    }
    pds_ui_init(l4, (r4 == ESP_OK) ? l4_len : 0);  /* no-op when blob absent */
    free(l4);

    /* Network (WiFi → HTTP server once connected) */
    ret = pds_device_wifi_init();
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "WiFi init error: %s — continuing without network", esp_err_to_name(ret));
    }

    ESP_LOGI(TAG, "Platform init complete");
    return PDS_OK;
}

/* ── pds_platform_loop ────────────────────────────────────────────────────── */

pds_err_t pds_platform_loop(void)
{
    pds_ui_tick();  /* drive display render timers regardless of pipeline state */

    if (!pds_pipeline_engine_is_loaded()) {
        return PDS_OK;
    }

    int64_t now_us  = esp_timer_get_time();
    int64_t elapsed = (now_us - s_last_tick_us) / 1000LL;

    if (elapsed >= (int64_t)s_tick_rate_ms) {
        /* Pre-sweep: sample all registered peripherals once before evaluating pipelines.
         * Ensures every block in the same tick sees the same sensor snapshot. */
        pds_adc_reg_refresh_all();
        pds_gpio_reg_refresh_inputs();
        pds_pipeline_engine_tick();
        s_last_tick_us = now_us;
    }

    return PDS_OK;
}
