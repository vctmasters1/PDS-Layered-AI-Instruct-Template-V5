package vm.pds.h2o.automation.ui_widgets

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import vm.pds.h2o.automation.datamodels.TimerConfig
import vm.pds.h2o.automation.datamodels.TimerType

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimerConfigWidget(
    timerConfig: TimerConfig,
    onTimerChanged: (TimerConfig) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxWidth()) {
        // Timer Type Dropdown
        var expandedType by remember { mutableStateOf(false) }
        ExposedDropdownMenuBox(
            expanded = expandedType,
            onExpandedChange = { expandedType = !expandedType },
            modifier = Modifier.fillMaxWidth()
        ) {
            OutlinedTextField(
                readOnly = true,
                value = timerConfig.type.displayName,
                onValueChange = { },
                label = { Text("Timer Type") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedType) },
                colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(),
                modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable, true).fillMaxWidth()
            )
            ExposedDropdownMenu(
                expanded = expandedType,
                onDismissRequest = { expandedType = false }
            ) {
                TimerType.entries.forEach { type ->
                    DropdownMenuItem(
                        text = { Text(type.displayName) },
                        onClick = {
                            onTimerChanged(timerConfig.copy(type = type))
                            expandedType = false
                        }
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        when (timerConfig.type) {
            TimerType.TIME_OF_DAY -> {
                Text(
                    text = "Time of Day Schedule (HH:MM:SS)",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = timerConfig.onTimeUnix.toString(), // TODO: Format as HH:MM
                        onValueChange = { it.toIntOrNull()?.let { v -> onTimerChanged(timerConfig.copy(onTimeUnix = v)) } },
                        label = { Text("Start Time (s)") },
                        modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                    OutlinedTextField(
                        value = timerConfig.offTimeUnix.toString(), // TODO: Format as HH:MM
                        onValueChange = { it.toIntOrNull()?.let { v -> onTimerChanged(timerConfig.copy(offTimeUnix = v)) } },
                        label = { Text("Stop Time (s)") },
                        modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                }
            }
            TimerType.CYCLE -> {
                Text(
                    text = "Repeating Cycle",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                 Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = timerConfig.onTimeUnix.toString(),
                        onValueChange = { it.toIntOrNull()?.let { v -> onTimerChanged(timerConfig.copy(onTimeUnix = v)) } },
                        label = { Text("Duration ON (s)") },
                        modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                    OutlinedTextField(
                        value = timerConfig.offTimeUnix.toString(),
                        onValueChange = { it.toIntOrNull()?.let { v -> onTimerChanged(timerConfig.copy(offTimeUnix = v)) } },
                        label = { Text("Total Cycle (s)") },
                        modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                }
            }
            TimerType.NONE -> {
                Text(
                    text = "No timer configured. Pipeline runs based on conditions only.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
