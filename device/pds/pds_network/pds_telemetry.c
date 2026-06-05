/**
 * @file pds_telemetry.c
 * @brief Telemetry collection and serialization implementation
 */

#include "pds_telemetry.h"
#include "pds_tel_sink.h"
#include "pds_adc.h"
#include "pds_pwm.h"
#include "pds_gpio.h"
#include "esp_log.h"
#include <string.h>
#include <time.h>
#include <sys/time.h>

static const char *TAG = "PDS_TELEMETRY";

/**
 * Global telemetry state
 */
typedef struct {
    uint16_t                 packet_id;
    bool                     initialized;
    pds_telemetry_provider_t provider;   /* Role-registered data provider */
} telemetry_state_t;

static telemetry_state_t g_telemetry = {0};

esp_err_t pds_telemetry_init(void) {
    if (g_telemetry.initialized) {
        ESP_LOGW(TAG, "Telemetry already initialized");
        return ESP_OK;
    }
    
    memset(&g_telemetry, 0, sizeof(telemetry_state_t));
    g_telemetry.initialized = true;
    
    ESP_LOGI(TAG, "Telemetry subsystem initialized");
    return ESP_OK;
}

esp_err_t pds_telemetry_collect(pds_teldata_packet_t* packet) {
    if (!packet) {
        return ESP_ERR_INVALID_ARG;
    }
    
    if (!g_telemetry.initialized) {
        return ESP_ERR_INVALID_STATE;
    }
    
    // Initialize packet
    if (!pds_teldata_packet_init(packet)) {
        return ESP_ERR_INVALID_ARG;
    }
    
    // Set timestamps
    packet->header.timestamp_ms = esp_log_timestamp();
    time_t now = time(NULL);
    packet->header.timestamp_unix = (uint32_t)now;
    
    // Set packet ID
    packet->header.packet_id = g_telemetry.packet_id++;
    
    // Status OK (will be set to ERROR/WARNING if issues occur)
    packet->header.status_flags = PDS_TELDATA_STATUS_OK;

    // Call the registered role provider (kept as no-op stub, sink handles collection)
    if (g_telemetry.provider) {
        esp_err_t provider_ret = g_telemetry.provider(packet);
        if (provider_ret != ESP_OK) {
            ESP_LOGW(TAG, "Telemetry provider returned error: %s",
                     esp_err_to_name(provider_ret));
            packet->header.status_flags = PDS_TELDATA_STATUS_WARNING;
        }
    }

    /* Walk the block telemetry sink — every pds_fb_* block that registered
     * at init time publishes its live state here. No role code needed. */
    int n = pds_tel_sink_count();
    int timer_idx = 0;
    ESP_LOGI(TAG, "tel_collect: sink_count=%d", n);
    for (int i = 0; i < n; i++) {
        const pds_tel_slot_t *s = pds_tel_sink_get(i);
        switch (s->kind) {
        case PDS_TEL_ADC: {
            float v = (float)PDS_ADC_raw_to_mv(s->adc.adc_channel, (int)*s->adc.raw) / 1000.0f;
            pds_telemetry_add_adc(packet, s->pin, (uint16_t)*s->adc.raw, v, *s->adc.value, s->label);
            break;
        }
        case PDS_TEL_PWM: {
            /* Read current duty directly from LEDC hardware via PWM manager.
             * This is always the actual running value regardless of pipeline state. */
            int pct = PDS_PWM_get_duty_percent((PDS_PWM_channel_t)s->pin);
            uint16_t dc = (uint16_t)(pct * 10);  /* 0-100% → 0-1000 per-mille */
            if (dc > 1000) dc = 1000;
            pds_telemetry_add_pwm(packet, s->pin, dc, s->pwm.freq_hz, s->label);
            break;
        }
        case PDS_TEL_GPIO: {
            /* For output GPIOs: read from the HAL output cache (last driven level).
             * For input GPIOs:  read hardware level via PDS_GPIO_read().
             * Both paths bypass the block context so the value reflects hardware truth. */
            int level = s->gpio.is_input
                        ? PDS_GPIO_read(s->pin)
                        : PDS_GPIO_get_output_level(s->pin);
            pds_telemetry_add_gpio(packet, s->pin, (uint8_t)level, s->label);
            break;
        }
        case PDS_TEL_TIMER:
            pds_telemetry_add_timer(packet, (uint8_t)timer_idx,
                                    *s->timer.active ? 1u : 0u,
                                    *s->timer.value,
                                    s->timer.elapsed_ms ? *s->timer.elapsed_ms : 0,
                                    s->label);
            timer_idx++;
            break;
        case PDS_TEL_PERIPH:
            pds_telemetry_add_periph(packet, s->periph.pin, s->periph.field,
                                     *s->periph.value,
                                     s->periph.voltage_v ? *s->periph.voltage_v : 0.0f,
                                     s->label);
            break;
        case PDS_TEL_PIPELINE:
            /* Pipeline float fields (e.g. PID setpoint) are for OLED display only
             * and are not included in cloud telemetry packets. */
            break;
        }
    }

    return ESP_OK;
}

