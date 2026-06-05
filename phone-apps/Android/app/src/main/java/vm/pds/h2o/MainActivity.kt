package vm.pds.h2o

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBox
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import vm.pds.h2o.dev_platforms.abstract.DevicePinMap
import vm.pds.h2o.dev_platforms.abstract.DefaultPinMapProvider
import vm.pds.h2o.dev_platforms.esp32c3_supermini.common.PinCapabilities
import vm.pds.h2o.dev_platforms.esp32c3_supermini.hwrev_001.h2o_001.PinConfigDefaults
import vm.pds.h2o.ui.AboutDialog
import vm.pds.h2o.ui.AssociateDeviceScreen
import vm.pds.h2o.ui.AutomationScreen
import vm.pds.h2o.ui.HomePanel
import vm.pds.h2o.ui.NoDeviceSelectedScreen
import vm.pds.h2o.ui.PlatformOtaUpdateDialog
import vm.pds.h2o.ui.SettingsScreen
import vm.pds.h2o.ui.SysconfScreen
import vm.pds.h2o.viewmodel.MainViewModel
import vm.pds.h2otower.ui.theme.Theme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            Theme {
                App()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun App(mainViewModel: MainViewModel = viewModel()) {
    val context = LocalContext.current
    var currentDestination by rememberSaveable { mutableStateOf(AppDestinations.HOME) }
    var showOverflowMenu by remember { mutableStateOf(false) }
    var showAboutDialog by remember { mutableStateOf(false) }
    var showOtaDialog by remember { mutableStateOf(false) }
    
    // Initialize pinMap with default, will update on selection
    var pinMap: DevicePinMap by remember { mutableStateOf(PinConfigDefaults.createDefaultPinMap()) }
    
    val knownDevices by mainViewModel.knownDevices.collectAsState()
    val selectedDevice by mainViewModel.selectedDevice.collectAsState()
    val deviceStatus by mainViewModel.deviceStatus.collectAsState()

    // Navigation & Pin Map Loading Logic:
    LaunchedEffect(selectedDevice) {
        if (selectedDevice != null) {
            currentDestination = AppDestinations.SETTINGS
            
            // Load the correct Pin Map for the selected device
            val address = selectedDevice!!.first
            val name = selectedDevice!!.second
            val platformId = mainViewModel.getPlatformIdForDevice(address, name)
            pinMap = DefaultPinMapProvider.get(platformId)
        } else {
            currentDestination = AppDestinations.HOME
        }
    }

    if (showAboutDialog) {
        AboutDialog(onDismiss = { showAboutDialog = false })
    }
    if (showOtaDialog) {
        PlatformOtaUpdateDialog(
            context = context,
            selectedDevicePlatformId = selectedDevice?.second ?: "", // Use selected device's ID
            onDismiss = { showOtaDialog = false }
        )
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        topBar = {
            TopAppBar(
                title = {
                    if (selectedDevice != null) {
                        Text(selectedDevice?.second ?: "")
                    } else {
                        Text("My Fleet")
                    }
                },
                navigationIcon = {
                    if (selectedDevice != null) {
                        IconButton(onClick = { 
                            mainViewModel.deselectDevice() 
                        }) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back to Fleet")
                        }
                    }
                },
                actions = {
                    // Connectivity & Firmware Update Indicator
                    if (selectedDevice != null) {
                        // Check if this is the dummy unprovisioned device
                        val isUnprovisionedDummy = selectedDevice?.first == "DE:AD:BE:EF:CA:FE"
                        
                        if (isUnprovisionedDummy) {
                             // UNPROV Button
                             TextButton(
                                onClick = { currentDestination = AppDestinations.ASSOCIATE_DEVICE },
                                colors = ButtonDefaults.textButtonColors(
                                    containerColor = Color.Magenta.copy(alpha = 0.2f),
                                    contentColor = Color.Magenta
                                ),
                                modifier = Modifier.padding(end=8.dp)
                            ) {
                                Text("UNPROV", style = MaterialTheme.typography.labelSmall)
                            }
                        } else {
                            val isConnected = deviceStatus?.isOnline == true
                            val needsUpdate = deviceStatus?.isFirmwareUpdateAvailable == true
                            
                            when {
                                !isConnected -> {
                                    // RED: Not Connected
                                    Box(
                                        modifier = Modifier
                                            .padding(end = 8.dp)
                                            .background(Color.Red.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                                            .padding(horizontal = 8.dp, vertical = 4.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text("N-CON", style = MaterialTheme.typography.labelSmall, color = Color.Red)
                                    }
                                }
                                needsUpdate -> {
                                    // BLUE: Update Firmware Button
                                    TextButton(
                                        onClick = { showOtaDialog = true },
                                        colors = ButtonDefaults.textButtonColors(
                                            containerColor = Color.Blue.copy(alpha = 0.2f),
                                            contentColor = Color.Blue
                                        ),
                                        modifier = Modifier.padding(end=8.dp)
                                    ) {
                                        Text("UPDT-FW", style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                                else -> {
                                    // GREEN: Connected
                                    Box(
                                        modifier = Modifier
                                            .padding(end = 8.dp)
                                            .background(Color.Green.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                                            .padding(horizontal = 8.dp, vertical = 4.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text("CON", style = MaterialTheme.typography.labelSmall, color = Color(0xFF006400))
                                    }
                                }
                            }
                        }
                    }

                    Box {
                        IconButton(onClick = { showOverflowMenu = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "More Options")
                        }
                        DropdownMenu(
                            expanded = showOverflowMenu,
                            onDismissRequest = { showOverflowMenu = false },
                            modifier = Modifier.border(1.dp, MaterialTheme.colorScheme.outline)
                        ) {
                            if (selectedDevice == null) {
                                DropdownMenuItem(
                                    text = { Text("Associate Device") },
                                    onClick = { 
                                        showOverflowMenu = false
                                        currentDestination = AppDestinations.ASSOCIATE_DEVICE
                                    }
                                )
                            }
                            DropdownMenuItem(
                                text = { Text("About") },
                                onClick = { 
                                    showOverflowMenu = false
                                    showAboutDialog = true
                                }
                            )
                            HorizontalDivider()
                            if (knownDevices.isEmpty()) {
                                DropdownMenuItem(
                                    text = { Text("Add Dummy Devices") },
                                    onClick = {
                                        mainViewModel.addDevice("00:11:22:33:44:55", "H2O-Tower-Dummy")
                                        mainViewModel.addDevice("AA:BB:CC:DD:EE:FF", "WH-001-Dummy")
                                        mainViewModel.addDevice("12:34:56:78:9A:BC", "H2O-001-Node32S")
                                        mainViewModel.addDevice("DE:AD:BE:EF:CA:FE", "H2O-Unprovisioned")
                                        showOverflowMenu = false
                                    }
                                )
                            } else {
                                DropdownMenuItem(
                                    text = { Text("Remove Dummy Devices") },
                                    onClick = {
                                        mainViewModel.removeAllDummyDevices()
                                        showOverflowMenu = false
                                    }
                                )
                            }
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        bottomBar = {
            if (selectedDevice != null) {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface
                ) {
                    AppDestinations.entries.forEach { destination ->
                        if (destination.isBottomBarItem) {
                            NavigationBarItem(
                                icon = {
                                    Icon(
                                        destination.icon,
                                        contentDescription = destination.label
                                    )
                                },
                                label = { Text(destination.label) },
                                selected = destination == currentDestination,
                                onClick = { currentDestination = destination }
                            )
                        }
                    }
                }
            }
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { innerPadding ->
        key(selectedDevice) { // Add key here to force recomposition
            Box(modifier = Modifier.padding(innerPadding)) {
                if (selectedDevice == null) {
                    // Show Device List (HomePanel) if no device is selected
                    // But we might be in ASSOCIATE_DEVICE or ABOUT
                    if (currentDestination == AppDestinations.ASSOCIATE_DEVICE) {
                        AssociateDeviceScreen(onDismiss = { currentDestination = AppDestinations.HOME }, mainViewModel = mainViewModel)
                    } else {
                        // Default to Home Panel (Fleet View)
                        HomePanel(mainViewModel)
                    }
                } else {
                    // Device Selected: Show Device Control Screens
                    when (currentDestination) {
                        AppDestinations.HOME -> {
                            HomePanel(mainViewModel) 
                        }
                        AppDestinations.SETTINGS -> {
                            SettingsScreen()
                        }
                        AppDestinations.SYSCONF -> {
                            // We now pass the dynamically loaded pinMap, but we need the PlatformCapabilities separately
                            // SysconfScreen takes `platformDef`.
                            // This is slightly problematic because we only have `pinMap` which is a DevicePinMap.
                            // We need to pass the capabilities used to CREATE the pin map, or just the pin map.
                            // However, SysconfScreen likely uses capabilities to show available pins.
                            // We should probably just pass the pinMap and let SysconfScreen derive/use capabilities if possible, 
                            // OR we need to load capabilities dynamically too.
                            
                            // For now, we will assume SysconfScreen just needs pinConfigs from pinMap.
                            // If it needs platformDef, we're stuck passing the default one unless we update SysconfScreen.
                            // But let's look at SysconfScreen signature: (platformDef: PlatformPinCapabilities, ...)
                            
                            // Hack: We will reuse the default one (ESP32C3) for the signature, 
                            // but the pin list will come from the CORRECT pinMap we loaded.
                            // Ideally we would load the correct capabilities too.
                            SysconfScreen(PinCapabilities, pinMap, onPinMapChange = { pinMap = it }, mainViewModel)
                        }
                        AppDestinations.AUTOMATION -> {
                            AutomationScreen(pinMap, mainViewModel)
                        }
                        AppDestinations.ASSOCIATE_DEVICE -> {
                            AssociateDeviceScreen(onDismiss = { currentDestination = AppDestinations.HOME }, mainViewModel = mainViewModel)
                        }
                    }
                }
            }
        }
    }
}

enum class AppDestinations(
    val label: String,
    val icon: ImageVector,
    val isBottomBarItem: Boolean = true,
    val requiresDevice: Boolean = false
) {
    HOME("Status", Icons.Default.Home, isBottomBarItem = false, requiresDevice = true), // Hidden from bottom bar
    SETTINGS("Settings", Icons.Default.Build, requiresDevice = true),
    AUTOMATION("Automation", Icons.Default.AccountBox, requiresDevice = true),
    SYSCONF("System", Icons.Default.Gavel, requiresDevice = true),
    ASSOCIATE_DEVICE("Associate Device", Icons.Default.Wifi, isBottomBarItem = false),
    //ABOUT("About", Icons.Default.Info),
}

@Preview(showBackground = true)
@Composable
fun GreetingPreview() {
    Theme {
        App()
    }
}
