package vm.pds.h2o.automation.datamodels

/**
 * Generic Condition Types
 * Platform adapters map these to device-specific enum values
 */
enum class ConditionType(val displayName: String) {
    NONE("None"),
    THRESHOLD_ABOVE("Threshold Above (>)"),
    THRESHOLD_BELOW("Threshold Below (<)"),
    RANGE("Value in Range"),
    GPIO_STATE("GPIO State Equals"),
    TIMER("Timer Active"),
    PID_SLEW_LOW("PID Slew Low (Decreasing Rate Control)"),
    PID_SLEW_HIGH("PID Slew High (Increasing Rate Control)"),
    MANUAL_BUTTON("Manual Button Press"),
    AND("Logical AND"),
    OR("Logical OR");
    
    val requiresSource: Boolean get() = this in listOf(
        THRESHOLD_ABOVE, THRESHOLD_BELOW, RANGE, GPIO_STATE, PID_SLEW_LOW, PID_SLEW_HIGH
    )
}

/**
 * Generic Action Types
 */
enum class ActionType(val displayName: String) {
    NONE("None"),
    SET_PWM("Set PWM Duty Cycle"),
    SET_GPIO("Set GPIO State"),
    TOGGLE_GPIO("Toggle GPIO"),
    SET_DAC("Set DAC Value"),
    SERVO("Servo Control"),
    TRIGGER_ACTION("Chain to Another Action");
    
    val requiresTarget: Boolean get() = this != NONE && this != TRIGGER_ACTION
}

/**
 * Generic Timer Types
 */
enum class TimerType(val displayName: String, val description: String) {
    NONE("None", "No timer"),
    TIME_OF_DAY("Time of Day", "Daily on/off schedule (HH:MM:SS)"),
    CYCLE("Cycle Timer", "Repeating cycle (DDD:HH:MM:SS)")
}
