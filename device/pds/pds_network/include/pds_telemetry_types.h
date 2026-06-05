/**
 * @file pds_telemetry_types.h
 * @brief Binary wire format structs for telemetry and configuration
 * 
 * These structs define the binary format for:
 * - Telemetry packets (PDS_TELDATA_*) - Device → Android via GET /status
 * - Configuration packets (PDS_TELCONF_*) - Android → Device via POST /config
 * 
 * ALL structs use:
 * - Fixed-size types (uint32_t, uint16_t, etc.)
 * - Packed layout (no padding) via __attribute__((packed))
 * - Little-endian byte order (validated at runtime)
 * - Version field for forward compatibility
 * 
 * CRITICAL: Do NOT modify struct member order or sizes - breaks wire format!
 * 
 * See PROTOCOL.md for complete packet specifications.
 */

#ifndef PDS_TELEMETRY_TYPES_H
#define PDS_TELEMETRY_TYPES_H

#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include "pds_types.h"   /* pds_pin_function_t — canonical pin func enum shared with pds_core */

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Wire format version - MUST match Android app
 * Increment only when adding new fields (maintain backward compatibility)
 */
#define PDS_TELEMETRY_VERSION 0x0001

/**
 * Maximum number of readings per telemetry packet
 */
#define PDS_TELDATA_MAX_ADC_READINGS    22
#define PDS_TELDATA_MAX_PWM_OUTPUTS     8
#define PDS_TELDATA_MAX_GPIO_STATES     22
#define PDS_TELDATA_MAX_TIMER_STATES    16
#define PDS_TELDATA_MAX_PERIPH_READINGS 8
#define PDS_TELDATA_PERIPH_FIELD_SIZE   8

/**
 * Label field size (pin/sensor descriptions, null-terminated)
 */
#define PDS_TELDATA_LABEL_SIZE          32

/**
 * Configuration types (POST /config target types)
 */
#define PDS_CONFIG_TYPE_SET_PWM_DUTY    1
#define PDS_CONFIG_TYPE_SET_GPIO_OUT    2
#define PDS_CONFIG_TYPE_SET_PIN_ENABLE  3
#define PDS_CONFIG_TYPE_CALIBRATE_ADC   4

/**
 * Status flags in telemetry header
 */
#define PDS_TELDATA_STATUS_OK           0x00
#define PDS_TELDATA_STATUS_ERROR        0x01
#define PDS_TELDATA_STATUS_WARNING      0x02
#define PDS_TELDATA_STATUS_PROVISIONING 0x04

/* ============================================================================
 * TELEMETRY PACKET STRUCTS (Device → Android via GET /status)
 * ============================================================================ */

/**
 * Single ADC reading entry within telemetry packet
 * Size: 42 bytes per entry
 */
typedef struct {
    uint8_t     pin_number;              /**< GPIO pin that ADC is reading (offset 0) */
    uint16_t    raw_value;               /**< Raw ADC value (12-bit: 0-4095) (offset 1) */
    float       voltage;                 /**< Converted voltage (0.0-3.3V) (offset 3) */
    float       calibrated_value;        /**< Calibration-adjusted value (offset 7) */
    char        label[PDS_TELDATA_LABEL_SIZE];  /**< Sensor name (offset 11) */
} __attribute__((packed)) pds_teldata_adc_reading_t;

/**
 * Single PWM output state within telemetry packet
 * Size: 38 bytes per entry
 */
typedef struct {
    uint8_t     pin_number;              /**< GPIO pin driving PWM (offset 0) */
    uint16_t    duty_cycle;              /**< Current duty cycle 0-1000 (offset 1) */
    uint32_t    frequency;               /**< PWM frequency in Hz (offset 3) */
    char        label[PDS_TELDATA_LABEL_SIZE];  /**< Actuator name (offset 7) */
} __attribute__((packed)) pds_teldata_pwm_state_t;

/**
 * Single GPIO state within telemetry packet
 * Size: 34 bytes per entry
 */
