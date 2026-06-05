package vm.pds.h2o.dev_platforms.efr32mg24.hwrev_001.wh_001

import vm.pds.h2o.dev_platforms.abstract.DevicePinMap
import vm.pds.h2o.dev_platforms.abstract.PinConfig
import vm.pds.h2o.dev_platforms.abstract.PlatformPinCapabilities
import vm.pds.h2o.dev_platforms.abstract.PinFunction
import vm.pds.h2o.dev_platforms.abstract.PinFlags

data class EfrWh001PinMap(
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

object DefaultPinMap {
    fun create(platformDef: PlatformPinCapabilities): DevicePinMap {
        return EfrWh001PinMap(
            platformId = platformDef.platformId,
            pins = (0..9).map { pinNumber ->
                when (pinNumber) {
                    0 -> PinConfig(0, PinFunction.ADC, "Soil Moisture", true)
                    2 -> PinConfig(2, PinFunction.GPIO_IN, "Water Level Switch", true, PinFlags.PULL_UP, 1)
                    3 -> PinConfig(3, PinFunction.PWM, "Water Pump", true)
                    4 -> PinConfig(4, PinFunction.PWM, "Grow Light", true)
                    else -> createBlankPin(platformDef, pinNumber)
                }
            }
        )
    }
    
    private fun createBlankPin(platformDef: PlatformPinCapabilities, pinNumber: Int): PinConfig {
        return PinConfig(
            pinNumber = pinNumber,
            function = PinFunction.UNASSIGNED,
            label = "Unassigned",
            isEnabled = false
        )
    }
}