esp_err_t pds_telemetry_serialize(
    const pds_teldata_packet_t* packet,
    uint8_t* buffer,
    size_t buffer_size,
    size_t* bytes_written
) {
    if (!packet || !buffer || !bytes_written) {
        return ESP_ERR_INVALID_ARG;
    }
    
    if (!pds_teldata_packet_validate(packet)) {
        return ESP_ERR_INVALID_ARG;
    }
    
    // Calculate required size
    size_t header_size = sizeof(pds_teldata_header_t);
    size_t adc_size = packet->header.num_adc_readings * sizeof(pds_teldata_adc_reading_t);
    size_t pwm_size = packet->header.num_pwm_outputs * sizeof(pds_teldata_pwm_state_t);
    size_t gpio_size = packet->header.num_gpio_states * sizeof(pds_teldata_gpio_state_t);
    
    size_t total_size = header_size + adc_size + pwm_size + gpio_size;
    
    if (total_size > buffer_size) {
        ESP_LOGE(TAG, "Buffer too small: needed %zu, got %zu", total_size, buffer_size);
        return ESP_ERR_NO_MEM;
    }
    
    // Serialize header
    uint8_t* offset = buffer;
    memcpy(offset, &packet->header, header_size);
    offset += header_size;
    
    // Serialize ADC readings
    for (uint8_t i = 0; i < packet->header.num_adc_readings; i++) {
        memcpy(offset, &packet->adc_readings[i], sizeof(pds_teldata_adc_reading_t));
        offset += sizeof(pds_teldata_adc_reading_t);
    }
    
    // Serialize PWM outputs
    for (uint8_t i = 0; i < packet->header.num_pwm_outputs; i++) {
        memcpy(offset, &packet->pwm_outputs[i], sizeof(pds_teldata_pwm_state_t));
        offset += sizeof(pds_teldata_pwm_state_t);
    }
    
    // Serialize GPIO states
    for (uint8_t i = 0; i < packet->header.num_gpio_states; i++) {
        memcpy(offset, &packet->gpio_states[i], sizeof(pds_teldata_gpio_state_t));
        offset += sizeof(pds_teldata_gpio_state_t);
    }
    
    *bytes_written = total_size;
    ESP_LOGD(TAG, "Serialized telemetry: %zu bytes (header=%zu, adc=%zu, pwm=%zu, gpio=%zu)",
             total_size, header_size, adc_size, pwm_size, gpio_size);
    
    return ESP_OK;
}

