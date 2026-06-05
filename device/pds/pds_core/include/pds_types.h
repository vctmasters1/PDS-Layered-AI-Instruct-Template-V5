#ifndef PDS_PDS_TYPES_H
#define PDS_PDS_TYPES_H

#include <stdint.h>

/**
 * H20-Tower Aeroponics Control System
 * Device Type Definitions
 * 
 * Defines all core data types and enums used by the ESP32-C3 device.
 */

/* ── Platform-agnostic error type ─────────────────────────────────────────── */
typedef int pds_err_t;
#define PDS_OK          (0)
#define PDS_FAIL        (-1)
#define PDS_ERR_TIMEOUT (-2)
#define PDS_ERR_NOMEM   (-3)
#define PDS_ERR_INVALID (-4)
/* On ESP platforms, esp_err_t is also int — ESP_OK == 0, so direct cast is safe. */

// Pin functionality types (shared with Android)
typedef enum {
    PDS_PIN_FUNC_NONE = 0,
    PDS_PIN_FUNC_ADC = 1,
    PDS_PIN_FUNC_PWM = 2,
    PDS_PIN_FUNC_GPIO_IN = 3,
    PDS_PIN_FUNC_GPIO_OUT = 4,
    PDS_PIN_FUNC_I2C_SDA = 5,
    PDS_PIN_FUNC_I2C_SCL = 6,
    PDS_PIN_FUNC_UART_TX = 7,
    PDS_PIN_FUNC_UART_RX = 8,
    PDS_PIN_FUNC_LED_ADDRESSABLE = 9  // WS2812/NeoPixel/SK6812 RGB LED strips
} pds_pin_function_t;

// ADC attenuation levels (maps to ESP-IDF adc_atten_t)
typedef enum {
    PDS_ADC_ATTEN_DB_0 = 0,    // 0dB attenuation (100mV ~ 950mV)
    PDS_ADC_ATTEN_DB_2_5 = 1,  // 2.5dB attenuation (100mV ~ 1250mV)
    PDS_ADC_ATTEN_DB_6 = 2,    // 6dB attenuation (150mV ~ 1750mV)
    PDS_ADC_ATTEN_DB_11 = 3    // 11dB attenuation (150mV ~ 2450mV)
} pds_adc_atten_t;

// ADC bitwidth (maps to ESP-IDF adc_bits_width_t)
typedef enum {
    PDS_ADC_WIDTH_BIT_9 = 0,
    PDS_ADC_WIDTH_BIT_10 = 1,
    PDS_ADC_WIDTH_BIT_11 = 2,
    PDS_ADC_WIDTH_BIT_12 = 3,
    PDS_ADC_WIDTH_BIT_13 = 4    // ESP32-S2 and later
} pds_adc_width_t;

// ADC unit selection
typedef enum {
    PDS_ADC_UNIT_1 = 0,
    PDS_ADC_UNIT_2 = 1
} pds_adc_unit_t;

// ADC calibration scheme
typedef enum {
    PDS_ADC_CALI_NONE = 0,
    PDS_ADC_CALI_LINE_FITTING = 1,
    PDS_ADC_CALI_CURVE_FITTING = 2
} pds_adc_cali_t;

// PWM duty resolution (maps to ESP-IDF ledc_timer_bit_t)
typedef enum {
    PDS_PWM_DUTY_RES_1_BIT = 1,
    PDS_PWM_DUTY_RES_2_BIT = 2,
    PDS_PWM_DUTY_RES_3_BIT = 3,
    PDS_PWM_DUTY_RES_4_BIT = 4,
    PDS_PWM_DUTY_RES_5_BIT = 5,
    PDS_PWM_DUTY_RES_6_BIT = 6,
    PDS_PWM_DUTY_RES_7_BIT = 7,
    PDS_PWM_DUTY_RES_8_BIT = 8,
    PDS_PWM_DUTY_RES_9_BIT = 9,
    PDS_PWM_DUTY_RES_10_BIT = 10,
    PDS_PWM_DUTY_RES_11_BIT = 11,
    PDS_PWM_DUTY_RES_12_BIT = 12,
    PDS_PWM_DUTY_RES_13_BIT = 13,
    PDS_PWM_DUTY_RES_14_BIT = 14
} pds_pwm_duty_res_t;

