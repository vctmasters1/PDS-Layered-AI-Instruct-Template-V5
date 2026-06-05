/**
 * HMI-WEB Main Entry Point
 * 
 * Exports all public APIs for the web application.
 */

// Network communication
export { PDS_web_ble_Manager, provisionDeviceOverBle } from './network/PDS_web_ble';
export type { BleProvisioningConfig, BleDevice } from './network/PDS_web_ble';

// Automation pipelines
export {
  createCycleTimerPipeline,
  createThresholdSafetyPipeline,
  createGpioStateSafetyPipeline,
  createTurnOffAction,
  createRangeControlPipeline,
} from './automation/pipeline_builders';

export {
  ConditionType,
  ActionType,
  TimerType,
  describeCondition,
  describeAction,
  summarizePipeline,
} from './automation/datamodels';

export type {
  Pipeline,
  Condition,
  Action,
  TimerConfig,
  DeviceAutomation,
} from './automation/datamodels';

// Data types
export {
  PinFunction,
  ConfigType,
  TELEMETRY_VERSION,
} from './types/pds_telemetry';

export type {
  TeldataPacket,
  TeldataHeader,
  TelconfPacket,
  TelconfHeader,
  AdcReading,
  PwmState,
  GpioState,
  LedState,
} from './types/pds_telemetry';