esp_err_t pds_telemetry_add_adc(
    pds_teldata_packet_t* packet,
    uint8_t pin_number,
    uint16_t raw_value,
    float voltage,
    float calibrated_value,
    const char* label
) {
    if (!packet || !label) {
        return ESP_ERR_INVALID_ARG;
    }
    
    if (packet->header.num_adc_readings >= PDS_TELDATA_MAX_ADC_READINGS) {
        ESP_LOGW(TAG, "ADC readings buffer full (%u/%u)",
                 packet->header.num_adc_readings, PDS_TELDATA_MAX_ADC_READINGS);
        return ESP_ERR_NO_MEM;
    }
    
    pds_teldata_adc_reading_t* entry = 
        &packet->adc_readings[packet->header.num_adc_readings];
    
    entry->pin_number = pin_number;
    entry->raw_value = raw_value;
    entry->voltage = voltage;
    entry->calibrated_value = calibrated_value;
    
    strncpy(entry->label, label, PDS_TELDATA_LABEL_SIZE - 1);
    entry->label[PDS_TELDATA_LABEL_SIZE - 1] = '\0';
    
    packet->header.num_adc_readings++;
    
    return ESP_OK;
}

esp_err_t pds_telemetry_add_pwm(
    pds_teldata_packet_t* packet,
    uint8_t pin_number,
    uint16_t duty_cycle,
    uint32_t frequency,
    const char* label
) {
    if (!packet || !label) {
        return ESP_ERR_INVALID_ARG;
    }
    
    if (duty_cycle > 1000) {
        return ESP_ERR_INVALID_ARG;
    }
    
    if (packet->header.num_pwm_outputs >= PDS_TELDATA_MAX_PWM_OUTPUTS) {
        ESP_LOGW(TAG, "PWM outputs buffer full (%u/%u)",
                 packet->header.num_pwm_outputs, PDS_TELDATA_MAX_PWM_OUTPUTS);
        return ESP_ERR_NO_MEM;
    }
    
    pds_teldata_pwm_state_t* entry = 
        &packet->pwm_outputs[packet->header.num_pwm_outputs];
    
    entry->pin_number = pin_number;
    entry->duty_cycle = duty_cycle;
    entry->frequency = frequency;
    
    strncpy(entry->label, label, PDS_TELDATA_LABEL_SIZE - 1);
    entry->label[PDS_TELDATA_LABEL_SIZE - 1] = '\0';
    
    packet->header.num_pwm_outputs++;
    
    return ESP_OK;
}

esp_err_t pds_telemetry_add_gpio(
    pds_teldata_packet_t* packet,
    uint8_t pin_number,
    uint8_t state,
    const char* label
) {
    if (!packet || !label) {
        return ESP_ERR_INVALID_ARG;
    }
    
    if (state > 1) {
        return ESP_ERR_INVALID_ARG;
    }
    
    if (packet->header.num_gpio_states >= PDS_TELDATA_MAX_GPIO_STATES) {
        ESP_LOGW(TAG, "GPIO states buffer full (%u/%u)",
                 packet->header.num_gpio_states, PDS_TELDATA_MAX_GPIO_STATES);
        return ESP_ERR_NO_MEM;
    }
    
    pds_teldata_gpio_state_t* entry = 
        &packet->gpio_states[packet->header.num_gpio_states];
    
    entry->pin_number = pin_number;
    entry->state = state;
    
    strncpy(entry->label, label, PDS_TELDATA_LABEL_SIZE - 1);
    entry->label[PDS_TELDATA_LABEL_SIZE - 1] = '\0';
    
    packet->header.num_gpio_states++;
    
    return ESP_OK;
}