// PWM speed mode
typedef enum {
    PDS_PWM_SPEED_LOW = 0,
    PDS_PWM_SPEED_HIGH = 1
} pds_pwm_speed_mode_t;

// GPIO interrupt types (maps to ESP-IDF gpio_int_type_t)
typedef enum {
    PDS_GPIO_INTR_DISABLE = 0,
    PDS_GPIO_INTR_POSEDGE = 1,    // Rising edge
    PDS_GPIO_INTR_NEGEDGE = 2,    // Falling edge
    PDS_GPIO_INTR_ANYEDGE = 3,    // Both edges
    PDS_GPIO_INTR_LOW_LEVEL = 4,
    PDS_GPIO_INTR_HIGH_LEVEL = 5
} pds_gpio_intr_t;

// UART parity
typedef enum {
    PDS_UART_PARITY_DISABLE = 0,
    PDS_UART_PARITY_EVEN = 1,
    PDS_UART_PARITY_ODD = 2
} pds_uart_parity_t;

// UART stop bits
typedef enum {
    PDS_UART_STOP_BITS_1 = 1,
    PDS_UART_STOP_BITS_1_5 = 2,
    PDS_UART_STOP_BITS_2 = 3
} pds_uart_stop_bits_t;

// Pin-specific configuration union
typedef union {
    // ADC configuration
    struct {
        pds_adc_atten_t attenuation;
        pds_adc_width_t bitwidth;
        pds_adc_unit_t unit;
        pds_adc_cali_t calibration;
    } adc;
    
    // PWM configuration
    struct {
        uint32_t frequency_hz;
        pds_pwm_duty_res_t duty_resolution;
        uint8_t timer_num;              // 0-3
        pds_pwm_speed_mode_t speed_mode;
        uint8_t invert_output;          // 0=normal, 1=inverted
    } pwm;
    
    // GPIO configuration
    struct {
        pds_gpio_intr_t interrupt_type;
    } gpio;
    
    // I2C configuration
    struct {
        uint32_t clock_speed_hz;        // Typically 100000 or 400000
        uint8_t address;                // 7-bit I2C address (for master mode)
    } i2c;
    
    // UART configuration
    struct {
        uint32_t baud_rate;
        uint8_t data_bits;              // 5-8
        pds_uart_parity_t parity;
        pds_uart_stop_bits_t stop_bits;
        uint8_t flow_control;           // 0=none, 1=RTS/CTS, 2=XON/XOFF
    } uart;
    
    // Addressable LED configuration (WS2812/NeoPixel)
    struct {
        uint16_t num_leds;              // Number of LEDs in strip (1-1024)
        uint8_t led_type;               // 0=WS2812/NeoPixel, 1=SK6812, 2=WS2811
        uint8_t color_order;            // 0=RGB, 1=GRB, 2=BGR (most common: GRB for WS2812)
        uint8_t brightness;             // Global brightness 0-255
        uint8_t red;                    // Initial red value 0-255
        uint8_t green;                  // Initial green value 0-255
        uint8_t blue;                   // Initial blue value 0-255
    } led;
} pds_pin_config_params_t;

// Pin configuration struct
typedef struct {
    uint8_t pin_number;                 // GPIO pin number
    pds_pin_function_t function;        // Pin functionality
    uint16_t config_flags;              // Additional config (pull-up, pull-down, etc)
    uint32_t init_value;                // Initial value for outputs
    pds_pin_config_params_t params;     // Function-specific parameters
    uint8_t function_locked;            // 1 = function cannot be changed, 0 = can be reconfigured
    char label[32];                     // Human-readable label
} pds_pin_def_t;

// ADC sensor reading
typedef struct {
    uint8_t pin_number;
    uint16_t raw_value;
    float voltage;
    float calibrated_value;
    char label[32];
} pds_adc_reading_t;

