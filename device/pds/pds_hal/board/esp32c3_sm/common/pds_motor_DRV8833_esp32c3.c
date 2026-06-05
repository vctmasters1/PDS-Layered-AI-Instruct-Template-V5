// Suppress format string warnings for typedef'd types that vary by platform
#pragma GCC diagnostic ignored "-Wformat"

#include "pds_motor_DRV8833.h"
#include "driver/ledc.h"
#include "driver/gpio.h"
#include "esp_log.h"

static const char *TAG = "PDS_MOTOR_DRV8833";

/**
 * Motor state management
 * Stores pin configuration and current state for each motor channel
 */
typedef struct {
    uint32_t pin_in1;               // IN1 GPIO pin
    uint32_t pin_in2;               // IN2 GPIO pin
    ledc_channel_t ledc_channel_in1; // LEDC channel for IN1
    ledc_channel_t ledc_channel_in2; // LEDC channel for IN2
    pds_motor_mode_t current_mode;  // Current mode
    uint32_t current_speed;         // Current speed (0 to max)
    bool initialized;               // Channel initialized
} pds_motor_state_t;

// Global state for both motor channels
static pds_motor_state_t g_motor_state[2] = {0};
static uint32_t g_pwm_max_speed = 0;
static bool g_driver_initialized = false;

// Pin configuration for H2o-Tower (hwrev_001)
// These are overridable per role/hwrev via CMakeLists.txt or menuconfig
#ifndef PDS_MOTOR_A_IN1_PIN
#define PDS_MOTOR_A_IN1_PIN 4
#endif
#ifndef PDS_MOTOR_A_IN2_PIN
#define PDS_MOTOR_A_IN2_PIN 5
#endif
#ifndef PDS_MOTOR_B_IN1_PIN
#define PDS_MOTOR_B_IN1_PIN 6
#endif
#ifndef PDS_MOTOR_B_IN2_PIN
#define PDS_MOTOR_B_IN2_PIN 7
#endif

// LEDC timer and channel assignments
// ESP32-C3 only has LEDC_LOW_SPEED_MODE (LEDC_HIGH_SPEED_MODE not available)
#define PDS_MOTOR_LEDC_TIMER LEDC_TIMER_0
#define PDS_MOTOR_LEDC_MODE LEDC_LOW_SPEED_MODE
#define PDS_MOTOR_CHANNEL_A_IN1 LEDC_CHANNEL_0
#define PDS_MOTOR_CHANNEL_A_IN2 LEDC_CHANNEL_1
#define PDS_MOTOR_CHANNEL_B_IN1 LEDC_CHANNEL_2
#define PDS_MOTOR_CHANNEL_B_IN2 LEDC_CHANNEL_3

/**
 * Apply current mode and speed to motor hardware
 */
static esp_err_t _pds_motor_apply_state(pds_motor_channel_t channel) {
    if (channel >= 2) {
        return ESP_ERR_INVALID_ARG;
    }

    pds_motor_state_t *state = &g_motor_state[channel];
    uint32_t duty_in1 = 0, duty_in2 = 0;

    // Map mode to IN1/IN2 duty cycles
    switch (state->current_mode) {
        case PDS_MOTOR_MODE_COAST:
            // Both LOW: duty = 0
            duty_in1 = 0;
            duty_in2 = 0;
            break;

        case PDS_MOTOR_MODE_FORWARD:
            // IN1 = speed (PWM), IN2 = 0 (LOW)
            duty_in1 = state->current_speed;
            duty_in2 = 0;
            break;

        case PDS_MOTOR_MODE_REVERSE:
            // IN1 = 0 (LOW), IN2 = speed (PWM)
            duty_in1 = 0;
            duty_in2 = state->current_speed;
            break;

        case PDS_MOTOR_MODE_BRAKE:
            // Both HIGH: duty = max
            duty_in1 = g_pwm_max_speed;
            duty_in2 = g_pwm_max_speed;
            break;

        default:
            ESP_LOGE(TAG, "Invalid motor mode: %d", state->current_mode);
            return ESP_ERR_INVALID_ARG;
    }

    // Apply duty cycles via LEDC
    esp_err_t ret = ledc_set_duty(PDS_MOTOR_LEDC_MODE, state->ledc_channel_in1, duty_in1);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to set IN1 duty: %s", esp_err_to_name(ret));
        return ret;
    }

    ret = ledc_set_duty(PDS_MOTOR_LEDC_MODE, state->ledc_channel_in2, duty_in2);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to set IN2 duty: %s", esp_err_to_name(ret));
        return ret;
    }

    // Update PWM output
    ledc_update_duty(PDS_MOTOR_LEDC_MODE, state->ledc_channel_in1);
    ledc_update_duty(PDS_MOTOR_LEDC_MODE, state->ledc_channel_in2);

    ESP_LOGD(TAG, "Motor %d: mode=%d, speed=%lu, IN1_duty=%lu, IN2_duty=%lu",
             channel, state->current_mode, state->current_speed, duty_in1, duty_in2);

    return ESP_OK;
}