typedef struct {
    uint8_t     pin_number;              /**< GPIO pin number (offset 0) */
    uint8_t     state;                   /**< GPIO state (0=LOW, 1=HIGH) (offset 1) */
    char        label[PDS_TELDATA_LABEL_SIZE];  /**< Device name (offset 2) */
} __attribute__((packed)) pds_teldata_gpio_state_t;

/**
 * Single peripheral sensor reading (DHT22 temp/humid, etc.)
 * Not part of binary wire format — JSON/cloud push only.
 */
typedef struct {
    uint8_t  pin;                                    /**< Physical data pin (e.g. DHT22 data line) */
    char     field[PDS_TELDATA_PERIPH_FIELD_SIZE];   /**< Channel: "temp" or "humid" */
    float    value;                                  /**< Current reading */
    float    voltage;                                /**< Raw sensor voltage (0 if not available) */
    char     label[PDS_TELDATA_LABEL_SIZE];          /**< Auto-generated label e.g. "dht22:22:temp" */
} pds_teldata_periph_reading_t;

/**
 * Single timer state within telemetry packet
 * Size: 44 bytes per entry (JSON/cloud push only — not binary wire format)
 */
typedef struct {
    uint8_t     timer_id;                        /**< Sequential timer index (0-based) */
    uint8_t     active;                          /**< 1 = timer active, 0 = idle */
    uint8_t     _pad[2];                         /**< Reserved, must be 0 */
    uint32_t    value;                           /**< cycle_count / current_count / remaining_ms */
    uint32_t    elapsed_ms;                      /**< ms elapsed in current ON/OFF phase (timer_cycle); 0 for others */
    char        label[PDS_TELDATA_LABEL_SIZE];   /**< Timer name */
} __attribute__((packed)) pds_teldata_timer_state_t;

/**
 * Telemetry packet header
 * Size: 16 bytes
 * 
 * Followed by variable-length data:
 * - num_adc_readings × pds_teldata_adc_reading_t (42 bytes each)
 * - num_pwm_outputs × pds_teldata_pwm_state_t (38 bytes each)
 * - num_gpio_states × pds_teldata_gpio_state_t (34 bytes each)
 */
typedef struct {
    uint32_t    timestamp_ms;            /**< Device uptime in milliseconds (offset 0) */
    uint32_t    timestamp_unix;          /**< Unix timestamp (seconds since epoch) (offset 4) */
    uint16_t    version;                 /**< Protocol version (0x0001) (offset 8) */
    uint16_t    packet_id;               /**< Sequential packet counter (offset 10) */
    uint8_t     num_adc_readings;        /**< Count of ADC entries (offset 12) */
    uint8_t     num_pwm_outputs;         /**< Count of PWM entries (offset 13) */
    uint8_t     num_gpio_states;         /**< Count of GPIO entries (offset 14) */
    uint8_t     status_flags;            /**< System status flags (offset 15) */
} __attribute__((packed)) pds_teldata_header_t;

/**
 * Complete telemetry packet (all data)
 * Maximum size: 16 (header) + 924 (ADC) + 228 (PWM) + 748 (GPIO) = 1916 bytes
 */
typedef struct {
    pds_teldata_header_t header;
    pds_teldata_adc_reading_t  adc_readings[PDS_TELDATA_MAX_ADC_READINGS];
    pds_teldata_pwm_state_t    pwm_outputs[PDS_TELDATA_MAX_PWM_OUTPUTS];
    pds_teldata_gpio_state_t   gpio_states[PDS_TELDATA_MAX_GPIO_STATES];
    /* Timer states — not part of binary wire format; used for JSON/cloud push only. */
    uint8_t                    num_timer_states;
    pds_teldata_timer_state_t  timer_states[PDS_TELDATA_MAX_TIMER_STATES];
    /* Peripheral sensor readings — not part of binary wire format; used for JSON/cloud push only. */
    uint8_t                       num_periph_readings;
    pds_teldata_periph_reading_t  periph_readings[PDS_TELDATA_MAX_PERIPH_READINGS];
} pds_teldata_packet_t;

