# Adding New I2C Devices

This directory contains the framework for interacting with I2C peripherals. The system uses a hardware-abstraction layer (`I2cInterface`) to decouple the specific driver logic (e.g., controlling a PCA9685) from the underlying communication mechanism (e.g., Android Things, USB-I2C bridge, or Remote IO).

## Framework Overview

*   **`I2cInterface.kt`**: The contract defining low-level read/write operations (byte/word).
*   **Driver Classes**: Device-specific logic (e.g., `ADS1115.kt`, `PCA9685.kt`) that consumes an `I2cInterface`.

## Steps to Add a New Device

1.  **Create the Driver Class**
    Create a new Kotlin file in this directory (e.g., `MCP9808.kt`).

2.  **Implement the Logic**
    The class should accept an `I2cInterface` and an address in its constructor.
    ```kotlin
    class MCP9808(private val i2c: I2cInterface, private val address: Int = 0x18) {
        // Define Registers
        private val REG_TEMP = 0x05
        
        init {
            i2c.open(address)
        }
        
        fun readTemperature(): Float {
            // Implement device-specific read logic
            val raw = i2c.readRegWord(REG_TEMP)
            // Convert raw to useful unit...
            return convertToCelsius(raw)
        }
    }
    ```

3.  **Define Constants**
    Include all necessary register maps and configuration bits as `private val` or within a `companion object`.

4.  **Expose High-Level Methods**
    Avoid exposing raw register access to the rest of the application. Provide semantic methods like `setBrightness()`, `readVoltage()`, or `startMotor()`.

## ⚠️ Firmware Requirements

Adding a driver file here **does not** automatically enable the hardware on the physical H2O-Tower device.

*   **Remote Automation**: If this device is to be used as part of an on-device automation pipeline (e.g., "Turn on Fan if Temp > 30"), the **Device Firmware** (ESP32/EFR32 code) must be updated to include the C/C++ driver for this specific chip. The firmware needs to know how to initialize and talk to the hardware autonomously.
*   **Transparent Bridging**: If the Android app is intended to control this device directly (via a raw I2C tunnel over BLE/WiFi), the firmware must support a "Passthrough Mode" that accepts generic I2C read/write commands from the app.

**Always ensure the firmware version running on the target hardware supports the new I2C peripheral before attempting integration.**