esp_err_t pds_motor_drv8833_init(const pds_motor_config_t *config) {
    if (!config) {
        return ESP_ERR_INVALID_ARG;
    }

    if (g_driver_initialized) {
        ESP_LOGW(TAG, "Motor driver already initialized");
        return ESP_OK;
    }

    // Calculate PWM max speed from resolution
    g_pwm_max_speed = (1 << config->pwm_resolution_bits) - 1;
    if (g_pwm_max_speed == 0) {
        ESP_LOGE(TAG, "Invalid PWM resolution: %lu bits", config->pwm_resolution_bits);
        return ESP_ERR_INVALID_ARG;
    }

    ESP_LOGI(TAG, "Initializing DRV8833: freq=%lu Hz, resolution=%lu bits, max_speed=%lu",
             config->pwm_frequency, config->pwm_resolution_bits, g_pwm_max_speed);

    // Configure LEDC timer
    ledc_timer_config_t timer_config = {
        .speed_mode = PDS_MOTOR_LEDC_MODE,
        .timer_num = PDS_MOTOR_LEDC_TIMER,
        .freq_hz = config->pwm_frequency,
        .duty_resolution = (ledc_timer_bit_t)config->pwm_resolution_bits,
        .clk_cfg = LEDC_AUTO_CLK,
    };

    esp_err_t ret = ledc_timer_config(&timer_config);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to configure LEDC timer: %s", esp_err_to_name(ret));
        return ret;
    }

    // Initialize motor channels
    struct {
        uint32_t pin_in1, pin_in2;
        ledc_channel_t ch_in1, ch_in2;
    } channels[] = {
        {PDS_MOTOR_A_IN1_PIN, PDS_MOTOR_A_IN2_PIN, PDS_MOTOR_CHANNEL_A_IN1, PDS_MOTOR_CHANNEL_A_IN2},
        {PDS_MOTOR_B_IN1_PIN, PDS_MOTOR_B_IN2_PIN, PDS_MOTOR_CHANNEL_B_IN1, PDS_MOTOR_CHANNEL_B_IN2},
    };

    for (int i = 0; i < 2; i++) {
        pds_motor_state_t *state = &g_motor_state[i];
        state->pin_in1 = channels[i].pin_in1;
        state->pin_in2 = channels[i].pin_in2;
        state->ledc_channel_in1 = channels[i].ch_in1;
        state->ledc_channel_in2 = channels[i].ch_in2;
        state->current_mode = PDS_MOTOR_MODE_COAST;
        state->current_speed = 0;
        state->initialized = true;

        // Configure GPIO pins as outputs
        gpio_config_t gpio_cfg = {
            .pin_bit_mask = (1ULL << state->pin_in1) | (1ULL << state->pin_in2),
            .mode = GPIO_MODE_OUTPUT,
            .pull_up_en = GPIO_PULLUP_DISABLE,
            .pull_down_en = GPIO_PULLDOWN_DISABLE,
            .intr_type = GPIO_INTR_DISABLE,
        };

        ret = gpio_config(&gpio_cfg);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "Failed to configure GPIO for motor %d: %s", i, esp_err_to_name(ret));
            return ret;
        }

        // Configure LEDC channels (both IN1 and IN2)
        ledc_channel_config_t ledc_config_in1 = {
            .channel = state->ledc_channel_in1,
            .duty = 0,
            .gpio_num = state->pin_in1,
            .speed_mode = PDS_MOTOR_LEDC_MODE,
            .timer_sel = PDS_MOTOR_LEDC_TIMER,
            .intr_type = LEDC_INTR_DISABLE,
        };

        ret = ledc_channel_config(&ledc_config_in1);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "Failed to configure LEDC for motor %d IN1: %s", i, esp_err_to_name(ret));
            return ret;
        }

        ledc_channel_config_t ledc_config_in2 = {
            .channel = state->ledc_channel_in2,
            .duty = 0,
            .gpio_num = state->pin_in2,
            .speed_mode = PDS_MOTOR_LEDC_MODE,
            .timer_sel = PDS_MOTOR_LEDC_TIMER,
            .intr_type = LEDC_INTR_DISABLE,
        };

        ret = ledc_channel_config(&ledc_config_in2);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "Failed to configure LEDC for motor %d IN2: %s", i, esp_err_to_name(ret));
            return ret;
        }

        ESP_LOGI(TAG, "Motor %d initialized: IN1=GPIO%lu, IN2=GPIO%lu", i, state->pin_in1, state->pin_in2);
    }

    g_driver_initialized = true;
    return ESP_OK;
}

