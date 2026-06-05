package vm.pds.h2o.dev_platforms.i2c

/**
 * Generic Interface for I2C Communication.
 * This abstraction allows drivers to be written independently of the underlying hardware implementation
 * (e.g., Android Things, USB-to-I2C bridge, or a mock for testing).
 */
interface I2cInterface {

    /**
     * Opens the I2C bus and connects to the device at the specified address.
     * @param address The 7-bit I2C address of the device.
     */
    fun open(address: Int)

    /**
     * Closes the connection to the device.
     */
    fun close()

    /**
     * Writes a single byte to a register.
     * @param register The register address.
     * @param byte The byte value to write.
     */
    fun writeRegByte(register: Int, byte: Int)

    /**
     * Writes a 16-bit word to a register.
     * @param register The register address.
     * @param word The 16-bit value to write.
     */
    fun writeRegWord(register: Int, word: Int)

    /**
     * Reads a single byte from a register.
     * @param register The register address.
     * @return The byte value read.
     */
    fun readRegByte(register: Int): Int

    /**
     * Reads a 16-bit word from a register.
     * @param register The register address.
     * @return The 16-bit value read.
     */
    fun readRegWord(register: Int): Int
}
