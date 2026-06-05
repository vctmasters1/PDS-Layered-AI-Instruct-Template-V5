package vm.pds.h2o.dev_platforms.esp32c3_supermini.hwrev_001.wh_001

import vm.pds.h2o.dev_platforms.abstract.DevicePinMap
import vm.pds.h2o.dev_platforms.abstract.PinConfig
import vm.pds.h2o.dev_platforms.abstract.PlatformPinCapabilities
import vm.pds.h2o.dev_platforms.abstract.PinFunction
import vm.pds.h2o.dev_platforms.abstract.PinFlags

data class Wh001PinMap(
    override val pins: List<PinConfig>,
    override val platformId: String,
    override val version: Int = 1
) : DevicePinMap {
    override fun getPin(pinNumber: Int): PinConfig? = pins.find { it.pinNumber == pinNumber }
    override fun validateAll(): Map<Int, List<String>> = emptyMap()
    override fun updatePin(pinConfig: PinConfig): DevicePinMap {
        val newPins = pins.map { if (it.pinNumber == pinConfig.pinNumber) pinConfig else it }
        return copy(pins = newPins)
    }
}

/**
 * Factory functions for creating default configurations for the WH-001 Wall Hugger product.
 */
object DefaultPinMap {

    /**
     * Creates the default pin map for the WH-001 product.
     * This configuration is specific to this product and its hardware revision.
     */
    fun create(platformDef: PlatformPinCapabilities): DevicePinMap {
        return Wh001PinMap(
            platformId = platformDef.platformId,
            pins = (0..21).map { pinNumber ->
                when (pinNumber) {
                    0 -> PinConfig(0, PinFunction.ADC, "LDR Sensor", true)
                    1 -> PinConfig(1, PinFunction.ADC, "Soil Moisture", true)
                    2 -> PinConfig(2, PinFunction.GPIO_IN, "Water Level Switch", true, PinFlags.PULL_UP, 1)
                    3 -> PinConfig(3, PinFunction.PWM, "Water Pump", true)
                    4 -> PinConfig(4, PinFunction.PWM, "Grow Light", true)
                    else -> createBlankPin(platformDef, pinNumber)
                }
            }
        )
    }

    /**
     * Creates a blank pin configuration with sensible defaults for a given platform.
     */
    private fun createBlankPin(platformDef: PlatformPinCapabilities, pinNumber: Int): PinConfig {
        val label = if (platformDef.isPinAvailable(pinNumber)) {
            "Unassigned"
        } else {
            platformDef.getPinRestriction(pinNumber) ?: "Reserved"
        }
        return PinConfig(
            pinNumber = pinNumber,
            function = PinFunction.UNASSIGNED,
            label = label,
            isEnabled = false
        )
    }
}
