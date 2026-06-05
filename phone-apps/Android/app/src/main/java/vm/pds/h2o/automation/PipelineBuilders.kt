package vm.pds.h2o.automation

import vm.pds.h2o.automation.datamodels.Condition
import vm.pds.h2o.automation.datamodels.Action
import vm.pds.h2o.automation.datamodels.ActionType
import vm.pds.h2o.automation.datamodels.ConditionType
import vm.pds.h2o.automation.datamodels.Pipeline
import vm.pds.h2o.automation.datamodels.TimerConfig
import vm.pds.h2o.automation.datamodels.TimerType

/**
 * Generic Pipeline Builders
 * Provides reusable factory functions for common automation patterns.
 */

/**
 * Creates a cycle timer pipeline (e.g., Mist schedule, Light schedule).
 * 
 * @param id Pipeline ID
 * @param name Pipeline Name
 * @param description Pipeline Description
 * @param platformType Platform ID string
 * @param timerId ID for the timer resource
 * @param targetPin Pin to control
 * @param targetAction Action type (SET_PWM, SET_GPIO)
 * @param targetValue Value to set when timer is active (e.g., 1023 for max PWM)
 * @param onSeconds Duration to stay ON
 * @param cycleSeconds Total cycle duration (Period)
 * @param delayOnMakeMs Delay to execute action when condition becomes true (stagger start)
 * @param delayOnBreakMs Delay to revert action when condition becomes false
 */
fun createCycleTimerPipeline(
    id: Int,
    name: String,
    description: String,
    platformType: String,
    timerId: Int,
    targetPin: Int,
    targetAction: ActionType,
    targetValue: Int,
    onSeconds: Int,
    cycleSeconds: Int,
    targetLabel: String = "Output ON",
    delayOnMakeMs: Int = 0,
    delayOnBreakMs: Int = 0
): Pipeline {
    return Pipeline(
        id = id,
        name = name,
        description = description,
        enabled = true,
        platformType = platformType,
        conditions = listOf(
            Condition(
                type = ConditionType.TIMER,
                sourcePin = 0,
                param1 = timerId,
                label = "Timer Active"
            )
        ),
        actions = listOf(
            Action(
                type = targetAction,
                targetPin = targetPin,
                value = targetValue,
                label = targetLabel,
                delayOnMakeMs = delayOnMakeMs,
                delayOnBreakMs = delayOnBreakMs
            )
        ),
        timer = TimerConfig(
            id = timerId,
            type = TimerType.CYCLE,
            onTimeUnix = onSeconds,
            offTimeUnix = cycleSeconds,
            label = "${onSeconds}s ON / ${cycleSeconds}s Cycle"
        )
    )
}

/**
 * Creates a safety cutoff pipeline based on a sensor threshold.
 * (e.g., Low Water Safety with ADC)
 * 
 * @param id Pipeline ID
 * @param name Pipeline Name
 * @param description Pipeline Description
 * @param platformType Platform ID string
 * @param sensorPin Input pin to monitor
 * @param threshold Threshold value
 * @param isBelowThreshold If true, triggers when value < threshold. If false, value > threshold.
 * @param cutoffActions List of actions to take (usually turning off pins)
 * @param conditionLabel Label for the condition
 */
fun createThresholdSafetyPipeline(
    id: Int,
    name: String,
    description: String,
    platformType: String,
    sensorPin: Int,
    threshold: Int,
    isBelowThreshold: Boolean,
    cutoffActions: List<Action>,
    conditionLabel: String = "Safety Threshold"
): Pipeline {
    return Pipeline(
        id = id,
        name = name,
        description = description,
        enabled = true,
        platformType = platformType,
        conditions = listOf(
            Condition(
                type = if (isBelowThreshold) ConditionType.THRESHOLD_BELOW else ConditionType.THRESHOLD_ABOVE,
                sourcePin = sensorPin,
                param1 = threshold,
                label = conditionLabel
            )
        ),
        actions = cutoffActions,
        timer = null
    )
}

/**
 * Creates a safety cutoff pipeline based on a digital GPIO state.
 * (e.g., Low Water Switch)
 * 
 * @param id Pipeline ID
 * @param name Pipeline Name
 * @param description Pipeline Description
 * @param platformType Platform ID string
 * @param sensorPin Input pin to monitor
 * @param triggerState State that triggers safety (0 or 1)
 * @param cutoffActions List of actions to take
 * @param conditionLabel Label for the condition
 */
fun createGpioStateSafetyPipeline(
    id: Int,
    name: String,
    description: String,
    platformType: String,
    sensorPin: Int,
    triggerState: Int,
    cutoffActions: List<Action>,
    conditionLabel: String = "Safety State"
): Pipeline {
    return Pipeline(
        id = id,
        name = name,
        description = description,
        enabled = true,
        platformType = platformType,
        conditions = listOf(
            Condition(
                type = ConditionType.GPIO_STATE,
                sourcePin = sensorPin,
                param1 = triggerState,
                label = conditionLabel
            )
        ),
        actions = cutoffActions,
        timer = null
    )
}

/**
 * Creates a helper for turning off a specific pin (used in safety pipelines).
 */
fun createTurnOffAction(
    targetPin: Int,
    actionType: ActionType,
    label: String = "Turn OFF",
    delayOnMakeMs: Int = 0,
    delayOnBreakMs: Int = 0
): Action {
    return Action(
        type = actionType,
        targetPin = targetPin,
        value = 0,
        label = label,
        delayOnMakeMs = delayOnMakeMs,
        delayOnBreakMs = delayOnBreakMs
    )
}
