/**
 * pds_ui.c — Layer 4 blob loader and UI device dispatcher
 */

#include <string.h>
#include "esp_log.h"
#include "pds_ui.h"
#include "pds_ui_oled.h"

#define TAG "pds_ui"

#define PDS_UI_MAX_DEVICES 8

/* Registered device handles (index mirrors order parsed from L4 blob) */
static pds_ui_oled_handle_t s_handles[PDS_UI_MAX_DEVICES];
static uint8_t              s_dev_count = 0;

/* ── Init ──────────────────────────────────────────────────────────────── */

esp_err_t pds_ui_init(const uint8_t *l4_blob, size_t l4_len)
{
    if (!l4_blob || l4_len < sizeof(pds_ui_l4_hdr_t)) {
        ESP_LOGW(TAG, "no L4 blob — UI subsystem inactive");
        return ESP_OK;
    }

    const pds_ui_l4_hdr_t *hdr = (const pds_ui_l4_hdr_t *)l4_blob;

    if (hdr->magic != PDS_UI_L4_MAGIC) {
        ESP_LOGE(TAG, "bad magic 0x%08X", (unsigned)hdr->magic);
        return ESP_ERR_INVALID_ARG;
    }
    if (hdr->version != PDS_UI_L4_VERSION) {
        ESP_LOGE(TAG, "unsupported L4 version %u", hdr->version);
        return ESP_ERR_INVALID_VERSION;
    }

    const uint8_t *cursor = l4_blob + sizeof(pds_ui_l4_hdr_t);
    const uint8_t *end    = l4_blob + l4_len;
    s_dev_count = 0;

    for (uint8_t i = 0; i < hdr->dev_count; i++) {
        if (cursor + sizeof(pds_ui_dev_hdr_t) > end) {
            ESP_LOGE(TAG, "blob truncated at device record %u", i);
            return ESP_ERR_INVALID_SIZE;
        }

        const pds_ui_dev_hdr_t *dev = (const pds_ui_dev_hdr_t *)cursor;
        cursor += sizeof(pds_ui_dev_hdr_t);

        if (cursor + dev->data_len > end) {
            ESP_LOGE(TAG, "device %u data_len overruns blob", i);
            return ESP_ERR_INVALID_SIZE;
        }

        if (s_dev_count >= PDS_UI_MAX_DEVICES) {
            ESP_LOGW(TAG, "PDS_UI_MAX_DEVICES (%d) reached", PDS_UI_MAX_DEVICES);
            break;
        }

        esp_err_t err = ESP_ERR_NOT_SUPPORTED;
        switch (dev->dev_type) {
            case PDS_UI_DEV_OLED_SSD1306:
                err = pds_ui_oled_init(cursor, dev->data_len,
                                       &s_handles[s_dev_count]);
                break;
            default:
                ESP_LOGW(TAG, "unknown dev_type 0x%02X — skipping", dev->dev_type);
                break;
        }

        if (err == ESP_OK) {
            s_dev_count++;
        } else {
            ESP_LOGE(TAG, "device %u init failed: %s", i, esp_err_to_name(err));
        }

        cursor += dev->data_len;
    }

    ESP_LOGI(TAG, "%u UI device(s) initialised", s_dev_count);
    return ESP_OK;
}

/* ── Tick ──────────────────────────────────────────────────────────────── */

void pds_ui_tick(void)
{
    for (uint8_t i = 0; i < s_dev_count; i++) {
        if (s_handles[i]) {
            pds_ui_oled_tick(s_handles[i]);
        }
    }
}
