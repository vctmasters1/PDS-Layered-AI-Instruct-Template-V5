/* pds_adc_registry.h — ADC channel registry
 *
 * Central store for all ADC inputs across the device. Each entry holds:
 *   - the channel identifier (GPIO pin number or external ADC index)
 *   - a read_fn that knows how to fetch a raw value for that channel
 *     (may be PDS_ADC_read for built-in ESP32 ADC, or ads1115_read for I2C, etc.)
 *   - a to_mv_fn that converts the raw value to millivolts
 *   - the last cached raw + mV values from the most recent read
 *
 * See pds_hal/registries/AI-INSTRUCT.md for full architecture.
 */

#ifndef PDS_ADC_REGISTRY_H
#define PDS_ADC_REGISTRY_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"
#include "pds_adc.h"   /* pds_adc_atten_t, pds_adc_width_t, PDS_ADC_configure */

#ifdef __cplusplus
extern "C" {
#endif

#define PDS_ADC_REG_MAX_CHANNELS  16

typedef int (*pds_adc_read_fn_t)(uint32_t channel);
typedef int (*pds_adc_raw_to_mv_fn_t)(uint32_t channel, int raw);

typedef struct {
    uint32_t                channel;
    pds_adc_read_fn_t       read_fn;     /* e.g. PDS_ADC_read, ads1115_read */
    pds_adc_raw_to_mv_fn_t  to_mv_fn;    /* e.g. PDS_ADC_raw_to_mv; NULL = use raw as mV */
    int32_t                 cached_raw;
    int32_t                 cached_mv;
    bool                    valid;       /* true after first successful read */
    bool                    registered;
    char                    label[16];
} pds_adc_reg_entry_t;

/**
 * Register an ADC channel. Internally calls PDS_ADC_configure() for built-in ESP32 ADC.
 * Idempotent — safe to call again on settings update.
 */
esp_err_t pds_adc_reg_register(uint32_t channel,
                                pds_adc_atten_t atten, pds_adc_width_t width,
                                pds_adc_read_fn_t read_fn,
                                pds_adc_raw_to_mv_fn_t to_mv_fn,
                                const char *label);

/**
 * Register an external ADC channel (e.g. ADS1115 over I2C).
 * Unlike pds_adc_reg_register(), does NOT call PDS_ADC_configure() —
 * the hardware is assumed to be initialised separately before pipeline load.
 * Use ADS1115_CHANNEL(dev, ain) for channel values (100+) to avoid collision
 * with ESP32 GPIO channel numbers.
 */
esp_err_t pds_adc_reg_register_ext(uint32_t channel,
                                    pds_adc_read_fn_t read_fn,
                                    pds_adc_raw_to_mv_fn_t to_mv_fn,
                                    const char *label);

/**
 * Read channel via registered read_fn, average over `samples`, cache result.
 * raw_out and mv_out are optional (may be NULL).
 */
esp_err_t pds_adc_reg_read(uint32_t channel, uint8_t samples,
                            int32_t *raw_out, int32_t *mv_out);

/** Convert raw value to mV using the registered to_mv_fn for this channel. */
int pds_adc_reg_raw_to_mv(uint32_t channel, int raw);

/** Returns cached raw value from last read. No hardware access. */
int32_t pds_adc_reg_get_cached_raw(uint32_t channel);

/** Returns cached mV value from last read. No hardware access. */
int32_t pds_adc_reg_get_cached_mv(uint32_t channel);

/** Returns true if channel has been read at least once. */
bool pds_adc_reg_is_valid(uint32_t channel);

/**
 * Single-sample sweep of all registered channels. Call once before pipeline tick so
 * all blocks in the same tick see the same sensor snapshot without double-reading.
 */
void pds_adc_reg_refresh_all(void);

/** Number of registered channels. */
uint8_t pds_adc_reg_get_count(void);

/** Returns pointer to internal entry array (count_out entries). For telemetry snapshot. */
const pds_adc_reg_entry_t *pds_adc_reg_get_all(uint8_t *count_out);

#ifdef __cplusplus
}
#endif

#endif /* PDS_ADC_REGISTRY_H */
