package vm.pds.h2o.pinconf

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import vm.pds.h2o.dev_platforms.abstract.PinFunction
import vm.pds.h2o.dev_platforms.abstract.PlatformPinCapabilities
import vm.pds.h2o.dev_platforms.abstract.PinConfig

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Card(
    platformDef: PlatformPinCapabilities,
    pinConfig: PinConfig,
    isExpanded: Boolean,
    onExpandToggle: () -> Unit,
    onConfigChanged: (PinConfig) -> Unit
) {
    val isReserved = !platformDef.isPinAvailable(pinConfig.pinNumber)
    val restriction = platformDef.getPinRestriction(pinConfig.pinNumber)

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = when {
                isReserved -> MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f)
                !pinConfig.isEnabled -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                else -> MaterialTheme.colorScheme.surface
            }
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = if (isExpanded) 4.dp else 1.dp)
    ) {
        Column {
            ListItem(
                headlineContent = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "GPIO ${pinConfig.pinNumber}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(Modifier.width(8.dp))
                        if (isReserved) {
                            AssistChip(
                                onClick = {},
                                label = { Text("SYSTEM", style = MaterialTheme.typography.labelSmall) },
                                colors = AssistChipDefaults.assistChipColors(
                                    containerColor = MaterialTheme.colorScheme.error
                                )
                            )
                        }
                    }
                },
                supportingContent = {
                    Column {
                        if (isReserved && restriction != null) {
                            Text(restriction, style = MaterialTheme.typography.bodySmall)
                        } else {
                            Text(pinConfig.label, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "${pinConfig.function.displayName}${if (!pinConfig.isEnabled) " (Disabled)" else ""}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                            )
                        }
                    }
                },
                leadingContent = {
                    Icon(
                        imageVector = when (pinConfig.function) {
                            PinFunction.ADC -> Icons.Default.ShowChart
                            PinFunction.PWM -> Icons.Default.TrendingUp
                            PinFunction.GPIO_IN -> Icons.Default.Input
                            PinFunction.GPIO_OUT -> Icons.Default.Output
                            PinFunction.I2C_SDA, PinFunction.I2C_SCL -> Icons.Default.Cable
                            PinFunction.UART_TX, PinFunction.UART_RX -> Icons.Default.Sensors
                            else -> Icons.Default.Block
                        },
                        contentDescription = null,
                        tint = if (pinConfig.isEnabled && !isReserved) 
                            MaterialTheme.colorScheme.primary 
                        else 
                            MaterialTheme.colorScheme.onSurface.copy(alpha = 0.3f)
                    )
                },
                trailingContent = {
                    IconButton(onClick = onExpandToggle) {
                        Icon(
                            imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                            contentDescription = if (isExpanded) "Collapse" else "Expand"
                        )
                    }
                }
            )

            if (isExpanded && !isReserved) {
                HorizontalDivider()
                Details(
                    platformDef = platformDef,
                    pinConfig = pinConfig,
                    onConfigChanged = onConfigChanged
                )
            }
        }
    }
}
