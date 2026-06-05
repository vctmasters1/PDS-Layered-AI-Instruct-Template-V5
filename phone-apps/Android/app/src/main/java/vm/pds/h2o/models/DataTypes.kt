package vm.pds.h2o.models

/**
 * H20-Tower Aeroponics Control System
 * Data Models
 * 
 * Kotlin data classes matching the device C structs for telemetry/config.
 * These classes mirror the PDS_TELDATA_* and PDS_TELCONF_* structs from the device.
 */

// Pin functionality enum (must match device)
enum class PinFunction(val value: Int) {
    NONE(0),
    ADC(1),
    PWM(2),
    GPIO_IN(3),
    GPIO_OUT(4),
    I2C_SDA(5),
    I2C_SCL(6),
    UART_TX(7),
    UART_RX(8),
    LED_ADDRESSABLE(9);  // WS2812/NeoPixel/SK6812 RGB LED strips
    
    companion object {
        fun fromValue(value: Int): PinFunction {
            return entries.find { it.value == value } ?: NONE
        }
    }
}

// ADC sensor reading
data class AdcReading(
    val pinNumber: UByte,
    val rawValue: UShort,
    val voltage: Float,
    val calibratedValue: Float,
    val label: String
)

// PWM output state
data class PwmState(
    val pinNumber: UByte,
    val dutyCycle: UShort,  // 0-1000 (0.0% to 100.0%)
    val frequency: UInt,
    val label: String
)

// GPIO state
data class GpioState(
    val pinNumber: UByte,
    val state: UByte,  // 0 or 1
    val label: String
)

// LED strip state (for telemetry)
data class LedState(
    val pinNumber: UByte,
    val red: UByte,        // Current red value 0-255
    val green: UByte,      // Current green value 0-255
    val blue: UByte,       // Current blue value 0-255
    val brightness: UByte, // Current brightness 0-255
    val numLeds: UShort,   // Number of LEDs in strip
    val label: String
)

// Telemetry header (device → Android)
data class TeldataHeader(
    val timestampMs: UInt,
    val timestampUnix: UInt,  // Unix timestamp for real-time clock sync
    val version: UShort,
    val packetId: UShort,
    val numAdcReadings: UByte,
    val numPwmOutputs: UByte,
    val numGpioStates: UByte,
    val statusFlags: UByte = 0u
)

// Complete telemetry packet
data class TeldataPacket(
    val header: TeldataHeader,
    val adcReadings: List<AdcReading>,
    val pwmOutputs: List<PwmState>,
    val gpioStates: List<GpioState>
)

// Configuration header (Android → device)
data class TelconfHeader(
    val timestampMs: UInt,
    val version: UShort,
    val configType: UShort,
    val configValue: UInt,
    val targetPin: UByte
)

// Configuration packet
data class TelconfPacket(
    val header: TelconfHeader,
    val payload: ByteArray = ByteArray(256)
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as TelconfPacket

        if (header != other.header) return false
        if (!payload.contentEquals(other.payload)) return false

        return true
    }

    override fun hashCode(): Int {
        var result = header.hashCode()
        result = 31 * result + payload.contentHashCode()
        return result
    }
}

// Configuration types (must match device)
object ConfigType {
    const val SET_PWM_DUTY: UShort = 1u
    const val SET_GPIO_OUT: UShort = 2u
    const val SET_PIN_ENABLE: UShort = 3u
    const val CALIBRATE_ADC: UShort = 4u
    
    // LED configuration commands (target_pin is LED strip pin)
    // For RGB color: pack as 0x00RRGGBB in config_value
    const val SET_LED_COLOR: UShort = 5u        // config_value: RGB as 0x00RRGGBB
    const val SET_LED_BRIGHTNESS: UShort = 6u   // config_value: brightness 0-255
    const val SET_LED_OFF: UShort = 7u          // config_value: ignored (turns all LEDs off)
    
    // Timer configuration commands (target_pin is output pin controlled)
    const val TIMER_SET_TYPE: UShort = 10u
    const val TIMER_SET_ON_SECS: UShort = 11u
    const val TIMER_SET_PERIOD: UShort = 12u
    const val TIMER_ENABLE: UShort = 13u
}

// Protocol version
const val TELEMETRY_VERSION: UShort = 1u
