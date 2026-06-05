/* pds_pwm_registry.c — PWM channel registry implementation
 * See pds_hal/registries/AI-INSTRUCT.md for architecture.
 */

#include "pds_pwm_registry.h"
#include "esp_log.h"
#include <inttypes.h>
#include <string.h>

static const char *TAG = "pwm_reg";

static pds_pwm_reg_entry_t s_entries[PDS_PWM_REG_MAX_CHANNELS];
static uint8_t s_count = 0;

static pds_pwm_reg_entry_t *_find(uint32_t pin)
{
    for (uint8_t i = 0; i < s_count; i++) {
        if (s_entries[i].pin == pin) return &s_entries[i];
    }
    return NULL;
}

esp_err_t pds_pwm_reg_register(uint32_t pin,
                                uint32_t freq_hz, uint32_t resolution_bits,
                                pds_pwm_set_duty_fn_t set_duty_fn,
                                pds_pwm_get_duty_fn_t get_duty_fn,
                                const char *label)
{
    if (!set_duty_fn) return ESP_ERR_INVALID_ARG;

    pds_pwm_reg_entry_t *e = _find(pin);
    if (!e) {
        if (s_count >= PDS_PWM_REG_MAX_CHANNELS) {
            ESP_LOGE(TAG, "Registry full (max %d)", PDS_PWM_REG_MAX_CHANNELS);
            return ESP_ERR_NO_MEM;
        }
        e = &s_entries[s_count++];
    }

    /* Configure LEDC channel + zero duty + start (idempotent on re-register). */
    esp_err_t ret = PDS_PWM_setup_channel(pin, freq_hz, resolution_bits);
    if (ret != ESP_OK) return ret;
    ret = PDS_PWM_set_duty_percent((PDS_PWM_channel_t)pin, 0u);
    if (ret != ESP_OK) return ret;
    ret = PDS_PWM_start((PDS_PWM_channel_t)pin);
    if (ret != ESP_OK) return ret;

    e->pin             = pin;
    e->freq_hz         = freq_hz;
    e->set_duty_fn     = set_duty_fn;
    e->get_duty_fn     = get_duty_fn;
    e->cached_duty_pct = 0;
    e->registered      = true;
    strncpy(e->label, label ? label : "", sizeof(e->label) - 1);
    e->label[sizeof(e->label) - 1] = '\0';

    ESP_LOGI(TAG, "GPIO%u PWM registered @ %"PRIu32"Hz ('%s')", (unsigned)pin, freq_hz, e->label);
    return ESP_OK;
}

esp_err_t pds_pwm_reg_set_duty(uint32_t pin, uint32_t duty_pct)
{
    pds_pwm_reg_entry_t *e = _find(pin);
    if (!e || !e->set_duty_fn) return ESP_ERR_INVALID_ARG;
    esp_err_t ret = e->set_duty_fn(pin, duty_pct);
    if (ret == ESP_OK) e->cached_duty_pct = duty_pct;
    return ret;
}

uint32_t pds_pwm_reg_get_duty(uint32_t pin)
{
    pds_pwm_reg_entry_t *e = _find(pin);
    return e ? e->cached_duty_pct : 0u;
}

uint8_t pds_pwm_reg_get_count(void)
{
    return s_count;
}

const pds_pwm_reg_entry_t *pds_pwm_reg_get_all(uint8_t *count_out)
{
    if (count_out) *count_out = s_count;
    return s_entries;
}
