/**
 * PDS Runtime Configuration Types
 * 
 * TypeScript equivalents of C structs from pds_telemetry_types.h
 * 
 * Three-packet model for runtime device configuration:
 * 1. PinMap     - Hardware pin assignments & variable mappings (uploaded once per setup)
 * 2. Ladder     - Logic automation bytecode (uploaded per logic change)
 * 3. UserSet    - User settings/thresholds (uploaded frequently)
 * 
 * This enables GENERIC CoreBinary that learns hardware at runtime.
 */

/**
 * Pin function types (matches PDS_PIN_FUNC_* enums)
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
  LED_ADDRESSABLE = 9,
}

/**
 * Pin mapping entry
 * Defines: pin → variable name + scale/offset + units
 */
export interface PinMapEntry {
  pinNumber: number;           // GPIO pin number (0-31)
  function: PinFunction;       // What the pin does
  flags: number;               // Enable, invert, etc.
  initValue: number;           // Initial value on startup
  scaleFactor: number;         // Multiply raw value by this
  offset: number;              // Add this after scaling
  varName: string;             // Variable name in ladder logic (max 31 chars)
  label: string;               // Human label (e.g., "Water Level") (max 31 chars)
  units: string;               // Unit for HMI display (e.g., "cm", "%RH") (max 15 chars)
}

/**
 * Pin mapping configuration
 * Generated from Pinleaf Forge JSON export
 * Maps 1-32 pins with variable names for ladder logic
 */
export interface PinMapConfig {
  version: number;             // Protocol version (0x0001)
  numPins: number;             // Number of pins (1-32)
  checksum: number;            // CRC32 validation
  pins: PinMapEntry[];         // Pin definitions
}

/**
 * Bytecode type enum for ladder logic
 */
export enum BytecodeType {
  IL = 1,                      // IL (Intermediate Language) bytecode
  STATE_MACHINE = 2,           // State machine definition
  INTERPRETED = 3,             // Interpreted instruction stream
}

/**
 * Ladder logic configuration
 * Compiled from .st files in LadderLogicEditor
 */
export interface LadderConfig {
  version: number;             // Protocol version (0x0001)
  bytecodeType: BytecodeType;  // Format of bytecode
  payloadSize: number;         // Size of bytecode payload
  checksum: number;            // CRC32 validation
  bytecode: Uint8Array;        // Compiled logic (max 4096 bytes)
}

/**
 * Single user setting entry
 * Variable name must match a PinMapEntry.varName
 */
export interface UserSetting {
  varName: string;             // Variable name (must match PINMAP)
  floatValue: number;          // Setting value as float
}

/**
 * User settings configuration
 * Frequently updated by HMI (user adjusts thresholds, timings, modes)
 */
export interface UserSettings {
  version: number;             // Protocol version (0x0001)
  checksum: number;            // CRC32 validation
  settings: UserSetting[];     // User-tunable values (max 64)
}

/**
 * Complete runtime configuration
 * Combines all three packet types for device initialization
 */
export interface RuntimeConfig {
  pinMap: PinMapConfig;        // Hardware + variable mappings
  ladder: LadderConfig;        // Automation logic
  userSettings: UserSettings;  // User parameters
}

/**
 * Config upload status
 * Returned by device after uploading config
 */
export interface ConfigUploadStatus {
  success: boolean;
  checksumValid: boolean;
  pagesWritten: number;        // NVS pages used
  error?: string;
}

/**
 * Helper to create empty/default configs
 */
export function createDefaultPinMapConfig(): PinMapConfig {
  return {
    version: 0x0001,
    numPins: 0,
    checksum: 0,
    pins: [],
  };
}

export function createDefaultLadderConfig(): LadderConfig {
  return {
    version: 0x0001,
    bytecodeType: BytecodeType.IL,
    payloadSize: 0,
    checksum: 0,
    bytecode: new Uint8Array(),
  };
}

export function createDefaultUserSettings(): UserSettings {
  return {
    version: 0x0001,
    checksum: 0,
    settings: [],
  };
}

/**
 * Validate pinmap config
 */
export function validatePinMap(config: PinMapConfig): boolean {
  if (!config) return false;
  if (config.version !== 0x0001) return false;
  if (config.numPins < 1 || config.numPins > 32) return false;
  if (config.pins.length !== config.numPins) return false;
  
  // Verify pin numbers are unique and in range
  const pinNumbers = new Set<number>();
  for (const pin of config.pins) {
    if (pin.pinNumber > 31) return false;
    if (pinNumbers.has(pin.pinNumber)) return false;
    pinNumbers.add(pin.pinNumber);
    
    // Verify variable names match referenced variables
    if (pin.varName.length === 0 || pin.varName.length > 31) return false;
  }
  
  return true;
}

/**
 * Validate ladder config
 */
export function validateLadder(config: LadderConfig): boolean {
  if (!config) return false;
  if (config.version !== 0x0001) return false;
  if (config.payloadSize > 4096) return false;
  if (config.bytecode.length > 4096) return false;
  return true;
}

/**
 * Validate user settings
 */
export function validateUserSettings(config: UserSettings): boolean {
  if (!config) return false;
  if (config.version !== 0x0001) return false;
  if (config.settings.length > 64) return false;
  return true;
}
