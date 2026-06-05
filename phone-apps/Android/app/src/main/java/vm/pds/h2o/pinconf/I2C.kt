package vm.pds.h2o.pinconf

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import vm.pds.h2o.dev_platforms.abstract.PinConfig

@Composable
fun I2C(pinConfig: PinConfig, onConfigChanged: (PinConfig) -> Unit) {
    OutlinedTextField(
        value = pinConfig.i2cClockSpeed.toString(),
        onValueChange = { value ->
            value.toIntOrNull()?.let {
                onConfigChanged(pinConfig.copy(i2cClockSpeed = it))
            }
        },
        label = { Text("Clock Speed (Hz)") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true
    )
}
