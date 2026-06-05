/* hx711.c — HX711 24-bit load-cell ADC bit-bang driver
 * Protocol extracted from pds_fb_hx711.c — see that file for pipeline lifecycle.
 */

#include "hx711.h"
#include "driver/gpio.h"
#include "esp_rom_sys.h"
#include "freertos/FreeRTOS.h"
#include "freertos/portmacro.h"

/* ── Public API ─────────────────────────────────────────────────────────── */

void hx711_configure_pins(int pin_clk, int pin_dat)
{
    if (pin_clk >= 0) {
        gpio_config_t cfg = {
            .pin_bit_mask = (1ULL << pin_clk),
            .mode         = GPIO_MODE_OUTPUT,
            .pull_up_en   = GPIO_PULLUP_DISABLE,
            .pull_down_en = GPIO_PULLDOWN_DISABLE,
            .intr_type    = GPIO_INTR_DISABLE,
        };
        gpio_config(&cfg);
        gpio_set_level((gpio_num_t)pin_clk, 0);   /* low = device active */
    }

    if (pin_dat >= 0) {
        gpio_config_t cfg = {
            .pin_bit_mask = (1ULL << pin_dat),
            .mode         = GPIO_MODE_INPUT,
            .pull_up_en   = GPIO_PULLUP_ENABLE,   /* pulls DOUT high when device is off */
            .pull_down_en = GPIO_PULLDOWN_DISABLE,
            .intr_type    = GPIO_INTR_DISABLE,
        };
        gpio_config(&cfg);
    }
}

bool hx711_data_ready(int pin_dat)
{
    return gpio_get_level((gpio_num_t)pin_dat) == 0;
}

int32_t hx711_read_raw(int pin_clk, int pin_dat, uint8_t gain)
{
    portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
    portENTER_CRITICAL(&mux);

    uint32_t raw = 0;
    for (int i = 0; i < 24; i++) {
        gpio_set_level((gpio_num_t)pin_clk, 1);
        esp_rom_delay_us(1);
        raw = (raw << 1) | (uint32_t)gpio_get_level((gpio_num_t)pin_dat);
        gpio_set_level((gpio_num_t)pin_clk, 0);
        esp_rom_delay_us(1);
    }

    /* Extra pulses select gain for the NEXT conversion: 128→1, 32→2, 64→3 */
    uint8_t extra = (gain == 128u) ? 1u : (gain == 32u) ? 2u : 3u;
    for (uint8_t i = 0; i < extra; i++) {
        gpio_set_level((gpio_num_t)pin_clk, 1);
        esp_rom_delay_us(1);
        gpio_set_level((gpio_num_t)pin_clk, 0);
        esp_rom_delay_us(1);
    }

    portEXIT_CRITICAL(&mux);

    /* Sign-extend 24-bit two's complement → int32 */
    if (raw & 0x800000u) {
        return (int32_t)(raw | 0xFF000000u);
    }
    return (int32_t)raw;
}
