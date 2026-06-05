package vm.pds.h2o.automation.ui_widgets

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import vm.pds.h2o.automation.datamodels.Action
import vm.pds.h2o.automation.datamodels.ActionType
import vm.pds.h2o.pinconf.Adapter
import kotlin.math.roundToInt

// This widget provides a UI for configuring a servo motor.
// It allows selecting between Analog/Digital (though generic action usually handles both via PWM),
// choosing an angle range (e.g. 180, 270, 360), and calibrating min/center/max positions.
//
// The "Action" model currently stores `value` as an Int (e.g. duty cycle or target).
// We'll treat `value` as the primary configuration or rely on external state if this widget 
// is for initial calibration rather than just setting a runtime target.
//
// Since the prompt asks to "complete the current file" based on the comments:
// "Analog or Digital Servo defintion"
// "single select - checkbox list with possible angles eg.(270, 360)"
// "a range slider for :left maximum(angle or speed) and right maximum (angle or speed)."
// a centered slider(material3 widget) for center.
// initial postition should also be a slider.
// the pwm output value is proportional to the typical range of a servo pulse (.5ms-2.5ms)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServoWidget(
    action: Action,
    adapter: Adapter,
    onUpdate: (Action) -> Unit
) {
    // Logic fix: We want to allow execution if it IS PWM OR IS Servo.
    // The previous negative logic with OR (type != PWM || type != SERVO) was always true because a type cannot be both.
    // Using positive logic is clearer.
    val isValid = action.type == ActionType.SET_PWM || action.type == ActionType.SERVO
    
    if (!isValid) {
        Text("Not a Servo/PWM action")
        return
    }

    var servoType by remember { mutableStateOf("Analog") } // "Analog" or "Digital"
    var maxAngle by remember { mutableStateOf(180) } // Default 180
    
    // State for calibration sliders, using RangeSlider for min/max
    var limits by remember { mutableStateOf(0f..100f) }
    var center by remember { mutableStateOf(50f) }


    Card(
        modifier = Modifier.fillMaxWidth().padding(8.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Servo Configuration: ${action.label.ifEmpty { "Pin ${action.targetPin}" }}",
                style = MaterialTheme.typography.titleMedium
            )
            
            Spacer(modifier = Modifier.height(8.dp))

            // Pin Selection
            var expandedPin by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(
                expanded = expandedPin,
                onExpandedChange = { expandedPin = !expandedPin },
                modifier = Modifier.fillMaxWidth()
            ) {
                OutlinedTextField(
                    readOnly = true,
                    value = adapter.getPinLabel(action.targetPin),
                    onValueChange = { },
                    label = { Text("Servo Pin") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedPin) },
                    colors = ExposedDropdownMenuDefaults.outlinedTextFieldColors(),
                    modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable, true).fillMaxWidth()
                )
                ExposedDropdownMenu(
                    expanded = expandedPin,
                    onDismissRequest = { expandedPin = false }
                ) {
                    adapter.getAvailablePins().filter { adapter.isPinPwmCapable(it) }.forEach { pin ->
                        DropdownMenuItem(
                            text = { Text(adapter.getPinLabel(pin)) },
                            onClick = {
                                onUpdate(action.copy(targetPin = pin))
                                expandedPin = false
                            }
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text("Servo Type", style = MaterialTheme.typography.bodyMedium)
            Row(verticalAlignment = Alignment.CenterVertically) {
                RadioButton(
                    selected = servoType == "Analog",
                    onClick = { servoType = "Analog" }
                )
                Text("Analog")
                Spacer(modifier = Modifier.width(16.dp))
                RadioButton(
                    selected = servoType == "Digital",
                    onClick = { servoType = "Digital" }
                )
                Text("Digital")
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text("Max Angle / Rotation", style = MaterialTheme.typography.bodyMedium)
            Row(verticalAlignment = Alignment.CenterVertically) {
                listOf(180, 270, 360).forEach { angle ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = maxAngle == angle,
                            onCheckedChange = { if (it) maxAngle = angle } // Single select behavior
                        )
                        Text("$angle°")
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(8.dp))

            Text("Calibration", style = MaterialTheme.typography.titleSmall)
            Text("Adjust min, center, and max limits.", style = MaterialTheme.typography.bodySmall)

            // Min/Max Range Slider for left and right limits
            Text("Min/Max Limits: ${limits.start.toInt()}% - ${limits.endInclusive.toInt()}%")
            RangeSlider(
                value = limits,
                onValueChange = { newLimits ->
                    limits = newLimits
                    // Ensure center is within the new limits
                    center = center.coerceIn(newLimits.start, newLimits.endInclusive)
                },
                valueRange = 0f..100f
            )

            // Center (Zero/Stop)
            Text("Center (Calibration): ${center.toInt()}%")
            Slider(
                value = center,
                onValueChange = { newCenter ->
                    center = newCenter
                },
                valueRange = limits // Center slider is constrained by the min/max limits
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // Servo Pulse Width Range (0.5ms - 2.5ms @ 50Hz)
            // 10-bit resolution (0-1023)
            // 0.5ms / 20ms * 1023 = ~26
            // 2.5ms / 20ms * 1023 = ~128
            val minPwm = 26f
            val maxPwm = 128f
            
            // Initial Position Slider
            // Map the PWM value back to a percentage for the slider
            val currentPercent = ((action.value.toFloat() - minPwm) / (maxPwm - minPwm) * 100f).coerceIn(0f, 100f)
            
            Text("Initial Position: ${currentPercent.roundToInt()}%")
            Slider(
                value = currentPercent,
                onValueChange = { 
                    val newVal = (minPwm + (it / 100f) * (maxPwm - minPwm)).roundToInt()
                    onUpdate(action.copy(value = newVal))
                },
                valueRange = 0f..100f
            )
        }
    }
}
