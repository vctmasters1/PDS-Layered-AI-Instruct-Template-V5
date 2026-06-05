package vm.pds.h2o.automation.datamodels

/**
 * Platform-agnostic Condition
 * 
 * Represents a test that must pass for actions to execute.
 * Platform adapters convert this to device-specific formats.
 */
data class Condition(
    val type: ConditionType,
    val sourcePin: Int,             // Pin number (platform-specific mapping)
    val param1: Int,                // Threshold, min value, condition index, or timer ID
    val param2: Int = 0,            // Max value or second condition index
    val delayOnMakeMs: Int = 0,     // Delay to trigger when condition becomes true
    val delayOnBreakMs: Int = 0,    // Delay to trigger when condition becomes false
    val enabled: Boolean = true,
    val label: String = ""
) {
    /**
     * Generic validation (platform adapter adds specific checks)
     */
    fun validate(): List<String> {
        val errors = mutableListOf<String>()
        
        when (type) {
            ConditionType.RANGE -> {
                if (param1 >= param2) {
                    errors.add("Range min ($param1) must be less than max ($param2)")
                }
            }
            ConditionType.GPIO_STATE -> {
                if (param1 !in 0..1) {
                    errors.add("GPIO state must be 0 or 1, got $param1")
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
        
        val pin = pinLabel ?: "Pin $sourcePin"
        
        val baseDescription = when (type) {
            ConditionType.THRESHOLD_ABOVE -> "$pin > $param1"
            ConditionType.THRESHOLD_BELOW -> "$pin < $param1"
            ConditionType.RANGE -> "$pin between $param1 and $param2"
            ConditionType.GPIO_STATE -> "$pin == ${if (param1 == 1) "HIGH" else "LOW"}"
            ConditionType.TIMER -> "Timer $param1 active"
            ConditionType.PID_SLEW_LOW -> "PID Slew Low on $pin"
            ConditionType.PID_SLEW_HIGH -> "PID Slew High on $pin"
            ConditionType.MANUAL_BUTTON -> "Manual Button ($param1) Pressed"
            ConditionType.AND -> "Condition[$param1] AND Condition[$param2]"
            ConditionType.OR -> "Condition[$param1] OR Condition[$param2]"
            ConditionType.NONE -> "Always true"
        }

        return if (delayOnMakeMs > 0) {
            "$baseDescription (debounced ${delayOnMakeMs}ms)"
        } else {
            baseDescription
        }
    }
}
