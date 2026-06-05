package vm.pds.h2o.dev_platforms.esp32c3_supermini.common

import vm.pds.h2o.dev_platforms.abstract.PlatformPinCapabilities

/**
 * ESP32-C3 Super Mini Platform Configuration
 * Defines hardware capabilities, pin constraints, and configuration options
 * for the ESP32-C3 Super Mini platform.
 */
object PinCapabilities : PlatformPinCapabilities {
    
    override val platformId: String = "ESP32C3_SUPERMINI"
    override val platformName: String = "ESP32-C3 Super Mini"
    
    override val reservedPins: List<Pair<Int, String>> = listOf(
        8 to "Built-in RGB LED (WS2812)",
        9 to "Boot Button",
        18 to "USB D-",
        19 to "USB D+",
        20 to "UART0 RX (Console)",
        21 to "UART0 TX (Console)"
    )
    
    override val availablePins: List<Int> = listOf(0, 1, 2, 3, 4, 5, 6, 7, 10)
    
    override val adcPins: List<Int> = listOf(0, 1, 2, 3, 4)

    // ESP32-C3 generally does not have input-only pins like the original ESP32 (34-39).
    // All GPIOs are capable of input and output.
    override val inputOnlyPins: List<Int> = emptyList()

    // Pins capable of DAC output
    // ESP32-C3 does NOT have a DAC.
    override val dacPins: List<Int> = emptyList()

    // Pins capable of PWM/LEDC output
    // Almost any GPIO can be used for PWM on ESP32-C3.
    override val pwmPins: List<Int> = availablePins.filter { it !in inputOnlyPins }
    
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
        BIT_13(4, "13-bit (8192 levels - S2+ only)")
    }
    
    // ADC unit selection
    enum class AdcUnit(val value: Int, val displayName: String) {
        UNIT_1(0, "ADC1"),
        UNIT_2(1, "ADC2")
    }
    
    // Uses generic ADC calibration if sufficient, otherwise extend here.
    // For now, we rely on the abstract definition which covers basic needs.
    // If specific LINE_FITTING or CURVE_FITTING values are needed for the firmware,
    // they should be handled by mapping the abstract DEFAULT to the specific value in the command generator.
    
    // Uses generic PWM duty resolution. 
    // ESP32 supports 1-14 bits, but 8, 10, 12 are the most common which are covered by abstract.
    
    // PWM speed mode - Specific to ESP32
    enum class PwmSpeedMode(val value: Int, val displayName: String) {
        LOW(0, "Low Speed Mode"),
        HIGH(1, "High Speed Mode")
    }
}
