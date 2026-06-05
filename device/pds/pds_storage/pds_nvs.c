#include "pds_nvs.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "esp_log.h"
#include "string.h"

static const char *TAG = "pds_NVS";
static nvs_handle_t _nvs_handle = 0;

esp_err_t pds_device_nvs_init(void) {
    esp_err_t ret = nvs_open(pds_NVS_NAMESPACE, NVS_READWRITE, &_nvs_handle);
    
    if (ret == ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGW(TAG, "NVS namespace not found, will be created on first write");
        ret = nvs_open(pds_NVS_NAMESPACE, NVS_READWRITE, &_nvs_handle);
    }
    
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open NVS: %s", esp_err_to_name(ret));
        return ret;
    }
    
    ESP_LOGI(TAG, "NVS subsystem initialized");
    return ESP_OK;
}

esp_err_t pds_device_nvs_load_pins(pds_pin_def_t *pin_table, uint8_t max_pins, uint8_t *pins_loaded) {
    if (!pin_table || !pins_loaded || !_nvs_handle) {
        return ESP_ERR_INVALID_ARG;
    }
    
    // Try to read the number of pins stored
    uint8_t saved_pin_count = 0;
    esp_err_t ret = nvs_get_u8(_nvs_handle, "pin_count", &saved_pin_count);
    
    if (ret == ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGI(TAG, "No saved pin configuration found");
        *pins_loaded = 0;
        return ESP_ERR_NVS_NOT_FOUND;
    }
    
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to read pin count: %s", esp_err_to_name(ret));
        return ret;
    }
    
    if (saved_pin_count > max_pins) {
        saved_pin_count = max_pins;
        ESP_LOGW(TAG, "Saved pin count exceeds max, loading %d pins", max_pins);
    }
    
    // Read the pin table blob
    size_t blob_size = sizeof(pds_pin_def_t) * saved_pin_count;
    ret = nvs_get_blob(_nvs_handle, pds_NVS_KEY_PIN_TABLE, pin_table, &blob_size);
    
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to read pin table: %s", esp_err_to_name(ret));
        return ret;
    }
    
    *pins_loaded = saved_pin_count;
    ESP_LOGI(TAG, "Loaded %d pins from NVS", saved_pin_count);
    return ESP_OK;
}

esp_err_t pds_device_nvs_save_pins(const pds_pin_def_t *pin_table, uint8_t pin_count) {
    if (!pin_table || !_nvs_handle) {
        return ESP_ERR_INVALID_ARG;
    }
    
    // Save the pin count
    esp_err_t ret = nvs_set_u8(_nvs_handle, "pin_count", pin_count);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save pin count: %s", esp_err_to_name(ret));
        return ret;
    }
    
    // Save the pin table
    size_t blob_size = sizeof(pds_pin_def_t) * pin_count;
    ret = nvs_set_blob(_nvs_handle, pds_NVS_KEY_PIN_TABLE, (void *)pin_table, blob_size);
    
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save pin table: %s", esp_err_to_name(ret));
        return ret;
    }
    
    // Commit changes
    ret = nvs_commit(_nvs_handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to commit NVS: %s", esp_err_to_name(ret));
        return ret;
    }
    
    ESP_LOGI(TAG, "Saved %d pins to NVS", pin_count);
    return ESP_OK;
}

esp_err_t pds_device_nvs_load_adc_calibration(void *calib_data, uint32_t calib_size) {
    if (!calib_data || !_nvs_handle) {
        return ESP_ERR_INVALID_ARG;
    }
    
    size_t blob_size = calib_size;
    esp_err_t ret = nvs_get_blob(_nvs_handle, pds_NVS_KEY_ADC_CALIBRATION, calib_data, &blob_size);
    
    if (ret == ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGI(TAG, "No saved ADC calibration found");
        return ESP_ERR_NVS_NOT_FOUND;
    }
    
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to load ADC calibration: %s", esp_err_to_name(ret));
        return ret;
    }
    
    ESP_LOGI(TAG, "Loaded ADC calibration (%zu bytes)", blob_size);
    return ESP_OK;
}

esp_err_t pds_device_nvs_save_adc_calibration(const void *calib_data, uint32_t calib_size) {
    if (!calib_data || !_nvs_handle) {
        return ESP_ERR_INVALID_ARG;
    }
    
    esp_err_t ret = nvs_set_blob(_nvs_handle, pds_NVS_KEY_ADC_CALIBRATION, (void *)calib_data, calib_size);
    
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save ADC calibration: %s", esp_err_to_name(ret));
        return ret;
    }
    
    ret = nvs_commit(_nvs_handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to commit ADC calibration: %s", esp_err_to_name(ret));
        return ret;
    }
    
    ESP_LOGI(TAG, "Saved ADC calibration (%lu bytes)", calib_size);
    return ESP_OK;
}

