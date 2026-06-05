/**
 * PDS Telemetry Data Types
 * 
 * TypeScript equivalents of the C structs from the device firmware.
 * These represent the binary wire format for device telemetry packets.
 * 
 * Matches: Device/pds/pds_telemetry/* (PDS_TELDATA_* structs)
 */

/**
 * Pin functionality enum (must match device)
 */
export enum PinFunction {
  NONE = 0,
  ADC = 1,
  PWM = 2,
  GPIO_IN = 3,
  GPIO_OUT = 4,
  I2C_SDA = 5,
  I2C_SCL = 6,
  UART_TX = 7,
  UART_RX = 8,
  LED_ADDRESSABLE = 9,  // WS2812/NeoPixel/SK6812 RGB LED strips
}

/**
 * ADC sensor reading from device
 */
export interface AdcReading {
  pinNumber: number;
  rawValue: number;
  voltage: number;        // Measured voltage
  calibratedValue: number; // Calibrated value (mapped to user units)
  label: string;         // Pin label (e.g., "Water Level")
}

/**
 * PWM output state from device
 */
export interface PwmState {
  pinNumber: number;
  dutyCycle: number;  // 0-1000 (0.0% to 100.0%)
  frequency: number;  // Hz
  label: string;
}

/**
 * GPIO digital state from device
 */
export interface GpioState {
  pinNumber: number;
  state: number;  // 0 (LOW) or 1 (HIGH)
  label: string;
}

/**
 * LED strip state from device (for addressable LED support)
 */
export interface LedState {
  pinNumber: number;
  red: number;         // Current red value 0-255
  green: number;       // Current green value 0-255
  blue: number;        // Current blue value 0-255
  brightness: number;  // Current brightness 0-255
  numLeds: number;     // Number of LEDs in strip
  label: string;
}

/**
 * Telemetry packet header
 * Sent by device → received by HMI
 */
export interface TeldataHeader {
  timestampMs: number;      // Device milliseconds
  timestampUnix: number;    // Unix timestamp for time sync
  version: number;          // Protocol version (currently 0x0001)
  packetId: number;         // Sequence number
  numAdcReadings: number;
  numPwmOutputs: number;
  numGpioStates: number;
  statusFlags?: number;
}

/**
 * Complete telemetry packet from device
 * Binary format deserialized from HTTP response
 */
export interface TeldataPacket {
  header: TeldataHeader;
  adcReadings: AdcReading[];
  pwmOutputs: PwmState[];
  gpioStates: GpioState[];
}

/**
 * Configuration command header
 * Sent by HMI → received by device
 */
export interface TelconfHeader {
  timestampMs: number;
  version: number;
  configType: number;  // ConfigType enum
  configValue: number;
  targetPin: number;
}

/**
 * Configuration packet sent to device
 */
export interface TelconfPacket {
  header: TelconfHeader;
  payload?: Uint8Array;
}

/**
 * Configuration command types (must match device)
 */
export const ConfigType = {
  SET_PWM_DUTY: 1,
  SET_GPIO_OUT: 2,
  SET_PIN_ENABLE: 3,
  CALIBRATE_ADC: 4,
  SET_LED_COLOR: 5,        // config_value: RGB as 0x00RRGGBB
  SET_LED_BRIGHTNESS: 6,   // config_value: brightness 0-255
  SET_LED_OFF: 7,          // Turns all LEDs off
  TIMER_SET_TYPE: 10,
  TIMER_SET_ON_SECS: 11,
  TIMER_SET_PERIOD: 12,
  TIMER_ENABLE: 13,
} as const;

export type ConfigTypeValue = typeof ConfigType[keyof typeof ConfigType];

/**
 * Protocol version
 */
export const TELEMETRY_VERSION = 0x0001;
