#include "pds_validation.h"
#include "esp_log.h"
#include "string.h"
#include "pds_telemetry_types.h"

static const char *TAG = "pds_VALIDATION";

esp_err_t pds_device_validate_pin(const pds_pin_def_t *pin) {
    if (!pin) {
        ESP_LOGW(TAG, "Pin validation failed: NULL pointer");
        return ESP_ERR_INVALID_ARG;
    }
    
    // Check pin number is valid for ESP32-C3 (GPIO 0-21, excluding some reserved pins)
    if (pin->pin_number > 21) {
        ESP_LOGW(TAG, "Pin validation failed: invalid GPIO number %d", pin->pin_number);
        return ESP_ERR_INVALID_ARG;
    }
    
    // Check pin function is valid
    if (pin->function > PDS_PIN_FUNC_UART_RX) {
        ESP_LOGW(TAG, "Pin validation failed: invalid function %d", pin->function);
        return ESP_ERR_INVALID_ARG;
    }
    
    // Check label is not empty if pin is enabled
    if ((pin->config_flags & PDS_PIN_FLAG_ENABLED) && strlen(pin->label) == 0) {
        ESP_LOGW(TAG, "Pin validation failed: empty label for enabled pin %d", pin->pin_number);
        return ESP_ERR_INVALID_ARG;
    }
    
    return ESP_OK;
}

esp_err_t pds_device_validate_condition(const pds_condition_t *condition, uint8_t max_pins) {
    if (!condition) {
        ESP_LOGW(TAG, "Condition validation failed: NULL pointer");
        return ESP_ERR_INVALID_ARG;
    }
    
    // Check condition type is valid
    if (condition->type > PDS_COND_TYPE_OR) {
        ESP_LOGW(TAG, "Condition validation failed: invalid type %d", condition->type);
        return ESP_ERR_INVALID_ARG;
    }
    
    // Check source pin is valid
    if (condition->source_pin >= max_pins && condition->type != PDS_COND_TYPE_NONE) {
        ESP_LOGW(TAG, "Condition validation failed: invalid source pin %d", condition->source_pin);
        return ESP_ERR_INVALID_ARG;
    }
    
    // Validate threshold parameters for range conditions
    if (condition->type == PDS_COND_TYPE_RANGE) {
        if (condition->param1 >= condition->param2) {
            ESP_LOGW(TAG, "Condition validation failed: range min >= max");
            return ESP_ERR_INVALID_ARG;
        }
    }
    
    return ESP_OK;
}

esp_err_t pds_device_validate_action(const pds_action_t *action, uint8_t max_pins) {
    if (!action) {
        ESP_LOGW(TAG, "Action validation failed: NULL pointer");
        return ESP_ERR_INVALID_ARG;
    }
    
    // Check action type is valid
    if (action->type > PDS_ACTION_TYPE_TRIGGER_ACTION) {
        ESP_LOGW(TAG, "Action validation failed: invalid type %d", action->type);
        return ESP_ERR_INVALID_ARG;
    }
    
    // Check target pin is valid
    if (action->target_pin >= max_pins && action->type != PDS_ACTION_TYPE_NONE) {
        ESP_LOGW(TAG, "Action validation failed: invalid target pin %d", action->target_pin);
        return ESP_ERR_INVALID_ARG;
    }
    
    // Validate action-specific parameters
    if (action->type == PDS_ACTION_TYPE_SET_PWM) {
        if (action->value > 1000) {
            ESP_LOGW(TAG, "Action validation failed: PWM duty %lu > 1000", action->value);
            return ESP_ERR_INVALID_ARG;
        }
    } else if (action->type == PDS_ACTION_TYPE_SET_GPIO) {
        if (action->value > 1) {
            ESP_LOGW(TAG, "Action validation failed: GPIO state %lu > 1", action->value);
            return ESP_ERR_INVALID_ARG;
        }
    }
    
    return ESP_OK;
}

esp_err_t pds_device_validate_timer(const pds_timer_config_t *timer) {
    if (!timer) {
        ESP_LOGW(TAG, "Timer validation failed: NULL pointer");
        return ESP_ERR_INVALID_ARG;
    }
    
    // Check timer type is valid
    if (timer->type > PDS_TIMER_TYPE_CYCLE) {
        ESP_LOGW(TAG, "Timer validation failed: invalid type %d", timer->type);
        return ESP_ERR_INVALID_ARG;
    }
    
    if (timer->type == PDS_TIMER_TYPE_TIME_OF_DAY) {
        // on_time and off_time should be seconds within a day (0-86400)
        if (timer->on_time_unix > 86400 || timer->off_time_unix > 86400) {
            ESP_LOGW(TAG, "Timer validation failed: time_of_day values exceed 24 hours");
            return ESP_ERR_INVALID_ARG;
        }
    } else if (timer->type == PDS_TIMER_TYPE_CYCLE) {
        // on_time is duration, off_time is total cycle period
        if (timer->on_time_unix > timer->off_time_unix) {
            ESP_LOGW(TAG, "Timer validation failed: cycle on_time > cycle period");
            return ESP_ERR_INVALID_ARG;
        }
        if (timer->off_time_unix == 0) {
            ESP_LOGW(TAG, "Timer validation failed: cycle period is zero");
            return ESP_ERR_INVALID_ARG;
        }
    }
    
    return ESP_OK;
}

