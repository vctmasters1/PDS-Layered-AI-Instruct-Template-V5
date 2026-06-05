package vm.pds.h2o.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import vm.pds.h2o.automation.ui_widgets.AutomationPanel
import vm.pds.h2o.dev_platforms.abstract.DevicePinMap
import vm.pds.h2o.dev_platforms.abstract.PlatformPinCapabilities
import vm.pds.h2o.dev_platforms.esp32c3_supermini.common.PinCapabilities as Esp32Constants
import vm.pds.h2o.dev_platforms.esp32c3_supermini.hwrev_001.h2o_001.DefaultAutomation
import vm.pds.h2o.pinconf.Adapter
import vm.pds.h2o.viewmodel.MainViewModel

@Composable
fun AutomationScreen(pinMap: DevicePinMap, mainViewModel: MainViewModel) {
    // Adapter needs PlatformDefinition. 
    // Ideally the device type comes from the selected device or MainViewModel.
    // For now we assume ESP32-C3
    val platformDef: PlatformPinCapabilities = Esp32Constants
    val adapter = Adapter(platformDef, pinLabelProvider = { pin -> 
        pinMap.getPin(pin)?.label ?: "GPIO $pin" 
    })

    // Local state for the automation configuration being edited.
    // Initialized with default values.
    // Ideally this should load from ViewModel initially if previously saved locally.
    // For simplicity in this iteration, we start with default or what's loaded.
    var automation by remember { mutableStateOf(mainViewModel.getSavedAutomation() ?: DefaultAutomation.createDefaultAutomation()) }
    
    // UI Message Handling
    val uiMessage by mainViewModel.uiMessage.collectAsState()
    
    if (uiMessage != null) {
        AlertDialog(
            onDismissRequest = { mainViewModel.clearUiMessage() },
            confirmButton = {
                Button(onClick = { mainViewModel.clearUiMessage() }) {
                    Text("OK")
                }
            },
            title = { Text("Automation Saved") },
            text = { Text(uiMessage ?: "") }
        )
    }

    Column(modifier = Modifier.padding(16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Automation Pipelines",
                style = MaterialTheme.typography.headlineSmall
            )
            Button(
                onClick = { mainViewModel.saveAutomation(automation) }
            ) {
                Text("Save to Device")
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        AutomationPanel(
            adapter = adapter,
            automation = automation,
            onSave = { updatedAutomation ->
                // Update local state immediately to reflect changes in UI
                automation = updatedAutomation
            }
        )
    }
}
