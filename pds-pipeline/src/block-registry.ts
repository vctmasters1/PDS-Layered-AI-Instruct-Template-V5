/**
 * Pipeline Block Registry
 *
 * TypeScript mirror of blob_packer.py BLOCK_DEFS.
 * Defines struct layout, field names, and HMI metadata for every pipeline
 * block type.  Used by pipeline-codec.ts to decode/encode L3 bytes and by
 * the frontend to render a typed settings form.
 */

// ── Field types ────────────────────────────────────────────────────────────

/** Single byte / word / float codes matching Python struct chars (LE assumed). */
export type FmtChar = 'B' | 'b' | 'H' | 'h' | 'I' | 'i' | 'f' | '?' | 'x';

/** Size in bytes for each format char. */
export function fmtCharSize(c: FmtChar): number {
  switch (c) {
    case 'B': case 'b': case '?': case 'x': return 1;
    case 'H': case 'h': return 2;
    case 'I': case 'i': case 'f': return 4;
  }
}

// ── Access level ─────────────────────────────────────────────────────────

/**
 * Controls which UI mode exposes a field.
 *   'hw'    — board designer only (pin assignments, hw-fixed params)
 *   'tuner' — commissioning technician (PID gains, calibration voltages)
 *   'user'  — plant operator (setpoints, enable toggles, cycle durations)
 *   'role'  — role editor only (encoder control_point targets, never shown in HMI)
 */
export type AccessLevel = 'hw' | 'tuner' | 'user' | 'role';

// ── UI metadata per field ─────────────────────────────────────────────────

/**
 * Measurement category for unit-aware display and input conversion.
 *   'duration_ms'   — value stored as milliseconds; display as DD:HH:MM:SS
 *   'temperature'   — °C stored; optionally display as °F
 *   'volume_ml'     — mL stored; optionally display as fl oz / gal
 *   'length_mm'     — mm stored; optionally display as inches
 */
export type MeasurementCategory =
  | 'duration_ms'      // stored as ms; display as DD:HH:MM:SS
  | 'time_of_day_sec'  // stored as seconds-since-midnight (0-86399); display as HH:MM:SS
  | 'temperature'      // stored as °C; optionally display as °F
  | 'volume_ml'        // stored as mL; optionally display as fl oz
  | 'length_mm'        // stored as mm; optionally display as inches
  | 'ec_mscm';         // stored as mS/cm; companion PPM field (×500) shown alongside

export interface FieldMeta {
  /** Human-readable label */
  label: string;
  /** Physical unit string for display (e.g. "ms", "Hz", "%") */
  units?: string;
  /** Minimum allowed value (for range/numeric inputs) */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Step increment (defaults to 1 for ints, 0.01 for floats) */
  step?: number;
  /**
   * Access level — controls which UI mode shows this field:
   *   'hw'    → board designer only (pin numbers, hw-fixed params). Never editable by operator.
   *   'tuner' → commissioning technician (PID gains, cal voltages, limits).
   *   'user'  → plant operator (setpoint, enabled, cycle durations).
   * UI filter: operator=user only, tuner=user+tuner, hw=all.
   */
  level: AccessLevel;
  /** Short description / tooltip */
  description?: string;
  /**
   * Measurement category — if set, the UI applies unit conversions based on
   * the user's measurement system preference (metric / imperial).
   */
  measurementCategory?: MeasurementCategory;
  /**
   * When true, this field is not shown in the settings UI even if its access
   * level would normally be visible.  Used for internal pipeline-paradigm
   * fields (e.g. sensor_index on sensor_value) that have no user-meaningful value.
   */
  hideInSettings?: boolean;
  /**
   * Override the default input widget.
   *   'slider'              — render as <input type="range"> bounded by meta.min/meta.max.
   *   'control-point-picker'— render a dropdown of all settable float fields across all
   *                           pipeline blocks.  The picker stores the selection as three
   *                           sibling fields (target_pipeline_idx, target_block_idx,
   *                           target_field_idx) whose FieldMeta has controlPointRole set.
   */
  uiWidget?: 'slider' | 'control-point-picker';
  /**
   * Identifies this field as part of the encoder control-point triple.
   * The role editor renders all three together as a single picker.
   */
  controlPointRole?: 'pipeline_idx' | 'block_idx' | 'field_idx';
}

// ── Block definition ──────────────────────────────────────────────────────

export interface BlockRegEntry {
  /** Numeric type ID written to L1 (matches pds_block_registry.h) */
  typeId: number;
  /** Display name shown in the HMI */
  displayName: string;
  /**
   * When true, this entire block type is hidden from the settings UI.
   * Use for internal pipeline-paradigm blocks (sensor_value, fb_ref) that
   * carry no user-meaningful settings.
   */
  hideInSettings?: boolean;
  /**
   * L3 struct format string — Python struct notation WITHOUT the leading '<'.
   * 'x' denotes a padding byte (no corresponding field name).
   * Field chars map positionally to l3Fields (padding chars are skipped).
   */
  l3Fmt: string;
  /** Field names in struct order (one per non-padding char in l3Fmt) */
  l3Fields: string[];
  /** UI metadata for each field, keyed by field name */
  fieldMeta: Record<string, FieldMeta>;
}

// ── Registry ──────────────────────────────────────────────────────────────

