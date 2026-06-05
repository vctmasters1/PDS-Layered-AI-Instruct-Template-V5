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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConditionWidget(
    condition: Condition,
    adapter: Adapter,
    onUpdate: (Condition) -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        // Condition Type Dropdown
        var expandedType by remember { mutableStateOf(false) }
        ExposedDropdownMenuBox(
            expanded = expandedType,
            onExpandedChange = { expandedType = !expandedType },
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedTextField(
                readOnly = true,
                value = condition.type.displayName,
                onValueChange = { },
                label = { Text("Condition Type") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedType) },
                colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(),
                modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable, true).fillMaxWidth()
            )
            ExposedDropdownMenu(
                expanded = expandedType,
                onDismissRequest = { expandedType = false }
            ) {
                ConditionType.entries.forEach { type ->
                    DropdownMenuItem(
                        text = { Text(type.displayName) },
                        onClick = {
                            onUpdate(condition.copy(type = type))
                            expandedType = false
                        }
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        // Source Pin Dropdown
        if (condition.type.requiresSource) {
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
                    label = { Text("Source Pin") },
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
        }

        // Parameters
        when (condition.type) {
            ConditionType.THRESHOLD_ABOVE,
            ConditionType.THRESHOLD_BELOW -> {
                OutlinedTextField(
                    value = condition.param1.toString(),
                    onValueChange = { it.toIntOrNull()?.let { v -> onUpdate(condition.copy(param1 = v)) } },
                    label = { Text("Threshold Value") },
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                )
            }
            ConditionType.GPIO_STATE -> {
                var expandedState by remember { mutableStateOf(false) }
                ExposedDropdownMenuBox(
                    expanded = expandedState,
                    onExpandedChange = { expandedState = !expandedState },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    OutlinedTextField(
                        readOnly = true,
                        value = if (condition.param1 == 1) "HIGH (1)" else "LOW (0)",
                        onValueChange = { },
                        label = { Text("Trigger State") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedState) },
                        colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(),
                        modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable, true).fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = expandedState,
                        onDismissRequest = { expandedState = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("HIGH (1)") },
                            onClick = { onUpdate(condition.copy(param1 = 1)); expandedState = false }
                        )
                        DropdownMenuItem(
                            text = { Text("LOW (0)") },
                            onClick = { onUpdate(condition.copy(param1 = 0)); expandedState = false }
                        )
                    }
                }
            }
            ConditionType.MANUAL_BUTTON -> {
                // If we are in manual button mode, maybe we want to select WHICH virtual button 
                // triggers this, if multiple are supported. For now, let's just show an ID field.
                 OutlinedTextField(
                    value = condition.param1.toString(),
                    onValueChange = { it.toIntOrNull()?.let { v -> onUpdate(condition.copy(param1 = v)) } },
                    label = { Text("Button ID (e.g. 1)") },
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                )
                
                // Also add a "Press Me" test button for convenience if this is a live view, 
                // but here we are just configuring the rule.
                
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = { /* TODO: Send manual trigger signal to device for testing */ },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Test Trigger (Button ${condition.param1})")
                }
            }
            else -> {}
        }
        
        // Debounce / Delay
        if (condition.type != ConditionType.NONE && condition.type != ConditionType.TIMER && condition.type != ConditionType.MANUAL_BUTTON) {
            Spacer(modifier = Modifier.height(8.dp))
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
}
