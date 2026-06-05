package vm.pds.h2o.dev_platforms.esp32c3_supermini.ota

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel

// this should impliment OTA updates based on the available files in the firmware folder.
// should automatically select the most current firmware, but also allow a dropdowm of versions for rollback.
// this should be a dialog window with a terminal-like, text based log for the user to see progress.

@Composable
fun OtaUpdateDialog(onDismiss: () -> Unit, otaViewModel: OtaViewModel = viewModel()) {
    val firmwareList by otaViewModel.firmwareList.collectAsState()
    val selectedFirmware by otaViewModel.selectedFirmware.collectAsState()
    val logMessages by otaViewModel.logMessages.collectAsState()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Firmware Update") },
        text = {
            Column {
                H2oDropdownSelector(
                    label = "Firmware Version",
                    options = firmwareList,
                    value = selectedFirmware,
                    displayText = { it?.version ?: "" },
                    onSelectionChange = { otaViewModel.selectFirmware(it) }
                )
                Spacer(modifier = Modifier.height(16.dp))
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp)
                        .background(Color.Black)
                        .padding(8.dp)
                ) {
                    items(logMessages) {
                        Text(it, color = Color.White, fontFamily = FontFamily.Monospace)
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { otaViewModel.startOtaUpdate() },
                enabled = selectedFirmware != null
            ) {
                Text("Start Update")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> H2oDropdownSelector(
    label: String,
    options: List<T>,
    value: T?,
    displayText: (T?) -> String,
    onSelectionChange: (T) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = modifier
    ) {
        OutlinedTextField(
            value = displayText(value),
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor()
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(displayText(option)) },
                    onClick = {
                        onSelectionChange(option)
                        expanded = false
                    },
                    contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding
                )
            }
        }
    }
}
