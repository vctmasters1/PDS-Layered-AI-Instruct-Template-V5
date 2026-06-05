/* pds_gpio_registry.c — GPIO pin registry implementation
 * See pds_hal/registries/AI-INSTRUCT.md for architecture.
 */

#include "pds_gpio_registry.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "gpio_reg";

static pds_gpio_reg_entry_t s_entries[PDS_GPIO_REG_MAX_PINS];
static uint8_t s_count = 0;

static pds_gpio_reg_entry_t *_find(uint32_t pin)
{
    for (uint8_t i = 0; i < s_count; i++) {
        if (s_entries[i].pin == pin) return &s_entries[i];
    }
    return NULL;
}

esp_err_t pds_gpio_reg_register(uint32_t pin,
                                 pds_gpio_mode_t mode, pds_gpio_pull_t pull,
                                 bool active_low,
                                 pds_gpio_read_fn_t read_fn,
                                 pds_gpio_write_fn_t write_fn,
                                 const char *label)
{
    pds_gpio_reg_entry_t *e = _find(pin);
    if (!e) {
        if (s_count >= PDS_GPIO_REG_MAX_PINS) {
            ESP_LOGE(TAG, "Registry full (max %d)", PDS_GPIO_REG_MAX_PINS);
            return ESP_ERR_NO_MEM;
        }
        e = &s_entries[s_count++];
    }

    /* Configure hardware (idempotent on re-register). */
    esp_err_t ret = PDS_GPIO_configure(pin, mode, pull);
    if (ret != ESP_OK) return ret;

    e->pin        = pin;
    e->mode       = mode;
    e->active_low = active_low;
    e->read_fn    = read_fn;
    e->write_fn   = write_fn;
    e->registered = true;
    strncpy(e->label, label ? label : "", sizeof(e->label) - 1);
    e->label[sizeof(e->label) - 1] = '\0';

    ESP_LOGI(TAG, "GPIO%u registered ('%s', %s)", (unsigned)pin, e->label,
             mode == PDS_GPIO_MODE_INPUT ? "INPUT" : "OUTPUT");
    return ESP_OK;
}

esp_err_t pds_gpio_reg_write(uint32_t pin, uint32_t level)
{
    pds_gpio_reg_entry_t *e = _find(pin);
    if (!e || !e->write_fn) return ESP_ERR_INVALID_ARG;
    esp_err_t ret = e->write_fn(pin, level);
    if (ret == ESP_OK) e->cached_level = (level != 0u);
    return ret;
}

int pds_gpio_reg_read(uint32_t pin)
{
    pds_gpio_reg_entry_t *e = _find(pin);
    if (!e || !e->read_fn) return -1;
    int v = e->read_fn(pin);
    if (v >= 0) e->cached_level = (v != 0);
    return v;
}

bool pds_gpio_reg_get_cached(uint32_t pin)
{
    pds_gpio_reg_entry_t *e = _find(pin);
    return e ? e->cached_level : false;
}

void pds_gpio_reg_refresh_inputs(void)
{
    /* Sweep all input pins — called once per pipeline tick before engine evaluation. */
    for (uint8_t i = 0; i < s_count; i++) {
        pds_gpio_reg_entry_t *e = &s_entries[i];
        if (!e->registered || e->mode != PDS_GPIO_MODE_INPUT || !e->read_fn) continue;
        int v = e->read_fn(e->pin);
        if (v >= 0) e->cached_level = (v != 0);
    }
}

uint8_t pds_gpio_reg_get_count(void)
{
    return s_count;
}

const pds_gpio_reg_entry_t *pds_gpio_reg_get_all(uint8_t *count_out)
{
    if (count_out) *count_out = s_count;
    return s_entries;
}
