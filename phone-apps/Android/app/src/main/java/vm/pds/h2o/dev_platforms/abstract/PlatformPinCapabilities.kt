package vm.pds.h2o.dev_platforms.abstract

/**
 * Interface defining the contract for platform-specific configuration constants.
 * Each device platform implementation (e.g., Esp32c3SuperMiniConstants) should implement this.
 */
interface PlatformPinCapabilities {
    val platformId: String
    val platformName: String

    // System-reserved pins (pin number -> description)
    val reservedPins: List<Pair<Int, String>>

    // Pins available for user configuration
    val availablePins: List<Int>

    // Pins capable of ADC
    val adcPins: List<Int>

    // Input-only pins (cannot be used as output)
    val inputOnlyPins: List<Int> get() = emptyList()

    // Pins capable of DAC output
    val dacPins: List<Int> get() = emptyList()

    // Pins capable of PWM/LEDC output
    val pwmPins: List<Int> get() = availablePins.filter { it !in inputOnlyPins }

    // Pins capable of hardware interrupts
    val interruptablePins: List<Int> get() = availablePins

    // Pins that are bidirectional (Input and Output)
    val bidirectionalPins: List<Int> get() = availablePins.filter { it !in inputOnlyPins }

    /**
     * Validates if a pin number is available for user configuration
     */
    fun isPinAvailable(pin: Int): Boolean {
        return pin in availablePins && !reservedPins.any { it.first == pin }
    }

    /**
     * Validates if a pin supports ADC functionality
     */
    fun isPinAdcCapable(pin: Int): Boolean {
        return pin in adcPins
    }

    /**
     * Validates if a pin supports DAC functionality
     */
    fun isPinDacCapable(pin: Int): Boolean {
        return pin in dacPins
    }
    
    /**
     * Validates if a pin supports PWM functionality
     */
    fun isPinPwmCapable(pin: Int): Boolean {
        return pin in pwmPins
    }

    /**
     * Validates if a pin supports interrupts
     */
    fun isPinInterruptable(pin: Int): Boolean {
        return pin in interruptablePins
    }

    /**
     * Gets the reason why a pin is unavailable, if applicable
     */
    fun getPinRestriction(pin: Int): String? {
        return reservedPins.find { it.first == pin }?.second
    }
}
