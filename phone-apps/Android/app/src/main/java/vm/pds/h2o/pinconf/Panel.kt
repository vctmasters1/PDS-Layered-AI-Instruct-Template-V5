package vm.pds.h2o.pinconf

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import vm.pds.h2o.dev_platforms.abstract.PinConfig
import vm.pds.h2o.dev_platforms.abstract.PlatformPinCapabilities

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PinConfPanel(
    platformDef: PlatformPinCapabilities,
    pinConfigs: List<PinConfig>,
    onPinConfigChanged: (PinConfig) -> Unit,
    onSaveConfigs: () -> Unit,
    modifier: Modifier = Modifier
) {
    var expandedPinIndex by remember { mutableStateOf<Int?>(null) }
    var hasUnsavedChanges by remember { mutableStateOf(false) }

    Column(modifier = modifier.fillMaxSize()) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.primaryContainer,
            tonalElevation = 2.dp
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Pin Configuration",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = platformDef.platformName,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
                    )
                }

                Button(
                    onClick = {
                        onSaveConfigs()
                        hasUnsavedChanges = false
                    },
                    enabled = hasUnsavedChanges
                ) {
                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Save to Device")
                }
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(pinConfigs.sortedBy { it.pinNumber }) { pinConfig ->
                Card(
                    platformDef = platformDef,
                    pinConfig = pinConfig,
                    isExpanded = expandedPinIndex == pinConfig.pinNumber,
                    onExpandToggle = {
                        expandedPinIndex = if (expandedPinIndex == pinConfig.pinNumber) null else pinConfig.pinNumber
                    },
                    onConfigChanged = { updatedConfig ->
                        onPinConfigChanged(updatedConfig)
                        hasUnsavedChanges = true
                    }
                )
            }
        }
    }
}