esp_err_t pds_device_validate_telemetry_header(const pds_TELDATA_header_t *header) {
    if (!header) {
        ESP_LOGW(TAG, "Telemetry header validation failed: NULL pointer");
        return ESP_ERR_INVALID_ARG;
    }
    
    // Check protocol version compatibility (currently 0x0001)
    if (header->version != 0x0001) {
        ESP_LOGW(TAG, "Telemetry header validation failed: unsupported version 0x%04x", header->version);
        return ESP_ERR_INVALID_ARG;
    }
    
    // Check array counts are reasonable
    if (header->num_adc_readings > 8) {
        ESP_LOGW(TAG, "Telemetry header validation failed: ADC count %d exceeds max 8", header->num_adc_readings);
        return ESP_ERR_INVALID_ARG;
    }
    
    if (header->num_pwm_outputs > PDS_TELDATA_MAX_PWM_OUTPUTS) {
        ESP_LOGW(TAG, "Telemetry header validation failed: PWM count %d exceeds max %d", header->num_pwm_outputs, PDS_TELDATA_MAX_PWM_OUTPUTS);
        return ESP_ERR_INVALID_ARG;
    }
    
    if (header->num_gpio_states > 8) {
        ESP_LOGW(TAG, "Telemetry header validation failed: GPIO count %d exceeds max 8", header->num_gpio_states);
        return ESP_ERR_INVALID_ARG;
    }
    
    return ESP_OK;
}

esp_err_t pds_device_validate_config_packet(const pds_TELCONF_packet_t *config, uint8_t max_pins) {
    if (!config) {
        ESP_LOGW(TAG, "Config packet validation failed: NULL pointer");
        return ESP_ERR_INVALID_ARG;
    }
    
    // Check protocol version
    if (config->version != 0x0001) {
        ESP_LOGW(TAG, "Config packet validation failed: unsupported version 0x%04x", config->version);
        return ESP_ERR_INVALID_ARG;
    }
    
    // Check target pin is valid
    if (config->target_pin >= max_pins) {
        ESP_LOGW(TAG, "Config packet validation failed: target pin %d >= max %d", config->target_pin, max_pins);
        return ESP_ERR_INVALID_ARG;
    }
    
    // Validate based on config type
    switch (config->config_type) {
        case PDS_CONFIG_TYPE_SET_PWM_DUTY:
            if (config->config_value > 1000) {
                ESP_LOGW(TAG, "Config validation failed: PWM duty %lu > 1000", config->config_value);
                return ESP_ERR_INVALID_ARG;
            }
            break;
            
        case PDS_CONFIG_TYPE_SET_GPIO_OUT:
            if (config->config_value > 1) {
                ESP_LOGW(TAG, "Config validation failed: GPIO value %lu > 1", config->config_value);
                return ESP_ERR_INVALID_ARG;
            }
            break;
            
        case PDS_CONFIG_TYPE_SET_PIN_ENABLE:
            if (config->config_value > 1) {
                ESP_LOGW(TAG, "Config validation failed: enable flag %lu is not 0 or 1", config->config_value);
                return ESP_ERR_INVALID_ARG;
            }
            break;
            
        case PDS_CONFIG_TYPE_CALIBRATE_ADC:
            // Calibration value is device-specific, allow any value
            break;

        case PDS_CONFIG_TYPE_TIMER_SET_TYPE:
            if (config->config_value > PDS_TIMER_TYPE_CYCLE) {
                ESP_LOGW(TAG, "Config validation failed: invalid timer type %lu", config->config_value);
                return ESP_ERR_INVALID_ARG;
            }
            break;

        case PDS_CONFIG_TYPE_TIMER_SET_ON_SECS:
        case PDS_CONFIG_TYPE_TIMER_SET_PERIOD:
            // Allow up to 7 days in seconds for safety (604800)
            if (config->config_value > 604800UL) {
                ESP_LOGW(TAG, "Config validation failed: timer seconds too large %lu", config->config_value);
                return ESP_ERR_INVALID_ARG;
            }
            break;

        case PDS_CONFIG_TYPE_TIMER_ENABLE:
            if (config->config_value > 1) {
                ESP_LOGW(TAG, "Config validation failed: timer enable %lu not 0/1", config->config_value);
                return ESP_ERR_INVALID_ARG;
            }
            break;
            
        default:
            ESP_LOGW(TAG, "Config validation failed: unknown config type %d", config->config_type);
            return ESP_ERR_INVALID_ARG;
    }
    
    return ESP_OK;
}

esp_err_t pds_device_validate_pwm_duty(uint16_t duty_cycle) {
    if (duty_cycle > 1000) {
        ESP_LOGW(TAG, "PWM duty validation failed: %d > 1000", duty_cycle);
        return ESP_ERR_INVALID_ARG;
    }
    return ESP_OK;
}

esp_err_t pds_device_validate_gpio_state(uint8_t state) {
    if (state != 0 && state != 1) {
        ESP_LOGW(TAG, "GPIO state validation failed: %d not in [0,1]", state);
        return ESP_ERR_INVALID_ARG;
    }
    return ESP_OK;
}

esp_err_t pds_device_validate_adc_range(uint16_t value, uint16_t min_value, uint16_t max_value) {
    if (min_value > max_value) {
        ESP_LOGW(TAG, "ADC range validation failed: min > max");
        return ESP_ERR_INVALID_ARG;
    }
    
    if (value < min_value || value > max_value) {
        ESP_LOGW(TAG, "ADC range validation failed: %d not in [%d,%d]", value, min_value, max_value);
        return ESP_ERR_INVALID_ARG;
    }
    
    return ESP_OK;
}