// PWM output state
typedef struct {
    uint8_t pin_number;
    uint16_t duty_cycle;  // 0-1000 (0.0% to 100.0%)
    uint32_t frequency;
    char label[32];
} pds_pwm_state_t;

// GPIO state
typedef struct {
    uint8_t pin_number;
    uint8_t state;  // 0 or 1
    char label[32];
} pds_gpio_state_t;

// LED strip state (for telemetry)
typedef struct {
    uint8_t pin_number;
    uint8_t red;        // Current red value 0-255
    uint8_t green;      // Current green value 0-255
    uint8_t blue;       // Current blue value 0-255
    uint8_t brightness; // Current brightness 0-255
    uint16_t num_leds;  // Number of LEDs in strip
    char label[32];
} pds_led_state_t;

// Telemetry data packet (device → Android)
typedef struct {
    uint32_t timestamp_ms;
    uint16_t version;  // Protocol version
    uint16_t packet_id;
    uint8_t num_adc_readings;
    uint8_t num_pwm_outputs;
    uint8_t num_gpio_states;
    uint8_t reserved;
} pds_TELDATA_header_t;

// Configuration packet (Android → device)
typedef struct {
    uint32_t timestamp_ms;
    uint16_t version;
    uint16_t config_type;  // Type of configuration update
    uint32_t config_value;
    uint8_t target_pin;
    uint8_t reserved[3];
} pds_TELCONF_header_t;

// Config types
#define PDS_CONFIG_TYPE_SET_PWM_DUTY         1
#define PDS_CONFIG_TYPE_SET_GPIO_OUT         2
#define PDS_CONFIG_TYPE_SET_PIN_ENABLE       3
#define PDS_CONFIG_TYPE_CALIBRATE_ADC        4

// LED configuration commands (target_pin is the LED strip pin)
// For RGB color: pack as 0x00RRGGBB in config_value
#define PDS_CONFIG_TYPE_SET_LED_COLOR        5  // config_value: RGB as 0x00RRGGBB
#define PDS_CONFIG_TYPE_SET_LED_BRIGHTNESS   6  // config_value: brightness 0-255
#define PDS_CONFIG_TYPE_SET_LED_OFF          7  // config_value: ignored (turns all LEDs off)

// Timer configuration commands (target_pin is the output pin controlled)
// Values encoded as seconds unless noted
#define PDS_CONFIG_TYPE_TIMER_SET_TYPE       10  // config_value: pds_timer_type_t
#define PDS_CONFIG_TYPE_TIMER_SET_ON_SECS    11  // config_value: on-time seconds (or start seconds for time-of-day)
#define PDS_CONFIG_TYPE_TIMER_SET_PERIOD     12  // config_value: total cycle seconds (for cycle timers) or off-time seconds for time-of-day
#define PDS_CONFIG_TYPE_TIMER_ENABLE         13  // config_value: 0/1 enable

// Maximum pipeline and timer counts
#define PDS_MAX_PIPELINES  16
#define PDS_MAX_TIMERS     16

// Config flags
#define PDS_PIN_FLAG_ENABLED     (1 << 0)
#define PDS_PIN_FLAG_PULL_UP     (1 << 1)
#define PDS_PIN_FLAG_PULL_DOWN   (1 << 2)

/**
 * Condition Types - Trigger evaluation for pin actions
 */
typedef enum {
    PDS_COND_TYPE_NONE = 0,
    PDS_COND_TYPE_THRESHOLD_ABOVE = 1,  // ADC value > threshold
    PDS_COND_TYPE_THRESHOLD_BELOW = 2,  // ADC value < threshold
    PDS_COND_TYPE_RANGE = 3,             // ADC value in range [min, max]
    PDS_COND_TYPE_GPIO_STATE = 4,        // GPIO input equals value
    PDS_COND_TYPE_TIMER = 5,             // Time-based trigger
    PDS_COND_TYPE_PID_SLEW_LOW = 6,      // Rate-of-decrease control (slowing down)
    PDS_COND_TYPE_PID_SLEW_HIGH = 7,     // Rate-of-increase control (speeding up)
    PDS_COND_TYPE_AND = 8,               // Logical AND of two conditions
    PDS_COND_TYPE_OR = 9                 // Logical OR of two conditions
} pds_condition_type_t;

