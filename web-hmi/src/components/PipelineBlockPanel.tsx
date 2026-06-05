/**
 * PipelineBlockPanel.tsx
 *
 * Renders decoded pipeline block settings in the same visual language as the
 * PDS-Role VS Code extension's centre panel:
 *
 *   Pipeline heading
 *   └─ func-card  (block name + type badge, collapsible, hue-tinted left border)
 *      └─ instance-var rows  label | input | unit-badge
 *
 * Props
 * ─────
 * data         Decoded pipeline settings returned by GET /pipeline-settings
 * mode         'user'   — show only user-editable fields (setpoint, enabled, durations)
 *              'tuner'  — show user + tuner fields (gains, calibration)
 *              'full'   — show all fields including hw pin assignments
 * onChange     Called with (pipelineIdx, blockIdx, fieldName, newValue)
 * readOnly     When true, all inputs are disabled (display-only view)
 */

import React, { useState } from 'react';
import type {
  AccessLevel,
  FieldMeta,
  DecodedField,
  DecodedBlock,
  DecodedPipeline,
  DecodedPipelineSettings,
} from '@pds/pipeline';
import { BLOCK_REGISTRY } from '@pds/pipeline';
import type { MeasurementSystem } from '../hooks/useMeasurementSystem';
import {
  msToDuration,
  durationToMs,
  secToHms,
  hmsToSec,
  toDisplay,
  fromDisplay,
  displayUnits,
} from '../utils/unitConversion';

// Re-export so consumers (SettingsScreen etc.) can import from this component
// instead of depending on @pds/pipeline directly.
export type { AccessLevel, FieldMeta, DecodedField, DecodedBlock, DecodedPipeline, DecodedPipelineSettings };

// ── Hue colours (same 8-hue cycle as role editor) ─────────────────────────

const HUE_BORDERS = [
  'border-l-red-400',
  'border-l-yellow-400',
  'border-l-emerald-400',
  'border-l-blue-400',
  'border-l-violet-400',
  'border-l-pink-400',
  'border-l-teal-400',
  'border-l-orange-400',
];
const HUE_BG = [
  'bg-red-500/5',
  'bg-yellow-500/5',
  'bg-emerald-500/5',
  'bg-blue-500/5',
  'bg-violet-500/5',
  'bg-pink-500/5',
  'bg-teal-500/5',
  'bg-orange-500/5',
];

// ── fmtChar → display type label ──────────────────────────────────────────

function fmtLabel(c: string): string {
  const map: Record<string, string> = {
    B: 'uint8', b: 'int8', H: 'uint16', h: 'int16',
    I: 'uint32', i: 'int32', f: 'float', '?': 'bool',
  };
  return map[c] ?? c;
}

// ── Single field row ──────────────────────────────────────────────────────

interface FieldRowProps {
  name: string;
  field: DecodedField;
  disabled: boolean;
  measurementSystem: MeasurementSystem;
  onChange: (value: number | boolean) => void;
}

