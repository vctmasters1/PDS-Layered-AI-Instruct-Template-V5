package vm.pds.h2o.dev_platforms.abstract

import kotlinx.coroutines.flow.StateFlow

/**
 * Result of an OTA operation
 * Sealed class allowing type-safe result handling across all platforms
 */
sealed class OtaResult {
    data class Success(val message: String) : OtaResult()
    data class InProgress(val progress: Int, val message: String) : OtaResult()  // progress: 0-100
    data class Error(val exception: Exception) : OtaResult()
    object Idle : OtaResult()
}

/**
 * Firmware update metadata
 */
data class FirmwareInfo(
    val version: String,
    val filePath: String,
    val checksum: String? = null,
    val hwRevision: String? = null,
    val releaseNotes: String? = null
)

/**
 * Abstract OTA (Over-The-Air) firmware update provider
 * Allows different platforms (ESP32-C3, EFR32MG24, etc.) to implement
 * platform-specific firmware update mechanisms while maintaining a
 * consistent interface for the Android UI.
 *
 * Implementations should handle:
 * - Asset scanning and firmware file discovery
 * - Platform-specific update transport (BLE, serial, bootloader protocol, etc.)
 * - Progress tracking and error handling
 * - Validation and checksums
 */
interface OtaProvider {

    /**
     * Get list of available firmware updates
     * @return List of FirmwareInfo, sorted by version (newest first)
     */
    suspend fun getAvailableFirmware(): List<FirmwareInfo>

    /**
     * Validate firmware file before attempting update
     * @param firmwareInfo The firmware to validate
     * @return OtaResult with validation result
     */
    suspend fun validateFirmware(firmwareInfo: FirmwareInfo): OtaResult

    /**
     * Start firmware update process
     * @param firmwareInfo The firmware to install
     * @param onProgress Callback for progress updates (0-100)
     * @return StateFlow tracking update progress/result
     */
    suspend fun startUpdate(
        firmwareInfo: FirmwareInfo,
        onProgress: (Int) -> Unit = {}
    ): StateFlow<OtaResult>

    /**
     * Cancel ongoing update
     * @return OtaResult indicating cancellation result
     */
    suspend fun cancelUpdate(): OtaResult

    /**
     * Get current update progress
     * @return Current progress 0-100, or -1 if no update in progress
     */
    fun getCurrentProgress(): Int

    /**
     * Platform-specific firmware file extension
     * @return File extension (e.g., ".bin", ".ihex", ".elf")
     */
    fun getFirmwareFileExtension(): String

    /**
     * Platform-specific asset folder path
     * @return Asset path (e.g., "firmware/esp32c3_supermini", "firmware/efr32mg24")
     */
    fun getFirmwareAssetPath(): String
}