esp_err_t pds_telemetry_add_periph(
    pds_teldata_packet_t* packet,
    uint8_t pin,
    const char* field,
    float value,
    float voltage,
    const char* label
) {
    if (!packet || !field || !label) {
        return ESP_ERR_INVALID_ARG;
    }
    if (packet->num_periph_readings >= PDS_TELDATA_MAX_PERIPH_READINGS) {
        ESP_LOGW(TAG, "Peripheral readings buffer full (%u/%u)",
                 packet->num_periph_readings, PDS_TELDATA_MAX_PERIPH_READINGS);
        return ESP_ERR_NO_MEM;
    }
    pds_teldata_periph_reading_t *e = &packet->periph_readings[packet->num_periph_readings];
    e->pin     = pin;
    e->value   = value;
    e->voltage = voltage;
    strncpy(e->field, field, PDS_TELDATA_PERIPH_FIELD_SIZE - 1);
    e->field[PDS_TELDATA_PERIPH_FIELD_SIZE - 1] = '\0';
    strncpy(e->label, label, PDS_TELDATA_LABEL_SIZE - 1);
    e->label[PDS_TELDATA_LABEL_SIZE - 1] = '\0';
    packet->num_periph_readings++;
    return ESP_OK;
}

esp_err_t pds_telemetry_add_timer(
    pds_teldata_packet_t* packet,
    uint8_t timer_id,
    uint8_t active,
    uint32_t value,
    uint32_t elapsed_ms,
    const char* label
) {
    if (!packet || !label) {
        return ESP_ERR_INVALID_ARG;
    }

    if (packet->num_timer_states >= PDS_TELDATA_MAX_TIMER_STATES) {
        ESP_LOGW(TAG, "Timer states buffer full (%u/%u)",
                 packet->num_timer_states, PDS_TELDATA_MAX_TIMER_STATES);
        return ESP_ERR_NO_MEM;
    }

    pds_teldata_timer_state_t *entry = &packet->timer_states[packet->num_timer_states];
    entry->timer_id   = timer_id;
    entry->active     = active;
    entry->_pad[0]    = 0;
    entry->_pad[1]    = 0;
    entry->value      = value;
    entry->elapsed_ms = elapsed_ms;
    strncpy(entry->label, label, PDS_TELDATA_LABEL_SIZE - 1);
    entry->label[PDS_TELDATA_LABEL_SIZE - 1] = '\0';

    packet->num_timer_states++;

    return ESP_OK;
}

esp_err_t pds_telemetry_deserialize(
    const uint8_t* buffer,
    size_t buffer_size,
    pds_teldata_packet_t* packet
) {
    if (!buffer || !packet || buffer_size < sizeof(pds_teldata_header_t)) {
        return ESP_ERR_INVALID_ARG;
    }
    
    // Parse header
    const pds_teldata_header_t* header = (const pds_teldata_header_t*)buffer;
    
    if (!pds_teldata_packet_validate((const pds_teldata_packet_t*)buffer)) {
        ESP_LOGE(TAG, "Invalid telemetry packet");
        return ESP_ERR_INVALID_ARG;
    }
    
    // Calculate expected size
    size_t expected_size = sizeof(pds_teldata_header_t);
    expected_size += header->num_adc_readings * sizeof(pds_teldata_adc_reading_t);
    expected_size += header->num_pwm_outputs * sizeof(pds_teldata_pwm_state_t);
    expected_size += header->num_gpio_states * sizeof(pds_teldata_gpio_state_t);
    
    if (expected_size > buffer_size) {
        ESP_LOGE(TAG, "Buffer too small: expected %zu, got %zu", expected_size, buffer_size);
        return ESP_ERR_INVALID_ARG;
    }
    
    // Copy entire packet
    memcpy(packet, buffer, expected_size);
    
    return ESP_OK;
}

uint16_t pds_telemetry_get_packet_id(void) {
    return g_telemetry.packet_id;
}

esp_err_t pds_telemetry_register_provider(pds_telemetry_provider_t provider)
{
    if (!provider) return ESP_ERR_INVALID_ARG;
    g_telemetry.provider = provider;
    ESP_LOGI(TAG, "Telemetry provider registered");
    return ESP_OK;
}

esp_err_t pds_telemetry_deinit(void) {
    if (!g_telemetry.initialized) {
        return ESP_OK;
    }
    
    memset(&g_telemetry, 0, sizeof(telemetry_state_t));
    ESP_LOGI(TAG, "Telemetry subsystem shutdown");
    return ESP_OK;
}
