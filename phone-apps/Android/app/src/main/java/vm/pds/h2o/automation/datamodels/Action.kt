package vm.pds.h2o.automation.datamodels

/**
 * Platform-agnostic Action
 */
data class Action(
    val type: ActionType,
    val targetPin: Int,             // Pin number (platform-specific mapping)
    val value: Int,                 // PWM duty, GPIO state, or action ID
    val delayOnMakeMs: Int = 0,     // Delay to execute action when condition becomes true (stagger start)
    val delayOnBreakMs: Int = 0,    // Delay to revert action when condition becomes false
    val enabled: Boolean = true,
    val label: String = ""
) {
    /**
     * Generic validation
     */
    fun validate(): List<String> {
        val errors = mutableListOf<String>()

        when (type) {
            ActionType.SET_GPIO -> {
                if (value !in 0..1) {
                    errors.add("GPIO value must be 0 or 1, got $value")
                }
            }
            ActionType.SET_PWM -> {
                if (value < 0) {
                    errors.add("PWM duty cannot be negative")
                }
            }
            else -> {}
        }

        return errors
    }

    /**
     * Human-readable description
     */
    fun describe(pinLabel: String? = null): String {
        if (label.isNotEmpty()) return label

        val pin = pinLabel ?: "Pin $targetPin"

        val actionDesc = when (type) {
            ActionType.SET_PWM -> {
                val percent = (value * 100.0 / 1023.0).toInt()  // Assumes 10-bit default
                "$pin PWM $percent%"
            }
            ActionType.SET_GPIO -> "$pin = ${if (value == 1) "ON" else "OFF"}"
            ActionType.TOGGLE_GPIO -> "Toggle $pin"
            ActionType.TRIGGER_ACTION -> "Trigger action $value"
            ActionType.NONE -> "No action"
            ActionType.SET_DAC -> "$pin DAC $value"
            ActionType.SERVO -> "$pin Servo $value"
        }

        return buildString {
            append(actionDesc)
            if (delayOnMakeMs > 0) append(" (start delay ${delayOnMakeMs}ms)")
            if (delayOnBreakMs > 0) append(" (stop delay ${delayOnBreakMs}ms)")
        }
    }
}