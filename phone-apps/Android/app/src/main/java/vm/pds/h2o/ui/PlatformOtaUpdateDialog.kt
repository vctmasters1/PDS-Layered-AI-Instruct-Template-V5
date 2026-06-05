package vm.pds.h2o.ui

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import vm.pds.h2o.dev_platforms.abstract.OtaProviderFactory
import vm.pds.h2o.dev_platforms.esp32c3_supermini.ota.OtaUpdateDialog as Esp32OtaDialog
import vm.pds.h2o.dev_platforms.efr32mg24.ota.OtaUpdateDialog as EfrOtaDialog

/**
 * Platform-agnostic OTA Update Dialog
 * 
 * Automatically selects the correct platform-specific OTA UI based on
 * the selected device's platform ID. Falls back to ESP32-C3 if no
 * specific device is selected.
 * 
 * Usage:
 * ```kotlin
 * if (showOtaDialog) {
 *     PlatformOtaUpdateDialog(
 *         context = context,
 *         selectedDevicePlatformId = currentDevice?.platformId,
 *         onDismiss = { showOtaDialog = false }
 *     )
 * }
 * ```
 */
@Composable
fun PlatformOtaUpdateDialog(
    context: Context,
    selectedDevicePlatformId: String?,
    onDismiss: () -> Unit
) {
    // Determine which platform OTA dialog to show
    val platformId = selectedDevicePlatformId ?: "ESP32C3_SUPERMINI"
    
    // Verify platform is supported
    if (!OtaProviderFactory.isSupportedPlatform(platformId)) {
        // Unsupported platform - show error dialog
        androidx.compose.material3.AlertDialog(
            onDismissRequest = onDismiss,
            title = { androidx.compose.material3.Text("Unsupported Platform") },
            text = { androidx.compose.material3.Text("OTA updates are not supported for platform: $platformId") },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = onDismiss) {
                    androidx.compose.material3.Text("Close")
                }
            }
        )
        return
    }

    // Display platform-specific OTA dialog
    when (platformId) {
        "ESP32C3_SUPERMINI" -> Esp32OtaDialog(onDismiss = onDismiss)
        "EFR32MG24_DK" -> EfrOtaDialog(onDismiss = onDismiss)
        else -> {
            // Fallback - should not happen if isSupportedPlatform() works correctly
            androidx.compose.material3.AlertDialog(
                onDismissRequest = onDismiss,
                title = { androidx.compose.material3.Text("Error") },
                text = { androidx.compose.material3.Text("OTA provider not found for: $platformId") },
                confirmButton = {
                    androidx.compose.material3.TextButton(onClick = onDismiss) {
                        androidx.compose.material3.Text("Close")
                    }
                }
            )
        }
    }
}
