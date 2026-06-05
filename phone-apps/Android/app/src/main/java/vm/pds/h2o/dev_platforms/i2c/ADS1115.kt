package vm.pds.h2o.dev_platforms.i2c

/**
 * Conceptual driver for the Texas Instruments ADS1115 16-bit ADC.
 * This class is designed to work with a generic I2cInterface.
 *
 * @param i2c The underlying I2C communication interface.
 * @param address The I2C address of the ADS1115 (e.g., 0x48).
 */
class ADS1115(private val i2c: I2cInterface, private val address: Int) {

    // --- Registers ---
    private val REG_CONVERSION = 0x00
    private val REG_CONFIG = 0x01

    // --- Config Register Bits ---
    // Multiplexer (Input Selection)
    private val MUX_AIN0_GND = 0x4000 // AIN0 vs GND
    private val MUX_AIN1_GND = 0x5000 // AIN1 vs GND
    private val MUX_AIN2_GND = 0x6000 // AIN2 vs GND
    private val MUX_AIN3_GND = 0x7000 // AIN3 vs GND

    // Programmable Gain Amplifier (PGA)
    private val PGA_6_144V = 0x0000 // +/- 6.144V
    private val PGA_4_096V = 0x0200 // +/- 4.096V
    private val PGA_2_048V = 0x0400 // +/- 2.048V (Default)

    // Data Rate (Samples Per Second)
    private val DR_8_SPS   = 0x0000
    private val DR_16_SPS  = 0x0020
    private val DR_128_SPS = 0x0080 // Default

    // Operating Mode
    private val MODE_SINGLE_SHOT = 0x0100 // Single-shot mode

    // OS Bit (Start Conversion)
    private val OS_START = 0x8000

    init {
        i2c.open(address)
    }

    /**
     * Reads a single-ended voltage from one of the four analog inputs.
     * @param channel The input channel to read (0-3).
     * @return The measured voltage in Volts.
     */
    fun readVoltage(channel: Int): Float {
        if (channel !in 0..3) throw IllegalArgumentException("Channel must be between 0 and 3")

        // 1. Build the configuration word
        var config = MODE_SINGLE_SHOT or OS_START or PGA_2_048V or DR_128_SPS
        
        config = when (channel) {
            0 -> config or MUX_AIN0_GND
            1 -> config or MUX_AIN1_GND
            2 -> config or MUX_AIN2_GND
            3 -> config or MUX_AIN3_GND
            else -> throw IllegalStateException() // Should not happen
        }

        // 2. Write the configuration to the device
        i2c.writeRegWord(REG_CONFIG, config)

        // 3. Wait for the conversion to complete.
        // In a real implementation, this would involve a delay or polling.
        // The delay depends on the data rate (e.g., 1/128s for 128SPS).
        // For this conceptual framework, we assume the read call blocks or is async.
        Thread.sleep(10) // Placeholder delay

        // 4. Read the 16-bit signed conversion result
        val rawValue = i2c.readRegWord(REG_CONVERSION)

        // 5. Convert raw value to voltage based on PGA setting
        // For PGA_2_048V, the full-scale range is +/- 2.048V over 16 bits (32767)
        val voltage = (rawValue * 2.048f) / 32767.0f

        return voltage
    }

    fun close() {
        i2c.close()
    }
}
