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

// Placeholder: LimitControlWidget
// This widget handles configuring LIMIT/RANGE type conditions if you have any.
// Since the original errors referenced LimitControlWidget and SlewControlWidget,
// and you requested breaking files apart, I'm ensuring these files are updated
// to point to the new datamodel locations.

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LimitControlWidget(
    condition: Condition,
    adapter: Adapter,
    onUpdate: (Condition) -> Unit
) {
    // This is a specialized widget for RANGE or LIMIT type conditions
    // Assuming ConditionType.RANGE for this example
    
    if (condition.type != ConditionType.RANGE) {
        Text("Not a Limit/Range condition")
        return
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "Limit Control: ${condition.label}",
            style = MaterialTheme.typography.titleSmall
        )
        
        // Example: Enable/Disable toggle inside the widget if needed
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
                label = { Text("Sensor Pin") },
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

        // Range Limits (Min/Max)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = condition.param1.toString(),
                onValueChange = { it.toIntOrNull()?.let { v -> onUpdate(condition.copy(param1 = v)) } },
                label = { Text("Min Value") },
                modifier = Modifier.weight(1f),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
            OutlinedTextField(
                value = condition.param2.toString(),
                onValueChange = { it.toIntOrNull()?.let { v -> onUpdate(condition.copy(param2 = v)) } },
                label = { Text("Max Value") },
                modifier = Modifier.weight(1f),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        // Hysteresis / Delays
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = condition.delayOnMakeMs.toString(),
                onValueChange = { it.toIntOrNull()?.let { v -> onUpdate(condition.copy(delayOnMakeMs = v)) } },
                label = { Text("Delay Make (ms)") },
                modifier = Modifier.weight(1f),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
            OutlinedTextField(
                value = condition.delayOnBreakMs.toString(),
                onValueChange = { it.toIntOrNull()?.let { v -> onUpdate(condition.copy(delayOnBreakMs = v)) } },
                label = { Text("Delay Break (ms)") },
                modifier = Modifier.weight(1f),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
        }
    }
}
