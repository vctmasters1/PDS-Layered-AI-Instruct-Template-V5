package vm.pds.h2o.dev_platforms.esp32c3_supermini.ota

import android.content.Context
import android.content.res.AssetManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import vm.pds.h2o.dev_platforms.abstract.FirmwareInfo
import vm.pds.h2o.dev_platforms.abstract.OtaProvider
import vm.pds.h2o.dev_platforms.abstract.OtaResult

/**
 * ESP32-C3 Super Mini OTA Manager
 * Implements OtaProvider interface for ESP32-C3 specific firmware updates via BLE
 */
class OtaManager(private val context: Context) : OtaProvider {

    private val assetManager: AssetManager = context.assets
    private var currentProgress = MutableStateFlow<OtaResult>(OtaResult.Idle)
    private var updateInProgress = false

    /**
     * Scans the app's assets for firmware files and returns a list of [FirmwareInfo].
     */
    override suspend fun getAvailableFirmware(): List<FirmwareInfo> {
        val firmwarePath = getFirmwareAssetPath()
        return try {
            assetManager.list(firmwarePath)?.mapNotNull { fileName ->
                if (fileName.endsWith(getFirmwareFileExtension())) {
                    val version = fileName.substringBeforeLast(getFirmwareFileExtension())
                    FirmwareInfo(
                        version = version,
                        filePath = "$firmwarePath/$fileName",
                        hwRevision = "hwrev_001"  // Default for ESP32-C3 Super Mini
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
            
            // Basic validation: file should not be empty
            if (fileSize > 0) {
                OtaResult.Success("Firmware validated: ${firmwareInfo.version} (${fileSize} bytes)")
            } else {
                OtaResult.Error(Exception("Firmware file is empty"))
            }
        } catch (e: Exception) {
            OtaResult.Error(e)
        }
    }

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

            currentProgress.value = OtaResult.InProgress(0, "Starting update: ${firmwareInfo.version}")
            onProgress(0)

            // TODO: Implement actual BLE OTA upload
            // For now, simulate progress
            for (progress in 10..90 step 10) {
                kotlinx.coroutines.delay(500)
                currentProgress.value = OtaResult.InProgress(progress, "Uploading... $progress%")
                onProgress(progress)
            }

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

    override fun getFirmwareFileExtension(): String = ".bin"

    override fun getFirmwareAssetPath(): String = "firmware/esp32c3_supermini"
}
