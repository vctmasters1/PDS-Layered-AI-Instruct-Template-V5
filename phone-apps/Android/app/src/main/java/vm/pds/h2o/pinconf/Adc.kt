package vm.pds.h2o.pinconf

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import vm.pds.h2o.dev_platforms.abstract.AdcCalibration
import vm.pds.h2o.dev_platforms.abstract.PlatformPinCapabilities
import vm.pds.h2o.dev_platforms.abstract.PinConfig
import vm.pds.h2o.dev_platforms.abstract.PwmDutyResolution
import vm.pds.h2o.dev_platforms.esp32c3_supermini.common.PinCapabilities as Esp32Constants

@Composable
fun Adc(platformDef: PlatformPinCapabilities, pinConfig: PinConfig, onConfigChanged: (PinConfig) -> Unit) {
    if (!platformDef.isPinAdcCapable(pinConfig.pinNumber)) {
        Text(
            "⚠️ Warning: GPIO${pinConfig.pinNumber} does not support ADC on this platform",
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall
        )
    }

    // TODO: Make these platform-agnostic or load specific options from platformDef
    Dropdown(
        label = "Attenuation",
        value = Esp32Constants.AdcAttenuation.values().getOrElse(0) { Esp32Constants.AdcAttenuation.DB_11 }, // Default placeholder
        options = Esp32Constants.AdcAttenuation.values().toList(),
        displayText = { "${it.displayName} - ${it.voltageRange}" },
        onValueChange = { /* TODO: Store platform specific config */ }
    )

    Dropdown(
        label = "Resolution",
        value = PwmDutyResolution.BIT_12, // Default or load from config
        options = PwmDutyResolution.values().toList(),
        displayText = { it.displayName },
        onValueChange = { /* TODO: Store platform specific config */ }
    )

    Dropdown(
        label = "Calibration",
        value = AdcCalibration.DEFAULT, // Default
        options = AdcCalibration.values().toList(),
        displayText = { it.displayName },
        onValueChange = { /* TODO: Store platform specific config */ }
    )

    // Example of calibration fields (if needed by generic config)
    /*
    if (pinConfig.adcCalibration != AdcCalibration.NONE) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = "0", // pinConfig.calSensorMin.toString(),
                onValueChange = { },
                label = { Text("Sensor Min") },
                modifier = Modifier.weight(1f)
            )
            // ...
        }
    }
    */
}
