package vm.pds.h2o.pinconf

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import vm.pds.h2o.dev_platforms.abstract.PinConfig

@Composable
fun Uart(pinConfig: PinConfig, onConfigChanged: (PinConfig) -> Unit) {
    OutlinedTextField(
        value = pinConfig.uartBaudRate.toString(),
        onValueChange = { value ->
            value.toIntOrNull()?.let {
                onConfigChanged(pinConfig.copy(uartBaudRate = it))
            }
        },
        label = { Text("Baud Rate") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true
    )
}