export const BLOCK_REGISTRY: Record<string, BlockRegEntry> = {

  sensor_analog: {
    typeId: 0x01,
    displayName: 'Analog Sensor',
    // Layout (28 bytes): uint8 adc_channel | int8 pin_power | uint16 sample_interval_ms |
    //   uint8 oversample_count | bool power_active_low | uint16 settling_time_ms |
    //   float×4 | bool enabled | 3-pad
    // Matches blob_packer.py: '<BbHB?Hffff?xxx'
    l3Fmt: 'BbHB?Hffff?xxx',
    l3Fields: [
      'adc_channel', 'pin_power', 'sample_interval_ms', 'oversample_count',
      'power_active_low', 'settling_time_ms',
      'Vmin', 'Vmax', 'scale_min', 'scale_max', 'enabled',
    ],
    fieldMeta: {
      adc_channel:        { label: 'ADC Channel',        level: 'hw',     description: 'GPIO/ADC channel number' },
      pin_power:          { label: 'Power Pin',           level: 'hw',     description: 'GPIO power enable (-1 = always on)' },
      sample_interval_ms: { label: 'Sample Interval',    level: 'user',   units: 'ms', min: 10, max: 60000, step: 10 },
      oversample_count:   { label: 'Oversampling',       level: 'hw',     description: 'ADC oversampling count — set at design time' },
      power_active_low:   { label: 'Power Active Low',   level: 'hw',     description: 'Invert power enable logic' },
      settling_time_ms:   { label: 'Settling Time',      level: 'hw',     units: 'ms', description: 'Wait time after power-up before sampling' },
      Vmin:               { label: 'Vmin',                level: 'tuner',  units: 'V', step: 0.001, description: 'Voltage at low calibration point' },
      Vmax:               { label: 'Vmax',                level: 'tuner',  units: 'V', step: 0.001, description: 'Voltage at high calibration point' },
      scale_min:          { label: 'Scale Min',           level: 'tuner',  step: 0.01, description: 'Engineering value at low cal point' },
      scale_max:          { label: 'Scale Max',           level: 'tuner',  step: 0.01, description: 'Engineering value at high cal point' },
      enabled:            { label: 'Enabled',             level: 'user' },
    },
  },

  // Deprecated — DHT22 is now a peripheral; use sensor_value (0x51) + sensor_ref instead.
  // These entries are kept for decoding legacy blobs (type_ids 0x02/0x03) but hidden in all UI.
  sensor_dht22_temp: {
    typeId: 0x02,
    displayName: 'DHT22 Temperature',
    hideInSettings: true,
    // Layout (6 bytes): int8 pin_data | pad | uint16 sample_interval_ms | bool enabled | pad
    // Matches blob_packer.py: '<bxH?x'
    l3Fmt: 'bxH?x',
    l3Fields: ['pin_data', 'sample_interval_ms', 'enabled'],
    fieldMeta: {
      pin_data:           { label: 'Data Pin',         level: 'hw',    description: 'DHT22 single-wire data pin' },
      sample_interval_ms: { label: 'Sample Interval',  level: 'user',  units: 'ms', min: 2000, max: 60000, step: 100 },
      enabled:            { label: 'Enabled',          level: 'user' },
    },
  },

  sensor_dht22_humid: {
    typeId: 0x03,
    displayName: 'DHT22 Humidity',
    hideInSettings: true,
    // Layout (6 bytes): int8 pin_data | pad | uint16 sample_interval_ms | bool enabled | pad
    // Matches blob_packer.py: '<bxH?x'
    l3Fmt: 'bxH?x',
    l3Fields: ['pin_data', 'sample_interval_ms', 'enabled'],
    fieldMeta: {
      pin_data:           { label: 'Data Pin',         level: 'hw',    description: 'DHT22 single-wire data pin' },
      sample_interval_ms: { label: 'Sample Interval',  level: 'user',  units: 'ms', min: 2000, max: 60000, step: 100 },
      enabled:            { label: 'Enabled',          level: 'user' },
    },
  },

  hmi_toggle: {
    typeId: 0x04,
    displayName: 'HMI Toggle',
    // ??  → value(bool) enabled(bool)
    l3Fmt: '??',
    l3Fields: ['value', 'enabled'],
    fieldMeta: {
      value:   { label: 'Value',   level: 'user', description: 'Current ON/OFF state (set by HMI)' },
      enabled: { label: 'Enabled', level: 'user' },
    },
  },

  hmi_momentary: {
    typeId: 0x05,
    displayName: 'HMI Momentary',
    // H?x  → pulse_ms(uint16) enabled(bool) + 1 pad
    l3Fmt: 'H?x',
    l3Fields: ['pulse_ms', 'enabled'],
    fieldMeta: {
      pulse_ms: { label: 'Pulse Duration', level: 'user', units: 'ms', min: 1, max: 60000, step: 100, description: 'Pulse width after HMI press' },
      enabled:  { label: 'Enabled',        level: 'user' },
    },
  },

  abortable_sub_pipeline: {
    typeId: 0x06,
    displayName: 'Abortable Sub-Pipeline',
    // I?xxx  → duration_ms(uint32) enabled(bool) + 3 pad
    l3Fmt: 'I?xxx',
    l3Fields: ['duration_ms', 'enabled'],
    fieldMeta: {
      duration_ms: { label: 'Duration', level: 'user', units: 'ms', min: 0, measurementCategory: 'duration_ms', description: 'Routine run time in ms. 0 = indefinite until abort.' },
      enabled:     { label: 'Enabled',  level: 'user' },
    },
  },

  pipeline_suspend: {
    typeId: 0x07,
    displayName: 'Pipeline Suspend',
    // B?  → pipeline_index(uint8) enabled(bool)
    l3Fmt: 'B?',
    l3Fields: ['pipeline_index', 'enabled'],
    fieldMeta: {
      pipeline_index: { label: 'Target Pipeline', level: 'hw',   description: 'Index of the pipeline to suspend (resolved from name at encode time)' },
      enabled:        { label: 'Enabled',          level: 'user' },
    },
  },

  pipeline_resume: {
    typeId: 0x08,
    displayName: 'Pipeline Resume',
    // B?  → pipeline_index(uint8) enabled(bool)
    l3Fmt: 'B?',
    l3Fields: ['pipeline_index', 'enabled'],
    fieldMeta: {
      pipeline_index: { label: 'Target Pipeline', level: 'hw',   description: 'Index of the pipeline to resume (resolved from name at encode time)' },
      enabled:        { label: 'Enabled',          level: 'user' },
    },
  },

  logic_or: {
    typeId: 0x09,
    displayName: 'Logic OR',
    // ?  → enabled(bool) — inputs A/B are wired via the inputs map, no L3 storage for them
    l3Fmt: '?',
    l3Fields: ['enabled'],
    fieldMeta: {
      enabled: { label: 'Enabled', level: 'user' },
    },
  },

  hmi_initiate: {
    typeId: 0x0A,
    displayName: 'HMI Initiate',
    // ??  → confirm(bool) enabled(bool)
    l3Fmt: '??',
    l3Fields: ['confirm', 'enabled'],
    fieldMeta: {
      confirm: { label: 'Confirm',  level: 'user', description: 'Set by HMI to trigger one-shot; auto-clears after one pipeline tick' },
      enabled: { label: 'Enabled',  level: 'user' },
    },
  },

  delay: {
    typeId: 0x0B,
    displayName: 'Delay',
    // Layout (8 bytes): uint32 delay_ms | bool enabled | 3-pad
    // Matches blob_packer.py: '<I?xxx'
    l3Fmt: 'I?xxx',
    l3Fields: ['delay_ms', 'enabled'],
    fieldMeta: {
      delay_ms: { label: 'Delay',   level: 'user', units: 'ms', min: 0, measurementCategory: 'duration_ms', description: 'One-shot delay after rising edge on input' },
      enabled:  { label: 'Enabled', level: 'user' },
    },
  },

  // ── sensor_ph (0x0C) — power-gated analog pH probe ───────────────────────
  // Layout (36 bytes): BbHBBB?ffffff??xx — matches blob_packer.py '<BbHBBB?ffffff??xx'
  sensor_ph: {
    typeId: 0x0C,
    displayName: 'pH Sensor',
    l3Fmt: 'BbHBBB?ffffff??xx',
    l3Fields: [
      'adc_channel', 'pin_power', 'sample_interval_s',
      'oversample', 'settling_time_s', 'response_time_s',
      'power_active_low',
      'Vmin', 'Vmax', 'scale_min', 'scale_max',
      'alarm_low', 'alarm_high',
      'alarm_enabled', 'enabled',
    ],
    fieldMeta: {
      adc_channel:      { label: 'ADC Channel',      level: 'hw',     description: 'ADC GPIO channel number' },
      pin_power:        { label: 'Power Pin',         level: 'hw',     description: 'Power-enable GPIO (-1 = always on)' },
      sample_interval_s:{ label: 'Sample Interval',  level: 'user',   units: 's', min: 1, max: 3600, step: 1 },
      oversample:       { label: 'Oversampling',      level: 'hw',     description: 'ADC reads to average (1–64)' },
      settling_time_s:  { label: 'Settling Time',     level: 'hw',     units: 's', description: 'Wait after power-on before sampling' },
      response_time_s:  { label: 'Response Time',     level: 'hw',     units: 's', description: 'Additional probe response wait' },
      power_active_low: { label: 'Power Active Low',  level: 'hw',     description: 'Invert power enable logic' },
      Vmin:             { label: 'Vmin',              level: 'tuner',  units: 'V', step: 0.001, description: 'Voltage at scale_min (low calibration point)' },
      Vmax:             { label: 'Vmax',              level: 'tuner',  units: 'V', step: 0.001, description: 'Voltage at scale_max (high calibration point)' },
      scale_min:        { label: 'Scale Min (pH)',    level: 'tuner',  step: 0.01, description: 'pH value at Vmin' },
      scale_max:        { label: 'Scale Max (pH)',    level: 'tuner',  step: 0.01, description: 'pH value at Vmax' },
      alarm_low:        { label: 'Alarm Low (pH)',    level: 'tuner',  step: 0.1,  description: 'Low pH alarm threshold' },
      alarm_high:       { label: 'Alarm High (pH)',   level: 'tuner',  step: 0.1,  description: 'High pH alarm threshold' },
      alarm_enabled:    { label: 'Alarm Enabled',     level: 'tuner' },
      enabled:          { label: 'Enabled',           level: 'user' },
    },
  },

  // ── sensor_ec (0x0D) — power-gated analog EC probe ──────────────────────────
  // Layout (48 bytes): BbHBBB?ffff?xxxffff??xx — matches blob_packer.py '<BbHBBB?ffff?xxxffff??xx'
  sensor_ec: {
    typeId: 0x0D,
    displayName: 'EC Sensor',
    l3Fmt: 'BbHBBB?ffff?xxxffff??xx',
    l3Fields: [
      'adc_channel', 'pin_power', 'sample_interval_s',
      'oversample', 'settling_time_s', 'response_time_s',
      'power_active_low',
      'Vmin', 'Vmax', 'scale_min', 'scale_max',
      'temp_comp_enabled',
      'temp_coeff', 'temp_reference_c',
      'alarm_low', 'alarm_high',
      'alarm_enabled', 'enabled',
    ],
    fieldMeta: {
      adc_channel:       { label: 'ADC Channel',        level: 'hw',     description: 'ADC GPIO channel number' },
      pin_power:         { label: 'Power Pin',           level: 'hw',     description: 'Power-enable GPIO (-1 = always on)' },
      sample_interval_s: { label: 'Sample Interval',    level: 'user',   units: 's', min: 1, max: 3600, step: 1 },
      oversample:        { label: 'Oversampling',        level: 'hw',     description: 'ADC reads to average (1–64)' },
      settling_time_s:   { label: 'Settling Time',       level: 'hw',     units: 's', description: 'Wait after power-on before sampling' },
      response_time_s:   { label: 'Response Time',       level: 'hw',     units: 's', description: 'Additional probe response wait' },
      power_active_low:  { label: 'Power Active Low',    level: 'hw',     description: 'Invert power enable logic' },
      Vmin:              { label: 'Vmin',                level: 'tuner',  units: 'V',     step: 0.001, description: 'Voltage at scale_min (low cal point)' },
      Vmax:              { label: 'Vmax',                level: 'tuner',  units: 'V',     step: 0.001, description: 'Voltage at scale_max (high cal point)' },
      scale_min:         { label: 'Scale Min (mS/cm)',   level: 'tuner',  units: 'mS/cm', step: 0.001, description: 'EC value in mS/cm at Vmin (typically 0)' },
      scale_max:         { label: 'Scale Max (mS/cm)',   level: 'tuner',  units: 'mS/cm', step: 0.001, description: 'EC value in mS/cm at Vmax (2.0 = 1000 PPM500)' },
      temp_comp_enabled: { label: 'Temp Compensation',  level: 'tuner',  description: 'Enable temperature compensation' },
      temp_coeff:        { label: 'Temp Coefficient',   level: 'tuner',  units: '%/°C', step: 0.1, description: 'Compensation coefficient (%/°C), typically 2.0' },
      temp_reference_c:  { label: 'Temp Reference',     level: 'tuner',  units: '°C', step: 0.5, description: 'Reference temperature for compensation (room temp ~25°C)' },
      alarm_low:         { label: 'Alarm Low (mS/cm)',  level: 'tuner',  units: 'mS/cm', step: 0.01, description: 'Low EC alarm threshold in mS/cm' },
      alarm_high:        { label: 'Alarm High (mS/cm)', level: 'tuner',  units: 'mS/cm', step: 0.01, description: 'High EC alarm threshold in mS/cm' },
      alarm_enabled:     { label: 'Alarm Enabled',      level: 'tuner' },
      enabled:           { label: 'Enabled',            level: 'user' },
    },
  },

  timer_countdown: {
    typeId: 0x10,
    displayName: 'Countdown Timer',
    l3Fmt: 'I??xxI?xxx',
    l3Fields: ['duration_ms', 'retrigger', 'any_edge', 'cooldown_ms', 'enabled'],
    fieldMeta: {
      duration_ms:  { label: 'Duration',  level: 'user',   units: 'ms', min: 0, measurementCategory: 'duration_ms' },
      retrigger:    { label: 'Retrigger', level: 'tuner',  description: 'Restart on new input edge' },
      any_edge:     { label: 'Any Edge',  level: 'tuner',  description: 'Trigger on any state change (rising or falling)' },
      cooldown_ms:  { label: 'Cooldown',  level: 'tuner',  units: 'ms', min: 0, measurementCategory: 'duration_ms' },
      enabled:      { label: 'Enabled',   level: 'user' },
    },
  },

  timer_countup: {
    typeId: 0x11,
    displayName: 'Count-up Timer',
    l3Fmt: 'II?xxxI?xxx',
    l3Fields: ['mode', 'threshold', 'auto_reset', 'hold_duration_ms', 'enabled'],
    fieldMeta: {
      mode:             { label: 'Mode',           level: 'tuner',  description: '0=EVENTS  1=HOLD_TIME_MS', min: 0, max: 1 },
      threshold:        { label: 'Threshold',      level: 'tuner',  min: 0 },
      auto_reset:       { label: 'Auto Reset',     level: 'tuner' },
      hold_duration_ms: { label: 'Hold Duration',  level: 'tuner',  units: 'ms', min: 0, measurementCategory: 'duration_ms' },
      enabled:          { label: 'Enabled',        level: 'user' },
    },
  },

  timer_cycle: {
    typeId: 0x12,
    displayName: 'Cycle Timer',
    l3Fmt: 'IIII?xxx',
    l3Fields: [
      'on_duration_ms', 'off_duration_ms', 'initial_delay_ms',
      'max_on_count', 'enabled',
    ],
    fieldMeta: {
      on_duration_ms:   { label: 'ON Duration',    level: 'user',   units: 'ms', min: 0, measurementCategory: 'duration_ms' },
      off_duration_ms:  { label: 'OFF Duration',   level: 'user',   units: 'ms', min: 0, measurementCategory: 'duration_ms' },
      initial_delay_ms: { label: 'Initial Delay',  level: 'tuner',  units: 'ms', min: 0, measurementCategory: 'duration_ms' },
      max_on_count:     { label: 'Max ON Count',   level: 'tuner',  min: 0, description: '0 = unlimited' },
      enabled:          { label: 'Enabled',        level: 'user' },
    },
  },

  timer_tod: {
    typeId: 0x14,
    displayName: 'Time of Day Timer',
    // II?xxx → on_time_sec off_time_sec enabled 3pad = 12 bytes
    l3Fmt: 'II?xxx',
    l3Fields: ['on_time_sec', 'off_time_sec', 'enabled'],
    fieldMeta: {
      on_time_sec:  { label: 'ON Time',  level: 'user',  measurementCategory: 'time_of_day_sec', min: 0, max: 86399, description: 'Time of day when output goes ON (default 06:00)' },
      off_time_sec: { label: 'OFF Time', level: 'user',  measurementCategory: 'time_of_day_sec', min: 0, max: 86399, description: 'Time of day when output goes OFF (default 22:00)' },
      enabled:      { label: 'Enabled',        level: 'user' },
    },
  },

  // Deprecated — replaced by pid (0x21) + pwm_output (0x22)
  pid_pwm: {
    typeId: 0x20,
    hideInSettings: true,
    displayName: 'PID → PWM',
    // Layout (40 bytes): int8 pin_pwm | 3-pad | uint32 pwm_frequency_hz | float×7 | uint16 sample_interval_ms | bool×2
    // Matches blob_packer.py: '<bxxxIfffffffH??'
    l3Fmt: 'bxxxIfffffffH??',
    l3Fields: [
      'pin_pwm', 'pwm_frequency_hz', 'setpoint',
      'kp', 'ki', 'kd',
      'output_min', 'output_max', 'deadband',
      'sample_interval_ms', 'reverse_acting', 'enabled',
    ],
    fieldMeta: {
      pin_pwm:             { label: 'PWM Pin',            level: 'hw' },
      pwm_frequency_hz:    { label: 'PWM Frequency',      level: 'hw',     units: 'Hz', min: 1, max: 40000 },
      setpoint:            { label: 'Setpoint',           level: 'user',   step: 0.01 },
      kp:                  { label: 'Kp (Proportional)',  level: 'tuner',  min: 0, step: 0.001 },
      ki:                  { label: 'Ki (Integral)',       level: 'tuner',  min: 0, step: 0.001 },
      kd:                  { label: 'Kd (Derivative)',    level: 'tuner',  min: 0, step: 0.001 },
      output_min:          { label: 'Output Min',         level: 'tuner',  units: '%', min: 0, max: 100 },
      output_max:          { label: 'Output Max',         level: 'tuner',  units: '%', min: 0, max: 100 },
      deadband:            { label: 'Deadband',           level: 'tuner',  min: 0, step: 0.01 },
      sample_interval_ms:  { label: 'Sample Interval',    level: 'hw',     units: 'ms', description: 'PID recalculation rate — set at design time' },
      reverse_acting:      { label: 'Reverse Acting',     level: 'tuner',  description: 'Invert PID output direction' },
      enabled:             { label: 'Enabled',            level: 'user' },
    },
  },

  pid: {
    typeId: 0x21,
    displayName: 'PID Controller',
    // fffffffH??xxxx → setpoint kp ki kd output_min output_max deadband sample_interval_ms reverse_acting enabled [4-pad]
    // Note: byte at offset 32 is reserved padding (was setpoint_src_idx — removed; use encoder_mapped control_point instead)
    l3Fmt: 'fffffffH??xxxx',
    l3Fields: [
      'setpoint', 'kp', 'ki', 'kd',
      'output_min', 'output_max', 'deadband',
      'sample_interval_ms', 'reverse_acting', 'enabled',
    ],
    fieldMeta: {
      setpoint:            { label: 'Setpoint',           level: 'user',   step: 0.01 },
      kp:                  { label: 'Kp (Proportional)',  level: 'tuner',  min: 0, step: 0.001 },
      ki:                  { label: 'Ki (Integral)',       level: 'tuner',  min: 0, step: 0.001 },
      kd:                  { label: 'Kd (Derivative)',    level: 'tuner',  min: 0, step: 0.001 },
      output_min:          { label: 'Output Min',         level: 'tuner',  units: '%', min: 0, max: 100 },
      output_max:          { label: 'Output Max',         level: 'tuner',  units: '%', min: 0, max: 100 },
      deadband:            { label: 'Deadband',           level: 'tuner',  min: 0, step: 0.01 },
      sample_interval_ms:  { label: 'Sample Interval',    level: 'hw',     units: 'ms', description: 'PID recalculation rate — set at design time' },
      reverse_acting:      { label: 'Reverse Acting',     level: 'tuner',  description: 'Invert PID output direction' },
      enabled:             { label: 'Enabled',            level: 'user' },
    },
  },

  pwm_output: {
    typeId: 0x22,
    displayName: 'PWM Output',
    // Layout (28 bytes): int8 pin_pwm | 3-pad | uint32 pwm_frequency_hz |
    //   float ratio | float func_min | float func_max | float count_rate_at_full |
    //   bool enabled | 3-pad
    // Matches blob_packer.py: '<bxxxIffff?xxx'
    l3Fmt: 'bxxxIffff?xxx',
    l3Fields: [
      'pin_pwm', 'pwm_frequency_hz', 'ratio', 'func_min', 'func_max', 'count_rate_at_full', 'enabled',
    ],
    fieldMeta: {
      pin_pwm:              { label: 'PWM Pin',             level: 'hw' },
      pwm_frequency_hz:     { label: 'PWM Frequency',       level: 'hw',     units: 'Hz', min: 1, max: 40000 },
      ratio:                { label: 'Ratio',               level: 'user',   units: '%',  min: 0, max: 100, step: 1,   uiWidget: 'slider', description: 'This output\'s share of the PID signal. Effective duty = input × ratio/100.' },
      func_min:             { label: 'Functional Min',      level: 'tuner',  units: '%',  min: 0, max: 100, step: 0.1, description: 'Minimum viable duty. Sub-threshold duty snaps to 0 (prevents pump stall). 0 = disabled.' },
      func_max:             { label: 'Functional Max',      level: 'tuner',  units: '%',  min: 0, max: 100, step: 0.1, description: 'Hard duty cap for this pump. 100 = no limit.' },
      // count_rate_at_full: calibrated throughput rate — tuner-adjustable
      count_rate_at_full:   { label: 'Count Rate @ 100%',   level: 'tuner',  units: 'units/sec', step: 0.001, min: 0, description: 'Real-world dispensing rate at 100 % duty. Multiply by (duty/100) for current rate.' },
      enabled:              { label: 'Enabled',             level: 'user' },
    },
  },

  gpio_input: {
    typeId: 0x30,
    displayName: 'GPIO Input',
    // Layout (12 bytes): int8 pin_input | int8 pin_power | uint16 debounce_ms |
    //   uint16 settling_time_ms | uint16 sample_interval_ms |
    //   bool active_low | bool power_active_low | bool enabled | 1-pad
    // Matches blob_packer.py: '<bbHHH???x'
    l3Fmt: 'bbHHH???x',
    l3Fields: ['pin_input', 'pin_power', 'debounce_ms', 'settling_time_ms', 'sample_interval_ms', 'active_low', 'power_active_low', 'enabled'],
    fieldMeta: {
      pin_input:         { label: 'Input Pin',         level: 'hw' },
      pin_power:         { label: 'Power Pin',          level: 'hw',    description: 'GPIO power enable for sensor (-1 = always on)' },
      debounce_ms:       { label: 'Debounce',           level: 'tuner', units: 'ms', min: 0, max: 1000 },
      settling_time_ms:  { label: 'Settling Time',      level: 'hw',    units: 'ms', description: 'Wait after power-up before sampling' },
      sample_interval_ms:{ label: 'Sample Interval',    level: 'hw',    units: 'ms' },
      active_low:        { label: 'Active Low',         level: 'tuner', description: 'Input is asserted low (inverted logic)' },
      power_active_low:  { label: 'Power Active Low',   level: 'hw',    description: 'Invert power enable logic' },
      enabled:           { label: 'Enabled',            level: 'user' },
    },
  },

  gpio_output: {
    typeId: 0x31,
    displayName: 'GPIO Output',
    // Layout (3 bytes): int8 pin_output | bool active_low | bool enabled
    // Matches blob_packer.py: '<b??'
    l3Fmt: 'b??',
    l3Fields: ['pin_output', 'active_low', 'enabled'],
    fieldMeta: {
      pin_output: { label: 'Output Pin',  level: 'hw' },
      active_low: { label: 'Active Low',  level: 'tuner', description: 'Output is asserted low (inverted logic)' },
      enabled:    { label: 'Enabled',     level: 'user' },
    },
  },

  switch_output: {  // firmware alias for gpio_output
    typeId: 0x31,
    displayName: 'Switch Output',
    // Layout (3 bytes): int8 pin_output | bool active_low | bool enabled
    // Matches blob_packer.py: '<b??'
    l3Fmt: 'b??',
    l3Fields: ['pin_output', 'active_low', 'enabled'],
    fieldMeta: {
      pin_output: { label: 'Output Pin',  level: 'hw' },
      active_low: { label: 'Active Low',  level: 'tuner', description: 'Output is asserted low (inverted logic)' },
      enabled:    { label: 'Enabled',     level: 'user' },
    },
  },

  gpio_value: {
    typeId: 0x32,
    displayName: 'GPIO Value',
    hideInSettings: true,  // internal wiring block — references a gpio_input in another pipeline
    // Layout (4 bytes): uint8 pipeline_idx | uint8 block_idx | bool enabled | 1-pad
    // Matches blob_packer.py: '<BB?x'
    l3Fmt: 'BB?x',
    l3Fields: ['pipeline_idx', 'block_idx', 'enabled'],
    fieldMeta: {
      pipeline_idx: { label: 'Source Pipeline', level: 'hw', description: 'L1 index of the pipeline containing the gpio_input block' },
      block_idx:    { label: 'Source Block',    level: 'hw', description: 'Block index within the source pipeline' },
      enabled:      { label: 'Enabled',         level: 'user' },
    },
  },

  limit_high: {
    typeId: 0x40,
    displayName: 'High Limit',
    l3Fmt: 'ff???x',
    l3Fields: ['threshold', 'hysteresis', 'trip_on_high', 'alarm_enabled', 'enabled'],
    fieldMeta: {
      threshold:     { label: 'Threshold',   level: 'user',   step: 0.01 },
      hysteresis:    { label: 'Hysteresis',  level: 'tuner',  step: 0.01, min: 0 },
      trip_on_high:  { label: 'Trip on High', level: 'tuner' },
      alarm_enabled: { label: 'Alarm',       level: 'user' },
      enabled:       { label: 'Enabled',     level: 'user' },
    },
  },

  limit_low: {
    typeId: 0x41,
    displayName: 'Low Limit',
    l3Fmt: 'ff???x',
    l3Fields: ['threshold', 'hysteresis', 'trip_on_high', 'alarm_enabled', 'enabled'],
    fieldMeta: {
      threshold:     { label: 'Threshold',   level: 'user',   step: 0.01 },
      hysteresis:    { label: 'Hysteresis',  level: 'tuner',  step: 0.01, min: 0 },
      trip_on_high:  { label: 'Trip on High', level: 'tuner' },
      alarm_enabled: { label: 'Alarm',       level: 'user' },
      enabled:       { label: 'Enabled',     level: 'user' },
    },
  },



  sensor_value: {
    typeId: 0x51,
    displayName: 'Sensor Value',
    hideInSettings: true,  // internal pipeline wiring block — no user-meaningful settings
    // B?  → sensor_index(uint8) enabled(bool)
    l3Fmt: 'B?',
    l3Fields: ['sensor_index', 'enabled'],
    fieldMeta: {
      sensor_index: { label: 'Sensor Index', level: 'hw', description: 'Index into the global sensor slot registry (0-31)' },
      enabled:      { label: 'Enabled',      level: 'user' },
    },
  },

  fb_ref: {
    typeId: 0x50,
    displayName: 'Fan Reference',
    hideInSettings: true,  // internal wiring block — no settings
    l3Fmt: '',
    l3Fields: [],
    fieldMeta: {},
  },

  fan_float: {
    typeId: 0x70,
    displayName: 'Fan (Float)',
    l3Fmt: '?',
    l3Fields: ['enabled'],
    fieldMeta: { enabled: { label: 'Enabled', level: 'tuner' } },
  },

  /* fan_bool (0x71) deprecated — use fan_float (0x70)
  fan_bool: {
    typeId: 0x71,
    displayName: 'Fan (Bool)',
    l3Fmt: '?',
    l3Fields: ['enabled'],
    fieldMeta: { enabled: { label: 'Enabled', level: 'tuner' } },
  },
  */

  led_addr: {
    typeId: 0x80,
    displayName: 'LED Addressable',
    // bBHBBBBB?  → pin_data led_type num_leds color_r color_g color_b color_w brightness enabled
    l3Fmt: 'bBHBBBBB?',
    l3Fields: [
      'pin_data', 'led_type', 'num_leds',
      'color_r', 'color_g', 'color_b', 'color_w',
      'brightness', 'enabled',
    ],
    fieldMeta: {
      pin_data:    { label: 'Data Pin',    level: 'hw' },
      led_type:    { label: 'LED Type',    level: 'hw',     description: '0 = WS2812B (RGB), 1 = SK6812 (RGBW)' },
      num_leds:    { label: 'LED Count',   level: 'hw',     min: 1, max: 1024 },
      color_r:     { label: 'Red',         level: 'user',   min: 0, max: 255, uiWidget: 'slider' },
      color_g:     { label: 'Green',       level: 'user',   min: 0, max: 255, uiWidget: 'slider' },
      color_b:     { label: 'Blue',        level: 'user',   min: 0, max: 255, uiWidget: 'slider' },
      color_w:     { label: 'White',       level: 'user',   min: 0, max: 255, uiWidget: 'slider', description: 'SK6812 only' },
      brightness:  { label: 'Brightness',  level: 'user',   units: '%', min: 0, max: 100, uiWidget: 'slider' },
      enabled:     { label: 'Enabled',     level: 'user' },
    },
  },

  // Deprecated — stepper drivers are now peripherals
  stepper_a4988: {
    typeId: 0x60,
    hideInSettings: true,
    displayName: 'Stepper A4988',
    l3Fmt: 'bbbbbbHBxxxff??xx',
    l3Fields: [
      'pin_step', 'pin_dir', 'pin_enable',
      'pin_ms1', 'pin_ms2', 'pin_ms3',
      'steps_per_rev', 'microstep_divisor',
      'max_rpm', 'accel_rpm_s',
      'invert_dir', 'enabled',
    ],
    fieldMeta: {
      pin_step:          { label: 'STEP Pin',     level: 'hw' },
      pin_dir:           { label: 'DIR Pin',      level: 'hw' },
      pin_enable:        { label: 'ENABLE Pin',   level: 'hw' },
      pin_ms1:           { label: 'MS1 Pin',      level: 'hw' },
      pin_ms2:           { label: 'MS2 Pin',      level: 'hw' },
      pin_ms3:           { label: 'MS3 Pin',      level: 'hw' },
      steps_per_rev:     { label: 'Steps/Rev',    level: 'tuner', min: 1, max: 6400 },
      microstep_divisor: { label: 'Microstep',    level: 'tuner', min: 1, max: 32, description: '1,2,4,8,16,32' },
      max_rpm:           { label: 'Max RPM',      level: 'tuner', units: 'RPM', min: 0.1, step: 0.1 },
      accel_rpm_s:       { label: 'Acceleration', level: 'tuner', units: 'RPM/s', min: 0, step: 0.1 },
      invert_dir:        { label: 'Invert Dir',   level: 'tuner' },
      enabled:           { label: 'Enabled',      level: 'user' },
    },
  },

  // Deprecated — stepper drivers are now peripherals
  stepper_drv8825: {
    typeId: 0x61,
    hideInSettings: true,
    displayName: 'Stepper DRV8825',
    l3Fmt: 'bbbbbbbxHBxff??xx',
    l3Fields: [
      'pin_step', 'pin_dir', 'pin_enable',
      'pin_ms1', 'pin_ms2', 'pin_ms3', 'pin_fault',
      'steps_per_rev', 'microstep_divisor',
      'max_rpm', 'accel_rpm_s',
      'invert_dir', 'enabled',
    ],
    fieldMeta: {
      pin_step:          { label: 'STEP Pin',    level: 'hw' },
      pin_dir:           { label: 'DIR Pin',     level: 'hw' },
      pin_enable:        { label: 'ENABLE Pin',  level: 'hw' },
      pin_ms1:           { label: 'MS1 Pin',     level: 'hw' },
      pin_ms2:           { label: 'MS2 Pin',     level: 'hw' },
      pin_ms3:           { label: 'MS3 Pin',     level: 'hw' },
      pin_fault:         { label: 'FAULT Pin',   level: 'hw' },
      steps_per_rev:     { label: 'Steps/Rev',   level: 'tuner', min: 1, max: 6400 },
      microstep_divisor: { label: 'Microstep',   level: 'tuner', min: 1, max: 32 },
      max_rpm:           { label: 'Max RPM',     level: 'tuner', units: 'RPM', min: 0.1, step: 0.1 },
      accel_rpm_s:       { label: 'Acceleration', level: 'tuner', units: 'RPM/s', min: 0, step: 0.1 },
      invert_dir:        { label: 'Invert Dir',  level: 'tuner' },
      enabled:           { label: 'Enabled',     level: 'user' },
    },
  },

  // Deprecated — stepper drivers are now peripherals
  stepper_tb6600: {
    typeId: 0x62,
    hideInSettings: true,
    displayName: 'Stepper TB6600',
    l3Fmt: 'bbbxHBxff??xx',
    l3Fields: [
      'pin_step', 'pin_dir', 'pin_enable',
      'steps_per_rev', 'microstep_divisor',
      'max_rpm', 'accel_rpm_s',
      'invert_dir', 'enabled',
    ],
    fieldMeta: {
      pin_step:          { label: 'STEP Pin',    level: 'hw' },
      pin_dir:           { label: 'DIR Pin',     level: 'hw' },
      pin_enable:        { label: 'ENABLE Pin',  level: 'hw' },
      steps_per_rev:     { label: 'Steps/Rev',   level: 'tuner', min: 1, max: 6400 },
      microstep_divisor: { label: 'Microstep',   level: 'tuner', min: 1, max: 32 },
      max_rpm:           { label: 'Max RPM',     level: 'tuner', units: 'RPM', min: 0.1, step: 0.1 },
      accel_rpm_s:       { label: 'Acceleration', level: 'tuner', units: 'RPM/s', min: 0, step: 0.1 },
      invert_dir:        { label: 'Invert Dir',  level: 'tuner' },
      enabled:           { label: 'Enabled',     level: 'user' },
    },
  },

  // Deprecated — stepper drivers are now peripherals
  stepper_tmc2209: {
    typeId: 0x63,
    hideInSettings: true,
    displayName: 'Stepper TMC2209',
    l3Fmt: 'bbbbBxHBxxxff??xx',
    l3Fields: [
      'pin_step', 'pin_dir', 'pin_enable', 'pin_uart',
      'uart_addr',
      'steps_per_rev', 'microstep_divisor',
      'max_rpm', 'accel_rpm_s',
      'invert_dir', 'enabled',
    ],
    fieldMeta: {
      pin_step:          { label: 'STEP Pin',      level: 'hw' },
      pin_dir:           { label: 'DIR Pin',       level: 'hw' },
      pin_enable:        { label: 'ENABLE Pin',    level: 'hw' },
      pin_uart:          { label: 'UART Pin',      level: 'hw' },
      uart_addr:         { label: 'UART Address',  level: 'tuner', min: 0, max: 3 },
      steps_per_rev:     { label: 'Steps/Rev',     level: 'tuner', min: 1, max: 6400 },
      microstep_divisor: { label: 'Microstep',     level: 'tuner', min: 1, max: 256 },
      max_rpm:           { label: 'Max RPM',       level: 'tuner', units: 'RPM', min: 0.1, step: 0.1 },
      accel_rpm_s:       { label: 'Acceleration',  level: 'tuner', units: 'RPM/s', min: 0, step: 0.1 },
      invert_dir:        { label: 'Invert Dir',    level: 'tuner' },
      enabled:           { label: 'Enabled',       level: 'user' },
    },
  },

  // Deprecated — stepper drivers are now peripherals
  stepper_tmc2208: {
    typeId: 0x64,
    hideInSettings: true,
    displayName: 'Stepper TMC2208',
    l3Fmt: 'bbbbBxHBxxxff??xx',
    l3Fields: [
      'pin_step', 'pin_dir', 'pin_enable', 'pin_uart',
      'uart_addr',
      'steps_per_rev', 'microstep_divisor',
      'max_rpm', 'accel_rpm_s',
      'invert_dir', 'enabled',
    ],
    fieldMeta: {
      pin_step:          { label: 'STEP Pin',      level: 'hw' },
      pin_dir:           { label: 'DIR Pin',       level: 'hw' },
      pin_enable:        { label: 'ENABLE Pin',    level: 'hw' },
      pin_uart:          { label: 'UART Pin',      level: 'hw' },
      uart_addr:         { label: 'UART Address',  level: 'tuner', min: 0, max: 3 },
      steps_per_rev:     { label: 'Steps/Rev',     level: 'tuner', min: 1, max: 6400 },
      microstep_divisor: { label: 'Microstep',     level: 'tuner', min: 1, max: 256 },
      max_rpm:           { label: 'Max RPM',       level: 'tuner', units: 'RPM', min: 0.1, step: 0.1 },
      accel_rpm_s:       { label: 'Acceleration',  level: 'tuner', units: 'RPM/s', min: 0, step: 0.1 },
      invert_dir:        { label: 'Invert Dir',    level: 'tuner' },
      enabled:           { label: 'Enabled',       level: 'user' },
    },
  },

  // ── Encoders (0xA1–0xA3) ──────────────────────────────────────────────────
  //
  // Encoders are BACKEND DRIVERS — no HMI settings panel.
  // They are configured exclusively in the role editor (hardware pin assignment
  // and the control_point assignment for encoder_mapped).
  //
  // encoder_mapped carries a "control point" pointer: (target_pipeline_idx,
  // target_block_idx, target_field_idx).  When the physical encoder turns, the
  // firmware writes mapped_value into that block's settings field in RAM and
  // the value is persisted back to the server via a settings-report POST.
  //
  // setpoint_src_idx was removed from pid (0x21) — use encoder_mapped control_point instead.

  encoder_position: {
    typeId: 0xA1,
    displayName: 'Encoder Position',
    hideInSettings: true,  // backend driver — no HMI panel; role editor only
    // Layout (16 bytes): bbbBfH????bx — same as encoder_velocity
    // Matches blob_packer.py: '<bbbBfH????bx'
    l3Fmt: 'bbbBfH????bx',
    l3Fields: [
      'pin_a', 'pin_b', 'pin_index', 'pull',
      'counts_per_rev', 'velocity_interval_ms',
      'active_low', 'reset_on_index', 'invert_direction', 'enabled',
      'pin_gnd',
    ],
    fieldMeta: {
      pin_a:                { label: 'Pin A',            level: 'hw',  description: 'Encoder channel A GPIO' },
      pin_b:                { label: 'Pin B',            level: 'hw',  description: 'Encoder channel B GPIO' },
      pin_index:            { label: 'Index Pin',        level: 'hw',  description: 'Index pulse GPIO (-1 = none)' },
      pull:                 { label: 'Pull Mode',        level: 'hw',  description: '0=none 1=pull-up 2=pull-down', min: 0, max: 2 },
      counts_per_rev:       { label: 'Counts / Rev',    level: 'hw',  min: 1, step: 1 },
      velocity_interval_ms: { label: 'Velocity Window', level: 'hw',  units: 'ms', min: 10, max: 5000 },
      active_low:           { label: 'Active Low',      level: 'hw' },
      reset_on_index:       { label: 'Reset on Index',  level: 'hw' },
      invert_direction:     { label: 'Invert Dir',      level: 'hw' },
      enabled:              { label: 'Enabled',         level: 'user' },
      pin_gnd:              { label: 'Virtual GND Pin', level: 'hw',  description: 'GPIO driven OUTPUT LOW as encoder GND (-1 = not used)' },
    },
  },

  encoder_velocity: {
    typeId: 0xA2,
    displayName: 'Encoder Velocity',
    hideInSettings: true,  // backend driver — no HMI panel; role editor only
    // Layout (16 bytes): bbbBfH????bx
    l3Fmt: 'bbbBfH????bx',
    l3Fields: [
      'pin_a', 'pin_b', 'pin_index', 'pull',
      'counts_per_rev', 'velocity_interval_ms',
      'active_low', 'reset_on_index', 'invert_direction', 'enabled',
      'pin_gnd',
    ],
    fieldMeta: {
      pin_a:                { label: 'Pin A',            level: 'hw',  description: 'Encoder channel A GPIO' },
      pin_b:                { label: 'Pin B',            level: 'hw',  description: 'Encoder channel B GPIO' },
      pin_index:            { label: 'Index Pin',        level: 'hw',  description: 'Index pulse GPIO (-1 = none)' },
      pull:                 { label: 'Pull Mode',        level: 'hw',  description: '0=none 1=pull-up 2=pull-down', min: 0, max: 2 },
      counts_per_rev:       { label: 'Counts / Rev',    level: 'hw',  min: 1, step: 1 },
      velocity_interval_ms: { label: 'Velocity Window', level: 'hw',  units: 'ms', min: 10, max: 5000 },
      active_low:           { label: 'Active Low',      level: 'hw' },
      reset_on_index:       { label: 'Reset on Index',  level: 'hw' },
      invert_direction:     { label: 'Invert Dir',      level: 'hw' },
      enabled:              { label: 'Enabled',         level: 'user' },
      pin_gnd:              { label: 'Virtual GND Pin', level: 'hw',  description: 'GPIO driven OUTPUT LOW as encoder GND (-1 = not used)' },
    },
  },

  encoder_mapped: {
    typeId: 0xA3,
    displayName: 'Encoder — Mapped',
    hideInSettings: true,  // backend driver — no HMI panel; role editor only
    // Layout (40 bytes):
    //   0–15:  bbbBfH????bx  — hardware base (same as encoder_position)
    //   16–35: ffff?xxx      — linear map (map_in_min/max, map_out_min/max, clamp)
    //   36–39: BBBx          — control_point triple (target_pipeline_idx, target_block_idx, target_field_idx)
    // Matches blob_packer.py: '<bbbBfH????bxffff?xxxBBBx'
    l3Fmt: 'bbbBfH????bxffff?xxxBBBx',
    l3Fields: [
      'pin_a', 'pin_b', 'pin_index', 'pull',
      'counts_per_rev', 'velocity_interval_ms',
      'active_low', 'reset_on_index', 'invert_direction', 'enabled',
      'pin_gnd',
      'map_in_min', 'map_in_max', 'map_out_min', 'map_out_max', 'clamp',
      'target_pipeline_idx', 'target_block_idx', 'target_field_idx',
    ],
    fieldMeta: {
      pin_a:                { label: 'Pin A',               level: 'hw',    description: 'Encoder channel A GPIO' },
      pin_b:                { label: 'Pin B',               level: 'hw',    description: 'Encoder channel B GPIO' },
      pin_index:            { label: 'Index Pin',           level: 'hw',    description: 'Index pulse GPIO (-1 = none)' },
      pull:                 { label: 'Pull Mode',           level: 'hw',    description: '0=none 1=pull-up 2=pull-down', min: 0, max: 2 },
      counts_per_rev:       { label: 'Counts / Rev',       level: 'hw',    min: 1, step: 1 },
      velocity_interval_ms: { label: 'Velocity Window',    level: 'hw',    units: 'ms', min: 10, max: 5000 },
      active_low:           { label: 'Active Low',         level: 'hw' },
      reset_on_index:       { label: 'Reset on Index',     level: 'hw' },
      invert_direction:     { label: 'Invert Dir',         level: 'hw' },
      enabled:              { label: 'Enabled',            level: 'user' },
      pin_gnd:              { label: 'Virtual GND Pin',    level: 'hw',    description: 'GPIO driven OUTPUT LOW as encoder GND (-1 = not used)' },
      map_in_min:           { label: 'Map In Min',         level: 'tuner', step: 0.1,  description: 'Encoder count at mapped min output' },
      map_in_max:           { label: 'Map In Max',         level: 'tuner', step: 0.1,  description: 'Encoder count at mapped max output' },
      map_out_min:          { label: 'Map Out Min',        level: 'tuner', step: 0.01, description: 'Output value at map_in_min counts' },
      map_out_max:          { label: 'Map Out Max',        level: 'tuner', step: 0.01, description: 'Output value at map_in_max counts' },
      clamp:                { label: 'Clamp Output',       level: 'tuner', description: 'Clamp mapped_value to [map_out_min, map_out_max]' },
      // Control point — the variable this encoder drives.
      // The three fields are stored as separate bytes in L3 but presented as
      // a single 'control-point-picker' widget in the role editor.
      target_pipeline_idx:  { label: 'Control Point',      level: 'role',  controlPointRole: 'pipeline_idx', uiWidget: 'control-point-picker',
                              description: 'Pipeline index of the setting this encoder controls (0xFF = not assigned)' },
      target_block_idx:     { label: 'Control Point Block', level: 'role', controlPointRole: 'block_idx',    hideInSettings: true,
                              description: 'Block index within the target pipeline' },
      target_field_idx:     { label: 'Control Point Field', level: 'role', controlPointRole: 'field_idx',    hideInSettings: true,
                              description: 'Field index (0-based) in target block L3 settings' },
    },
  },

  // ── System ────────────────────────────────────────────────────────────────
  all_stop: {
    typeId: 0x90,
    displayName: 'ALL-STOP',
    // Layout (6 bytes): int8 pin_input | bool active_low | uint16 debounce_ms | bool enabled | 1-pad
    // Matches blob_packer.py: '<b?H?x'
    l3Fmt: 'b?H?x',
    l3Fields: ['pin_input', 'active_low', 'debounce_ms', 'enabled'],
    fieldMeta: {
      pin_input:   { label: 'E-Stop Pin',  level: 'hw',    description: '-1 = pipeline trigger only' },
      active_low:  { label: 'Active Low',  level: 'tuner', description: 'true = normally-closed button (recommended)' },
      debounce_ms: { label: 'Debounce',    level: 'tuner', units: 'ms', min: 0, max: 500 },
      enabled:     { label: 'Enabled',     level: 'user' },
    },
  },
};


