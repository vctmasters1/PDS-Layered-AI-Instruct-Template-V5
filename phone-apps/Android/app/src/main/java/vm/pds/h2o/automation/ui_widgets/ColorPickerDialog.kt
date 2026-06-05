package vm.pds.h2o.automation.ui_widgets

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import kotlin.math.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ColorPickerDialog(
    initialColor: Color,
    onColorSelected: (Color) -> Unit,
    onDismiss: () -> Unit
) {
    var selectedColor by remember { mutableStateOf(initialColor) }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Select Color") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Simple HSV Color Wheel
                ColorWheel(
                    selectedColor = selectedColor,
                    onColorChanged = { selectedColor = it },
                    modifier = Modifier.size(240.dp)
                )
                
                // RGB Sliders
                ColorSlider(
                    label = "Red",
                    value = (selectedColor.red * 255).toInt(),
                    color = Color.Red,
                    onValueChange = { 
                        selectedColor = selectedColor.copy(red = it / 255f)
                    }
                )
                
                ColorSlider(
                    label = "Green",
                    value = (selectedColor.green * 255).toInt(),
                    color = Color.Green,
                    onValueChange = { 
                        selectedColor = selectedColor.copy(green = it / 255f)
                    }
                )
                
                ColorSlider(
                    label = "Blue",
                    value = (selectedColor.blue * 255).toInt(),
                    color = Color.Blue,
                    onValueChange = { 
                        selectedColor = selectedColor.copy(blue = it / 255f)
                    }
                )
            }
        },
        confirmButton = {
            Button(onClick = { onColorSelected(selectedColor) }) {
                Text("Select")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@Composable
private fun ColorWheel(
    selectedColor: Color,
    onColorChanged: (Color) -> Unit,
    modifier: Modifier = Modifier
) {
    Canvas(modifier = modifier) {
        val radius = size.minDimension / 2
        val center = Offset(size.width / 2, size.height / 2)
        
        // Draw color wheel
        for (angle in 0 until 360 step 1) {
            val rad = Math.toRadians(angle.toDouble())
            val color = Color.hsv(angle.toFloat(), 1f, 1f)
            
            drawArc(
                color = color,
                startAngle = angle.toFloat(),
                sweepAngle = 1f,
                useCenter = true,
                topLeft = Offset(center.x - radius, center.y - radius),
                size = androidx.compose.ui.geometry.Size(radius * 2, radius * 2)
            )
        }
        
        // Draw center circle (white to black gradient)
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(Color.White, Color.Black),
                center = center,
                radius = radius * 0.5f
            ),
            radius = radius * 0.5f,
            center = center
        )
        
        // Draw selection indicator
        drawCircle(
            color = Color.White,
            radius = 12f,
            center = center,
            style = Stroke(width = 3f)
        )
        drawCircle(
            color = Color.Black,
            radius = 12f,
            center = center,
            style = Stroke(width = 1f)
        )
    }
}

@Composable
private fun ColorSlider(
    label: String,
    value: Int,
    color: Color,
    onValueChange: (Int) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(label, style = MaterialTheme.typography.bodySmall)
            Text(value.toString(), style = MaterialTheme.typography.bodySmall)
        }
        
        Slider(
            value = value.toFloat(),
            onValueChange = { onValueChange(it.toInt()) },
            valueRange = 0f..255f,
            colors = SliderDefaults.colors(
                thumbColor = color,
                activeTrackColor = color
            )
        )
    }
}
