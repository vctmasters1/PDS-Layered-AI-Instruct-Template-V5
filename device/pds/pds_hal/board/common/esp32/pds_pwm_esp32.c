/**
 * PDS PWM HAL Implementation — shared across all ESP32 family targets.
 *
 * The one real hardware difference between targets:
 *   ESP32:       has both LEDC_HIGH_SPEED_MODE and LEDC_LOW_SPEED_MODE
 *   ESP32-C3:    LEDC_LOW_SPEED_MODE only (no high-speed hardware timer)
 *   ESP32-S3:    LEDC_LOW_SPEED_MODE only (same as C3)
 *
 * CMakeLists.txt defines PDS_LEDC_SPEED_MODE per target:
 *   esp32:   -DPDS_LEDC_SPEED_MODE=LEDC_HIGH_SPEED_MODE
 *   esp32c3: -DPDS_LEDC_SPEED_MODE=LEDC_LOW_SPEED_MODE
 *   esp32s3: -DPDS_LEDC_SPEED_MODE=LEDC_LOW_SPEED_MODE
 */

#pragma GCC diagnostic ignored "-Wformat"

#include "pds_pwm.h"
#include "driver/ledc.h"
#include "esp_log.h"
#include <stdbool.h>

#ifndef TARGET_PLATFORM
#define TARGET_PLATFORM "ESP32"
#endif

/* Default to low speed mode — targets that need high speed override via CMake */
#ifndef PDS_LEDC_SPEED_MODE
#define PDS_LEDC_SPEED_MODE LEDC_LOW_SPEED_MODE
#endif

static const char *TAG = "PDS_PWM_" TARGET_PLATFORM;

static bool pwm_initialized = false;

/* ── GPIO → LEDC channel mapping ────────────────────────────────────────── */
/* The public API uses GPIO pin numbers as channel IDs. Internally we map
 * each GPIO to a hardware LEDC channel index (0-7 on ESP32). */
#define _PWM_MAX_CHANNELS 8
static struct {
    int  gpio_num; /* GPIO pin bound to this slot, -1 = free */
} s_ch_map[_PWM_MAX_CHANNELS];

static void _ch_map_init(void) {
    for (int i = 0; i < _PWM_MAX_CHANNELS; i++) s_ch_map[i].gpio_num = -1;
}

/* Returns the LEDC channel index for a GPIO, allocating a new slot if needed.
 * Returns -1 if no free channels remain. */
static int _ch_get_or_alloc(int gpio_num)
{
    for (int i = 0; i < _PWM_MAX_CHANNELS; i++) {
        if (s_ch_map[i].gpio_num == gpio_num) return i;
    }
    for (int i = 0; i < _PWM_MAX_CHANNELS; i++) {
        if (s_ch_map[i].gpio_num < 0) { s_ch_map[i].gpio_num = gpio_num; return i; }
    }
    return -1;
}

/* Returns the LEDC channel index for a GPIO, or -1 if not yet set up. */
static int _ch_find(int gpio_num)
{
    for (int i = 0; i < _PWM_MAX_CHANNELS; i++) {
        if (s_ch_map[i].gpio_num == gpio_num) return i;
    }
    return -1;
}

esp_err_t PDS_PWM_init(void) {
    if (pwm_initialized) return ESP_OK;
    _ch_map_init();
    pwm_initialized = true;
    ESP_LOGI(TAG, "PWM subsystem initialized (speed_mode=%d)", PDS_LEDC_SPEED_MODE);
    return ESP_OK;
}

