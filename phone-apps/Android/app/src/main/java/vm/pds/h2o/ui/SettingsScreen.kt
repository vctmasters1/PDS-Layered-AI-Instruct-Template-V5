package vm.pds.h2o.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import vm.pds.h2o.dev_platforms.abstract.DefaultAutomationProvider
import vm.pds.h2o.automation.datamodels.*
import vm.pds.h2o.viewmodel.MainViewModel

@Composable
fun SettingsScreen(mainViewModel: MainViewModel = viewModel()) {
    // Attempt to load from save, otherwise try to load from default provider using selected device ID
    val automation: DeviceAutomation? = mainViewModel.getSavedAutomation()
        ?: mainViewModel.selectedDevice.value?.let { (_, _) -> 
             // Default fallback for demo
             DefaultAutomationProvider.get("ESP32C3_SUPERMINI_H2O_001")
        }

    if (automation == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No automation configuration available.")
        }
        return
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(
                "Quick Settings",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                "Everyday adjustments for your automation pipelines.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        items(automation.pipelines) { pipeline ->
            PipelineSettingsCard(pipeline)
        }
    }
}

@Composable
fun PipelineSettingsCard(pipeline: Pipeline) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = if (pipeline.timer != null) Icons.Default.Timer else Icons.Default.Settings,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.width(8.dp))
                Column {
                    Text(pipeline.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    if (pipeline.description.isNotEmpty()) {
                        Text(pipeline.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            
            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

            // Settings Rows
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                
                // 1. Timer Settings
                pipeline.timer?.let { timer ->
                    if (timer.type == TimerType.CYCLE) {
                        SettingRow(
                            label = "On Duration",
                            value = formatDuration(timer.onTimeUnix)
                        )
                        SettingRow(
                            label = "Cycle Period",
                            value = formatDuration(timer.offTimeUnix)
                        )
                    } else if (timer.type == TimerType.TIME_OF_DAY) {
                        SettingRow(
                            label = "Start Time",
                            value = formatTimeOfDay(timer.onTimeUnix)
                        )
                        SettingRow(
                            label = "End Time",
                            value = formatTimeOfDay(timer.offTimeUnix)
                        )
                    }
                }

                // 2. Sensor Thresholds / Conditions
                pipeline.conditions.forEach { condition ->
                    when (condition.type) {
                        ConditionType.THRESHOLD_ABOVE -> {
                             SettingRow("Threshold (Above)", "${condition.param1}")
                        }
                        ConditionType.THRESHOLD_BELOW -> {
                             SettingRow("Threshold (Below)", "${condition.param1}")
                        }
                        ConditionType.RANGE -> {
                             SettingRow("Range", "${condition.param1} - ${condition.param2}")
                        }
                        ConditionType.GPIO_STATE -> {
                             // E.g. Float Switch
                             // param1 is target state (0 or 1)
                             SettingRow("Trigger State", if (condition.param1 == 1) "HIGH" else "LOW")
                        }
                        else -> {}
                    }
                }

                // 3. Actions (PWM / Output)
                pipeline.actions.forEach { action ->
                    if (action.type == ActionType.SET_PWM) {
                        // Assuming 10-bit PWM (0-1023) for display %
                        val percent = (action.value / 1023f * 100).toInt()
                        SettingRow("Output Power", "$percent%")
                    } else if (action.type == ActionType.SET_GPIO) {
                        SettingRow("Output State", if (action.value == 1) "ON" else "OFF")
                    }
                }
            }
        }
    }
}

@Composable
fun SettingRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
    }
}

// Helper formats
private fun formatTimeOfDay(seconds: Int): String {
    val hours = (seconds / 3600) % 24
    val minutes = (seconds % 3600) / 60
    return String.format("%02d:%02d", hours, minutes)
}

private fun formatDuration(seconds: Int): String {
    val days = seconds / 86400
    val hours = (seconds % 86400) / 3600
    val minutes = (seconds % 3600) / 60
    val secs = seconds % 60
    
    return buildString {
        if (days > 0) append("${days}d ")
        if (hours > 0) append("${hours}h ")
        if (minutes > 0) append("${minutes}m ")
        if (secs > 0 || length == 0) append("${secs}s")
    }.trim()
}
