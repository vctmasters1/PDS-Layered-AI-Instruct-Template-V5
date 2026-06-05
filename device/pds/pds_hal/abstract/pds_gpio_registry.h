/* pds_gpio_registry.h — GPIO pin registry
 *
 * Central store for all GPIO pins across the device. Each entry holds:
 *   - the pin identifier
 *   - a read_fn (e.g. PDS_GPIO_read, or an I2C expander read function)
 *   - a write_fn (e.g. PDS_GPIO_write, or an I2C expander write function)
 *   - the last cached logical level from the most recent read or write
 *
 * Input pins are swept by pds_gpio_reg_refresh_inputs() once before each
 * pipeline tick. All blocks in the same tick see the same pin snapshot.
 *
 * See pds_hal/registries/AI-INSTRUCT.md for full architecture.
 */

#ifndef PDS_GPIO_REGISTRY_H
#define PDS_GPIO_REGISTRY_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"
#include "pds_gpio.h"   /* pds_gpio_mode_t, pds_gpio_pull_t, PDS_GPIO_configure */

#ifdef __cplusplus
extern "C" {
#endif

#define PDS_GPIO_REG_MAX_PINS  40

typedef esp_err_t (*pds_gpio_write_fn_t)(uint32_t pin, uint32_t level);
typedef int       (*pds_gpio_read_fn_t)(uint32_t pin);

typedef struct {
    uint32_t              pin;
    pds_gpio_mode_t       mode;
    bool                  active_low;
    pds_gpio_read_fn_t    read_fn;      /* NULL for output-only pins */
    pds_gpio_write_fn_t   write_fn;     /* NULL for input-only pins */
    bool                  cached_level; /* last hardware level from read or write */
    bool                  registered;
    char                  label[16];
} pds_gpio_reg_entry_t;

/**
 * Register a GPIO pin. Internally calls PDS_GPIO_configure() for ESP32 native GPIO.
 * Idempotent — safe to call again on settings update.
 */
esp_err_t pds_gpio_reg_register(uint32_t pin,
                                 pds_gpio_mode_t mode, pds_gpio_pull_t pull,
                                 bool active_low,
                                 pds_gpio_read_fn_t read_fn,
                                 pds_gpio_write_fn_t write_fn,
                                 const char *label);

/** Write output pin via registered write_fn. Caches the driven level. */
esp_err_t pds_gpio_reg_write(uint32_t pin, uint32_t level);

/** Read input pin via registered read_fn. Caches result. Returns -1 on error. */
int pds_gpio_reg_read(uint32_t pin);

/** Returns cached hardware level from last write or read. No hardware access. */
bool pds_gpio_reg_get_cached(uint32_t pin);

/**
 * Sweep all registered INPUT pins: reads once and caches.
 * Call before pipeline tick so all blocks see the same snapshot.
 */
void pds_gpio_reg_refresh_inputs(void);

/** Number of registered pins. */
uint8_t pds_gpio_reg_get_count(void);

/** Returns pointer to internal entry array. For telemetry snapshot. */
const pds_gpio_reg_entry_t *pds_gpio_reg_get_all(uint8_t *count_out);

#ifdef __cplusplus
}
#endif

#endif /* PDS_GPIO_REGISTRY_H */
