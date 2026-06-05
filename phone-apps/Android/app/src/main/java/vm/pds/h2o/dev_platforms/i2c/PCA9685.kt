package vm.pds.h2o.dev_platforms.i2c

import kotlin.math.roundToInt

/**
 * Conceptual driver for the NXP PCA9685 16-Channel 12-bit PWM/Servo Driver.
 * This class uses the generic I2cInterface for platform-agnostic communication.
 *
 * @param i2c The underlying I2C communication interface.
 * @param address The I2C address of the PCA9685 (default is 0x40).
 */
class PCA9685(private val i2c: I2cInterface, private val address: Int = 0x40) {

    // --- Registers ---
    private val REG_MODE1       = 0x00
    private val REG_PRE_SCALE   = 0xFE
    private val REG_LED0_ON_L   = 0x06
    private val REG_LED0_ON_H   = 0x07
    private val REG_LED0_OFF_L  = 0x08
    private val REG_LED0_OFF_H  = 0x09
    private val REG_ALL_LED_ON_L = 0xFA
    private val REG_ALL_LED_OFF_L = 0xFC


    // --- MODE1 Bits ---
    private val BIT_SLEEP       = 0x10 // Put oscillator to sleep
    private val BIT_RESTART     = 0x80 // Restart enabled

    private val OSCILLATOR_FREQ = 25_000_000.0 // Internal oscillator frequency

    init {
        i2c.open(address)
        // Initialize the chip
        setAllPwm(0, 0) // Set all outputs to off
        i2c.writeRegByte(REG_MODE1, 0x00) // Wake up from sleep
        Thread.sleep(1) // Wait for oscillator
    }

    /**
     * Sets the PWM frequency for all channels.
     * @param freqHz The desired frequency in Hertz (e.g., 50 for servos, 1000 for LEDs).
     */
    fun setPwmFreq(freqHz: Float) {
        val prescaleval = (OSCILLATOR_FREQ / (4096 * freqHz)).roundToInt() - 1
        val oldMode = i2c.readRegByte(REG_MODE1)
        val newMode = (oldMode and 0x7F) or BIT_SLEEP // Set sleep bit
        
        i2c.writeRegByte(REG_MODE1, newMode) // Go to sleep
        i2c.writeRegByte(REG_PRE_SCALE, prescaleval) // Set prescaler
        i2c.writeRegByte(REG_MODE1, oldMode) // Wake up
        
        Thread.sleep(5) // Wait for oscillator to stabilize
        
        i2c.writeRegByte(REG_MODE1, oldMode or BIT_RESTART) // Restart logic
    }

    /**
     * Sets the PWM duty cycle for a single channel.
     * @param channel The channel number (0-15).
     * @param on The 12-bit time value (0-4095) when the pulse should turn ON.
     * @param off The 12-bit time value (0-4095) when the pulse should turn OFF.
     */
    fun setPwm(channel: Int, on: Int, off: Int) {
        if (channel !in 0..15) throw IllegalArgumentException("Channel must be between 0 and 15")
        
        val onL = on and 0xFF
        val onH = on shr 8
        val offL = off and 0xFF
        val offH = off shr 8
        
        i2c.writeRegByte(REG_LED0_ON_L + 4 * channel, onL)
        i2c.writeRegByte(REG_LED0_ON_H + 4 * channel, onH)
        i2c.writeRegByte(REG_LED0_OFF_L + 4 * channel, offL)
        i2c.writeRegByte(REG_LED0_OFF_H + 4 * channel, offH)
    }

    /**
     * Sets the PWM duty cycle for all channels simultaneously.
     * @param on The 12-bit time value (0-4095) when the pulse should turn ON.
     * @param off The 12-bit time value (0-4095) when the pulse should turn OFF.
     */
    fun setAllPwm(on: Int, off: Int) {
        i2c.writeRegByte(REG_ALL_LED_ON_L, on and 0xFF)
        i2c.writeRegByte(REG_ALL_LED_ON_L + 1, on shr 8)
        i2c.writeRegByte(REG_ALL_LED_OFF_L, off and 0xFF)
        i2c.writeRegByte(REG_ALL_LED_OFF_L + 1, off shr 8)
    }

    /**
     * Helper to set a channel to a specific duty cycle percentage.
     * @param channel The channel number (0-15).
     * @param percent The duty cycle from 0.0 to 100.0.
     */
    fun setDutyCycle(channel: Int, percent: Float) {
        if (percent < 0.0f || percent > 100.0f) {
            throw IllegalArgumentException("Duty cycle must be between 0.0 and 100.0")
        }
        val off = (4095 * (percent / 100.0f)).roundToInt()
        setPwm(channel, 0, off)
    }
    
    fun close() {
        i2c.close()
    }
}
