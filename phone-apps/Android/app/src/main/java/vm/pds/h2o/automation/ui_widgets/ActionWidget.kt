package vm.pds.h2o.automation.ui_widgets

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import vm.pds.h2o.automation.datamodels.Action
import vm.pds.h2o.automation.datamodels.ActionType
import vm.pds.h2o.pinconf.Adapter
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActionWidget(
    action: Action,
    adapter: Adapter,
    onUpdate: (Action) -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        // Action Type Dropdown
        var expandedType by remember { mutableStateOf(false) }
        ExposedDropdownMenuBox(
            expanded = expandedType,
            onExpandedChange = { expandedType = !expandedType },
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedTextField(
                readOnly = true,
                value = action.type.displayName,
                onValueChange = { },
                label = { Text("Action Type") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedType) },
                colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(),
                modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable, true).fillMaxWidth()
            )
            ExposedDropdownMenu(
                expanded = expandedType,
                onDismissRequest = { expandedType = false }
            ) {
                ActionType.entries.forEach { type ->
                    DropdownMenuItem(
                        text = { Text(type.displayName) },
                        onClick = {
                            onUpdate(action.copy(type = type))
                            expandedType = false
                        }
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.height(8.dp))

        // If it's a Servo type, delegate to ServoWidget
        if (action.type == ActionType.SERVO) {
             ServoWidget(action, adapter, onUpdate)
             return
        }

        // Target Pin Dropdown
        if (action.type.requiresTarget) {
             var expandedPin by remember { mutableStateOf(false) }
             ExposedDropdownMenuBox(
                expanded = expandedPin,
                onExpandedChange = { expandedPin = !expandedPin },
                modifier = Modifier.fillMaxWidth()
            ) {
                OutlinedTextField(
                    readOnly = true,
                    value = adapter.getPinLabel(action.targetPin),
                    onValueChange = { },
                    label = { Text("Target Pin") },
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
                                onUpdate(action.copy(targetPin = pin))
                                expandedPin = false
                            }
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
        }
        
        // Values
        if (action.type == ActionType.SET_PWM) {
            // Convert 0-1023 to 0-100% for display
            val percentage = (action.value / 1023.0 * 100).roundToInt()
            
            Column {
                Text(
                    text = "PWM-RATE: $percentage%",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Slider(
                    value = percentage.toFloat(),
                    onValueChange = { newPercent ->
                        val safePercent = newPercent.roundToInt().coerceIn(0, 100)
                        val rawValue = (safePercent / 100.0 * 1023).roundToInt()
                        onUpdate(action.copy(value = rawValue))
                    },
                    valueRange = 0f..100f,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        } else if (action.type == ActionType.SET_GPIO) {
             var expandedVal by remember { mutableStateOf(false) }
             ExposedDropdownMenuBox(
                expanded = expandedVal,
                onExpandedChange = { expandedVal = !expandedVal },
                modifier = Modifier.fillMaxWidth()
            ) {
                OutlinedTextField(
                    readOnly = true,
                    value = if (action.value == 1) "ON (1)" else "OFF (0)",
                    onValueChange = { },
                    label = { Text("State") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedVal) },
                    colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(),
                    modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable, true).fillMaxWidth()
                )
                ExposedDropdownMenu(
                    expanded = expandedVal,
                    onDismissRequest = { expandedVal = false }
                ) {
                    DropdownMenuItem(text = { Text("ON (1)") }, onClick = { onUpdate(action.copy(value = 1)); expandedVal = false })
                    DropdownMenuItem(text = { Text("OFF (0)") }, onClick = { onUpdate(action.copy(value = 0)); expandedVal = false })
                }
            }
        } else if (action.type == ActionType.SET_DAC) {
            // DAC Input (0-255 or 0-4095 depending on platform, assuming generic int input for now)
             OutlinedTextField(
                value = action.value.toString(),
                onValueChange = { it.toIntOrNull()?.let { v -> onUpdate(action.copy(value = v)) } },
                label = { Text("DAC Value") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
        }

        // Action Delays (Make/Break)
        if (action.type != ActionType.NONE) {
            Spacer(modifier = Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = action.delayOnMakeMs.toString(),
                    onValueChange = { it.toIntOrNull()?.let { v -> onUpdate(action.copy(delayOnMakeMs = v)) } },
                    label = { Text("Delay Start (ms)") },
                    modifier = Modifier.weight(1f),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                )
                OutlinedTextField(
                    value = action.delayOnBreakMs.toString(),
                    onValueChange = { it.toIntOrNull()?.let { v -> onUpdate(action.copy(delayOnBreakMs = v)) } },
                    label = { Text("Delay Stop (ms)") },
                    modifier = Modifier.weight(1f),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                )
            }
        }
    }
}
