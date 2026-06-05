package vm.pds.h2o.dev_platforms.efr32mg24.hwrev_001.h2o_001

import vm.pds.h2o.dev_platforms.abstract.DevicePinMap
import vm.pds.h2o.dev_platforms.abstract.PinConfig
import vm.pds.h2o.dev_platforms.abstract.PlatformPinCapabilities
import vm.pds.h2o.dev_platforms.abstract.PinFunction

data class EfrH2o001PinMap(
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
        return EfrH2o001PinMap(
            platformId = platformDef.platformId,
            pins = (0..9).map { pinNumber ->
                when (pinNumber) {
                    0 -> PinConfig(0, PinFunction.ADC, "Water Level", true)
                    4 -> PinConfig(4, PinFunction.PWM, "Mist Pump", true)
                    5 -> PinConfig(5, PinFunction.PWM, "Nutrient Pump", true)
                    7 -> PinConfig(7, PinFunction.GPIO_OUT, "UV Light", true)
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