/** Reverse map: typeId (from L1) → blockType name string */
export const TYPE_ID_TO_NAME: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  for (const [name, def] of Object.entries(BLOCK_REGISTRY)) {
    // Only register the first name that maps to each typeId
    // (switch_output is an alias for gpio_output — skip duplicate)
    if (!(def.typeId in m)) {
      m[def.typeId] = name;
    }
  }
  return m;
})();

// ── Role-editor helpers ───────────────────────────────────────────────────

/**
 * Describes a single float field that an encoder_mapped control_point can target.
 * Returned by getSettableFields() for display in the role editor picker.
 */
export interface SettableField {
  /** Human-readable label: "Pipeline Name > Block Name > Field Label" */
  label: string;
  /** Pipeline id string (from role JSON) */
  pipelineId: string;
  /** 0-based pipeline index in L1 order */
  pipelineIdx: number;
  /** 0-based block index within the pipeline */
  blockIdx: number;
  /** 0-based field index within l3Fields for that block type */
  fieldIdx: number;
  /** Field key name (e.g. "setpoint") */
  fieldName: string;
  /** Block type name (e.g. "pid") */
  blockType: string;
}

/**
 * Enumerates all float fields across all pipeline blocks that are valid
 * control_point targets (level !== 'hw', not a boolean, not a control-point
 * field itself, not hideInSettings).
 *
 * Intended for role editor use only.  Does not require any binary blobs.
 *
 * @param pipelines  - Array of pipeline objects from the role JSON.
 *   Each pipeline must have { id: string, name?: string, blocks: { blockType: string }[] }
 */
