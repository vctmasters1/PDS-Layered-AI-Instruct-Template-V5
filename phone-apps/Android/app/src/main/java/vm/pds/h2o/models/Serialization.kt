package vm.pds.h2o.models

import java.nio.ByteBuffer
import java.nio.ByteOrder

object Serialization {
    
    fun deserializeTelemetryPacket(data: ByteArray): TeldataPacket? {
        try {
            val buffer = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN)
            
            val header = TeldataHeader(
                timestampMs = buffer.int.toUInt(),
                timestampUnix = buffer.int.toUInt(),
                version = buffer.short.toUShort(),
                packetId = buffer.short.toUShort(),
                numAdcReadings = buffer.get().toUByte(),
                numPwmOutputs = buffer.get().toUByte(),
                numGpioStates = buffer.get().toUByte()
            )
            buffer.get()  // reserved byte
            
            val adcReadings = mutableListOf<AdcReading>()
            for (i in 0 until header.numAdcReadings.toInt()) {
                val pinNumber = buffer.get().toUByte()
                val rawValue = buffer.short.toUShort()
                val voltage = buffer.float
                val calibratedValue = buffer.float
                val label = _readString(buffer, 32)
                
                adcReadings.add(AdcReading(pinNumber, rawValue, voltage, calibratedValue, label))
            }
            
            val pwmOutputs = mutableListOf<PwmState>()
            for (i in 0 until header.numPwmOutputs.toInt()) {
                val pinNumber = buffer.get().toUByte()
                buffer.get()  // padding
                val dutyCycle = buffer.short.toUShort()
                val frequency = buffer.int.toUInt()
                val label = _readString(buffer, 32)
                
                pwmOutputs.add(PwmState(pinNumber, dutyCycle, frequency, label))
            }
            
            val gpioStates = mutableListOf<GpioState>()
            for (i in 0 until header.numGpioStates.toInt()) {
                val pinNumber = buffer.get().toUByte()
                val state = buffer.get().toUByte()
                val label = _readString(buffer, 32)
                buffer.get()  // padding
                buffer.get()  // padding
                
                gpioStates.add(GpioState(pinNumber, state, label))
            }
            
            return TeldataPacket(header, adcReadings, pwmOutputs, gpioStates)
        } catch (e: Exception) {
            e.printStackTrace()
            return null
        }
    }
    
    fun serializeConfigPacket(packet: TelconfPacket): ByteArray {
        val buffer = ByteBuffer.allocate(512).order(ByteOrder.LITTLE_ENDIAN)
        
        buffer.putInt(packet.header.timestampMs.toInt())
        buffer.putShort(packet.header.version.toShort())
        buffer.putShort(packet.header.configType.toShort())
        buffer.putInt(packet.header.configValue.toInt())
        buffer.put(packet.header.targetPin.toByte())
        buffer.put(0)  // reserved
        buffer.put(0)  // reserved
        buffer.put(0)  // reserved
        
        buffer.put(packet.payload)
        
        return buffer.array().copyOf(buffer.position())
    }
    
    fun createPwmConfigPacket(pinNumber: UByte, dutyCycle: UShort): TelconfPacket {
        return TelconfPacket(
            header = TelconfHeader(
                timestampMs = System.currentTimeMillis().toUInt(),
                version = TELEMETRY_VERSION,
                configType = ConfigType.SET_PWM_DUTY,
                configValue = dutyCycle.toUInt(),
                targetPin = pinNumber
            )
        )
    }
    
    fun createGpioConfigPacket(pinNumber: UByte, state: Boolean): TelconfPacket {
        return TelconfPacket(
            header = TelconfHeader(
                timestampMs = System.currentTimeMillis().toUInt(),
                version = TELEMETRY_VERSION,
                configType = ConfigType.SET_GPIO_OUT,
                configValue = if (state) 1u else 0u,
                targetPin = pinNumber
            )
        )
    }
    
    fun createPinEnableConfigPacket(pinNumber: UByte, enabled: Boolean): TelconfPacket {
        return TelconfPacket(
            header = TelconfHeader(
                timestampMs = System.currentTimeMillis().toUInt(),
                version = TELEMETRY_VERSION,
                configType = ConfigType.SET_PIN_ENABLE,
                configValue = if (enabled) 1u else 0u,
                targetPin = pinNumber
            )
        )
    }
    
    private fun _readString(buffer: ByteBuffer, maxLength: Int): String {
        val bytes = ByteArray(maxLength)
        buffer.get(bytes)
        val nullIndex = bytes.indexOf(0)
        return if (nullIndex >= 0) {
            String(bytes, 0, nullIndex, Charsets.UTF_8)
        } else {
            String(bytes, Charsets.UTF_8)
        }
    }
}
