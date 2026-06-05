package vm.pds.h2o.pinconf

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import vm.pds.h2o.dev_platforms.abstract.GpioInterruptType
import vm.pds.h2o.dev_platforms.abstract.PinFlags
import vm.pds.h2o.dev_platforms.abstract.PinFunction
import vm.pds.h2o.dev_platforms.abstract.PinConfig

@Composable
fun Gpio(pinConfig: PinConfig, onConfigChanged: (PinConfig) -> Unit) {
    if (pinConfig.function == PinFunction.GPIO_IN) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = pinConfig.hasPullUp,
                    onCheckedChange = { checked ->
                        val newFlags = if (checked) {
                            pinConfig.configFlags or PinFlags.PULL_UP
                        } else {
                            pinConfig.configFlags and PinFlags.PULL_UP.inv()
                        }
                        onConfigChanged(pinConfig.copy(configFlags = newFlags))
                    }
                )
                Text("Pull-up")
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = pinConfig.hasPullDown,
                    onCheckedChange = { checked ->
                        val newFlags = if (checked) {
                            pinConfig.configFlags or PinFlags.PULL_DOWN
                        } else {
                            pinConfig.configFlags and PinFlags.PULL_DOWN.inv()
                        }
                        onConfigChanged(pinConfig.copy(configFlags = newFlags))
                    }
                )
                Text("Pull-down")
            }
        }

        Dropdown(
            label = "Interrupt Type",
            value = pinConfig.gpioInterruptType,
            options = GpioInterruptType.values().toList(),
            displayText = { it.displayName },
            onValueChange = { onConfigChanged(pinConfig.copy(gpioInterruptType = it)) }
        )
    }
}