const FieldRow: React.FC<FieldRowProps> = ({ name, field, disabled, measurementSystem, onChange }) => {
  const { value, meta, fmtChar } = field;
  const isBool = fmtChar === '?';
  const isFloat = fmtChar === 'f';
  const isDuration   = meta.measurementCategory === 'duration_ms';
  const isTimeOfDay  = meta.measurementCategory === 'time_of_day_sec';

  // Duration fields: track local edit string for DD:HH:MM:SS input
  const [durationStr, setDurationStr] = useState<string | null>(null);
  // Time-of-day fields: track local edit string for HH:MM(:SS) input
  const [todStr, setTodStr] = useState<string | null>(null);
  // Float fields: track local edit string so we can show x.xx without browser re-formatting
  const [floatStr, setFloatStr] = useState<string | null>(null);

  const inputClass =
    'flex-1 min-w-[60px] max-w-[180px] px-1.5 py-0.5 text-[11px] font-mono ' +
    'bg-gray-100 dark:bg-[var(--input-bg,#1e1e1e)] ' +
    'text-gray-900 dark:text-gray-100 ' +
    'border border-gray-300 dark:border-gray-600 rounded ' +
    'disabled:opacity-60 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400';

  const displayedUnits = displayUnits(meta.units, meta.measurementCategory, measurementSystem);
  const displayedValue = toDisplay(Number(value), meta.measurementCategory, measurementSystem);

  return (
    <div className="flex items-center gap-2 py-[3px] border-b border-gray-100 dark:border-gray-700/60 last:border-0">
      {/* Label — monospace, fixed width, matches role editor .instance-var label */}
      <label
        className="min-w-[130px] font-mono text-[11px] text-gray-600 dark:text-gray-300 truncate shrink-0"
        title={meta.description ?? name}
      >
        {meta.label}
      </label>

      {/* Input */}
      {isBool ? (
        <button
          type="button"
          role="switch"
          aria-checked={!!value}
          disabled={disabled}
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-60 ${
            value ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-[18px]' : 'translate-x-[2px]'
          }`} />
        </button>
      ) : isDuration ? (
        // DD:HH:MM:SS text input for duration fields (stored in ms)
        <input
          type="text"
          value={durationStr ?? msToDuration(Number(value))}
          disabled={disabled}
          placeholder="MM:SS"
          onChange={e => setDurationStr(e.target.value)}
          onBlur={() => {
            if (durationStr !== null) {
              const ms = durationToMs(durationStr);
              if (!isNaN(ms)) {
                onChange(ms);
                setDurationStr(null);
              } else {
                // Revert invalid input
                setDurationStr(null);
              }
            }
          }}
          className={inputClass + ' max-w-[100px]'}
        />
      ) : isTimeOfDay ? (
        // HH:MM(:SS) text input for time-of-day fields (stored as seconds since midnight)
        <input
          type="text"
          value={todStr ?? secToHms(Number(value))}
          disabled={disabled}
          placeholder="HH:MM"
          onChange={e => setTodStr(e.target.value)}
          onBlur={() => {
            if (todStr !== null) {
              const sec = hmsToSec(todStr);
              if (!isNaN(sec) && sec >= 0) {
                onChange(sec);
                setTodStr(null);
              } else {
                setTodStr(null);
              }
            }
          }}
          className={inputClass + ' max-w-[100px]'}
        />
      ) : isFloat ? (
        // Float fields: text input with x.xx display, parses on blur
        <input
          type="text"
          inputMode="decimal"
          value={floatStr ?? displayedValue.toFixed(2)}
          disabled={disabled}
          onChange={e => setFloatStr(e.target.value)}
          onBlur={() => {
            if (floatStr !== null) {
              const parsed = parseFloat(floatStr);
              if (!isNaN(parsed)) {
                onChange(fromDisplay(parsed, meta.measurementCategory, measurementSystem));
              }
              setFloatStr(null);
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className={inputClass}
        />
      ) : (
        <input
          type="number"
          value={displayedValue}
          min={meta.min}
          max={meta.max}
          step={1}
          disabled={disabled}
          onChange={e => {
            onChange(parseInt(e.target.value, 10));
          }}
          className={inputClass}
        />
      )}

      {/* Type / unit badge — matches .var-type-badge in role editor */}
      <span className="text-[9px] text-gray-400 dark:text-gray-500 shrink-0 min-w-[40px] text-right">
        {isDuration ? 'DD:HH:MM:SS' : isTimeOfDay ? 'HH:MM' : (displayedUnits ?? fmtLabel(fmtChar))}
      </span>
    </div>
  );
};

// ── Slider row (for uiWidget: 'slider' fields, e.g. RGBW, brightness) ─────────

interface SliderRowProps {
  name: string;
  field: DecodedField;
  disabled: boolean;
  onChange: (value: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({ name, field, disabled, onChange }) => {
  const { value, meta, fmtChar } = field;
  const isFloat = fmtChar === 'f';
  const min = meta.min ?? 0;
  const max = meta.max ?? 255;
  const step = meta.step ?? (isFloat ? 0.1 : 1);
  const current = Number(value);

  return (
    <div className="flex items-center gap-2 py-[3px] border-b border-gray-100 dark:border-gray-700/60 last:border-0">
      <label
        className="min-w-[130px] font-mono text-[11px] text-gray-600 dark:text-gray-300 truncate shrink-0"
        title={meta.description ?? name}
      >
        {meta.label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        disabled={disabled}
        onChange={e => onChange(isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10))}
        className="flex-1 accent-blue-500 disabled:opacity-60 cursor-pointer"
      />
      <span className="text-[11px] font-mono text-gray-700 dark:text-gray-200 w-[28px] text-right shrink-0">
        {isFloat ? current.toFixed(1) : current}
      </span>
      <span className="text-[9px] text-gray-400 dark:text-gray-500 shrink-0 min-w-[30px] text-right">
        {meta.units ?? ''}
      </span>
    </div>
  );
};

// ── EC ↔ PPM inferred setpoint row ───────────────────────────────────────

/** Hanna/Truncheon scale: 1 mS/cm = 500 PPM (most common in US hydroponics) */
const EC_PPM_FACTOR = 500;

interface EcSetpointRowProps {
  field: DecodedField;
  disabled: boolean;
  onChange: (value: number) => void;
}

const EcSetpointRow: React.FC<EcSetpointRowProps> = ({ field, disabled, onChange }) => {
  const ecValue = Number(field.value);
  const [localEc, setLocalEc] = useState<string | null>(null);
  const [localPpm, setLocalPpm] = useState<string | null>(null);

  const inputClass =
    'flex-1 min-w-[60px] max-w-[180px] px-1.5 py-0.5 text-[11px] font-mono ' +
    'bg-gray-100 dark:bg-[var(--input-bg,#1e1e1e)] ' +
    'text-gray-900 dark:text-gray-100 ' +
    'border border-gray-300 dark:border-gray-600 rounded ' +
    'disabled:opacity-60 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400';

  const rowClass = 'flex items-center gap-2 py-[3px] border-b border-gray-100 dark:border-gray-700/60';

  return (
    <>
      {/* EC row — stored value */}
      <div className={rowClass}>
        <label
          className="min-w-[130px] font-mono text-[11px] text-gray-600 dark:text-gray-300 truncate shrink-0"
          title="Target EC setpoint (mS/cm)"
        >
          {field.meta.label}
        </label>
        <input
          type="number"
          value={localEc ?? ecValue.toFixed(2)}
          min={0}
          step={0.01}
          disabled={disabled}
          onChange={e => setLocalEc(e.target.value)}
          onBlur={() => {
            if (localEc !== null) {
              const v = parseFloat(localEc);
              if (!isNaN(v) && v >= 0) onChange(v);
              setLocalEc(null);
            }
          }}
          className={inputClass}
        />
        <span className="text-[9px] text-gray-400 dark:text-gray-500 shrink-0 min-w-[40px] text-right">
          mS/cm
        </span>
      </div>
      {/* PPM row — inferred, bidirectional */}
      <div className={`${rowClass} last:border-0`}>
        <label
          className="min-w-[130px] font-mono text-[11px] text-blue-500 dark:text-blue-400 truncate shrink-0 italic"
          title={`PPM (EC × ${EC_PPM_FACTOR} — Hanna/500 scale)`}
        >
          ↳ PPM ×{EC_PPM_FACTOR}
        </label>
        <input
          type="number"
          value={localPpm ?? Math.round(ecValue * EC_PPM_FACTOR)}
          min={0}
          step={1}
          disabled={disabled}
          onChange={e => setLocalPpm(e.target.value)}
          onBlur={() => {
            if (localPpm !== null) {
              const ppm = parseFloat(localPpm);
              if (!isNaN(ppm) && ppm >= 0) onChange(ppm / EC_PPM_FACTOR);
              setLocalPpm(null);
            }
          }}
          className={`${inputClass} border-blue-300 dark:border-blue-700/60`}
        />
        <span className="text-[9px] text-blue-400 dark:text-blue-500 shrink-0 min-w-[40px] text-right">
          PPM
        </span>
      </div>
    </>
  );
};

// ── Block card — equivalent to .func-card in role editor ─────────────────

/** Returns true if the field's access level is visible at the given mode level */
function isFieldVisible(fieldLevel: AccessLevel | undefined, mode: AccessLevel | 'full'): boolean {
  if (mode === 'full') return true;
  if (!fieldLevel || fieldLevel === 'user') return true;  // unknown = show everywhere
  if (fieldLevel === 'tuner') return mode === 'tuner';
  if (fieldLevel === 'hw')    return false;               // hw never shown in user/tuner modes
  return true;
}

interface BlockCardProps {
  block: DecodedBlock;
  hueIdx: number;
  mode: AccessLevel | 'full';
  disabled: boolean;
  measurementSystem: MeasurementSystem;
  onChange: (fieldName: string, value: number | boolean) => void;
  onAction?: (action: string) => void;
}

const BlockCard: React.FC<BlockCardProps> = ({ block, hueIdx, mode, disabled, measurementSystem, onChange, onAction }) => {
  const [collapsed, setCollapsed] = useState(false);

  const registryEntry = BLOCK_REGISTRY[block.blockType];

  const visibleFields = Object.entries(block.settings).filter(
    ([, f]) => isFieldVisible(f.meta.level, mode) && !f.meta.hideInSettings,
  );

  // Skip blocks with nothing to show (e.g. fb_ref) or marked as hidden in settings
  if (registryEntry?.hideInSettings || visibleFields.length === 0) return null;

  const hue = hueIdx % 8;
  const borderClass = HUE_BORDERS[hue];
  const bgClass = HUE_BG[hue];

  return (
    <div className={`border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden border-l-4 ${borderClass}`}>

      {/* Card header — like .func-card-header */}
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer select-none
          ${bgClass}
          border-b border-gray-200 dark:border-gray-700
          hover:opacity-90 transition-opacity`}
      >
        {/* Block type badge */}
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 shrink-0">
          {block.blockType}
        </span>
        {/* Display name */}
        <span className="text-[13px] font-semibold text-gray-900 dark:text-white flex-1">
          {block.displayName}
        </span>
        {/* Chevron */}
        <span className={`text-[10px] text-gray-400 transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}>
          ▾
        </span>
      </button>

      {/* Card body — like .func-card-body */}
      {!collapsed && (
        <div className="px-3 py-2 bg-white dark:bg-gray-800/50">
          {visibleFields.map(([name, field]) => {
            if (field.meta.measurementCategory === 'ec_mscm') {
              return (
                <EcSetpointRow
                  key={name}
                  field={field}
                  disabled={disabled}
                  onChange={val => onChange(name, val)}
                />
              );
            }
            if (field.meta.uiWidget === 'slider') {
              return (
                <SliderRow
                  key={name}
                  name={name}
                  field={field}
                  disabled={disabled}
                  onChange={val => onChange(name, val)}
                />
              );
            }
            return (
              <FieldRow
                key={name}
                measurementSystem={measurementSystem}
                name={name}
                field={field}
                disabled={disabled}
                onChange={val => onChange(name, val)}
              />
            );
          })}
          {/* Cumulative counter reset — shown for output blocks that accumulate on-time */}
          {(block.blockType === 'pwm_output' || block.blockType === 'gpio_output') && (
            <div className="pt-1.5 mt-1.5 border-t border-gray-100 dark:border-gray-700/60">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onAction?.('reset_cumulative')}
                  disabled={disabled}
                  title="Reset the cumulative on-time counter for this output block"
                  className="flex-1 py-1 text-[11px] font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-50 transition"
                >
                  ↺ Reset Cumulative Counter
                </button>
                {block.blockType === 'pwm_output' && (() => {
                  const craf = block.settings['count_rate_at_full'];
                  const v = typeof craf?.value === 'number' ? craf.value : null;
                  return v != null && v > 0 ? (
                    <span className="text-[10px] font-mono text-purple-500 dark:text-purple-400 whitespace-nowrap flex-shrink-0" title="Configured throughput rate at 100% duty">
                      {v.toFixed(3)} units/s
                    </span>
                  ) : null;
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main exported component ───────────────────────────────────────────────

interface PipelineBlockPanelProps {
  data: DecodedPipelineSettings;
  mode?: AccessLevel | 'full';
  readOnly?: boolean;
  measurementSystem?: MeasurementSystem;
  onChange?: (pipelineIdx: number, blockIdx: number, fieldName: string, value: number | boolean) => void;
  onPipelineEnabledChange?: (pipelineIdx: number, enabled: boolean) => void;
  /** Called when the user clicks an action button inside a block card (e.g. 'reset_cumulative') */
  onAction?: (pipelineIdx: number, blockIdx: number, action: string) => void;
  /** Optional pipeline predicate — only pipelines where this returns true are shown */
  pipelineFilter?: (pipeline: DecodedPipeline) => boolean;
  /** Optional block-type predicate — only blocks where this returns true are shown */
  blockFilter?: (blockType: string) => boolean;
}

const PipelineBlockPanel: React.FC<PipelineBlockPanelProps> = ({
  data,
  mode = 'user',
  readOnly = false,
  measurementSystem = 'metric',
  onChange,
  onPipelineEnabledChange,
  onAction,
  pipelineFilter,
  blockFilter,
}) => {
  let globalHue = 0;

  return (
    <div className="space-y-5">
      {data.pipelines.map(pipeline => {
        // Apply optional pipeline-level filter
        if (pipelineFilter && !pipelineFilter(pipeline)) return null;

        // Collect blocks that pass: registry hideInSettings flag, optional type filter,
        // and have at least one visible field
        const visibleBlocks = pipeline.blocks.filter(block => {
          const reg = BLOCK_REGISTRY[block.blockType];
          if (reg?.hideInSettings) return false;
          if (blockFilter && !blockFilter(block.blockType)) return false;
          const fields = Object.values(block.settings);
          return fields.some(f => isFieldVisible(f.meta.level, mode) && !f.meta.hideInSettings);
        });

        if (visibleBlocks.length === 0) return null;

        // Pipeline-level enabled: look for a field named 'enabled' in the first block
        // that has one, so we can surface it in the header toggle.
        let pipelineEnabled: boolean | undefined = undefined;
        let pipelineEnabledBlockIdx: number | undefined = undefined;
        for (const block of pipeline.blocks) {
          const f = block.settings['enabled'];
          if (f !== undefined && f.fmtChar === '?') {
            pipelineEnabled = !!f.value;
            pipelineEnabledBlockIdx = block.index;
            break;
          }
        }
        const hasPipelineEnabled = pipelineEnabled !== undefined;

        return (
          <div key={pipeline.index} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {/* Pipeline card header — like .pipeline-card-header in role editor */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
              <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 shrink-0">
                {pipeline.index + 1}
              </span>
              <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 flex-1 truncate">
                {pipeline.name || `Pipeline ${pipeline.index + 1}`}
              </span>
              {/* Pipeline-level enabled toggle */}
              {hasPipelineEnabled && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={pipelineEnabled}
                  disabled={readOnly}
                  title={pipelineEnabled ? 'Disable pipeline' : 'Enable pipeline'}
                  onClick={() => {
                    if (pipelineEnabledBlockIdx !== undefined) {
                      const newVal = !pipelineEnabled;
                      onChange?.(pipeline.index, pipelineEnabledBlockIdx, 'enabled', newVal);
                      onPipelineEnabledChange?.(pipeline.index, newVal);
                    }
                  }}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-60 ${
                    pipelineEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    pipelineEnabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
                  }`} />
                </button>
              )}
            </div>

            {/* Pipeline body — block cards */}
            <div className="p-2 space-y-2 bg-white dark:bg-gray-900/50">
              {visibleBlocks.map(block => {
                const card = (
                  <BlockCard
                    key={block.index}
                    block={block}
                    hueIdx={globalHue}
                    mode={mode}
                    disabled={readOnly}
                    measurementSystem={measurementSystem}
                    onChange={(fieldName, value) =>
                      onChange?.(pipeline.index, block.index, fieldName, value)
                    }
                    onAction={(action) =>
                      onAction?.(pipeline.index, block.index, action)
                    }
                  />
                );
                globalHue++;
                return card;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PipelineBlockPanel;
