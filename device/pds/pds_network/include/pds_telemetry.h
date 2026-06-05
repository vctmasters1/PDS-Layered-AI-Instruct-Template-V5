/**
 * @file pds_telemetry.h
 * @brief Telemetry collection and serialization for HTTPS transmission
 * 
 * Provides functions to:
 * - Collect sensor readings and actuator states
 * - Serialize into binary PDS_TELDATA_packet_t format
 * - Track packet sequence numbers
 * - Handle overflow conditions gracefully
 */

#ifndef PDS_TELEMETRY_H
#define PDS_TELEMETRY_H

#include <stdint.h>
#include <stdbool.h>
#include "pds_telemetry_types.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Initialize telemetry subsystem
 * 
 * Must be called once during device startup before collecting telemetry.
 * Initializes packet sequence counter and allocates internal buffers.
 * 
 * @return ESP_OK on success, ESP_ERR_* on failure
 */
esp_err_t pds_telemetry_init(void);

/**
 * Collect current sensor readings and actuator states
 * 
 * Populates the provided telemetry packet with:
 * - All active ADC sensor readings
 * - All PWM output states
 * - All GPIO input/output states
 * 
 * @param packet Pointer to telemetry packet structure to populate
 * @return ESP_OK on success, ESP_ERR_* on failure
 */
esp_err_t pds_telemetry_collect(pds_teldata_packet_t* packet);

/**
 * Get serialized telemetry packet as binary buffer
 * 
 * This is the data to transmit via HTTPS GET /status response.
 * 
 * @param packet Pointer to telemetry packet
 * @param buffer Output buffer for serialized data
 * @param buffer_size Size of output buffer
 * @param bytes_written Output parameter for actual bytes written
 * @return ESP_OK on success, ESP_ERR_INVALID_ARG if buffer too small
 */
esp_err_t pds_telemetry_serialize(
    const pds_teldata_packet_t* packet,
    uint8_t* buffer,
    size_t buffer_size,
    size_t* bytes_written
);

/**
 * Add ADC reading to telemetry packet
 * 
 * @param packet Packet to add to
 * @param pin_number GPIO pin number
 * @param raw_value Raw ADC value (0-4095)
 * @param voltage Converted voltage (0.0-3.3)
 * @param calibrated_value Calibration-adjusted value
 * @param label Sensor name (max 31 chars)
 * @return ESP_OK on success, ESP_ERR_NO_MEM if packet full
 */
esp_err_t pds_telemetry_add_adc(
    pds_teldata_packet_t* packet,
    uint8_t pin_number,
    uint16_t raw_value,
    float voltage,
    float calibrated_value,
    const char* label
);

/**
 * Add PWM output state to telemetry packet
 * 
 * @param packet Packet to add to
 * @param pin_number GPIO pin driving PWM
 * @param duty_cycle Current duty cycle (0-1000)
 * @param frequency PWM frequency in Hz
 * @param label Actuator name (max 31 chars)
 * @return ESP_OK on success, ESP_ERR_NO_MEM if packet full
 */
esp_err_t pds_telemetry_add_pwm(
    pds_teldata_packet_t* packet,
    uint8_t pin_number,
    uint16_t duty_cycle,
    uint32_t frequency,
    const char* label
);

/**
 * Add GPIO state to telemetry packet
 * 
 * @param packet Packet to add to
 * @param pin_number GPIO pin number
 * @param state GPIO state (0=LOW, 1=HIGH)
 * @param label Device name (max 31 chars)
 * @return ESP_OK on success, ESP_ERR_NO_MEM if packet full
 */
esp_err_t pds_telemetry_add_gpio(
    pds_teldata_packet_t* packet,
    uint8_t pin_number,
    uint8_t state,
    const char* label
);

