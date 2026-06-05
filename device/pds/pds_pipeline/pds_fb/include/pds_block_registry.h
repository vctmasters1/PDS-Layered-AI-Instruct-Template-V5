/**
 * PDS Block Registry
 *
 * Compile-time table mapping Layer 1 type IDs to block init/run/connect
 * function pointers and settings/pins sizes. Never sent over the wire.
 *
 * The pipeline engine uses this table to build and tick pipelines from
 * the raw binary blobs stored in NVS.
 *
 * Bootstrap note: pins_size = 0 for all blocks except fb_ref until the
 * pins_t / settings_t split refactor is complete. All pin fields remain in
 * the combined settings_t and are carried in Layer 3.
 */

#ifndef PDS_BLOCK_REGISTRY_H
#define PDS_BLOCK_REGISTRY_H

#include "pds_component_base.h"
#include <stdint.h>

/* ── Block Type IDs — must match Layer 1 byte stream sentinel map ── */
typedef enum {
    PDS_BLOCK_SENSOR_ANALOG      = 0x01,
    PDS_BLOCK_SENSOR_DHT22_TEMP  = 0x02,   /**< DHT22 temperature output (°C) */
    PDS_BLOCK_SENSOR_DHT22_HUMID = 0x03,   /**< DHT22 humidity output (%RH) */
    PDS_BLOCK_HMI_TOGGLE         = 0x04,   /**< Virtual latching switch — set via HMI */
    PDS_BLOCK_HMI_MOMENTARY      = 0x05,   /**< Virtual momentary button — pulse via HMI */
    PDS_BLOCK_HMI_RUN_ROUTINE    = 0x06,   /**< Virtual one-shot routine — start/abort via HMI */
    PDS_BLOCK_PIPELINE_SUSPEND    = 0x07,   /**< Rising edge → suspend target pipeline (latching) */
    PDS_BLOCK_PIPELINE_RESUME     = 0x08,   /**< Rising edge → resume target pipeline */
    PDS_BLOCK_LOGIC_OR            = 0x09,   /**< Output 1.0 if input A OR input B >= 0.5 */
    PDS_BLOCK_HMI_INITIATE        = 0x0A,   /**< One-shot trigger set by HMI; auto-clears after one tick */
    PDS_BLOCK_DELAY              = 0x0B,   /**< Rising-edge one-shot delay timer — fires active_f for one tick after delay_ms */
    PDS_BLOCK_SENSOR_PH          = 0x0C,   /**< Power-gated analog pH probe — ADC_PROBE mutex group */
    PDS_BLOCK_SENSOR_EC          = 0x0D,   /**< Power-gated analog EC/PPM probe — ADC_PROBE mutex group */
    PDS_BLOCK_TIMER_COUNTDOWN    = 0x10,
    PDS_BLOCK_TIMER_COUNTUP    = 0x11,
    PDS_BLOCK_TIMER_CYCLE      = 0x12,
    PDS_BLOCK_PID_PWM          = 0x20,
    PDS_BLOCK_PID              = 0x21,
    PDS_BLOCK_PWM_OUTPUT       = 0x22,
    PDS_BLOCK_GPIO_INPUT       = 0x30,
    PDS_BLOCK_GPIO_OUTPUT      = 0x31,
    PDS_BLOCK_GPIO_VALUE       = 0x32,   /**< Cross-pipeline gpio_input reference (read cached bool state) */
    PDS_BLOCK_LIMIT_HIGH       = 0x40,
    PDS_BLOCK_LIMIT_LOW        = 0x41,
    PDS_BLOCK_REF              = 0x50,
    PDS_BLOCK_SENSOR_VALUE     = 0x51,   /**< Cross-pipeline sensor reference (sensor slot by index) */
    /* ── Stepper motor drivers — velocity mode (continuous speed) ─── */
    PDS_BLOCK_STEPPER_A4988_VELOCITY   = 0x60,
    PDS_BLOCK_STEPPER_DRV8825_VELOCITY = 0x61,
    PDS_BLOCK_STEPPER_TB6600_VELOCITY  = 0x62,
    PDS_BLOCK_STEPPER_TMC2209_VELOCITY = 0x63,
    PDS_BLOCK_STEPPER_TMC2208_VELOCITY = 0x64,
    /* ── Stepper motor drivers — position mode (move N steps) ─── */
    PDS_BLOCK_STEPPER_A4988_POSITION   = 0x65,
    PDS_BLOCK_STEPPER_DRV8825_POSITION = 0x66,
    PDS_BLOCK_STEPPER_TB6600_POSITION  = 0x67,
    PDS_BLOCK_STEPPER_TMC2209_POSITION = 0x68,
    PDS_BLOCK_STEPPER_TMC2208_POSITION = 0x69,
    /* ── Fan / distribute ─── */
    PDS_BLOCK_FAN_FLOAT        = 0x70,
    // PDS_BLOCK_FAN_BOOL         = 0x71,   /* deprecated: use fan_float (0x70) */
    /* ── LED output ─── */
    PDS_BLOCK_LED_ADDR         = 0x80,
    /* ── System ─── */
    PDS_BLOCK_ALL_STOP         = 0x90,
    /* ── Precision peripheral sensors ─── */
    PDS_BLOCK_SENSOR_HX711     = 0xA0,   /**< HX711 24-bit load-cell ADC */
    PDS_BLOCK_ENCODER_POSITION = 0xA1,   /**< Quadrature encoder — position output (float count) */
    PDS_BLOCK_ENCODER_VELOCITY = 0xA2,   /**< Quadrature encoder — velocity output (RPM) */
    PDS_BLOCK_ENCODER_MAPPED   = 0xA3,   /**< Encoder mapped — linear-mapped float output */
} pds_block_type_t;

