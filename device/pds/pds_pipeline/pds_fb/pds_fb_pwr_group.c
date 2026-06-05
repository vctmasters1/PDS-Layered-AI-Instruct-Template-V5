/**
 * PDS Power Group — shared power-pin coordinator implementation
 */

#include "pds_fb_pwr_group.h"
#include "pds_tel_sink.h"
#include "pds_gpio_registry.h"   /* see pds_hal/registries/AI-INSTRUCT.md */
#include "esp_timer.h"
#include "esp_log.h"
#include <string.h>
#include <stdio.h>

static const char *TAG = "pwr_group";

typedef struct {
    int8_t   pin;
    bool     active_low;
    bool     registered;
    bool     output_state;    /**< Logical ON/OFF — pointed to by telemetry slot */
    uint8_t  refcount;
    uint32_t power_on_tick;   /**< _now_ms() when power was last turned on */
} _pwr_slot_t;

static _pwr_slot_t _slots[PDS_PWR_GROUP_MAX_PINS];

static inline uint32_t _now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000LL);
}

/* ── Public API ──────────────────────────────────────────────────────────── */

esp_err_t pds_pwr_group_register(int8_t pin, bool active_low)
{
    if (pin < 0 || pin >= PDS_PWR_GROUP_MAX_PINS) return ESP_ERR_INVALID_ARG;

    _pwr_slot_t *s = &_slots[(uint8_t)pin];

    if (s->registered) {
        /* Idempotent: second block in the same group re-registers — OK. */
        s->active_low = active_low;
        return ESP_OK;
    }

    /* Register with GPIO registry — configures hardware and tracks output state. */
    char _label[16];
    snprintf(_label, sizeof(_label), "PWR%d", (int)pin);
    esp_err_t ret = pds_gpio_reg_register(
        (uint32_t)pin, PDS_GPIO_MODE_OUTPUT, PDS_GPIO_PULL_NONE,
        active_low, PDS_GPIO_get_output_level, PDS_GPIO_write, _label);
    if (ret != ESP_OK) return ret;

    pds_gpio_reg_write((uint32_t)pin, active_low ? 1u : 0u);   /* inactive = HIGH if active_low */

    s->pin          = pin;
    s->active_low   = active_low;
    s->refcount     = 0;
    s->output_state = false;
    s->registered   = true;

    /* Register with telemetry so this power-enable pin appears in the dashboard. */
    pds_tel_slot_t slot = {
        .kind = PDS_TEL_GPIO,
        .pin  = (uint8_t)pin,
        .gpio = { .active = &s->output_state, .is_input = false },
    };
    snprintf(slot.label, sizeof(slot.label), "GPIO%d", (int)pin);
    esp_err_t tel_ret = pds_tel_sink_register(&slot);
    if (tel_ret != ESP_OK) {
        ESP_LOGW(TAG, "GPIO%d: tel_sink_register failed (%d) — continuing", (int)pin, tel_ret);
    }
    return ESP_OK;
}

void pds_pwr_group_acquire(int8_t pin)
{
    if (pin < 0 || pin >= PDS_PWR_GROUP_MAX_PINS) return;
    _pwr_slot_t *s = &_slots[(uint8_t)pin];

    if (s->refcount == 0) {
        /* First requester this cycle: turn power on, stamp the tick. */
        pds_gpio_reg_write((uint32_t)pin, s->active_low ? 0u : 1u);
        s->power_on_tick = _now_ms();
        s->output_state  = true;
    }
    s->refcount++;
}

void pds_pwr_group_release(int8_t pin)
{
    if (pin < 0 || pin >= PDS_PWR_GROUP_MAX_PINS) return;
    _pwr_slot_t *s = &_slots[(uint8_t)pin];

    if (s->refcount == 0) return;   /* guard against double-release */

    s->refcount--;
    if (s->refcount == 0) {
        /* Last releaser: cut power. */
        pds_gpio_reg_write((uint32_t)pin, s->active_low ? 1u : 0u);
        s->output_state = false;
    }
}

uint32_t pds_pwr_group_on_tick(int8_t pin)
{
    if (pin < 0 || pin >= PDS_PWR_GROUP_MAX_PINS) return 0u;
    return _slots[(uint8_t)pin].power_on_tick;
}

void pds_pwr_group_clear(void)
{
    for (int i = 0; i < PDS_PWR_GROUP_MAX_PINS; i++) {
        _pwr_slot_t *s = &_slots[i];
        if (s->registered && s->refcount > 0) {
            /* Force power off before clearing. */
            PDS_GPIO_write((uint32_t)s->pin, s->active_low ? 1u : 0u);
        }
    }
    memset(_slots, 0, sizeof(_slots));
}
