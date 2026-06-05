package vm.pds.h2o.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import vm.pds.h2o.data.DeviceStatus
import vm.pds.h2o.viewmodel.HomeViewModel
import vm.pds.h2o.viewmodel.MainViewModel

// This Panel is a recycleview of devices that we are associated with.
// the device card should indicate whether it is currently available for query.
// the card should indicate when it was last queried successfully.
// the card should the current timer countdown values.
// the card should have the most recent PH and EC/PPM.
// the panel should display no associated devices if there are none.

@Composable
fun HomePanel(mainViewModel: MainViewModel, homeViewModel: HomeViewModel = viewModel()) {
    val knownDevices by mainViewModel.knownDevices.collectAsState()
    val allDevicesStatus by mainViewModel.allDevicesStatus.collectAsState()

    if (knownDevices.isEmpty()) {
        NoAssociatedDevicesMessage()
    } else {
        LazyColumn(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Show statuses for all devices we have status for
            items(allDevicesStatus) { status ->
                DeviceStatusCard(status, onClick = {
                    mainViewModel.selectDevice(status.address, status.name)
                })
            }
            
            // Optionally, handle devices that are in knownDevices but don't have a status yet (loading/unreachable)
            // For now, we only show devices that returned a status.
        }
    }
}

@Composable
fun NoAssociatedDevicesMessage() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(Icons.Default.Info, contentDescription = null, modifier = Modifier.height(48.dp), tint = MaterialTheme.colorScheme.primary)
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "No Associated Devices",
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center
        )
        Text(
            text = "Please associate a new device from the top menu to get started.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
fun DeviceStatusCard(device: DeviceStatus, onClick: () -> Unit = {}) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(device.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                
                // Status Indicator Logic (CON, N-CON, FW-UPDTE, UNPROV)
                // Replaces the generic Online/Offline icon
                val isUnprovisioned = device.address.equals("DE:AD:BE:EF:CA:FE", ignoreCase = true) // Or check name
                
                when {
                    isUnprovisioned -> {
                         Box(
                            modifier = Modifier
                                .background(Color.Magenta.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("UNPROV", style = MaterialTheme.typography.labelSmall, color = Color.Magenta)
                        }
                    }
                    device.isFirmwareUpdateAvailable -> {
                         Box(
                            modifier = Modifier
                                .background(Color.Blue.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("FW-UPDTE", style = MaterialTheme.typography.labelSmall, color = Color.Blue)
                        }
                    }
                    device.isOnline -> {
                        Box(
                            modifier = Modifier
                                .background(Color.Green.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("CON", style = MaterialTheme.typography.labelSmall, color = Color(0xFF006400))
                        }
                    }
                    else -> {
                        Box(
                            modifier = Modifier
                                .background(Color.Red.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("N-CON", style = MaterialTheme.typography.labelSmall, color = Color.Red)
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text("Last Queried: ${formatTimestamp(device.lastQueried)}", style = MaterialTheme.typography.bodySmall)
            Divider(modifier = Modifier.padding(vertical = 8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceAround
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("pH", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                    Text(String.format("%.1f", device.ph))
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("EC/PPM", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                    Text(String.format("%.1f / %.0f", device.ec, device.ppm))
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Timer", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                    Text(formatCountdown(device.timerCountdown))
                }
            }
        }
    }
}

private fun formatTimestamp(timestamp: Long): String {
    val sdf = java.text.SimpleDateFormat("MM/dd/yyyy HH:mm:ss", java.util.Locale.getDefault())
    return sdf.format(java.util.Date(timestamp))
}

private fun formatCountdown(seconds: Int): String {
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    val secs = seconds % 60
    return String.format("%02d:%02d:%02d", hours, minutes, secs)
}
