/**
 * PDS Automation Data Types
 * 
 * Platform-agnostic automation pipeline definitions.
 * Matches the Kotlin models in Android/app/src/main/java/vm/pds/h2o/automation/datamodels/
 */

/**
 * Generic condition types
 * Platform adapters map these to device-specific enum values
 */
export enum ConditionType {
  NONE = "NONE",
  THRESHOLD_ABOVE = "THRESHOLD_ABOVE",
  THRESHOLD_BELOW = "THRESHOLD_BELOW",
  RANGE = "RANGE",
  GPIO_STATE = "GPIO_STATE",
  TIMER = "TIMER",
  PID_SLEW_LOW = "PID_SLEW_LOW",
  PID_SLEW_HIGH = "PID_SLEW_HIGH",
  MANUAL_BUTTON = "MANUAL_BUTTON",
  AND = "AND",
  OR = "OR",
}

/**
 * Generic action types
 */
export enum ActionType {
  NONE = "NONE",
  SET_PWM = "SET_PWM",
  SET_GPIO = "SET_GPIO",
  TOGGLE_GPIO = "TOGGLE_GPIO",
  SET_DAC = "SET_DAC",
  SERVO = "SERVO",
  TRIGGER_ACTION = "TRIGGER_ACTION",
}

/**
 * Generic timer types
 */
export enum TimerType {
  NONE = "NONE",
  TIME_OF_DAY = "TIME_OF_DAY",    // Daily schedule HH:MM:SS
  CYCLE = "CYCLE",                 // Repeating DDD:HH:MM:SS
}

/**
 * Condition: represents a test that must pass for actions to execute
 */
export interface Condition {
  type: ConditionType;
  sourcePin: number;          // Pin number
  param1: number;             // Threshold, min value, condition index, or timer ID
  param2?: number;            // Max value or second condition index
  delayOnMakeMs?: number;     // Delay to trigger when condition becomes true
  delayOnBreakMs?: number;    // Delay to trigger when condition becomes false
  enabled?: boolean;
  label?: string;
}

/**
 * Action: represents an operation to perform when condition is true
 */
export interface Action {
  type: ActionType;
  targetPin: number;          // Pin number
  value: number;              // PWM duty, GPIO state, or action ID
  delayOnMakeMs?: number;     // Delay to execute when condition becomes true
  delayOnBreakMs?: number;    // Delay to revert when condition becomes false
  enabled?: boolean;
  label?: string;
}

/**
 * Timer configuration for pipelines
 */
export interface TimerConfig {
  id: number;
  type: TimerType;
  onTimeUnix: number;         // For CYCLE: on duration in seconds
  offTimeUnix: number;        // For CYCLE: total period in seconds
  label?: string;
}

/**
 * Complete automation pipeline
 * IF [conditions] THEN [actions]
 */
export interface Pipeline {
  id: string;               // Pipeline ID (UUID or string key)
  name: string;
  description?: string;
  conditions: Condition[];
  actions: Action[];
  timer?: TimerConfig;
  enabled?: boolean;
  platformType?: string;     // e.g., "ESP32C3_SUPERMINI"
}

/**
 * Device automation configuration
 * Collection of pipelines for a device
 */
export interface DeviceAutomation {
  deviceId?: string;
  platformType?: string;
  pipelines: Pipeline[];
  timestamp?: number;
}

/**
 * Helper to describe a condition in human-readable format
 */
export function describeCondition(condition: Condition, pinLabel?: string): string {
  if (condition.label) return condition.label;

  const pin = pinLabel || `Pin ${condition.sourcePin}`;

  let baseDescription = "";
  switch (condition.type) {
    case ConditionType.THRESHOLD_ABOVE:
      baseDescription = `${pin} > ${condition.param1}`;
      break;
    case ConditionType.THRESHOLD_BELOW:
      baseDescription = `${pin} < ${condition.param1}`;
      break;
    case ConditionType.RANGE:
      baseDescription = `${pin} between ${condition.param1} and ${condition.param2}`;
      break;
    case ConditionType.GPIO_STATE:
      baseDescription = `${pin} == ${condition.param1 === 1 ? "HIGH" : "LOW"}`;
      break;
    case ConditionType.TIMER:
      baseDescription = `Timer ${condition.param1} active`;
      break;
    case ConditionType.PID_SLEW_LOW:
      baseDescription = `PID Slew Low on ${pin}`;
      break;
    case ConditionType.PID_SLEW_HIGH:
      baseDescription = `PID Slew High on ${pin}`;
      break;
    case ConditionType.MANUAL_BUTTON:
      baseDescription = `Manual Button (${condition.param1}) Pressed`;
      break;
    case ConditionType.AND:
      baseDescription = `Condition[${condition.param1}] AND Condition[${condition.param2}]`;
      break;
    case ConditionType.OR:
      baseDescription = `Condition[${condition.param1}] OR Condition[${condition.param2}]`;
      break;
    case ConditionType.NONE:
    default:
      baseDescription = "Always true";
      break;
  }

  if (condition.delayOnMakeMs && condition.delayOnMakeMs > 0) {
    return `${baseDescription} (debounced ${condition.delayOnMakeMs}ms)`;
  }
  return baseDescription;
}

/**
 * Helper to describe an action in human-readable format
 */
export function describeAction(action: Action, pinLabel?: string): string {
  if (action.label) return action.label;

  const pin = pinLabel || `Pin ${action.targetPin}`;

  let actionDesc = "";
  switch (action.type) {
    case ActionType.SET_PWM:
      const percent = Math.round((action.value * 100) / 1023);
      actionDesc = `${pin} PWM ${percent}%`;
      break;
    case ActionType.SET_GPIO:
      actionDesc = `${pin} = ${action.value === 1 ? "ON" : "OFF"}`;
      break;
    case ActionType.TOGGLE_GPIO:
      actionDesc = `Toggle ${pin}`;
      break;
    case ActionType.TRIGGER_ACTION:
      actionDesc = `Trigger action ${action.value}`;
      break;
    case ActionType.SET_DAC:
      actionDesc = `${pin} DAC ${action.value}`;
      break;
    case ActionType.SERVO:
      actionDesc = `${pin} Servo ${action.value}`;
      break;
    case ActionType.NONE:
    default:
      actionDesc = "No action";
      break;
  }

  let result = actionDesc;
  if (action.delayOnMakeMs && action.delayOnMakeMs > 0) {
    result += ` (start delay ${action.delayOnMakeMs}ms)`;
  }
  if (action.delayOnBreakMs && action.delayOnBreakMs > 0) {
    result += ` (stop delay ${action.delayOnBreakMs}ms)`;
  }
  return result;
}

/**
 * Helper to summarize a pipeline
 */
export function summarizePipeline(pipeline: Pipeline): string {
  const condDesc = pipeline.conditions.length === 1
    ? describeCondition(pipeline.conditions[0])
    : `${pipeline.conditions.length} conditions`;

  const actionDesc = pipeline.actions.length === 1
    ? describeAction(pipeline.actions[0])
    : `${pipeline.actions.length} actions`;

  return `IF ${condDesc} THEN ${actionDesc}`;
}