export function getSettableFields(
  pipelines: Array<{ id: string; name?: string; blocks: Array<{ blockType: string }> }>,
): SettableField[] {
  const results: SettableField[] = [];

  for (let pipelineIdx = 0; pipelineIdx < pipelines.length; pipelineIdx++) {
    const pipeline = pipelines[pipelineIdx];
    const pipelineName = pipeline.name ?? pipeline.id;

    for (let blockIdx = 0; blockIdx < pipeline.blocks.length; blockIdx++) {
      const block = pipeline.blocks[blockIdx];
      const blockType = block.blockType;
      const def = BLOCK_REGISTRY[blockType];
      if (!def || def.hideInSettings) continue;

      // Determine which format characters correspond to floats
      const fmtChars = (def.l3Fmt || '').replace(/\d+/g, '').split('');
      let fieldPos = 0;

      for (let fi = 0; fi < def.l3Fields.length; fi++) {
        // advance fmtChars past any padding bytes ('x') to find this field's char
        while (fieldPos < fmtChars.length && fmtChars[fieldPos] === 'x') fieldPos++;
        const fmtChar = fmtChars[fieldPos] ?? '';
        fieldPos++;

        const fieldName = def.l3Fields[fi];
        const meta = def.fieldMeta[fieldName];
        if (!meta) continue;
        if (meta.level === 'hw') continue;
        if (meta.hideInSettings) continue;
        if (meta.controlPointRole) continue;  // skip control_point triple fields
        if (fmtChar !== 'f') continue;  // only float fields are valid targets

        results.push({
          label: `${pipelineName} > ${def.displayName} > ${meta.label}`,
          pipelineId:  pipeline.id,
          pipelineIdx,
          blockIdx,
          fieldIdx: fi,
          fieldName,
          blockType,
        });
      }
    }
  }

  return results;
}
