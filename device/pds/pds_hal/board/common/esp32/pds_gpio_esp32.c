/**
 * PDS GPIO HAL Implementation — shared across all ESP32 family targets.
 *
 * gpio_config(), gpio_set_level(), gpio_get_level(), and the ISR service API
 * are identical on esp32, esp32c3, and esp32s3.
 */

#pragma GCC diagnostic ignored "-Wformat"

#include "pds_gpio.h"
#include "driver/gpio.h"
#include "esp_log.h"

#ifndef TARGET_PLATFORM
#define TARGET_PLATFORM "ESP32"
#endif

static const char *TAG = "PDS_GPIO_" TARGET_PLATFORM;

/* ── Output level cache ──────────────────────────────────────────────────── */
/* Tracks the last written level for each GPIO output pin so that
 * PDS_GPIO_get_output_level() can return the driven state without
 * requiring GPIO_MODE_INPUT_OUTPUT (which enables the input buffer). */
#define GPIO_CACHE_PINS 40
static uint8_t s_output_cache[GPIO_CACHE_PINS];  /* 0 or 1 per pin */

esp_err_t PDS_GPIO_init(void) {
    esp_err_t ret = gpio_install_isr_service(0);
    if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "Failed to install GPIO ISR service: %s", esp_err_to_name(ret));
        return ret;
    }
    ESP_LOGI(TAG, "GPIO subsystem initialized");
    return ESP_OK;
}

esp_err_t PDS_GPIO_configure(uint32_t pin, pds_gpio_mode_t mode, pds_gpio_pull_t pull) {
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << pin),
        .mode         = GPIO_MODE_DISABLE,
        .pull_up_en   = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type    = GPIO_INTR_DISABLE,
    };
    switch (mode) {
        case PDS_GPIO_MODE_INPUT:        io_conf.mode = GPIO_MODE_INPUT;        break;
        case PDS_GPIO_MODE_OUTPUT:       io_conf.mode = GPIO_MODE_OUTPUT;       break;
        case PDS_GPIO_MODE_INPUT_OUTPUT: io_conf.mode = GPIO_MODE_INPUT_OUTPUT; break;
        default: return ESP_ERR_INVALID_ARG;
    }
    switch (pull) {
        case PDS_GPIO_PULL_NONE: break;
        case PDS_GPIO_PULL_UP:   io_conf.pull_up_en   = GPIO_PULLUP_ENABLE;   break;
        case PDS_GPIO_PULL_DOWN: io_conf.pull_down_en = GPIO_PULLDOWN_ENABLE; break;
        default: return ESP_ERR_INVALID_ARG;
    }
    esp_err_t ret = gpio_config(&io_conf);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "GPIO pin %u config failed: %s", pin, esp_err_to_name(ret));
    }
    return ret;
}

esp_err_t PDS_GPIO_write(uint32_t pin, uint32_t level) {
    if (pin < GPIO_CACHE_PINS) s_output_cache[pin] = (uint8_t)(level ? 1 : 0);
    return gpio_set_level(pin, level ? 1 : 0);
}

int PDS_GPIO_read(uint32_t pin) {
    return gpio_get_level(pin);
}

int PDS_GPIO_get_output_level(uint32_t pin) {
    if (pin >= GPIO_CACHE_PINS) return 0;
    return (int)s_output_cache[pin];
}

esp_err_t PDS_GPIO_set_interrupt(uint32_t pin, pds_gpio_intr_t intr_type,
                                  void (*handler)(void *), void *arg) {
    PDS_GPIO_init();  /* idempotent — ensures ISR service is running */

    gpio_int_type_t esp_intr;
    switch (intr_type) {
        case PDS_GPIO_INTR_DISABLE: esp_intr = GPIO_INTR_DISABLE; break;
        case PDS_GPIO_INTR_POSEDGE: esp_intr = GPIO_INTR_POSEDGE; break;
        case PDS_GPIO_INTR_NEGEDGE: esp_intr = GPIO_INTR_NEGEDGE; break;
        case PDS_GPIO_INTR_ANYEDGE: esp_intr = GPIO_INTR_ANYEDGE; break;
        default: return ESP_ERR_INVALID_ARG;
    }
    esp_err_t ret = gpio_set_intr_type(pin, esp_intr);
    if (ret != ESP_OK) return ret;
    if (handler != NULL) {
        ret = gpio_isr_handler_add(pin, (gpio_isr_t)handler, arg);
    }
    return ret;
}

esp_err_t PDS_GPIO_disable_interrupt(uint32_t pin) {
    gpio_set_intr_type(pin, GPIO_INTR_DISABLE);
    gpio_isr_handler_remove(pin);
    return ESP_OK;
}