// Condition configuration struct
typedef struct {
    pds_condition_type_t type;
    uint8_t source_pin;              // Pin to read from for evaluation
    uint32_t param1;                 // Threshold, min value, setpoint, or condition ID
    uint32_t param2;                 // Max value, GPIO state, rate limit, or condition ID
    uint8_t enabled;                 // Enable/disable this condition
    uint8_t reserved[3];
} pds_condition_t;

/**
 * Action Types - Responses triggered by conditions
 */
typedef enum {
    PDS_ACTION_TYPE_NONE = 0,
    PDS_ACTION_TYPE_SET_PWM = 1,         // Set PWM duty cycle
    PDS_ACTION_TYPE_SET_GPIO = 2,        // Set GPIO output state
    PDS_ACTION_TYPE_TOGGLE_GPIO = 3,     // Toggle GPIO output
    PDS_ACTION_TYPE_TRIGGER_ACTION = 4   // Chain to another action
} pds_action_type_t;

// Action configuration struct
typedef struct {
    pds_action_type_t type;
    uint8_t target_pin;              // Pin to apply action to
    uint32_t value;                  // PWM duty, GPIO state, or action ID
    uint8_t enabled;                 // Enable/disable this action
    uint8_t reserved[3];
} pds_action_t;

/**
 * Time-Based Actuator Support
 */
typedef enum {
    PDS_TIMER_TYPE_NONE = 0,
    PDS_TIMER_TYPE_TIME_OF_DAY = 1, // HH:MM:SS each day
    PDS_TIMER_TYPE_CYCLE = 2        // DDD:HH:MM:SS repeating cycle
} pds_timer_type_t;

// Timer configuration struct - DDD:HH:MM:SS format support
typedef struct {
    pds_timer_type_t type;
    uint32_t on_time_unix;           // Start time (Unix timestamp or seconds from midnight)
    uint32_t off_time_unix;          // End time (Unix timestamp or seconds from midnight)
    uint8_t enabled;
    uint8_t reserved[3];
} pds_timer_config_t;

/**
 * Pin Pipeline Configuration
 * Links a pin to conditions and actions for automated control
 */
typedef struct {
    uint8_t pin_index;               // Index in pds_global_pin_def_table
    pds_condition_t *conditions;     // Array of conditions to evaluate
    uint8_t num_conditions;
    pds_action_t *actions;           // Array of actions to trigger
    uint8_t num_actions;
    pds_timer_config_t timer;        // Optional timer configuration
    uint8_t enabled;                 // Enable/disable this pipeline
    uint8_t reserved;
} pds_pipeline_config_t;

/**
 * Complete Telemetry Packet Structure
 */
typedef struct {
    uint32_t timestamp_ms;           // Device timestamp in milliseconds
    uint32_t timestamp_unix;         // Unix timestamp (seconds since epoch)
    uint16_t version;                // Protocol version (currently 0x0001)
    uint16_t packet_id;              // Sequence number for packet tracking
    uint8_t num_adc_readings;
    uint8_t num_pwm_outputs;
    uint8_t num_gpio_states;
    uint8_t status_flags;            // Device status (WiFi connected, etc)
    pds_adc_reading_t adc_readings[8];
    pds_pwm_state_t pwm_states[4];
    pds_gpio_state_t gpio_states[8];
} __attribute__((packed)) pds_TELDATA_packet_t;

/**
 * Configuration update payload (Android → Device)
 */
typedef struct {
    uint32_t timestamp_ms;
    uint16_t version;
    uint16_t config_type;             // Type of configuration update
    uint8_t target_pin;
    uint8_t reserved[3];
    uint32_t config_value;
} __attribute__((packed)) pds_TELCONF_packet_t;

// Telemetry max payload size for serialization
#define pds_TELEMETRY_MAX_PAYLOAD 1024

#endif // pds_TYPES_H


