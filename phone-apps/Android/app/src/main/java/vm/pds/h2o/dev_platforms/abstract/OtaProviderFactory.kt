package vm.pds.h2o.dev_platforms.abstract

import android.content.Context
import vm.pds.h2o.dev_platforms.efr32mg24.ota.OtaManager as Efr32OtaManager
import vm.pds.h2o.dev_platforms.esp32c3_supermini.ota.OtaManager as Esp32OtaManager
import vm.pds.h2o.dev_platforms.esp32c3_supermini.common.PinCapabilities as Esp32Constants
import vm.pds.h2o.dev_platforms.efr32mg24.common.PinCapabilities as EfrConstants

/**
 * Factory for creating platform-specific OTA providers
 * 
 * Usage:
 * ```kotlin
 * val otaProvider = OtaProviderFactory.createOtaProvider(
 *     context = context,
 *     platformId = device.platformId  // from Constants.platformId
 * )
 * ```
 */
object OtaProviderFactory {

    /**
     * Create appropriate OTA provider for the given platform
     * @param context Android context for asset access
     * @param platformId Platform identifier (e.g., "ESP32C3_SUPERMINI", "EFR32MG24_DK")
     * @return OtaProvider implementation for the platform
     * @throws IllegalArgumentException if platform ID is not supported
     */
    fun createOtaProvider(context: Context, platformId: String): OtaProvider {
        return when (platformId) {
            "ESP32C3_SUPERMINI", Esp32Constants.platformId -> Esp32OtaManager(context)
            "EFR32MG24_DK", EfrConstants.platformId -> Efr32OtaManager(context)
            else -> throw IllegalArgumentException("Unsupported platform: $platformId")
        }
    }

    /**
     * Get list of supported platform IDs
     */
    fun getSupportedPlatforms(): List<String> = listOf(
        Esp32Constants.platformId,
        EfrConstants.platformId
    )

    /**
     * Check if platform is supported
     */
    fun isSupportedPlatform(platformId: String): Boolean {
        return getSupportedPlatforms().contains(platformId)
    }
}