/* ============================================================================
 * CONFIGURATION PACKET STRUCTS (Android → Device via POST /config)
 * ============================================================================ */

/**
 * Configuration packet (POST /config request body)
 * Size: Fixed 16 bytes
 * 
 * Used to update device configuration remotely:
 * - Adjust PWM duty cycles
 * - Toggle GPIO outputs
 * - Enable/disable pins
 * - Calibrate ADC sensors
 */
typedef struct {
    uint32_t    timestamp_ms;            /**< Request timestamp (offset 0) */
    uint16_t    version;                 /**< Protocol version (0x0001) (offset 4) */
    uint16_t    config_type;             /**< Config type (1-4 as defined above) (offset 6) */
    uint8_t     target_pin;              /**< GPIO pin number to configure (offset 8) */
    uint8_t     reserved1;               /**< Reserved for future use (offset 9) */
    uint8_t     reserved2;               /**< Reserved for future use (offset 10) */
    uint8_t     reserved3;               /**< Reserved for future use (offset 11) */
    uint32_t    config_value;            /**< Config value (depends on type) (offset 12) */
} __attribute__((packed)) pds_telconf_packet_t;

/**
 * Single pin configuration entry in full config response
 */
typedef struct {
    uint8_t     pin_number;              /**< GPIO pin number */
    uint8_t     function;                /**< Pin function (ADC, PWM, GPIO_IN, GPIO_OUT, etc.) */
    uint16_t    flags;                   /**< Pin configuration flags */
    uint16_t    init_value;              /**< Initial/current value */
    char        label[PDS_TELDATA_LABEL_SIZE];  /**< Pin name */
} __attribute__((packed)) pds_telconf_pin_entry_t;

/**
 * Full configuration response (GET /config response body)
 * Size: 16-byte header + (up to 16 pins × 38 bytes each) = max ~624 bytes
 */
typedef struct {
    uint32_t    timestamp_ms;            /**< Device uptime (ms) */
    uint32_t    timestamp_unix;          /**< Unix timestamp (seconds) */
    uint16_t    version;                 /**< Protocol version (0x0001) */
    uint8_t     num_pins;                /**< Number of pin entries */
    uint8_t     reserved;                /**< Reserved padding */
    pds_telconf_pin_entry_t pins[16];   /**< Pin configuration table */
} __attribute__((packed)) pds_telconf_full_config_t;

/* ============================================================================
 * RUNTIME VALIDATION & HELPERS
 * ============================================================================ */

/**
 * Compile-time size checks - catches wire format changes during build
 */
_Static_assert(sizeof(pds_teldata_header_t) == 16, 
    "pds_teldata_header_t must be exactly 16 bytes");

_Static_assert(sizeof(pds_teldata_adc_reading_t) == 43,
    "pds_teldata_adc_reading_t must be exactly 43 bytes");

_Static_assert(sizeof(pds_teldata_pwm_state_t) == 39,
    "pds_teldata_pwm_state_t must be exactly 39 bytes");

_Static_assert(sizeof(pds_teldata_gpio_state_t) == 34,
    "pds_teldata_gpio_state_t must be exactly 34 bytes");

_Static_assert(sizeof(pds_telconf_packet_t) == 16,
    "pds_telconf_packet_t must be exactly 16 bytes");

_Static_assert(sizeof(pds_telconf_pin_entry_t) == 38,
    "pds_telconf_pin_entry_t must be exactly 38 bytes");

/**
 * Initialize a telemetry packet with default values
 * 
 * @param packet Pointer to packet structure
 * @return true if successful
 */
static inline bool pds_teldata_packet_init(pds_teldata_packet_t* packet) {
    if (!packet) return false;
    memset(packet, 0, sizeof(pds_teldata_packet_t));
    packet->header.version = PDS_TELEMETRY_VERSION;
    packet->header.status_flags = PDS_TELDATA_STATUS_OK;
    return true;
}