esp_err_t pds_motor_set_mode(pds_motor_channel_t channel, pds_motor_mode_t mode) {
    if (channel >= 2) {
        return ESP_ERR_INVALID_ARG;
    }

    if (!g_motor_state[channel].initialized) {
        return ESP_ERR_INVALID_STATE;
    }

    g_motor_state[channel].current_mode = mode;
    return _pds_motor_apply_state(channel);
}

esp_err_t pds_motor_set_speed(pds_motor_channel_t channel, uint32_t speed) {
    if (channel >= 2) {
        return ESP_ERR_INVALID_ARG;
    }

    if (!g_motor_state[channel].initialized) {
        return ESP_ERR_INVALID_STATE;
    }

    if (speed > g_pwm_max_speed) {
        ESP_LOGW(TAG, "Speed %lu exceeds max %lu, clamping", speed, g_pwm_max_speed);
        speed = g_pwm_max_speed;
    }

    g_motor_state[channel].current_speed = speed;
    return _pds_motor_apply_state(channel);
}

esp_err_t pds_motor_set_speed_percent(pds_motor_channel_t channel, uint32_t percent) {
    if (percent > 100) {
        ESP_LOGE(TAG, "Invalid speed percentage: %lu (must be 0-100)", percent);
        return ESP_ERR_INVALID_ARG;
    }

    uint32_t speed = (g_pwm_max_speed * percent) / 100;
    return pds_motor_set_speed(channel, speed);
}

esp_err_t pds_motor_control(pds_motor_channel_t channel, pds_motor_mode_t mode, uint32_t speed) {
    esp_err_t ret = pds_motor_set_mode(channel, mode);
    if (ret != ESP_OK) {
        return ret;
    }

    return pds_motor_set_speed(channel, speed);
}

esp_err_t pds_motor_get_speed(pds_motor_channel_t channel, uint32_t *speed) {
    if (channel >= 2 || !speed) {
        return ESP_ERR_INVALID_ARG;
    }

    if (!g_motor_state[channel].initialized) {
        return ESP_ERR_INVALID_STATE;
    }

    *speed = g_motor_state[channel].current_speed;
    return ESP_OK;
}

esp_err_t pds_motor_get_mode(pds_motor_channel_t channel, pds_motor_mode_t *mode) {
    if (channel >= 2 || !mode) {
        return ESP_ERR_INVALID_ARG;
    }

    if (!g_motor_state[channel].initialized) {
        return ESP_ERR_INVALID_STATE;
    }

    *mode = g_motor_state[channel].current_mode;
    return ESP_OK;
}

esp_err_t pds_motor_stop_all(pds_motor_mode_t stop_mode) {
    if (stop_mode != PDS_MOTOR_MODE_COAST && stop_mode != PDS_MOTOR_MODE_BRAKE) {
        ESP_LOGE(TAG, "Invalid stop mode: %d (use COAST or BRAKE)", stop_mode);
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t ret = ESP_OK;
    for (int i = 0; i < 2; i++) {
        esp_err_t ch_ret = pds_motor_set_mode(i, stop_mode);
        if (ch_ret != ESP_OK) {
            ret = ch_ret;
        }
    }

    ESP_LOGI(TAG, "All motors stopped: mode=%d", stop_mode);
    return ret;
}

uint32_t pds_motor_get_max_speed(void) {
    return g_pwm_max_speed;
}

esp_err_t pds_motor_drv8833_deinit(void) {
    if (!g_driver_initialized) {
        return ESP_OK;
    }

    // Stop all motors
    pds_motor_stop_all(PDS_MOTOR_MODE_COAST);

    // Clean up LEDC channels
    for (int i = 0; i < 2; i++) {
        pds_motor_state_t *state = &g_motor_state[i];
        ledc_stop(PDS_MOTOR_LEDC_MODE, state->ledc_channel_in1, 0);
        ledc_stop(PDS_MOTOR_LEDC_MODE, state->ledc_channel_in2, 0);
        state->initialized = false;
    }

    // Clean up GPIO
    gpio_reset_pin(PDS_MOTOR_A_IN1_PIN);
    gpio_reset_pin(PDS_MOTOR_A_IN2_PIN);
    gpio_reset_pin(PDS_MOTOR_B_IN1_PIN);
    gpio_reset_pin(PDS_MOTOR_B_IN2_PIN);

    g_driver_initialized = false;
    ESP_LOGI(TAG, "Motor driver deinitialized");
    return ESP_OK;
}