/**
 * Add timer state to telemetry packet
 *
 * @param packet     Packet to add to
 * @param timer_id   Sequential timer index (0-based, assigned by collect loop)
 * @param active     1 = timer is in active/ON state, 0 = idle
 * @param value      cycle_count (timer_cycle) / current_count (countup) / remaining_ms (countdown)
 * @param elapsed_ms ms elapsed in current ON/OFF phase (timer_cycle); 0 for others
 * @param label      Timer name (max 31 chars)
 * @return ESP_OK on success, ESP_ERR_NO_MEM if packet full
 */
esp_err_t pds_telemetry_add_timer(
    pds_teldata_packet_t* packet,
    uint8_t timer_id,
    uint8_t active,
    uint32_t value,
    uint32_t elapsed_ms,
    const char* label
);

/**
 * Add peripheral sensor reading to telemetry packet (JSON-only, not binary wire format)
 *
 * @param packet  Packet to add to
 * @param pin     Physical data pin number
 * @param field   Channel name: "temp" or "humid"
 * @param value   Current reading
 * @param voltage Raw sensor voltage (pass 0.0f if not available)
 * @param label   Auto-generated label e.g. "dht22:22:temp"
 * @return ESP_OK on success, ESP_ERR_NO_MEM if packet full
 */
esp_err_t pds_telemetry_add_periph(
    pds_teldata_packet_t* packet,
    uint8_t pin,
    const char* field,
    float value,
    float voltage,
    const char* label
);

/**
 * Deserialize binary telemetry packet from buffer
 * 
 * Used by test code and configuration tools to parse device responses.
 * Validates packet format and version.
 * 
 * @param buffer Input binary buffer
 * @param buffer_size Size of input buffer
 * @param packet Output packet structure
 * @return ESP_OK on success, ESP_ERR_INVALID_ARG if parse fails
 */
esp_err_t pds_telemetry_deserialize(
    const uint8_t* buffer,
    size_t buffer_size,
    pds_teldata_packet_t* packet
);

/**
 * Get next packet sequence number
 * 
 * Incremented automatically with each telemetry collection.
 * Wraps from 65535 to 0.
 * 
 * @return Current sequence number
 */
uint16_t pds_telemetry_get_packet_id(void);

/**
 * Callback type for role-provided telemetry data.
 *
 * The role implements a function matching this signature and registers it
 * via pds_telemetry_register_provider().  When pds_telemetry_collect() is
 * called (e.g., by the HTTPS GET /status handler) it calls the provider to
 * populate sensor readings and actuator states into the packet.
 *
 * The provider MUST call pds_telemetry_add_adc(), pds_telemetry_add_pwm(),
 * and pds_telemetry_add_gpio() to fill in the packet entries.
 *
 * Example (in pds_process_action.c):
 * @code
 *   static esp_err_t h2o_telemetry_provider(pds_teldata_packet_t *pkt) {
 *       pds_telemetry_add_adc(pkt, 33, h2o_state.ph_sensor_raw, voltage, cal, "pH");
 *       pds_telemetry_add_gpio(pkt, 11, h2o_state.float_switch_state, "Float SW");
 *       return ESP_OK;
 *   }
 *   // In h2o_role_init():
 *   pds_telemetry_register_provider(h2o_telemetry_provider);
 * @endcode
 *
 * This replaces the old pds_global_rt pattern: the role owns its state,
 * the telemetry system reads from it via this callback.
 */
typedef esp_err_t (*pds_telemetry_provider_t)(pds_teldata_packet_t *packet);

/**
 * Register the role's telemetry data provider.
 *
 * Call once from the role's init function (e.g., h2o_role_init()).
 * Replaces any previously registered provider.
 *
 * @param provider  Callback that populates a telemetry packet with live data
 * @return ESP_OK on success
 * @return ESP_ERR_INVALID_ARG if provider is NULL
 */
esp_err_t pds_telemetry_register_provider(pds_telemetry_provider_t provider);

/**
 * Shutdown telemetry subsystem
 * 
 * Releases internal buffers and stops collection.
 * 
 * @return ESP_OK on success
 */
esp_err_t pds_telemetry_deinit(void);

#ifdef __cplusplus
}
#endif

#endif /* PDS_TELEMETRY_H */
