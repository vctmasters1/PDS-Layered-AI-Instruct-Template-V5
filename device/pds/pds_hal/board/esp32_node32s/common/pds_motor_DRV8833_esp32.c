/**
 * H20-Tower Motor DRV8833 HAL Implementation for ESP32 (Node32S)
 * 
 * Platform-specific motor driver (DRV8833 dual H-bridge) implementation for ESP32.
 * Controls reversible pumps through PWM-based H-bridge logic.
 * Uses LEDC (LED Control) for PWM output.
 */

// Suppress format string warnings for typedef'd types that vary by platform
#pragma GCC diagnostic ignored "-Wformat"

#include "pds_motor_DRV8833.h"
#include "driver/ledc.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "PDS_MOTOR_DRV8833_ESP32";

/**
 * Initialize DRV8833 motor driver
 */
esp_err_t PDS_MOTOR_DRV8833_init(uint8_t in1_pin, uint8_t in2_pin, uint8_t nsleep_pin, 
                                  uint8_t nfault_pin, uint32_t pwm_freq_hz) {
    ESP_LOGI(TAG, "Initializing DRV8833 motor driver");

    // Configure GPIO pins
    gpio_config_t gpio_cfg = {
        .pin_bit_mask = (1ULL << in1_pin) | (1ULL << in2_pin) | (1ULL << nsleep_pin),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };

    esp_err_t ret = gpio_config(&gpio_cfg);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to configure GPIO: %s", esp_err_to_name(ret));
        return ret;
    }

    // Configure nFAULT as input with pull-up
    gpio_config_t fault_cfg = {
        .pin_bit_mask = (1ULL << nfault_pin),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };

    ret = gpio_config(&fault_cfg);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to configure nFAULT pin: %s", esp_err_to_name(ret));
        return ret;
    }

    // Configure PWM for IN1 and IN2 pins using LEDC
    ledc_timer_config_t timer_conf = {
        .speed_mode = LEDC_HIGH_SPEED_MODE,
        .timer_num = LEDC_TIMER_1,
        .duty_resolution = LEDC_TIMER_10_BIT,
        .freq_hz = pwm_freq_hz,
    };

    ret = ledc_timer_config(&timer_conf);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to configure LEDC timer: %s", esp_err_to_name(ret));
        return ret;
    }

    // Configure IN1 PWM channel
    ledc_channel_config_t ch_conf1 = {
        .gpio_num = in1_pin,
        .speed_mode = LEDC_HIGH_SPEED_MODE,
        .channel = LEDC_CHANNEL_2,
        .intr_type = LEDC_INTR_DISABLE,
        .timer_sel = LEDC_TIMER_1,
        .duty = 0,
    };

    ret = ledc_channel_config(&ch_conf1);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to configure IN1 PWM: %s", esp_err_to_name(ret));
        return ret;
    }

    // Configure IN2 PWM channel
    ledc_channel_config_t ch_conf2 = {
        .gpio_num = in2_pin,
        .speed_mode = LEDC_HIGH_SPEED_MODE,
        .channel = LEDC_CHANNEL_3,
        .intr_type = LEDC_INTR_DISABLE,
        .timer_sel = LEDC_TIMER_1,
        .duty = 0,
    };

    ret = ledc_channel_config(&ch_conf2);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to configure IN2 PWM: %s", esp_err_to_name(ret));
        return ret;
    }

    // Enable motor driver (nSLEEP = HIGH)
    gpio_set_level(nsleep_pin, 1);

    ESP_LOGI(TAG, "DRV8833 motor driver initialized on IN1=GPIO%" PRIu8 ", IN2=GPIO%" PRIu8, 
             in1_pin, in2_pin);
    return ESP_OK;
}

/**
 * Control motor direction and speed
 * direction: 1 = forward, -1 = reverse, 0 = stop
 * speed: 0-1000 (0% to 100%)
 */
esp_err_t PDS_MOTOR_DRV8833_set_speed(uint8_t in1_pin, uint8_t in2_pin, 
                                       int8_t direction, uint16_t speed_0_to_1000) {
    if (speed_0_to_1000 > 1000) {
        speed_0_to_1000 = 1000;
    }

    // Convert 0-1000 to 10-bit (0-1023)
    uint16_t duty_10bit = (speed_0_to_1000 * 1023) / 1000;

    if (direction == 1) {
        // Forward: IN1 = PWM, IN2 = 0
        ledc_set_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_2, duty_10bit);
        ledc_update_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_2);
        ledc_set_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_3, 0);
        ledc_update_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_3);
        ESP_LOGD(TAG, "Motor forward: speed=%u", speed_0_to_1000);
    } else if (direction == -1) {
        // Reverse: IN1 = 0, IN2 = PWM
        ledc_set_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_2, 0);
        ledc_update_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_2);
        ledc_set_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_3, duty_10bit);
        ledc_update_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_3);
        ESP_LOGD(TAG, "Motor reverse: speed=%u", speed_0_to_1000);
    } else {
        // Stop: IN1 = 0, IN2 = 0
        ledc_set_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_2, 0);
        ledc_update_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_2);
        ledc_set_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_3, 0);
        ledc_update_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_3);
        ESP_LOGD(TAG, "Motor stopped");
    }

    return ESP_OK;
}

/**
 * Check motor fault status (nFAULT pin)
 * Returns 1 if fault detected (pin LOW), 0 if normal
 */
esp_err_t PDS_MOTOR_DRV8833_check_fault(uint8_t nfault_pin, uint8_t* fault_detected) {
    if (!fault_detected) {
        return ESP_ERR_INVALID_ARG;
    }

    int level = gpio_get_level(nfault_pin);
    *fault_detected = (level == 0) ? 1 : 0;  // nFAULT is active LOW

    if (*fault_detected) {
        ESP_LOGW(TAG, "Motor fault detected!");
    }

    return ESP_OK;
}

/**
 * Enable/disable motor driver
 */
esp_err_t PDS_MOTOR_DRV8833_set_enabled(uint8_t nsleep_pin, bool enabled) {
    gpio_set_level(nsleep_pin, enabled ? 1 : 0);
    ESP_LOGI(TAG, "Motor driver %s", enabled ? "enabled" : "disabled");
    return ESP_OK;
}

/**
 * Cleanup motor driver
 */
esp_err_t PDS_MOTOR_DRV8833_deinit(uint8_t in1_pin, uint8_t in2_pin, uint8_t nsleep_pin) {
    // Stop motor
    ledc_set_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_2, 0);
    ledc_update_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_2);
    ledc_set_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_3, 0);
    ledc_update_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_3);

    // Disable motor driver
    gpio_set_level(nsleep_pin, 0);

    // Reset GPIO pins
    gpio_reset_pin(in1_pin);
    gpio_reset_pin(in2_pin);
    gpio_reset_pin(nsleep_pin);

    ESP_LOGI(TAG, "DRV8833 motor driver deinitialized");
    return ESP_OK;
}
