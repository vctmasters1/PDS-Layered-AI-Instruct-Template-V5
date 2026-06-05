/* ec_001.c — Analog EC/PPM probe HAL driver (rev 001)
 * Configures the ESP32 built-in ADC for an EC/PPM electrode and provides
 * raw-count and millivolt read primitives.
 * Calibration, temp compensation, and pipeline lifecycle are handled by pds_fb_sensor_ec.c.
 */

#include "ec_001.h"
#include "pds_adc.h"
#include "esp_log.h"

static const char *TAG = "ec_001";

esp_err_t ec_001_configure(uint8_t adc_channel)
{
    esp_err_t ret = PDS_ADC_configure(
        (uint32_t)adc_channel,
        PDS_ADC_ATTEN_DB_11,
        PDS_ADC_WIDTH_BIT_12);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "ADC configure ch%u failed: %s",
                 (unsigned)adc_channel, esp_err_to_name(ret));
    }
    return ret;
}

esp_err_t ec_001_read_raw(uint8_t adc_channel, uint8_t count, int32_t *out_raw)
{
    if (!out_raw) return ESP_ERR_INVALID_ARG;
    if (count < 1)  count = 1;
    if (count > 64) count = 64;

    int64_t sum = 0;
    for (uint8_t i = 0; i < count; i++) {
        int sample = PDS_ADC_read((uint32_t)adc_channel);
        if (sample < 0) {
            ESP_LOGW(TAG, "ec_001 ADC read ch%u failed (sample %u)",
                     (unsigned)adc_channel, (unsigned)i);
            return ESP_FAIL;
        }
        sum += sample;
    }
    *out_raw = (int32_t)(sum / count);
    return ESP_OK;
}

int ec_001_raw_to_mv(uint8_t adc_channel, int32_t raw)
{
    return PDS_ADC_raw_to_mv((uint32_t)adc_channel, (int)raw);
}
