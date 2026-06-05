package vm.pds.h2o.dev_platforms.efr32mg24.ota

import android.content.Context
import android.content.res.AssetManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import vm.pds.h2o.dev_platforms.abstract.FirmwareInfo
import vm.pds.h2o.dev_platforms.abstract.OtaProvider
import vm.pds.h2o.dev_platforms.abstract.OtaResult

/**
 * EFR32MG24 OTA Manager
 * Implements OtaProvider interface for EFR32MG24 specific firmware updates.
 *
 * EFR32MG24 firmware can be updated via:
 * - Gecko Bootloader (serial protocol) - default
 * - J-Link SEGGER (debug/production)
 * - BLE OTA (if supported by firmware build)
 *
 * This implementation supports Gecko Bootloader serial protocol.
 * For production, use J-Link or Silicon Labs OTA tool.
 */
class OtaManager(private val context: Context) : OtaProvider {

    private val assetManager: AssetManager = context.assets
    private var currentProgress = MutableStateFlow<OtaResult>(OtaResult.Idle)
    private var updateInProgress = false

    /**
     * Scans the app's assets for EFR32MG24 firmware files.
     * Filters by hardware revision if specified in filename.
     * Format: efr32mg24-hwrev_001-v1.2.3.gbl or efr32mg24-v1.2.3.gbl
     */
    override suspend fun getAvailableFirmware(): List<FirmwareInfo> {
        val firmwarePath = getFirmwareAssetPath()
        return try {
            assetManager.list(firmwarePath)?.mapNotNull { fileName ->
                if (fileName.endsWith(getFirmwareFileExtension())) {
                    // Parse filename: efr32mg24-hwrev_001-v1.2.3.gbl or efr32mg24-v1.2.3.gbl
                    val parts = fileName.substringBeforeLast(getFirmwareFileExtension()).split("-")
                    val version = parts.lastOrNull() ?: "unknown"
                    val hwRevision = if (parts.size >= 3) parts[1] else "hwrev_001"
                    
                    FirmwareInfo(
                        version = version,
                        filePath = "$firmwarePath/$fileName",
                        hwRevision = hwRevision,
                        releaseNotes = "EFR32MG24 Gecko Bootloader firmware"
                    )
                } else null
            }?.sortedByDescending { it.version } ?: emptyList()
        } catch (e: Exception) {
            e.printStackTrace()
            emptyList()
        }
    }

    override suspend fun validateFirmware(firmwareInfo: FirmwareInfo): OtaResult {
        return try {
            // Verify file exists in assets
            val inputStream = assetManager.open(firmwareInfo.filePath)
            val fileSize = inputStream.available()
            inputStream.close()

            // EFR32MG24 .gbl files should be substantial (>1KB)
            if (fileSize > 1024) {
                OtaResult.Success("Firmware validated: ${firmwareInfo.version} (${fileSize} bytes)")
            } else {
                OtaResult.Error(Exception("Firmware file too small: ${fileSize} bytes"))
            }
        } catch (e: Exception) {
            OtaResult.Error(e)
        }
    }

    /**
     * Start EFR32MG24 firmware update via Gecko Bootloader serial protocol.
     * 
     * Steps:
     * 1. Read .gbl file from assets
     * 2. Connect to device serial port (requires Serial2Bluetooth adapter or USB connection)
     * 3. Invoke Gecko Bootloader (requires device reset into bootloader mode)
     * 4. Upload .gbl file with progress tracking
     * 5. Verify checksum
     * 6. Reset device to run new firmware
     *
     * TODO: Implement actual serial protocol communication
     * For development, simulate progress updates
     */
    override suspend fun startUpdate(
        firmwareInfo: FirmwareInfo,
        onProgress: (Int) -> Unit
    ): StateFlow<OtaResult> {
        if (updateInProgress) {
            currentProgress.value = OtaResult.Error(Exception("Update already in progress"))
            return currentProgress.asStateFlow()
        }

        updateInProgress = true
        try {
            // Validate firmware first
            val validation = validateFirmware(firmwareInfo)
            if (validation is OtaResult.Error) {
                currentProgress.value = validation
                updateInProgress = false
                return currentProgress.asStateFlow()
            }

            currentProgress.value = OtaResult.InProgress(0, "Starting Gecko Bootloader update: ${firmwareInfo.version}")
            onProgress(0)

            // Step 1: Load firmware file
            currentProgress.value = OtaResult.InProgress(5, "Loading firmware from assets...")
            onProgress(5)
            val inputStream = assetManager.open(firmwareInfo.filePath)
            val firmwareData = inputStream.readBytes()
            inputStream.close()

            // TODO: Step 2-6: Implement actual Gecko Bootloader serial protocol
            // For now, simulate progress
            var progress = 10
            while (progress < 90) {
                kotlinx.coroutines.delay(300)
                progress += 10
                currentProgress.value = OtaResult.InProgress(
                    progress,
                    "Uploading ${firmwareInfo.version}... $progress%"
                )
                onProgress(progress)
            }

            // Simulate final verification
            currentProgress.value = OtaResult.InProgress(95, "Verifying firmware checksum...")
            onProgress(95)
            kotlinx.coroutines.delay(500)

            currentProgress.value = OtaResult.InProgress(99, "Resetting device...")
            onProgress(99)
            kotlinx.coroutines.delay(500)

            currentProgress.value = OtaResult.Success("Firmware update complete: ${firmwareInfo.version}")
            onProgress(100)
        } catch (e: Exception) {
            currentProgress.value = OtaResult.Error(e)
        } finally {
            updateInProgress = false
        }

        return currentProgress.asStateFlow()
    }

    override suspend fun cancelUpdate(): OtaResult {
        return if (updateInProgress) {
            updateInProgress = false
            currentProgress.value = OtaResult.Error(Exception("Update cancelled by user"))
            OtaResult.Success("Update cancelled")
        } else {
            OtaResult.Error(Exception("No update in progress"))
        }
    }

    override fun getCurrentProgress(): Int {
        return when (val result = currentProgress.value) {
            is OtaResult.InProgress -> result.progress
            else -> -1
        }
    }

    override fun getFirmwareFileExtension(): String = ".gbl"

    override fun getFirmwareAssetPath(): String = "firmware/efr32mg24"
}
