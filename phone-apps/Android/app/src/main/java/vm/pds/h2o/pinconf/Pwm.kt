package vm.pds.h2o.pinconf

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import vm.pds.h2o.dev_platforms.abstract.PinConfig
import vm.pds.h2o.dev_platforms.abstract.PwmDutyResolution

@Composable
fun Pwm(pinConfig: PinConfig, onConfigChanged: (PinConfig) -> Unit) {
    OutlinedTextField(
        value = pinConfig.pwmFrequency.toString(),
        onValueChange = { value ->
            value.toIntOrNull()?.let {
                if (it in 1..80_000_000) { // ESP32-C3 specific range
                    onConfigChanged(pinConfig.copy(pwmFrequency = it))
                }
            }
        },
        label = { Text("Frequency (Hz)") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true
    )

    Dropdown(
        label = "Duty Resolution",
        value = pinConfig.pwmDutyResolution,
        options = PwmDutyResolution.values().toList(),
        displayText = { it.displayName },
        onValueChange = { onConfigChanged(pinConfig.copy(pwmDutyResolution = it)) }
    )
}
