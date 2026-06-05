package vm.pds.h2o.automation.ui_widgets

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import vm.pds.h2o.automation.datamodels.Condition
import vm.pds.h2o.automation.datamodels.ConditionType
import vm.pds.h2o.pinconf.Adapter

// Placeholder: SlewControlWidget
// This widget handles configuring PID/SLEW type conditions if you have any.
// As with LimitControlWidget, updating imports to fix build errors.

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SlewControlWidget(
    condition: Condition,
    adapter: Adapter,
    onUpdate: (Condition) -> Unit
) {
    // This is a specialized widget for PID_SLEW type conditions
    if (condition.type != ConditionType.PID_SLEW_LOW && condition.type != ConditionType.PID_SLEW_HIGH) {
        Text("Not a PID/Slew condition")
        return
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "PID Slew Control: ${condition.label}",
            style = MaterialTheme.typography.titleSmall
        )
        
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Checkbox(
                checked = condition.enabled,
                onCheckedChange = { onUpdate(condition.copy(enabled = it)) }
            )
            Text("Enabled")
        }

        // Source Pin
         var expandedPin by remember { mutableStateOf(false) }
         ExposedDropdownMenuBox(
            expanded = expandedPin,
            onExpandedChange = { expandedPin = !expandedPin },
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedTextField(
                readOnly = true,
                value = adapter.getPinLabel(condition.sourcePin),
                onValueChange = { },
                label = { Text("Sensor/Input Pin") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedPin) },
                colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(),
                modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable, true).fillMaxWidth()
            )
            ExposedDropdownMenu(
                expanded = expandedPin,
                onDismissRequest = { expandedPin = false }
            ) {
                adapter.getAvailablePins().forEach { pin ->
                    DropdownMenuItem(
                        text = { Text(adapter.getPinLabel(pin)) },
                        onClick = {
                            onUpdate(condition.copy(sourcePin = pin))
                            expandedPin = false
                        }
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        // Slew Rate / Thresholds
        // Assuming param1 is target rate or threshold
        OutlinedTextField(
            value = condition.param1.toString(),
            onValueChange = { it.toIntOrNull()?.let { v -> onUpdate(condition.copy(param1 = v)) } },
            label = { Text("Target Rate / Threshold") },
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
        )
    }
}
