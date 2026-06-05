package vm.pds.h2o.dev_platforms.esp32c3_supermini.hwrev_001.h2o_001

import vm.pds.h2o.dev_platforms.abstract.DevicePinMap
import vm.pds.h2o.dev_platforms.abstract.PinConfig
import vm.pds.h2o.dev_platforms.abstract.PinFunction
import vm.pds.h2o.dev_platforms.esp32c3_supermini.common.PinCapabilities

// This ROLE is a aeroponics controller.

/**
 * Complete pin map configuration for the device
 * Contains all GPIO pins and their configurations
 */
data class DefaultPinMap(
    override val pins: List<PinConfig>,
    override val platformId: String = PinCapabilities.platformId,
    override val version: Int = 1
) : DevicePinMap {
    init {
        // ESP32-C3 has fewer pins exposed on Super Mini, but internal logic might track more.
        // Super Mini usually exposes: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 21. 
        // 8 is RGB, 9 is Boot.
        // We will just validate that we have configurations for the available pins defined in Constants.
    }

    /**
     * Gets configuration for a specific pin number
     */
    override fun getPin(pinNumber: Int): PinConfig? {
        return pins.find { it.pinNumber == pinNumber }
    }

    /**
     * Validates all pin configurations
     */
    override fun validateAll(): Map<Int, List<String>> {
        return pins.associate { pin ->
            pin.pinNumber to pin.validate()
        }.filter { it.value.isNotEmpty() }
    }

    override fun updatePin(pinConfig: PinConfig): DevicePinMap {
        val newPins = pins.map { if (it.pinNumber == pinConfig.pinNumber) pinConfig else it }
        return copy(pins = newPins)
    }
}

/**
 * Factory functions for creating default configurations
 */
object PinConfigDefaults {

    /**
     * Creates the default pin map matching the device-side _global_pin_def_table
     */
    fun createDefaultPinMap(): DefaultPinMap {
        val allPins = PinCapabilities.availablePins.map { pinNumber ->
            when (pinNumber) {
                0 -> PinConfig(0, PinFunction.ADC, "pH Sensor", true)
                1 -> PinConfig(1, PinFunction.ADC, "EC Sensor", true)
                2 -> PinConfig(2, PinFunction.SYSTEM, "System Strapping", true)
                3 -> PinConfig(3, PinFunction.GPIO_IN, "Water Level", true)
                4 -> PinConfig(4, PinFunction.PWM, "Fill Pump - AIN1", true)
                5 -> PinConfig(5, PinFunction.PWM, "Fill Pump - AIN2", true)
                6 -> PinConfig(6, PinFunction.PWM, "Nutrient Pump A", true)
                7 -> PinConfig(7, PinFunction.GPIO_OUT, "Nutrient Pump B", true)
                8 -> PinConfig(8, PinFunction.SYSTEM, "Board RGB LED", true)
                9 -> PinConfig(9, PinFunction.SYSTEM, "Boot Button", true)
                10 -> PinConfig(10, PinFunction.GPIO_OUT, "Ultrasonic Relay", true)
                20 -> PinConfig(20, PinFunction.PWM, "Ultrasonic Lift Pump", true)
                21 -> PinConfig(21, PinFunction.RMT_TX, "LED Strip", true)
                else -> createBlankPin(pinNumber)
            }
        }
        return DefaultPinMap(pins = allPins)
    }

    /**
     * Creates a blank pin configuration with sensible defaults
     */
    fun createBlankPin(pinNumber: Int): PinConfig {
        val restriction = PinCapabilities.getPinRestriction(pinNumber)
        val label = if (PinCapabilities.isPinAvailable(pinNumber)) "Unassigned" else (restriction ?: "Reserved")
        return PinConfig(
            pinNumber = pinNumber,
            function = PinFunction.UNASSIGNED,
            label = label,
            isEnabled = false
        )
    }
}
