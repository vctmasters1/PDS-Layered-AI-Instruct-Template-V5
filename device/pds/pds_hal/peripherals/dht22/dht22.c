/* dht22.c — DHT22 / AM2302 single-wire bit-bang driver
 * Protocol extracted from pds_fb_dht22.c — see that file for pipeline lifecycle.
 */

#include "dht22.h"
#include "driver/gpio.h"
#include "esp_rom_sys.h"
#include "freertos/FreeRTOS.h"
#include "freertos/portmacro.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "dht22";

/* ── Internal helpers ───────────────────────────────────────────────────── */

/* Wait for pin to reach target level, up to timeout_us µs.
 * Returns elapsed µs, or -1 on timeout.  Must run inside a critical section. */
static int _wait_for_level(int pin, int target, int timeout_us)
{
    int elapsed = 0;
    while (gpio_get_level(pin) != target) {
        if (elapsed >= timeout_us) return -1;
        esp_rom_delay_us(1);
        elapsed++;
    }
    return elapsed;
}

/* ── Public API ─────────────────────────────────────────────────────────── */

void dht22_configure_pin(int pin)
{
    gpio_config_t cfg = {
        .pin_bit_mask = (1ULL << pin),
        .mode         = GPIO_MODE_INPUT,
        .pull_up_en   = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type    = GPIO_INTR_DISABLE,
    };
    gpio_config(&cfg);
}

esp_err_t dht22_read(int pin, float *temp_c, float *humid)
{
    uint8_t data[5] = {0};

    /* Start signal: pull low ≥ 1 ms, release */
    gpio_set_direction((gpio_num_t)pin, GPIO_MODE_OUTPUT_OD);
    gpio_set_level((gpio_num_t)pin, 0);
    esp_rom_delay_us(1200);                   /* 1.2 ms — well above 1 ms minimum */
    gpio_set_level((gpio_num_t)pin, 1);
    esp_rom_delay_us(30);
    gpio_set_direction((gpio_num_t)pin, GPIO_MODE_INPUT);

    /* Critical section — microsecond timing from here */
    portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
    portENTER_CRITICAL(&mux);

    /* DHT22 response: low ~80 µs, then high ~80 µs */
    if (_wait_for_level(pin, 0, 100) < 0) goto timeout;
    if (_wait_for_level(pin, 1, 100) < 0) goto timeout;
    if (_wait_for_level(pin, 0, 100) < 0) goto timeout;

    /* Read 40 bits (8 hum-int, 8 hum-dec, 8 temp-int, 8 temp-dec, 8 checksum) */
    for (int i = 0; i < 40; i++) {
        if (_wait_for_level(pin, 1, 70) < 0) goto timeout;
        esp_rom_delay_us(40);          /* sample at 40 µs: 0=gone (<28 µs), 1=still high (70 µs) */
        int bit = gpio_get_level(pin);
        if (_wait_for_level(pin, 0, 80) < 0) goto timeout;
        data[i / 8] = (uint8_t)((data[i / 8] << 1) | (uint8_t)bit);
    }

    portEXIT_CRITICAL(&mux);

    /* Checksum */
    uint8_t checksum = (uint8_t)(data[0] + data[1] + data[2] + data[3]);
    if (checksum != data[4]) {
        ESP_LOGW(TAG, "CRC mismatch: calc=0x%02X got=0x%02X", checksum, data[4]);
        return ESP_ERR_INVALID_CRC;
    }

    /* Decode */
    uint16_t raw_humid = ((uint16_t)data[0] << 8) | data[1];
    uint16_t raw_temp  = ((uint16_t)(data[2] & 0x7F) << 8) | data[3];
    bool     temp_neg  = (data[2] & 0x80) != 0;

    *humid  = (float)raw_humid * 0.1f;
    *temp_c = (float)raw_temp  * 0.1f;
    if (temp_neg) *temp_c = -*temp_c;

    return ESP_OK;

timeout:
    portEXIT_CRITICAL(&mux);
    ESP_LOGW(TAG, "Timeout reading DHT22 on pin %d", pin);
    return ESP_ERR_TIMEOUT;
}
