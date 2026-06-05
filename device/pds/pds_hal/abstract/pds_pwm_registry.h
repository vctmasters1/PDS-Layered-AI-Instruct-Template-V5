/* pds_pwm_registry.h — PWM channel registry
 *
 * Central store for all PWM outputs across the device. Each entry holds:
 *   - the pin identifier (GPIO number or external channel index)
 *   - a set_duty_fn that writes a 0-100% duty to the output
 *     (may be PDS_PWM_set_duty_percent for built-in LEDC, or a PCA9685 function, etc.)
 *   - a get_duty_fn that reads back the current duty
 *   - the last cached duty percentage
 *
 * See pds_hal/registries/AI-INSTRUCT.md for full architecture.
 */

#ifndef PDS_PWM_REGISTRY_H
#define PDS_PWM_REGISTRY_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"
#include "pds_pwm.h"   /* PDS_PWM_setup_channel, PDS_PWM_start */

#ifdef __cplusplus
extern "C" {
#endif

#define PDS_PWM_REG_MAX_CHANNELS  8

typedef esp_err_t (*pds_pwm_set_duty_fn_t)(uint32_t pin, uint32_t duty_pct);
typedef int       (*pds_pwm_get_duty_fn_t)(uint32_t pin);

typedef struct {
    uint32_t              pin;
    pds_pwm_set_duty_fn_t set_duty_fn;
    pds_pwm_get_duty_fn_t get_duty_fn;   /* may be NULL */
    uint32_t              cached_duty_pct;
    uint32_t              freq_hz;
    bool                  registered;
    char                  label[16];
} pds_pwm_reg_entry_t;

/**
 * Register a PWM channel. Internally calls PDS_PWM_setup_channel() + PDS_PWM_start().
 * Idempotent — safe to call again on settings update.
 */
esp_err_t pds_pwm_reg_register(uint32_t pin,
                                uint32_t freq_hz, uint32_t resolution_bits,
                                pds_pwm_set_duty_fn_t set_duty_fn,
                                pds_pwm_get_duty_fn_t get_duty_fn,
                                const char *label);

/** Set duty cycle (0–100%) via registered set_duty_fn. Caches result. */
esp_err_t pds_pwm_reg_set_duty(uint32_t pin, uint32_t duty_pct);

/** Returns last cached duty percentage. No hardware access. */
uint32_t pds_pwm_reg_get_duty(uint32_t pin);

/** Number of registered PWM channels. */
uint8_t pds_pwm_reg_get_count(void);

/** Returns pointer to internal entry array. For telemetry snapshot. */
const pds_pwm_reg_entry_t *pds_pwm_reg_get_all(uint8_t *count_out);

#ifdef __cplusplus
}
#endif

#endif /* PDS_PWM_REGISTRY_H */