esp_err_t PDS_PWM_setup_channel(uint32_t gpio_num, uint32_t freq_hz, uint32_t duty_resolution) {
    if (!pwm_initialized) PDS_PWM_init();

    int ch = _ch_get_or_alloc((int)gpio_num);
    if (ch < 0) {
        ESP_LOGE(TAG, "No free LEDC channels for GPIO %u (max %d)", gpio_num, _PWM_MAX_CHANNELS);
        return ESP_ERR_NO_MEM;
    }

    ledc_timer_config_t timer_conf = {
        .speed_mode      = PDS_LEDC_SPEED_MODE,
        .duty_resolution = (ledc_timer_bit_t)duty_resolution,
        .timer_num       = LEDC_TIMER_0,
        .freq_hz         = freq_hz,
        .clk_cfg         = LEDC_AUTO_CLK,
    };
    esp_err_t ret = ledc_timer_config(&timer_conf);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "LEDC timer config failed: %s", esp_err_to_name(ret));
        return ret;
    }

    ledc_channel_config_t ch_conf = {
        .speed_mode = PDS_LEDC_SPEED_MODE,
        .channel    = (ledc_channel_t)ch,
        .timer_sel  = LEDC_TIMER_0,
        .intr_type  = LEDC_INTR_DISABLE,
        .gpio_num   = (int)gpio_num,
        .duty       = 0,
        .hpoint     = 0,
    };
    ret = ledc_channel_config(&ch_conf);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "LEDC ch%d (GPIO%u) config failed: %s", ch, gpio_num, esp_err_to_name(ret));
    } else {
        ESP_LOGI(TAG, "PWM GPIO%u → LEDC ch%d @ %uHz", gpio_num, ch, freq_hz);
    }
    return ret;
}

esp_err_t PDS_PWM_set_duty(uint32_t gpio_num, uint32_t duty) {
    int ch = _ch_find((int)gpio_num);
    if (ch < 0) return ESP_ERR_INVALID_ARG;
    esp_err_t ret = ledc_set_duty(PDS_LEDC_SPEED_MODE, (ledc_channel_t)ch, duty);
    if (ret != ESP_OK) return ret;
    return ledc_update_duty(PDS_LEDC_SPEED_MODE, (ledc_channel_t)ch);
}

esp_err_t PDS_PWM_set_duty_percent(PDS_PWM_channel_t gpio_num, uint32_t duty_percent) {
    /* Convert integer 0-100 to raw duty counts (13-bit: max 8191) */
    uint32_t max_duty = (1u << 13) - 1;
    if (duty_percent > 100u) duty_percent = 100u;
    return PDS_PWM_set_duty(gpio_num, (duty_percent * max_duty) / 100u);
}

esp_err_t PDS_PWM_set_frequency(uint32_t gpio_num, uint32_t hz) {
    (void)gpio_num;
    return ledc_set_freq(PDS_LEDC_SPEED_MODE, LEDC_TIMER_0, hz);
}

esp_err_t PDS_PWM_start(uint32_t gpio_num) {
    int ch = _ch_find((int)gpio_num);
    if (ch < 0) return ESP_ERR_INVALID_ARG;
    return ledc_update_duty(PDS_LEDC_SPEED_MODE, (ledc_channel_t)ch);
}

esp_err_t PDS_PWM_stop(uint32_t gpio_num) {
    int ch = _ch_find((int)gpio_num);
    if (ch < 0) return ESP_ERR_INVALID_ARG;
    ledc_set_duty(PDS_LEDC_SPEED_MODE, (ledc_channel_t)ch, 0);
    return ledc_update_duty(PDS_LEDC_SPEED_MODE, (ledc_channel_t)ch);
}

int PDS_PWM_get_duty(PDS_PWM_channel_t gpio_num) {
    int ch = _ch_find((int)gpio_num);
    if (ch < 0) return -1;
    return (int)ledc_get_duty(PDS_LEDC_SPEED_MODE, (ledc_channel_t)ch);
}

int PDS_PWM_get_duty_percent(PDS_PWM_channel_t gpio_num) {
    int raw = PDS_PWM_get_duty(gpio_num);
    if (raw < 0) return 0;
    /* Convert using same 13-bit scale as PDS_PWM_set_duty_percent (max = 8191) */
    int pct = (raw * 100) / (int)((1u << 13) - 1);
    return (pct > 100) ? 100 : pct;
}

uint32_t PDS_PWM_get_frequency(uint32_t gpio_num) {
    (void)gpio_num;
    return ledc_get_freq(PDS_LEDC_SPEED_MODE, LEDC_TIMER_0);
}