/**
 * Initialize a configuration packet with default values
 * 
 * @param packet Pointer to packet structure
 * @return true if successful
 */
static inline bool pds_telconf_packet_init(pds_telconf_packet_t* packet) {
    if (!packet) return false;
    memset(packet, 0, sizeof(pds_telconf_packet_t));
    packet->version = PDS_TELEMETRY_VERSION;
    return true;
}

/**
 * Validate telemetry packet integrity
 * - Checks version field
 * - Verifies count fields are within bounds
 * - Ensures payload size is reasonable
 * 
 * @param packet Pointer to packet
 * @return true if packet is valid
 */
static inline bool pds_teldata_packet_validate(const pds_teldata_packet_t* packet) {
    if (!packet) return false;
    if (packet->header.version != PDS_TELEMETRY_VERSION) return false;
    if (packet->header.num_adc_readings > PDS_TELDATA_MAX_ADC_READINGS) return false;
    if (packet->header.num_pwm_outputs > PDS_TELDATA_MAX_PWM_OUTPUTS) return false;
    if (packet->header.num_gpio_states > PDS_TELDATA_MAX_GPIO_STATES) return false;
    return true;
}

/**
 * Validate configuration packet
 * - Checks version field
 * - Verifies config type is in valid range (1-4)
 * - Ensures pin number is valid (0-63)
 * 
 * @param packet Pointer to packet
 * @return true if packet is valid
 */
static inline bool pds_telconf_packet_validate(const pds_telconf_packet_t* packet) {
    if (!packet) return false;
    if (packet->version != PDS_TELEMETRY_VERSION) return false;
    if (packet->config_type < 1 || packet->config_type > 4) return false;
    if (packet->target_pin > 63) return false;  // ESP32 max GPIO
    return true;
}

/* ============================================================================
 * RUNTIME CONFIGURATION UPLOAD STRUCTS (HMI → Device via POST /config)
 * ============================================================================
 * 
 * These three packets define the complete device runtime configuration:
 * 1. PDS_TELCONF_PINMAP  - Hardware pin assignments & variable mappings
 * 2. PDS_TELCONF_LADDER  - Logic automation bytecode/IL
 * 3. PDS_TELCONF_USRSET  - User-tunable settings (thresholds, timings, modes)
 * 
 * This enables GENERIC CoreBinary that learns its hardware at runtime.
 */

/**
 * Pin function enum (matching hardware capabilities)
 * Used in pds_telconf_pinmap_entry_t
 * NOTE: These values are defined as an enum in pds_types.h (pds_pin_function_t).
 *       Do NOT redefine them here as macros — it causes name conflicts when both
 *       headers are included. Use pds_pin_function_t enum values directly.
 */
/* PDS_PIN_FUNC_* values come from pds_types.h:pds_pin_function_t — 0..9 */

/**
 * Maximum pins supported (generic CoreBinary limit)
 */
#define PDS_TELCONF_PINMAP_MAX_PINS     32

/**
 * Single pin mapping entry in PINMAP configuration
 * Size: 128 bytes per entry (fixed, allows efficient array)
 * 
 * Defines:
 * - What pin number is connected
 * - What function it serves (ADC, PWM, GPIO, etc.)
 * - What variable name it maps to
 * - Scale/offset for user unit conversion
 * - Unit label for HMI display
 */
typedef struct {
    uint8_t     pin_number;              /**< GPIO pin number (0-31) (offset 0) */
    uint8_t     function;                /**< Function type (ADC, PWM, GPIO_IN, GPIO_OUT, etc.) (offset 1) */
    uint16_t    flags;                   /**< Pin flags: enabled, inverted, etc. (offset 2) */
    uint16_t    init_value;              /**< Initial value on startup (offset 4) */
    uint16_t    reserved;                /**< Reserved for future use (offset 6) */
    
    float       scale_factor;            /**< Multiply raw value by this (offset 8) */
    float       offset;                  /**< Add this after scaling (offset 12) */
    
    char        var_name[32];            /**< Variable name in ladder logic (offset 16) */
    char        label[32];               /**< Human label for HMI (e.g., "Water Level") (offset 48) */
    char        units[16];               /**< Unit string for display (e.g., "cm", "%RH") (offset 80) */
    
    uint8_t     reserved2[32];           /**< Future expansion (offset 96) */
} __attribute__((packed)) pds_telconf_pinmap_entry_t;

