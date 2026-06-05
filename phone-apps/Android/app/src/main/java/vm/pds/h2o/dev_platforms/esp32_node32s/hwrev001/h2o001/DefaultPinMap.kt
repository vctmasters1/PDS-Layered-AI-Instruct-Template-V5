package vm.pds.h2o.dev_platforms.esp32_node32s.hwrev001.h2o001

import vm.pds.h2o.dev_platforms.abstract.DevicePinMap
import vm.pds.h2o.dev_platforms.abstract.PinConfig
import vm.pds.h2o.dev_platforms.abstract.PlatformPinCapabilities
import vm.pds.h2o.dev_platforms.abstract.PinFunction
import vm.pds.h2o.dev_platforms.abstract.PinFlags

/**
 * Default Pin Map for H2O-Tower (h2o001) based on ESP32-Node32S
 */
data class H2o001PinMap(
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
        return H2o001PinMap(
            platformId = platformDef.platformId,
            pins = listOf(
                PinConfig(1, PinFunction.PWM, "Nutrient A Pump", true, PinFlags.PULL_DOWN),
                PinConfig(2, PinFunction.PWM, "Nutrient B Pump", true, PinFlags.PULL_DOWN),
                PinConfig(3, PinFunction.PWM, "Nutrient C Pump", true, PinFlags.PULL_DOWN),
                PinConfig(4, PinFunction.PWM, "Fill Pump (Fwd)", true),
                PinConfig(5, PinFunction.PWM, "Fill Pump (Rev)", true),
                PinConfig(6, PinFunction.PWM, "Lift Pump", true, PinFlags.PULL_DOWN),
                PinConfig(7, PinFunction.GPIO_OUT, "Air Pump", true),
                PinConfig(8, PinFunction.GPIO_OUT, "Nebulizer", true),
                PinConfig(9, PinFunction.RMT_TX, "LED Strip (WS2812)", true),
                PinConfig(10, PinFunction.GPIO_IN, "DHT22 (Temp/Hum)", true),
                PinConfig(11, PinFunction.GPIO_IN, "Water Level Switch", true, PinFlags.PULL_UP),
                PinConfig(12, PinFunction.ADC, "pH Sensor", true),
                PinConfig(13, PinFunction.ADC, "EC/TDS Sensor", true),
                PinConfig(14, PinFunction.GPIO_OUT, "Motor Enable (nSLEEP)", true),
                PinConfig(15, PinFunction.I2C_SDA, "I2C SDA", true),
                PinConfig(16, PinFunction.I2C_SCL, "I2C SCL", true),
                PinConfig(17, PinFunction.GPIO_IN, "Motor Fault (nFAULT)", true, PinFlags.PULL_UP),
                // Free pins
                createFreePin(18),
                createFreePin(19),
                createFreePin(20),
                createFreePin(21),
                createFreePin(38),
                createFreePin(39),
                createFreePin(40),
                createFreePin(41),
                createFreePin(42)
            )
        )
    }

    private fun createFreePin(pinNumber: Int): PinConfig {
        return PinConfig(
            pinNumber = pinNumber,
            function = PinFunction.UNASSIGNED,
            label = "Free",
            isEnabled = false
        )
    }
}