/* ── Registry Entry ── */
typedef struct {
    uint8_t  type_id;
    uint16_t pins_size;      /**< Bytes consumed from Layer 2 per block instance */
    uint16_t settings_size;  /**< Bytes consumed from Layer 3 per block instance */

    /** Allocate and initialise the block. pins and/or settings may be NULL. */
    esp_err_t (*init)(const void *pins, const void *settings, pds_comp_handle_t *out);

    /** Non-blocking tick. Called every update_rate_ms from the pipeline engine. */
    pds_comp_status_t (*run)(pds_comp_handle_t handle);

    /** Apply fresh settings from Layer 3 without reinitialising. */
    void (*set_settings)(pds_comp_handle_t handle, const void *settings);

    /**
     * Connect src_ptr to this block's input port.
     * port = 0 is always the primary input.
     * src_ptr type is float* or bool* depending on block type and port.
     * No-op if the block has no pipeline inputs (e.g. sensor_analog, timer_cycle).
     */
    void (*connect)(pds_comp_handle_t dst, uint8_t port, const void *src_ptr);

    /**
     * Return a pointer to this block's output field for the given port.
     * port = 0 is always the primary output.
     * Returns NULL for terminal blocks (e.g. gpio_output).
     * Type is float* or bool* — the consuming block's connect() knows which.
     */
    const void *(*output_ptr)(pds_comp_handle_t handle, uint8_t port);

    /**
     * Drive all hardware outputs to their safe/resting state.
     * Called by pds_pipeline_engine_all_stop() on every block that has this set.
     * NULL for logic-only blocks (sensors, timers, fans, ref).
     */
    void (*safe_state)(pds_comp_handle_t handle);

    /**
     * Release any system resources held by the block (peripherals, driver
     * handles, DMA buffers, etc.) BEFORE the ctx struct is freed.
     * Called by engine_teardown() for each block prior to free(handle).
     * NULL for blocks that own no sub-allocated resources.
     */
    void (*destroy)(pds_comp_handle_t handle);
} pds_block_type_entry_t;

/**
 * @brief Look up a registry entry by Layer 1 type ID byte.
 * @return Pointer to entry, or NULL if type_id is not registered.
 */
const pds_block_type_entry_t *pds_block_registry_lookup(uint8_t type_id);

extern const pds_block_type_entry_t pds_block_registry[];
extern const uint8_t                pds_block_registry_count;

#endif /* PDS_BLOCK_REGISTRY_H */
