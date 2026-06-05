/**
 * @file pds_tel_sink.h
 * @brief Generic telemetry sink — live-state slot registry.
 *
 * Each pds_fb_* block calls pds_tel_sink_register() at init time to publish
 * a pointer to its live state. pds_telemetry_collect() reads the registry and
 * snapshots all values into the telemetry packet.
 *
 * No role code, no provider callback, no block accessor needed.
 * Uses only basic C types (float*, int32_t*, bool*) — no pds_network deps.
 */

#ifndef PDS_TEL_SINK_H
#define PDS_TEL_SINK_H

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define PDS_TEL_SINK_MAX_SLOTS  32
#define PDS_TEL_SINK_LABEL_SIZE 32

typedef enum {
    PDS_TEL_ADC   = 0,  /**< Analog sensor (sensor_analog) */
    PDS_TEL_PWM   = 1,  /**< PWM actuator  (pwm_output)    */
    PDS_TEL_GPIO  = 2,  /**< Digital I/O   (switch_output, gpio_input) */
    PDS_TEL_TIMER = 3,  /**< Timer block   (timer_cycle, timer_countdown, timer_countup) */
    PDS_TEL_PERIPH  = 4, /**< Peripheral float sensor (sensor_dht22_temp/humid, etc.) */
    PDS_TEL_PIPELINE= 5, /**< Pipeline block settable float field (cp:<pl>:<blk>:<field>) */
} pds_tel_kind_t;

typedef struct {
    pds_tel_kind_t kind;
    uint8_t        pin;
    char           label[PDS_TEL_SINK_LABEL_SIZE];
    union {
        struct {
            const float   *value;        /**< Calibrated engineering value   */
            const int32_t *raw;          /**< Raw ADC counts                 */
            uint8_t        adc_channel;  /**< For PDS_ADC_raw_to_mv()        */
        } adc;
        struct {
            const float *duty_pct;       /**< Effective duty 0–100 %         */
            uint32_t     freq_hz;        /**< PWM carrier frequency          */
        } pwm;
        struct {
            const bool *active;          /**< Logical (debounced) state      */
            bool        is_input;        /**< true = gpio_input (use HAL read), false = gpio_output (use output cache) */
        } gpio;
        struct {
            const bool     *active;      /**< Timer active flag              */
            const float    *active_f;    /**< Float version of active        */
            const uint32_t *value;       /**< cycle_count / current_count / remaining_ms */
            const uint32_t *elapsed_ms;  /**< ms elapsed in current phase; NULL if not applicable */
        } timer;
        struct {
            const float *value;          /**< Pointer to live float reading  */
            const float *voltage_v;      /**< Pointer to raw voltage (V); NULL if not available */
            uint8_t      pin;            /**< Physical data pin number       */
            char         field[16];      /**< Channel name: "temp", "humid", "position", etc. */
        } periph;
        struct {
            const float *value;          /**< Pointer to live pipeline block float field */
        } pipeline;
    };
} pds_tel_slot_t;

/**
 * Register a live-state slot. Called by each pds_fb_*_init().
 * @return ESP_ERR_NO_MEM if the slot table is full.
 */
esp_err_t pds_tel_sink_register(const pds_tel_slot_t *slot);

/**
 * Clear all registered slots. Called by pipeline engine teardown.
 */
void pds_tel_sink_clear(void);

/** Number of currently registered slots. */
int pds_tel_sink_count(void);

/** Returns slot[idx], or NULL if out of range. */
const pds_tel_slot_t *pds_tel_sink_get(int idx);

/**
 * Look up a live float value by telemetry label (O(N) strcmp scan).
 * Returns NULL if not found or if the slot kind has no float value (e.g. GPIO).
 */
const float *pds_tel_sink_lookup(const char *key);

#ifdef __cplusplus
}
#endif

#endif /* PDS_TEL_SINK_H */
