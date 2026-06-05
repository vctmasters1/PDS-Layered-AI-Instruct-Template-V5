/**
 * @file pds_tel_sink.c
 * @brief Generic telemetry sink — live-state slot registry implementation.
 */

#include "pds_tel_sink.h"
#include <string.h>
#include "esp_log.h"

static const char *TAG = "tel_sink";

static pds_tel_slot_t s_slots[PDS_TEL_SINK_MAX_SLOTS];
static int            s_count = 0;

esp_err_t pds_tel_sink_register(const pds_tel_slot_t *slot)
{
    if (!slot) return ESP_ERR_INVALID_ARG;
    if (s_count >= PDS_TEL_SINK_MAX_SLOTS) {
        ESP_LOGW(TAG, "slot table full (%d), dropping %s", PDS_TEL_SINK_MAX_SLOTS, slot->label);
        return ESP_ERR_NO_MEM;
    }
    /* Deduplicate PERIPH slots: skip if same pin+field already registered */
    if (slot->kind == PDS_TEL_PERIPH) {
        for (int i = 0; i < s_count; i++) {
            if (s_slots[i].kind == PDS_TEL_PERIPH &&
                s_slots[i].periph.pin == slot->periph.pin &&
                strncmp(s_slots[i].periph.field, slot->periph.field, sizeof(s_slots[i].periph.field)) == 0) {
                ESP_LOGD(TAG, "periph slot pin=%u field=%s already registered — skipping",
                         slot->periph.pin, slot->periph.field);
                return ESP_OK;
            }
        }
    }
    s_slots[s_count++] = *slot;
    ESP_LOGI(TAG, "registered slot[%d] kind=%d pin=%u label=%s (count now %d)",
             s_count - 1, (int)slot->kind, slot->pin, slot->label, s_count);
    return ESP_OK;
}

void pds_tel_sink_clear(void)
{
    s_count = 0;
}

int pds_tel_sink_count(void)
{
    return s_count;
}

const pds_tel_slot_t *pds_tel_sink_get(int idx)
{
    if (idx < 0 || idx >= s_count) return NULL;
    return &s_slots[idx];
}

const float *pds_tel_sink_lookup(const char *key)
{
    if (!key || key[0] == '\0') return NULL;
    for (int i = 0; i < s_count; i++) {
        if (strncmp(s_slots[i].label, key, PDS_TEL_SINK_LABEL_SIZE) == 0) {
            switch (s_slots[i].kind) {
                case PDS_TEL_ADC:      return s_slots[i].adc.value;
                case PDS_TEL_PWM:      return s_slots[i].pwm.duty_pct;
                case PDS_TEL_PERIPH:   return s_slots[i].periph.value;
                case PDS_TEL_TIMER:    return s_slots[i].timer.active_f;
                case PDS_TEL_PIPELINE: return s_slots[i].pipeline.value;
                default:               return NULL;
            }
        }
    }
    return NULL;
}
