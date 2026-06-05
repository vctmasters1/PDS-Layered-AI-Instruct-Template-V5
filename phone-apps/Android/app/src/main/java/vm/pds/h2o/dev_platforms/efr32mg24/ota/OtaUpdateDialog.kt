package vm.pds.h2o.dev_platforms.efr32mg24.ota

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
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import vm.pds.h2o.dev_platforms.abstract.OtaResult

/**
 * EFR32MG24 OTA Update Dialog
 * Displays firmware selection, progress tracking, and operation logs
 */
@Composable
fun OtaUpdateDialog(
    onDismiss: () -> Unit,
    otaViewModel: OtaViewModel = viewModel()
) {
    val firmwareList by otaViewModel.firmwareList.collectAsState()
    val selectedFirmware by otaViewModel.selectedFirmware.collectAsState()
    val logMessages by otaViewModel.logMessages.collectAsState()
    val updateResult by otaViewModel.updateResult.collectAsState()
    val currentProgress by otaViewModel.currentProgress.collectAsState()

    val isUpdating = updateResult is OtaResult.InProgress
    val updateSucceeded = updateResult is OtaResult.Success
    val updateFailed = updateResult is OtaResult.Error

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("EFR32MG24 Firmware Update")
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                // Firmware selector
                FirmwareSelector(
                    firmwareList = firmwareList,
                    selectedFirmware = selectedFirmware,
                    onSelectionChange = { otaViewModel.selectFirmware(it) },
                    enabled = !isUpdating
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Progress bar
                if (isUpdating) {
                    LinearProgressIndicator(
                        progress = { currentProgress / 100f },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp),
                        color = MaterialTheme.colorScheme.primary,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "$currentProgress% Complete",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                }

                // Status indicator
                if (updateSucceeded) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                color = Color.Green.copy(alpha = 0.1f),
                                shape = MaterialTheme.shapes.small
                            )
                            .padding(8.dp)
                    ) {
                        Text("✓ Update successful", color = Color.Green)
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                } else if (updateFailed) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                color = Color.Red.copy(alpha = 0.1f),
                                shape = MaterialTheme.shapes.small
                            )
                            .padding(8.dp)
                    ) {
                        Text("✗ Update failed", color = Color.Red)
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                }

                // Log output
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(250.dp)
                        .background(Color.Black, shape = MaterialTheme.shapes.small)
                        .padding(8.dp)
                ) {
                    items(logMessages) { message ->
                        Text(
                            text = message,
                            color = Color.Green,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp
                        )
                    }
                }
            }
        },
        confirmButton = {
            if (!isUpdating && !updateSucceeded && !updateFailed) {
                Button(
                    onClick = { otaViewModel.startOtaUpdate() },
                    enabled = selectedFirmware != null
                ) {
                    Text("Start Update")
                }
            } else if (isUpdating) {
                Button(onClick = { otaViewModel.cancelUpdate() }) {
                    Text("Cancel")
                }
            } else {
                Button(onClick = onDismiss) {
                    Text("Close")
                }
            }
        },
        dismissButton = {
            if (!isUpdating) {
                TextButton(onClick = onDismiss) {
                    Text("Close")
                }
            }
        },
        modifier = Modifier.fillMaxWidth()
    )
}

/**
 * Firmware version dropdown selector
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FirmwareSelector(
    firmwareList: List<vm.pds.h2o.dev_platforms.abstract.FirmwareInfo>,
    selectedFirmware: vm.pds.h2o.dev_platforms.abstract.FirmwareInfo?,
    onSelectionChange: (vm.pds.h2o.dev_platforms.abstract.FirmwareInfo) -> Unit,
    enabled: Boolean = true,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it && enabled },
        modifier = modifier.fillMaxWidth()
    ) {
        OutlinedTextField(
            value = selectedFirmware?.let { "${it.version} (${it.hwRevision})" } ?: "Select firmware",
            onValueChange = {},
            readOnly = true,
            label = { Text("Firmware Version") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            enabled = enabled,
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor()
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            firmwareList.forEach { firmware ->
                DropdownMenuItem(
                    text = {
                        Column {
                            Text(firmware.version)
                            Text(
                                "hwrev: ${firmware.hwRevision}",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    },
                    onClick = {
                        onSelectionChange(firmware)
                        expanded = false
                    },
                    contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding
                )
            }
        }
    }
}
