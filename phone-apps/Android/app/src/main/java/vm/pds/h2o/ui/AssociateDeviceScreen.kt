package vm.pds.h2o.ui

import android.Manifest
import android.bluetooth.le.ScanResult
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import vm.pds.h2o.viewmodel.AssociateDeviceViewModel
import vm.pds.h2o.viewmodel.ConnectionStatus
import vm.pds.h2o.viewmodel.MainViewModel

@Composable
fun AssociateDeviceScreen(
    onDismiss: () -> Unit,
    mainViewModel: MainViewModel,
    associateDeviceViewModel: AssociateDeviceViewModel = viewModel()
) {
    val scannedDevices by associateDeviceViewModel.scannedDevices.collectAsState()
    val isScanning by associateDeviceViewModel.isScanning.collectAsState()
    val knownDevices by mainViewModel.knownDevices.collectAsState()
    val connectionStatus by associateDeviceViewModel.connectionStatus.collectAsState()
    var hasPermissions by remember { mutableStateOf(false) }

    val permissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        arrayOf(
            Manifest.permission.BLUETOOTH_SCAN,
            Manifest.permission.BLUETOOTH_CONNECT,
            Manifest.permission.ACCESS_FINE_LOCATION
        )
    } else {
        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
        onResult = { permissionsResult ->
            hasPermissions = permissionsResult.values.all { it }
        }
    )

    LaunchedEffect(key1 = true) {
        launcher.launch(permissions)
    }

    Column(modifier = Modifier.padding(16.dp)) {
        Text("Associate Device", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(16.dp))

        if (connectionStatus == ConnectionStatus.CONNECTING) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }

        Text("Known Devices", style = MaterialTheme.typography.titleMedium)
        LazyColumn {
            items(knownDevices.toList()) { (address, name) ->
                DeviceItem(name, address, true, associateDeviceViewModel, mainViewModel)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Scanned Devices", style = MaterialTheme.typography.titleMedium)
            Button(
                onClick = { 
                    if (isScanning) {
                        associateDeviceViewModel.stopScan()
                    } else {
                        associateDeviceViewModel.startScan()
                    }
                },
                enabled = hasPermissions && connectionStatus != ConnectionStatus.CONNECTING
            ) {
                Text(if (isScanning) "Stop Scan" else "Start Scan")
            }
        }
        LazyColumn {
            items(scannedDevices) { device ->
                DeviceItem(device.device.name ?: "Unknown", device.device.address, false, associateDeviceViewModel, mainViewModel)
            }
        }
    }
}

@Composable
private fun DeviceItem(
    name: String,
    address: String,
    isKnown: Boolean,
    viewModel: AssociateDeviceViewModel,
    mainViewModel: MainViewModel
) {
    var showDialog by remember { mutableStateOf(false) }

    if (showDialog) {
        AssociateDeviceDialog(onDismiss = { showDialog = false }, onSave = { ssid, pass, isHotspot ->
            viewModel.connectToDevice(address)
            viewModel.sendWifiCredentials(ssid, pass, isHotspot)
            mainViewModel.addDevice(address, name)
        })
    }

    Card(modifier = Modifier.padding(vertical = 4.dp).fillMaxWidth()) {
        ListItem(
            headlineContent = { Text(name) },
            supportingContent = { Text(address) },
            trailingContent = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (isKnown) {
                        IconButton(onClick = { mainViewModel.forgetDevice(address) }) {
                            Icon(Icons.Default.Delete, contentDescription = "Forget Device")
                        }
                    }
                    Button(onClick = { showDialog = true }) {
                        Text("Connect")
                    }
                }
            }
        )
    }
}

@Composable
fun AssociateDeviceDialog(
    onDismiss: () -> Unit,
    onSave: (ssid: String, pass: String, isHotspot: Boolean) -> Unit
) {
    var selectedTabIndex by remember { mutableStateOf(0) }
    var ssid by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Configure Wi-Fi") },
        text = {
            Column {
                TabRow(selectedTabIndex = selectedTabIndex) {
                    Tab(
                        selected = selectedTabIndex == 0,
                        onClick = { selectedTabIndex = 0 },
                        text = { Text("Connect to Wi-Fi") }
                    )
                    Tab(
                        selected = selectedTabIndex == 1,
                        onClick = { selectedTabIndex = 1 },
                        text = { Text("Hotspot Mode") }
                    )
                }

                Column(modifier = Modifier.padding(top = 16.dp)) {
                    if (selectedTabIndex == 0) {
                        OutlinedTextField(
                            value = ssid,
                            onValueChange = { ssid = it },
                            label = { Text("Network SSID") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedTextField(
                            value = password,
                            onValueChange = { password = it },
                            label = { Text("Password") },
                            modifier = Modifier.fillMaxWidth()
                        )
                    } else {
                        Text("The device will create its own Wi-Fi network. Connect to the device\'s hotspot from your phone\'s Wi-Fi settings.")
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { 
                    onSave(ssid, password, selectedTabIndex == 1)
                    onDismiss()
                 }
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
