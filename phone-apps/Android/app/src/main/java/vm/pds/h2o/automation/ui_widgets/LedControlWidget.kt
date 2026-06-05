package vm.pds.h2o.automation.ui_widgets

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * LED Control Widget for H2O-Tower
 * Controls addressable LED strips (WS2812/NeoPixel)
 * 
 * Features:
 * - Color picker with HSV wheel
 * - Brightness slider
 * - Preset colors for grow lighting
 * - Off button
 */

@Composable
fun LedControlWidget(
    pinNumber: Int,
    label: String,
    currentRed: Int,
    currentGreen: Int,
    currentBlue: Int,
    currentBrightness: Int,
    onColorChanged: (red: Int, green: Int, blue: Int) -> Unit,
    onBrightnessChanged: (brightness: Int) -> Unit,
    onTurnOff: () -> Unit,
    modifier: Modifier = Modifier
) {
    var selectedColor by remember { mutableStateOf(Color(currentRed, currentGreen, currentBlue)) }
    var brightness by remember { mutableStateOf(currentBrightness) }
    var showColorPicker by remember { mutableStateOf(false) }

    Card(
        modifier = modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Pin $pinNumber • Addressable LED",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                
                // Current color indicator
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(selectedColor)
                        .border(2.dp, MaterialTheme.colorScheme.outline, CircleShape)
                )
            }

            HorizontalDivider()

            // Brightness Slider
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Brightness",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        text = "${(brightness * 100 / 255)}%",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                
                Slider(
                    value = brightness.toFloat(),
                    onValueChange = { brightness = it.toInt() },
                    onValueChangeFinished = {
                        onBrightnessChanged(brightness)
                    },
                    valueRange = 0f..255f,
                    steps = 0
                )
            }

            HorizontalDivider()

            // Color Presets
            Text(
                text = "Grow Light Presets",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium
            )
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ColorPresetButton(
                    label = "White",
                    color = Color(255, 255, 255),
                    onClick = {
                        selectedColor = Color(255, 255, 255)
                        onColorChanged(255, 255, 255)
                    },
                    modifier = Modifier.weight(1f)
                )
                
                ColorPresetButton(
                    label = "Red",
                    color = Color(255, 0, 0),
                    onClick = {
                        selectedColor = Color(255, 0, 0)
                        onColorChanged(255, 0, 0)
                    },
                    modifier = Modifier.weight(1f)
                )
                
                ColorPresetButton(
                    label = "Blue",
                    color = Color(0, 0, 255),
                    onClick = {
                        selectedColor = Color(0, 0, 255)
                        onColorChanged(0, 0, 255)
                    },
                    modifier = Modifier.weight(1f)
                )
            }
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ColorPresetButton(
                    label = "Purple",
                    color = Color(255, 0, 255),
                    onClick = {
                        selectedColor = Color(255, 0, 255)
                        onColorChanged(255, 0, 255)
                    },
                    modifier = Modifier.weight(1f)
                )
                
                ColorPresetButton(
                    label = "Warm",
                    color = Color(255, 221, 170),
                    onClick = {
                        selectedColor = Color(255, 221, 170)
                        onColorChanged(255, 221, 170)
                    },
                    modifier = Modifier.weight(1f)
                )
                
                ColorPresetButton(
                    label = "Custom",
                    color = null,
                    icon = Icons.Default.Palette,
                    onClick = { showColorPicker = true },
                    modifier = Modifier.weight(1f)
                )
            }

            HorizontalDivider()

            // Action Buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onTurnOff,
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.PowerSettingsNew, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Turn Off")
                }
                
                FilledTonalButton(
                    onClick = {
                        onColorChanged(
                            selectedColor.red.times(255).toInt(),
                            selectedColor.green.times(255).toInt(),
                            selectedColor.blue.times(255).toInt()
                        )
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Check, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Apply")
                }
            }

            // RGB Values Display
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                RgbValueChip("R", (selectedColor.red * 255).toInt(), Color(255, 100, 100))
                RgbValueChip("G", (selectedColor.green * 255).toInt(), Color(100, 255, 100))
                RgbValueChip("B", (selectedColor.blue * 255).toInt(), Color(100, 100, 255))
            }
        }
    }

    // Color Picker Dialog
    if (showColorPicker) {
        ColorPickerDialog(
            initialColor = selectedColor,
            onColorSelected = { color ->
                selectedColor = color
                onColorChanged(
                    (color.red * 255).toInt(),
                    (color.green * 255).toInt(),
                    (color.blue * 255).toInt()
                )
                showColorPicker = false
            },
            onDismiss = { showColorPicker = false }
        )
    }
}
