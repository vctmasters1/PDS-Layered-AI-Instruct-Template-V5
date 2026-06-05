package vm.pds.h2o.dev_platforms.esp32_node32s.common

import vm.pds.h2o.dev_platforms.abstract.PlatformPinCapabilities

/**
 * ESP32 Node32S Platform Configuration
 * Defines hardware capabilities, pin constraints, and configuration options
 * for the standard ESP32-WROOM-32 based Node32S platform.
 * Ref: https://www.espboards.dev/esp32/nodemcu-32s/
 */
object PinCapabilities : PlatformPinCapabilities {
    
    override val platformId: String = "ESP32_NODE32S"
    override val platformName: String = "ESP32 Node32S"
    
    // System-reserved or special function pins
    override val reservedPins: List<Pair<Int, String>> = listOf(
        1 to "UART0 TX (Console)",
        3 to "UART0 RX (Console)",
        6 to "SPI Flash CLK (Do Not Use)",
        7 to "SPI Flash SD0 (Do Not Use)",
        8 to "SPI Flash SD1 (Do Not Use)",
        9 to "SPI Flash SD2 (Do Not Use)",
        10 to "SPI Flash SD3 (Do Not Use)",
        11 to "SPI Flash CMD (Do Not Use)",
        0 to "Boot Button / Strapping Pin (Active Low)",
        2 to "Built-in LED / Strapping Pin"
    )
    
    // Available GPIOs for user configuration (excluding flash and console)
    override val availablePins: List<Int> = listOf(
        0, 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39
    )
    
    // Input Only Pins (No internal pull-up/down, Input only)
    override val inputOnlyPins: List<Int> = listOf(34, 35, 36, 39)
    
    // DAC Pins (Digital to Analog Converter)
    // DAC1: GPIO 25, DAC2: GPIO 26
    override val dacPins: List<Int> = listOf(25, 26)
    
    // PWM Pins (Any Output Pin can be used for PWM/LEDC)
    override val pwmPins: List<Int> = availablePins.filter { it !in inputOnlyPins }
    
    // Pins capable of ADC
    // ADC1: GPIO 32-39 (Preferred, works with WiFi)
    // ADC2: GPIO 0, 2, 4, 12-15, 25-27 (Restricted usage when WiFi is active)
    override val adcPins: List<Int> = listOf(
        36, 39, 34, 35, 32, 33, 25, 26, 27, 14, 12, 13, 4, 0, 2, 15
    )
    
    // ADC attenuation options (voltage ranges)
    enum class AdcAttenuation(val value: Int, val displayName: String, val voltageRange: String) {
        DB_0(0, "0dB", "100mV ~ 950mV"),
        DB_2_5(1, "2.5dB", "100mV ~ 1250mV"),
        DB_6(2, "6dB", "150mV ~ 1750mV"),
        DB_11(3, "11dB", "150mV ~ 2450mV")
    }
    
    // ADC bitwidth/resolution
    enum class AdcWidth(val value: Int, val displayName: String) {
        BIT_9(0, "9-bit (512 levels)"),
        BIT_10(1, "10-bit (1024 levels)"),
        BIT_11(2, "11-bit (2048 levels)"),
        BIT_12(3, "12-bit (4096 levels)"),
        // ESP32 (classic) typically supports up to 12-bit ADC
    }
    
    // ADC unit selection
    enum class AdcUnit(val value: Int, val displayName: String) {
        UNIT_1(0, "ADC1 (Safe with WiFi)"),
        UNIT_2(1, "ADC2 (Shared with WiFi)")
    }
    
    // PWM speed mode - Specific to ESP32
    enum class PwmSpeedMode(val value: Int, val displayName: String) {
        LOW(0, "Low Speed Mode"),
        HIGH(1, "High Speed Mode")
    }
}
