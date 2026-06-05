package vm.pds.h2o.dev_platforms.abstract

/**
 * Interface for device pin map configuration
 * Contains all GPIO pins and their configurations
 */
interface DevicePinMap {
    val platformId: String
    val version: Int
    
    // Expose the list of pins so UI can iterate them
    val pins: List<PinConfig>

    /**
     * Gets configuration for a specific pin number
     * Returns a generic PinConfig or specific implementation
     */
    fun getPin(pinNumber: Int): PinConfig?

    /**
     * Validates all pin configurations
     */
    fun validateAll(): Map<Int, List<String>>

    /**
     * Updates a single pin configuration and returns a new DevicePinMap instance
     */
    fun updatePin(pinConfig: PinConfig): DevicePinMap
}

/**
 * Generic Pin Configuration Data Class
 */
data class PinConfig(
    val pinNumber: Int,
    val function: PinFunction = PinFunction.UNASSIGNED,
    val label: String = "",
    val isEnabled: Boolean = true,
    // Add other common properties here
    val configFlags: Int = 0,
    val initValue: Int = 0,
    val gpioInterruptType: GpioInterruptType = GpioInterruptType.DISABLE,
    val i2cClockSpeed: Int = 100000,
    val pwmFrequency: Int = 1000,
    val pwmDutyResolution: PwmDutyResolution = PwmDutyResolution.BIT_8,
    val uartBaudRate: Int = 115200
) {
    val hasPullUp: Boolean
        get() = (configFlags and PinFlags.PULL_UP) != 0

    val hasPullDown: Boolean
        get() = (configFlags and PinFlags.PULL_DOWN) != 0

    fun validate(): List<String> {
        // Generic validation logic
        return emptyList()
    }
}
