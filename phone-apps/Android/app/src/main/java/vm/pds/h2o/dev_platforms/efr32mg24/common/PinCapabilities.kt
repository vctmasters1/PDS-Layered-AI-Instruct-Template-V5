package vm.pds.h2o.dev_platforms.efr32mg24.common

import vm.pds.h2o.dev_platforms.abstract.PlatformPinCapabilities

/**
 * EFR32MG24 Platform Configuration
 * Defines hardware capabilities, pin constraints, and configuration options
 * for the EFR32MG24 platform.
 */
object PinCapabilities : PlatformPinCapabilities {
    
    override val platformId: String = "EFR32MG24_DK"
    override val platformName: String = "EFR32MG24 Dev Kit"
    
    // System-reserved or special function pins
    override val reservedPins: List<Pair<Int, String>> = listOf(
        // Common reserved pins for EFR32 development kits (adjust as needed based on schematic)
        44 to "VCOM_TX", 
        45 to "VCOM_RX",
        // Debug pins often reserved
        // SWCLK, SWDIO, etc.
    )
    
    // EFR32MG24 has many GPIOs, list the user accessible ones on the Dev Kit
    override val availablePins: List<Int> = listOf(
        // PC0-PC9, PD0-PD5, etc. mapped to integer IDs for the app
        // Using generic mapping 0-9 for placeholder as originally defined, 
        // but typically this would be a larger range or mapped specifically.
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9 
    )
    
    // Pins capable of ADC
    override val adcPins: List<Int> = listOf(
        0, 1, 2, 3 
    )

    // Input-only pins
    // EFR32 generally doesn't have "input only" pins in the same way ESP32 (34-39) does, 
    // nearly all are configurable.
    override val inputOnlyPins: List<Int> = emptyList()

    // Pins capable of DAC output (if any)
    override val dacPins: List<Int> = emptyList()

    // EFR32 specific ADC configuration if needed (e.g. Reference Voltage selection)
    // For now, generic options in Abstract are sufficient.
    
    // EFR32 specific PWM configuration
    // EFR32 TIMER/PWM does not have "Speed Mode" like ESP32.
    // It uses Prescalers and Top values.
}