esp_err_t pds_device_nvs_save_blob(const char *key, const void *value, uint32_t size) {
    if (!key || !value || !_nvs_handle) {
        return ESP_ERR_INVALID_ARG;
    }
    
    esp_err_t ret = nvs_set_blob(_nvs_handle, key, (void *)value, size);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save blob '%s': %s", key, esp_err_to_name(ret));
        return ret;
    }
    
    ret = nvs_commit(_nvs_handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to commit blob: %s", esp_err_to_name(ret));
        return ret;
    }
    
    return ESP_OK;
}

esp_err_t pds_device_nvs_load_blob(const char *key, void *value, uint32_t *size) {
    if (!key || !value || !size || !_nvs_handle) {
        return ESP_ERR_INVALID_ARG;
    }
    
    size_t blob_size = *size;
    esp_err_t ret = nvs_get_blob(_nvs_handle, key, value, &blob_size);
    
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to load blob '%s': %s", key, esp_err_to_name(ret));
        return ret;
    }
    
    *size = (uint32_t)blob_size;
    return ESP_OK;
}

esp_err_t pds_device_nvs_read_blob(const char *key, uint8_t **out_buf, size_t *out_len)
{
    if (!key || !out_buf || !out_len || !_nvs_handle) {
        return ESP_ERR_INVALID_ARG;
    }
    /* First call: get required size */
    size_t required = 0;
    esp_err_t ret = nvs_get_blob(_nvs_handle, key, NULL, &required);
    if (ret == ESP_ERR_NVS_NOT_FOUND) {
        *out_buf = NULL;
        *out_len = 0;
        return ESP_ERR_NVS_NOT_FOUND;
    }
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "nvs_get_blob size query '%s': %s", key, esp_err_to_name(ret));
        return ret;
    }
    uint8_t *buf = malloc(required);
    if (!buf) {
        return ESP_ERR_NO_MEM;
    }
    ret = nvs_get_blob(_nvs_handle, key, buf, &required);
    if (ret != ESP_OK) {
        free(buf);
        ESP_LOGE(TAG, "nvs_get_blob read '%s': %s", key, esp_err_to_name(ret));
        return ret;
    }
    *out_buf = buf;
    *out_len = required;
    return ESP_OK;
}

esp_err_t pds_device_nvs_write_blob(const char *key, const uint8_t *buf, size_t len)
{
    return pds_device_nvs_save_blob(key, buf, (uint32_t)len);
}

esp_err_t pds_device_nvs_read_str(const char *key, char *buf, size_t buf_len)
{
    if (!key || !buf || !buf_len || !_nvs_handle) {
        return ESP_ERR_INVALID_ARG;
    }
    size_t len = buf_len;
    esp_err_t ret = nvs_get_str(_nvs_handle, key, buf, &len);
    if (ret != ESP_OK && ret != ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGE(TAG, "nvs_get_str '%s': %s", key, esp_err_to_name(ret));
    }
    return ret;
}

esp_err_t pds_device_nvs_write_str(const char *key, const char *value)
{
    if (!key || !value || !_nvs_handle) {
        return ESP_ERR_INVALID_ARG;
    }
    esp_err_t ret = nvs_set_str(_nvs_handle, key, value);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "nvs_set_str '%s': %s", key, esp_err_to_name(ret));
        return ret;
    }
    ret = nvs_commit(_nvs_handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "nvs_commit after write_str '%s': %s", key, esp_err_to_name(ret));
    }
    return ret;
}

esp_err_t pds_device_nvs_clear_all(void) {
    if (!_nvs_handle) {
        return ESP_ERR_INVALID_ARG;
    }
    
    esp_err_t ret = nvs_erase_all(_nvs_handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to erase NVS: %s", esp_err_to_name(ret));
        return ret;
    }
    
    ret = nvs_commit(_nvs_handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to commit NVS erase: %s", esp_err_to_name(ret));
        return ret;
    }
    
    ESP_LOGI(TAG, "Cleared all NVS data");
    return ESP_OK;
}

esp_err_t pds_device_nvs_get_stats(uint32_t *total_size, uint32_t *used_size) {
    if (!_nvs_handle || !total_size || !used_size) {
        return ESP_ERR_INVALID_ARG;
    }
    
    // Note: ESP-IDF doesn't provide direct NVS size queries
    // These are placeholder values; actual implementation would need
    // to track or calculate from individual key sizes
    *total_size = 65536;  // Typical NVS partition size (64KB)
    *used_size = 0;       // Would need to enumerate and sum keys
    
    ESP_LOGI(TAG, "NVS stats - Total: %lu, Used: %lu", *total_size, *used_size);
    return ESP_OK;
}

