/**
 * PDS Automation Pipeline Builders
 * 
 * Provides reusable factory functions for common automation patterns.
 * Mirrors: Android/app/src/main/java/vm/pds/h2o/automation/PipelineBuilders.kt
 */

import {
  Pipeline,
  Action,
  TimerType,
  ActionType,
  ConditionType,
} from './datamodels';

/**
 * Create a cycle timer pipeline
 * Example: Mist schedule, Light schedule
 *
 * @param id Pipeline ID
 * @param name Pipeline name
 * @param description Pipeline description
 * @param platformType Platform ID string (e.g., "ESP32C3_SUPERMINI")
 * @param timerId ID for the timer resource
 * @param targetPin Pin to control
 * @param targetAction Action type (SET_PWM, SET_GPIO)
 * @param targetValue Value to set when timer is active (e.g., 1023 for max PWM)
 * @param onSeconds Duration to stay ON
 * @param cycleSeconds Total cycle duration (Period)
 * @param targetLabel Label for the action
 * @param delayOnMakeMs Delay to execute action when condition becomes true
 * @param delayOnBreakMs Delay to revert action when condition becomes false
 */
export function createCycleTimerPipeline(
  id: number,
  name: string,
  description: string,
  platformType: string,
  timerId: number,
  targetPin: number,
  targetAction: ActionType,
  targetValue: number,
  onSeconds: number,
  cycleSeconds: number,
  targetLabel: string = 'Output ON',
  delayOnMakeMs: number = 0,
  delayOnBreakMs: number = 0
): Pipeline {
  return {
    id: String(id),
    name,
    description,
    enabled: true,
    platformType,
    conditions: [
      {
        type: ConditionType.TIMER,
        sourcePin: 0,
        param1: timerId,
        label: 'Timer Active',
      },
    ],
    actions: [
      {
        type: targetAction,
        targetPin,
        value: targetValue,
        label: targetLabel,
        delayOnMakeMs,
        delayOnBreakMs,
      },
    ],
    timer: {
      id: timerId,
      type: TimerType.CYCLE,
      onTimeUnix: onSeconds,
      offTimeUnix: cycleSeconds,
      label: `${onSeconds}s ON / ${cycleSeconds}s Cycle`,
    },
  };
}

/**
 * Create a safety cutoff pipeline based on sensor threshold
 * Example: Low Water Safety with ADC
 *
 * @param id Pipeline ID
 * @param name Pipeline name
 * @param description Pipeline description
 * @param platformType Platform ID string
 * @param sensorPin Input pin to monitor
 * @param threshold Threshold value
 * @param isBelowThreshold If true, triggers when value < threshold
 * @param cutoffActions List of actions to take (usually turning off pins)
 * @param conditionLabel Label for the condition
 */
export function createThresholdSafetyPipeline(
  id: number,
  name: string,
  description: string,
  platformType: string,
  sensorPin: number,
  threshold: number,
  isBelowThreshold: boolean,
  cutoffActions: Action[],
  conditionLabel: string = 'Safety Threshold'
): Pipeline {
  return {
    id: String(id),
    name,
    description,
    enabled: true,
    platformType,
    conditions: [
      {
        type: isBelowThreshold ? ConditionType.THRESHOLD_BELOW : ConditionType.THRESHOLD_ABOVE,
        sourcePin: sensorPin,
        param1: threshold,
        label: conditionLabel,
      },
    ],
    actions: cutoffActions,
  };
}

/**
 * Create a safety cutoff pipeline based on GPIO state
 * Example: Low Water Switch
 *
 * @param id Pipeline ID
 * @param name Pipeline name
 * @param description Pipeline description
 * @param platformType Platform ID string
 * @param sensorPin Input pin to monitor
 * @param triggerState State that triggers safety (0 or 1)
 * @param cutoffActions List of actions to take
 * @param conditionLabel Label for the condition
 */
export function createGpioStateSafetyPipeline(
  id: number,
  name: string,
  description: string,
  platformType: string,
  sensorPin: number,
  triggerState: number,
  cutoffActions: Action[],
  conditionLabel: string = 'Safety State'
): Pipeline {
  return {
    id: String(id),
    name,
    description,
    enabled: true,
    platformType,
    conditions: [
      {
        type: ConditionType.GPIO_STATE,
        sourcePin: sensorPin,
        param1: triggerState,
        label: conditionLabel,
      },
    ],
    actions: cutoffActions,
  };
}

/**
 * Create a helper action for turning off a specific pin
 * Used in safety pipelines
 */
export function createTurnOffAction(
  targetPin: number,
  actionType: ActionType,
  label: string = 'Turn OFF',
  delayOnMakeMs: number = 0,
  delayOnBreakMs: number = 0
): Action {
  return {
    type: actionType,
    targetPin,
    value: 0,
    label,
    delayOnMakeMs,
    delayOnBreakMs,
  };
}

/**
 * Create a range-based condition pipeline
 * Example: Temperature or pH control within acceptable range
 *
 * @param id Pipeline ID
 * @param name Pipeline name
 * @param description Pipeline description
 * @param platformType Platform ID string
 * @param sensorPin Input pin to monitor
 * @param minValue Minimum acceptable value
 * @param maxValue Maximum acceptable value
 * @param actions Actions to take when within range
 * @param conditionLabel Label for the condition
 */
export function createRangeControlPipeline(
  id: number,
  name: string,
  description: string,
  platformType: string,
  sensorPin: number,
  minValue: number,
  maxValue: number,
  actions: Action[],
  conditionLabel: string = 'Within Range'
): Pipeline {
  return {
    id: String(id),
    name,
    description,
    enabled: true,
    platformType,
    conditions: [
      {
        type: ConditionType.RANGE,
        sourcePin: sensorPin,
        param1: minValue,
        param2: maxValue,
        label: conditionLabel,
      },
    ],
    actions,
  };
}