_Static_assert(sizeof(pds_telconf_pinmap_entry_t) == 128,
    "pds_telconf_pinmap_entry_t must be exactly 128 bytes");

/**
 * Pin mapping configuration packet
 * Uploaded once per hardware setup change
 * Size: 8 (header) + (num_pins × 128) bytes
 * 
 * HMI generates this from Pinleaf Forge JSON export
 */
typedef struct {
    uint16_t    version;                 /**< Protocol version (0x0001) (offset 0) */
    uint8_t     num_pins;                /**< Number of pins defined (1-32) (offset 2) */
    uint8_t     reserved;                /**< Reserved padding (offset 3) */
    uint32_t    checksum;                /**< CRC32 for validation (offset 4) */
    pds_telconf_pinmap_entry_t pins[PDS_TELCONF_PINMAP_MAX_PINS];
} __attribute__((packed)) pds_telconf_pinmap_t;

_Static_assert(sizeof(pds_telconf_pinmap_t) == 8 + (32 * 128),
    "pds_telconf_pinmap_t size must be 8 + 4096 = 4104 bytes");

/**
 * Ladder logic configuration packet
 * Uploaded when automation logic changes
 * Size: 16 (header) + payload (up to 4KB bytecode)
 * 
 * Payload format:
 * - IL bytecode from LadderLogicEditor
 * - Or state machine definition
 * - Or interpreted instruction stream
 * 
 * Device interprets/executes this bytecode at runtime
 */
typedef struct {
    uint16_t    version;                 /**< Protocol version (0x0001) */
    uint16_t    bytecode_type;           /**< Type: 1=IL, 2=StateMachine, 3=Interpreted (offset 2) */
    uint32_t    payload_size;            /**< Size of bytecode payload (offset 4) */
    uint32_t    checksum;                /**< CRC32 for validation (offset 8) */
    uint32_t    reserved;                /**< Reserved (offset 12) */
    
    uint8_t     bytecode[4096];          /**< Compiled logic bytecode (offset 16) */
} __attribute__((packed)) pds_telconf_ladder_t;

_Static_assert(sizeof(pds_telconf_ladder_t) == 16 + 4096,
    "pds_telconf_ladder_t size must be 4112 bytes");

/**
 * Single user setting entry
 * Size: 40 bytes per entry
 */
typedef struct {
    char        var_name[32];            /**< Variable name (must match PINMAP entry) */
    float       float_value;             /**< Value if numeric */
} __attribute__((packed)) pds_telconf_setting_entry_t;

_Static_assert(sizeof(pds_telconf_setting_entry_t) == 36,
    "pds_telconf_setting_entry_t must be exactly 36 bytes");

/**
 * User settings configuration packet
 * Uploaded frequently (user adjusts thresholds, timings, etc.)
 * Size: 8 (header) + (num_settings × 36) bytes
 * 
 * Defines user-tunable parameters that ladder logic references
 * Examples:
 *  - threshold_moisture = 650
 *  - timer_cycle_seconds = 120
 *  - mode_auto = 1
 */
typedef struct {
    uint16_t    version;                 /**< Protocol version (0x0001) */
    uint16_t    num_settings;            /**< Number of settings (max 64) */
    uint32_t    checksum;                /**< CRC32 for validation */
    
    pds_telconf_setting_entry_t settings[64];
} __attribute__((packed)) pds_telconf_usrset_t;

_Static_assert(sizeof(pds_telconf_usrset_t) == 8 + (64 * 36),
    "pds_telconf_usrset_t size must be 8 + 2304 = 2312 bytes");

#ifdef __cplusplus
}
#endif

#endif /* PDS_TELEMETRY_TYPES_H */
