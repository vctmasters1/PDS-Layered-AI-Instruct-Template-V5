/**
 * PDS ADC HAL Implementation — shared across all ESP32 family targets.
 *
 * The ESP-IDF ADC oneshot API (adc_oneshot_new_unit, adc_oneshot_config_channel,
 * adc_oneshot_read) is identical on esp32, esp32c3, and esp32s3.
 *
 * Bitwidth differences per target:
 *   esp32:   9, 10, 11, 12-bit
 *   esp32c3: 12-bit only (ADC_BITWIDTH_DEFAULT)
 *   esp32s3: 12, 13-bit
 * The switch below maps to ADC_BITWIDTH_DEFAULT for unsupported widths,
 * letting the IDF driver choose the best available on that target.
 */

#pragma GCC diagnostic ignored "-Wformat"

#include "pds_adc.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"
#include "esp_log.h"

#ifndef TARGET_PLATFORM
#define TARGET_PLATFORM "ESP32"
#endif

static const char *TAG = "PDS_ADC_" TARGET_PLATFORM;

static adc_oneshot_unit_handle_t adc_handle      = NULL;
static adc_cali_handle_t         adc_cali_handle = NULL;

/* ESP32 ADC1 GPIO → channel map.
 * The role editor stores GPIO pin numbers; this converts them to the
 * ADC_CHANNEL_x enum value expected by the oneshot API.
 * If the value passed is already a valid channel (0–7) it is returned unchanged.
 * ADC2 pins (GPIO0/2/4/12–15/25–27) are NOT supported when WiFi is active. */
static int _gpio_to_adc1_channel(uint32_t gpio)
{
    static const struct { uint8_t gpio; uint8_t ch; } map[] = {
        {36, 0}, {37, 1}, {38, 2}, {39, 3},
        {32, 4}, {33, 5}, {34, 6}, {35, 7},
    };
    if (gpio <= 7) return (int)gpio;  /* already a channel number */
    for (int i = 0; i < (int)(sizeof(map)/sizeof(map[0])); i++) {
        if (gpio == map[i].gpio) return (int)map[i].ch;
    }
    return -1;  /* not an ADC1 pin */
}

esp_err_t PDS_ADC_init(void) {
    if (adc_handle != NULL) return ESP_OK;

    adc_oneshot_unit_init_cfg_t init_config = { .unit_id = ADC_UNIT_1 };
    esp_err_t ret = adc_oneshot_new_unit(&init_config, &adc_handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to init ADC unit: %s", esp_err_to_name(ret));
        return ret;
    }

    /* Calibration scheme selection:
     *   - ESP32 (Xtensa, original): line-fitting only    → ADC_CALI_SCHEME_LINE_FITTING_SUPPORTED
     *   - ESP32-C3, ESP32-S3:       curve-fitting only   → ADC_CALI_SCHEME_CURVE_FITTING_SUPPORTED
     * These macros are defined by esp_adc/adc_cali_scheme.h (already included above)
     * when the respective scheme header is pulled in for the current target. */
#if defined(ADC_CALI_SCHEME_CURVE_FITTING_SUPPORTED)
    adc_cali_curve_fitting_config_t cali_config = {
        .unit_id  = ADC_UNIT_1,
        .atten    = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_DEFAULT,
    };
    if (adc_cali_create_scheme_curve_fitting(&cali_config, &adc_cali_handle) != ESP_OK) {
        ESP_LOGW(TAG, "ADC calibration unavailable (non-fatal)");
        adc_cali_handle = NULL;
    }
#elif defined(ADC_CALI_SCHEME_LINE_FITTING_SUPPORTED)
    adc_cali_line_fitting_config_t cali_config = {
        .unit_id  = ADC_UNIT_1,
        .atten    = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_DEFAULT,
    };
    if (adc_cali_create_scheme_line_fitting(&cali_config, &adc_cali_handle) != ESP_OK) {
        ESP_LOGW(TAG, "ADC calibration unavailable (non-fatal)");
        adc_cali_handle = NULL;
    }
#else
    ESP_LOGW(TAG, "No ADC calibration scheme available for this target");
    adc_cali_handle = NULL;
#endif

    ESP_LOGI(TAG, "ADC subsystem initialized");
    return ESP_OK;
}

esp_err_t PDS_ADC_configure(uint32_t channel, pds_adc_atten_t atten, pds_adc_width_t width) {
    if (adc_handle == NULL) {
        esp_err_t r = PDS_ADC_init();
        if (r != ESP_OK) return r;
    }

    adc_atten_t esp_atten;
    switch (atten) {
        case PDS_ADC_ATTEN_DB_0:   esp_atten = ADC_ATTEN_DB_0;   break;
        case PDS_ADC_ATTEN_DB_2_5: esp_atten = ADC_ATTEN_DB_2_5; break;
        case PDS_ADC_ATTEN_DB_6:   esp_atten = ADC_ATTEN_DB_6;   break;
        case PDS_ADC_ATTEN_DB_11:  esp_atten = ADC_ATTEN_DB_12;  break;  /* DB_11 deprecated alias for DB_12 in IDF 5.x */
        default: return ESP_ERR_INVALID_ARG;
    }

    /* ADC_BITWIDTH_DEFAULT lets the IDF pick the best resolution for the
     * target chip — safe fallback for widths not natively supported. */
    adc_bitwidth_t esp_width;
    switch (width) {
        case PDS_ADC_WIDTH_BIT_9:  esp_width = ADC_BITWIDTH_9;   break;
        case PDS_ADC_WIDTH_BIT_10: esp_width = ADC_BITWIDTH_10;  break;
        case PDS_ADC_WIDTH_BIT_12: esp_width = ADC_BITWIDTH_12;  break;
        default:                   esp_width = ADC_BITWIDTH_DEFAULT; break;
    }

    int ch = _gpio_to_adc1_channel(channel);
    if (ch < 0) {
        ESP_LOGE(TAG, "GPIO %u is not an ADC1 pin (ADC2 unsupported with WiFi)", channel);
        return ESP_ERR_INVALID_ARG;
    }
    adc_oneshot_chan_cfg_t cfg = { .bitwidth = esp_width, .atten = esp_atten };
    esp_err_t ret = adc_oneshot_config_channel(adc_handle, (adc_channel_t)ch, &cfg);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "ADC GPIO %u (ch%d) config failed: %s", channel, ch, esp_err_to_name(ret));
    }
    return ret;
}

int PDS_ADC_read(uint32_t channel) {
    if (adc_handle == NULL) return -1;
    int ch = _gpio_to_adc1_channel(channel);
    if (ch < 0) return -1;
    int val = 0;
    return (adc_oneshot_read(adc_handle, (adc_channel_t)ch, &val) == ESP_OK) ? val : -1;
}

int PDS_ADC_read_average(uint32_t channel, uint32_t samples) {
    if (adc_handle == NULL || samples == 0) return -1;
    int sum = 0;
    for (uint32_t i = 0; i < samples; i++) {
        int r = PDS_ADC_read(channel);
        if (r < 0) return -1;
        sum += r;
    }
    return sum / (int)samples;
}

esp_err_t PDS_ADC_calibrate(uint32_t channel) {
    (void)channel;
    return ESP_OK;
}

int PDS_ADC_raw_to_mv(uint32_t channel, int raw_value) {
    (void)channel;
    if (adc_cali_handle == NULL) return -1;
    int mv = 0;
    return (adc_cali_raw_to_voltage(adc_cali_handle, raw_value, &mv) == ESP_OK) ? mv : -1;
}
