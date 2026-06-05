/* pds_adc_registry.c — ADC channel registry implementation
 * See pds_hal/registries/AI-INSTRUCT.md for architecture.
 */

#include "pds_adc_registry.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "adc_reg";

static pds_adc_reg_entry_t s_entries[PDS_ADC_REG_MAX_CHANNELS];
static uint8_t s_count = 0;

static pds_adc_reg_entry_t *_find(uint32_t channel)
{
    for (uint8_t i = 0; i < s_count; i++) {
        if (s_entries[i].channel == channel) return &s_entries[i];
    }
    return NULL;
}

esp_err_t pds_adc_reg_register(uint32_t channel,
                                pds_adc_atten_t atten, pds_adc_width_t width,
                                pds_adc_read_fn_t read_fn,
                                pds_adc_raw_to_mv_fn_t to_mv_fn,
                                const char *label)
{
    if (!read_fn) return ESP_ERR_INVALID_ARG;

    pds_adc_reg_entry_t *e = _find(channel);
    if (!e) {
        if (s_count >= PDS_ADC_REG_MAX_CHANNELS) {
            ESP_LOGE(TAG, "Registry full (max %d)", PDS_ADC_REG_MAX_CHANNELS);
            return ESP_ERR_NO_MEM;
        }
        e = &s_entries[s_count++];
    }

    /* Configure the hardware channel (idempotent on re-register). */
    esp_err_t ret = PDS_ADC_configure(channel, atten, width);
    if (ret != ESP_OK) return ret;

    e->channel    = channel;
    e->read_fn    = read_fn;
    e->to_mv_fn   = to_mv_fn;
    e->registered = true;
    strncpy(e->label, label ? label : "", sizeof(e->label) - 1);
    e->label[sizeof(e->label) - 1] = '\0';

    ESP_LOGI(TAG, "Channel %u registered ('%s')", (unsigned)channel, e->label);
    return ESP_OK;
}

esp_err_t pds_adc_reg_register_ext(uint32_t channel,
                                    pds_adc_read_fn_t read_fn,
                                    pds_adc_raw_to_mv_fn_t to_mv_fn,
                                    const char *label)
{
    if (!read_fn) return ESP_ERR_INVALID_ARG;

    pds_adc_reg_entry_t *e = _find(channel);
    if (!e) {
        if (s_count >= PDS_ADC_REG_MAX_CHANNELS) {
            ESP_LOGE(TAG, "Registry full (max %d)", PDS_ADC_REG_MAX_CHANNELS);
            return ESP_ERR_NO_MEM;
        }
        e = &s_entries[s_count++];
    }

    /* External ADC — no PDS_ADC_configure() call; hardware is pre-initialised. */
    e->channel    = channel;
    e->read_fn    = read_fn;
    e->to_mv_fn   = to_mv_fn;
    e->registered = true;
    strncpy(e->label, label ? label : "", sizeof(e->label) - 1);
    e->label[sizeof(e->label) - 1] = '\0';

    ESP_LOGI(TAG, "External channel %u registered ('%s')", (unsigned)channel, e->label);
    return ESP_OK;
}

esp_err_t pds_adc_reg_read(uint32_t channel, uint8_t samples,
                            int32_t *raw_out, int32_t *mv_out)
{
    pds_adc_reg_entry_t *e = _find(channel);
    if (!e || !e->read_fn) return ESP_ERR_INVALID_ARG;

    if (samples < 1)  samples = 1;
    if (samples > 64) samples = 64;

    int32_t sum = 0;
    for (uint8_t i = 0; i < samples; i++) {
        int v = e->read_fn(channel);
        if (v < 0) return ESP_FAIL;
        sum += v;
    }
    int32_t raw = sum / (int32_t)samples;
    int32_t mv  = e->to_mv_fn ? (int32_t)e->to_mv_fn(channel, (int)raw) : raw;

    e->cached_raw = raw;
    e->cached_mv  = mv;
    e->valid      = true;

    if (raw_out) *raw_out = raw;
    if (mv_out)  *mv_out  = mv;
    return ESP_OK;
}

int pds_adc_reg_raw_to_mv(uint32_t channel, int raw)
{
    pds_adc_reg_entry_t *e = _find(channel);
    if (!e || !e->to_mv_fn) return raw;
    return e->to_mv_fn(channel, raw);
}

int32_t pds_adc_reg_get_cached_raw(uint32_t channel)
{
    pds_adc_reg_entry_t *e = _find(channel);
    return e ? e->cached_raw : 0;
}

int32_t pds_adc_reg_get_cached_mv(uint32_t channel)
{
    pds_adc_reg_entry_t *e = _find(channel);
    return e ? e->cached_mv : 0;
}

bool pds_adc_reg_is_valid(uint32_t channel)
{
    pds_adc_reg_entry_t *e = _find(channel);
    return e ? e->valid : false;
}

void pds_adc_reg_refresh_all(void)
{
    /* Single-sample sweep — called once per pipeline tick before engine evaluation. */
    for (uint8_t i = 0; i < s_count; i++) {
        pds_adc_reg_entry_t *e = &s_entries[i];
        if (!e->registered || !e->read_fn) continue;
        int v = e->read_fn(e->channel);
        if (v < 0) continue;
        e->cached_raw = (int32_t)v;
        e->cached_mv  = e->to_mv_fn ? (int32_t)e->to_mv_fn(e->channel, v) : (int32_t)v;
        e->valid      = true;
    }
}

uint8_t pds_adc_reg_get_count(void)
{
    return s_count;
}

const pds_adc_reg_entry_t *pds_adc_reg_get_all(uint8_t *count_out)
{
    if (count_out) *count_out = s_count;
    return s_entries;
}
