package vm.pds.h2o.pinconf

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import vm.pds.h2o.dev_platforms.abstract.PinFunction
import vm.pds.h2o.dev_platforms.abstract.PlatformPinCapabilities
import vm.pds.h2o.dev_platforms.abstract.PinConfig

@Composable
fun Details(
    platformDef: PlatformPinCapabilities,
    pinConfig: PinConfig,
    onConfigChanged: (PinConfig) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        OutlinedTextField(
            value = pinConfig.label,
            onValueChange = { onConfigChanged(pinConfig.copy(label = it)) },
            label = { Text("Label") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Dropdown(
            label = "Function",
            value = pinConfig.function,
            options = PinFunction.values().toList(),
            displayText = { it.displayName },
            onValueChange = { onConfigChanged(pinConfig.copy(function = it)) }
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Enabled", style = MaterialTheme.typography.bodyLarge)
            Switch(
                checked = pinConfig.isEnabled,
                onCheckedChange = { enabled ->
                    onConfigChanged(pinConfig.copy(isEnabled = enabled))
                }
            )
        }

        when (pinConfig.function) {
            PinFunction.ADC -> Adc(platformDef, pinConfig, onConfigChanged)
            PinFunction.PWM -> Pwm(pinConfig, onConfigChanged)
            PinFunction.GPIO_IN, PinFunction.GPIO_OUT -> Gpio(pinConfig, onConfigChanged)
            PinFunction.I2C_SDA, PinFunction.I2C_SCL -> I2C(pinConfig, onConfigChanged)
            PinFunction.UART_TX, PinFunction.UART_RX -> Uart(pinConfig, onConfigChanged)
            else -> {}
        }
    }
}
