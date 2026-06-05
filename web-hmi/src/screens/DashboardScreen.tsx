/**
 * DashboardScreen.tsx
 * Real-time device state — polls GET /devices/:id/live-state (written on every device check-in).
 * No table scan; the snapshot is stored directly on the device record.
 * Only shown when device.lastSeenAt is within 5 minutes (isOnline gating in DeviceHMIScreen).
 *
 * Layout: one panel per pipeline (ordered by pipelineOrder from server), items sorted by
 * blockIndex within each panel. Items with no pipelineName fall into an "Other" panel.
 * Generic — works for any role JSON without per-role UI code.
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../services/apiClient';
import type { DeviceHMIContext } from './DeviceHMIScreen';
import { useTimezone } from '../hooks/useTimezone';
import type { DecodedPipelineSettings } from '../components/PipelineBlockPanel';
import { useEcUnits, convertEcValue, EC_UNIT_LABELS, EC_UNIT_DECIMALS } from '../hooks/useEcUnits';
import { useTempUnits, convertTemp, TEMP_LABELS, TEMP_DECIMALS } from '../hooks/useTempUnits';

// ── Shared item base ──────────────────────────────────────────────────────────
interface PipelineItem {
  pipelineName?: string | null;
  blockIndex?: number | null;
}

interface AdcReading extends PipelineItem {
  pin: number;
  calibratedValue: number;
  label: string;
  voltage: number;
  rawValue?: number;
  pinPower?: number;
  alias?: string;
}

interface PwmOutput extends PipelineItem {
  pin: number;
  dutyCycle: number;
  label: string;
  frequency?: number;
  countRateAtFull?: number | null;
}

interface GpioState extends PipelineItem {
  pin: number;
  state: number;
  label: string;
}

interface TimerState extends PipelineItem {
  timerId: number;
  active: boolean;
  value: number;
  label: string;
  alias?: string;
  blockType?: 'timer_cycle' | 'timer_countdown' | 'timer_countup' | null;
  onMs?: number | null;
  offMs?: number | null;
  durationMs?: number | null;
  elapsedMs?: number | null;  // ms elapsed in current phase at capturedAt (timer_cycle only)
}

interface PeriphReading extends PipelineItem {
  pin: number;
  field: string;      // 'temp' | 'humid'
  value: number;
  label: string;
  alias?: string;
}

interface LiveState {
  capturedAt: string | null;
  deviceTimestampUnix?: number | null;
  pipelineOrder?: string[];
  adcReadings?: AdcReading[];
  pwmOutputs?: PwmOutput[];
  gpioStates?: GpioState[];
  timerStates?: TimerState[];
  peripheralReadings?: PeriphReading[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format milliseconds as HH:MM:SS (always shows all three segments, pads to ≥2 digits each) */
function msToHms(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${String(h).padStart(2, '0')}:${p2(m)}:${p2(s)}`;
}

const POLL_INTERVAL_MS = 5000;

// ── Per-item card components ──────────────────────────────────────────────────

const LiveTimerDisplay: React.FC<{ timer: TimerState; capturedAt: string | null }> = ({ timer, capturedAt }) => {
  const { blockType, value, active, onMs, offMs, elapsedMs } = timer;
  const capturedMs = capturedAt ? new Date(capturedAt).getTime() : null;

  const [display, setDisplay] = useState(() => {
    if (blockType === 'timer_cycle') {
      const onMsV  = onMs  ?? 0;
      const offMsV = offMs ?? 0;
      const phaseDur = active ? onMsV : offMsV;
      const remaining = Math.max(0, phaseDur - (elapsedMs ?? 0));
      return `${msToHms(remaining)} (${active ? 'ON' : 'OFF'})`;
    }
    return blockType === 'timer_countdown' ? msToHms(Math.max(0, value)) : msToHms(value);
  });

  useEffect(() => {
    const compute = () => {
      const sinceCapture = capturedMs ? Math.max(0, Date.now() - capturedMs) : 0;
      if (blockType === 'timer_countdown') {
        setDisplay(msToHms(Math.max(0, value - sinceCapture)));
      } else if (blockType === 'timer_cycle') {
        const onMsV  = onMs  ?? 0;
        const offMsV = offMs ?? 0;
        const period = onMsV + offMsV;
        if (period > 0) {
          // Anchor: at capturedAt the device was `elapsedMs` into the current phase.
          // Walk forward from there by `sinceCapture`.
          const phaseDurAtCapture = active ? onMsV : offMsV;
          const anchorElapsed = elapsedMs ?? 0;
          const remainingAtCapture = Math.max(0, phaseDurAtCapture - anchorElapsed);
          // How far into the timeline after capturedAt are we?
          const timelinePos = sinceCapture; // ms since we received this packet
          if (timelinePos < remainingAtCapture) {
            // Still in the original phase
            const remaining = remainingAtCapture - timelinePos;
            setDisplay(`${msToHms(remaining)} (${active ? 'ON' : 'OFF'})`);
          } else {
            // Crossed into subsequent phases — wrap through full cycles
            const afterFirst = timelinePos - remainingAtCapture;
            const posInCycle = afterFirst % period;
            // First full phase after the original is the opposite phase
            const nextPhaseDur = active ? offMsV : onMsV;
            const inNextPhase = posInCycle < nextPhaseDur;
            const nowActive = active ? !inNextPhase : inNextPhase;
            const remaining = inNextPhase
              ? nextPhaseDur - posInCycle
              : period - posInCycle;
            setDisplay(`${msToHms(remaining)} (${nowActive ? 'ON' : 'OFF'})`);
          }
        } else {
          setDisplay(active ? 'ON' : 'OFF');
        }
      } else {
        setDisplay(msToHms(value + sinceCapture));
      }
    };
    compute();
    const id = setInterval(compute, 500);
    return () => clearInterval(id);
  }, [blockType, value, active, onMs, offMs, elapsedMs, capturedMs]);

  return <span className="text-xl font-mono font-semibold text-gray-900 dark:text-white">{display}</span>;
};

const AdcCard: React.FC<{ item: AdcReading; gpioPinState: Record<number, number> }> = ({ item, gpioPinState }) => {
  const hasPower = item.pinPower != null && item.pinPower >= 0;
  const powerOn  = hasPower ? gpioPinState[item.pinPower!] === 1 : null;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-1.5">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{item.alias ?? item.label}</p>
      <p className="text-xl font-mono font-semibold text-gray-900 dark:text-white leading-none">
        {item.calibratedValue.toFixed(2)}
      </p>
      {hasPower && (
        <div className="flex items-center gap-1 mt-auto">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${powerOn ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-600'}`} />
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{powerOn ? 'on' : 'off'}</span>
        </div>
      )}
    </div>
  );
};

const PwmCard: React.FC<{ item: PwmOutput }> = ({ item }) => {
  // Firmware reports dutyCycle in 0–1000 units
  const pct = Math.min(100, (item.dutyCycle / 1000) * 100);
  const currentRate = (item.countRateAtFull && item.countRateAtFull > 0)
    ? ((pct / 100) * item.countRateAtFull)
    : null;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-1 min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{item.label}</p>
        {currentRate !== null && (
          <span className="text-[10px] font-mono text-purple-500 dark:text-purple-400 flex-shrink-0 ml-1" title={`Count rate at 100%: ${item.countRateAtFull} units/s`}>
            {currentRate.toFixed(2)}<span className="text-gray-400 ml-0.5">/s</span>
          </span>
        )}
      </div>
      <p className="text-2xl font-mono font-semibold text-gray-900 dark:text-white leading-none">
        {pct.toFixed(1)}<span className="text-sm font-normal text-gray-400 ml-0.5">%</span>
      </p>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1 mt-auto">
        <div className="bg-purple-500 h-1 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const GpioCard: React.FC<{ item: GpioState }> = ({ item }) => (
  <div className={`rounded-xl border-2 p-3 text-center flex flex-col gap-1.5 ${item.state ? 'bg-green-50 dark:bg-green-900/20 border-green-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
    <p className="text-xs text-gray-500 dark:text-gray-400 truncate leading-tight">{item.label}</p>
    <p className={`font-bold text-sm mt-auto ${item.state ? 'text-green-700 dark:text-green-300' : 'text-gray-400 dark:text-gray-500'}`}>
      {item.state ? 'ON' : 'OFF'}
    </p>
  </div>
);

const PERIPH_UNITS: Record<string, string> = { humid: '%RH' };

const PERIPH_SENTINEL = -998; // firmware writes -999.0 on read failure

const PeriphCard: React.FC<{ item: PeriphReading }> = ({ item }) => {
  const { unit: ecUnit } = useEcUnits();
  const { unit: tempUnit } = useTempUnits();
  const failed = item.value <= PERIPH_SENTINEL;

  // EC conversion — field 'ec' carries the firmware's mS/cm value
  const isEc   = item.field === 'ec';
  const isTemp = item.field === 'temp';

  const displayValue = isEc   ? convertEcValue(item.value, ecUnit)
                     : isTemp ? convertTemp(item.value, tempUnit)
                     : item.value;
  const displayUnit  = isEc   ? EC_UNIT_LABELS[ecUnit]
                     : isTemp ? TEMP_LABELS[tempUnit]
                     : (PERIPH_UNITS[item.field] ?? '');
  const decimals     = isEc   ? EC_UNIT_DECIMALS[ecUnit]
                     : isTemp ? TEMP_DECIMALS[tempUnit]
                     : 1;

  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-1.5 ${failed ? 'bg-gray-50 dark:bg-gray-900/40 border-gray-300 dark:border-gray-700' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{item.alias ?? item.label}</p>
      {failed ? (
        <p className="text-xl font-mono font-semibold text-gray-400 dark:text-gray-500 leading-none">
          N/A
          <span className="text-xs font-normal text-gray-400 ml-1.5">no reading</span>
        </p>
      ) : (
        <p className="text-xl font-mono font-semibold text-gray-900 dark:text-white leading-none">
          {displayValue.toFixed(decimals)}
          <span className="text-sm font-normal text-gray-400 ml-0.5">{displayUnit}</span>
        </p>
      )}
    </div>
  );
};

const TimerCard: React.FC<{ item: TimerState; capturedAt: string | null }> = ({ item, capturedAt }) => {
  const on = item.active;
  // Cycle timers alternate ON/OFF — keep card styling stable (always blue) so
  // the border doesn't flash every cycle transition.
  const isCycle = item.blockType === 'timer_cycle';
  const highlighted = isCycle || on;
  return (
    <div className={`rounded-xl border-2 p-4 flex flex-col gap-1 ${highlighted ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
      {/* Top row: label left, count + ON/OFF right */}
      <div className="flex items-start justify-between gap-1 min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate leading-tight">{item.alias ?? item.label}</p>
        {item.blockType === 'timer_cycle' && (
          <span className="text-xs font-mono text-gray-500 dark:text-gray-400 leading-tight flex-shrink-0 ml-1">{item.value} Cycles</span>
        )}
      </div>
      {/* Timer countdown / phase display */}
      <p className="text-xl font-mono font-semibold text-gray-900 dark:text-white mt-auto">
        <LiveTimerDisplay timer={item} capturedAt={capturedAt} />
      </p>
    </div>
  );
};

// ── Tagged union for ordering items within a pipeline panel ───────────────────
type AnyItem =
  | { kind: 'adc';    blockIndex: number; item: AdcReading }
  | { kind: 'pwm';    blockIndex: number; item: PwmOutput }
  | { kind: 'gpio';   blockIndex: number; item: GpioState }
  | { kind: 'timer';  blockIndex: number; item: TimerState }
  | { kind: 'periph'; blockIndex: number; item: PeriphReading };

// ── Pipeline panel ────────────────────────────────────────────────────────────
const PipelinePanel: React.FC<{
  name: string;
  items: AnyItem[];
  capturedAt: string | null;
  gpioPinState: Record<number, number>;
}> = ({ name, items, capturedAt, gpioPinState }) => {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => a.blockIndex - b.blockIndex);
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">{name}</h3>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
        {sorted.map((entry, i) => {
          if (entry.kind === 'adc')    return <AdcCard    key={i} item={entry.item} gpioPinState={gpioPinState} />;
          if (entry.kind === 'pwm')    return <div key={i} className="col-span-2"><PwmCard item={entry.item} /></div>;
          if (entry.kind === 'gpio')   return <GpioCard   key={i} item={entry.item} />;
          if (entry.kind === 'timer')  return <div key={i} className="col-span-2"><TimerCard item={entry.item} capturedAt={capturedAt} /></div>;
          if (entry.kind === 'periph') return <PeriphCard key={i} item={entry.item} />;
          return null;
        })}
      </div>
    </section>
  );
};

// ── Main screen ───────────────────────────────────────────────────────────────
const DashboardScreen: React.FC = () => {
  const { deviceId } = useOutletContext<DeviceHMIContext>();
  const { formatTs } = useTimezone();
  const [state, setState] = useState<LiveState | null>(null);
  const [settings, setSettings] = useState<DecodedPipelineSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    try {
      const [liveState, pipelineSettings] = await Promise.all([
        api.get<LiveState>(`/devices/${deviceId}/live-state`),
        api.get<DecodedPipelineSettings>(`/devices/${deviceId}/pipeline-settings`).catch(() => null),
      ]);
      setState(liveState);
      setSettings(pipelineSettings);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load live state');
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchLatest();
    intervalRef.current = setInterval(fetchLatest, POLL_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchLatest]);

  // Build a lookup of GPIO state by pin for power-pin indicators
  const gpioPinState = Object.fromEntries((state?.gpioStates ?? []).map(g => [g.pin, g.state]));

  // Build authoritative timer duration map from pipeline-settings.
  // Keys are "pipelineName:blockIndex". Used to overlay onMs/offMs on live-state
  // timer items so the dashboard always shows the configured durations, not just
  // what the device last reported (which may lag behind a recent settings save).
  const timerSettingsMap = useMemo(() => {
    const map = new Map<string, { onMs: number; offMs: number }>();
    if (!settings || !state?.pipelineOrder) return map;
    for (const pipeline of settings.pipelines) {
      const pipelineName = state.pipelineOrder[pipeline.index];
      if (!pipelineName) continue;
      for (const block of pipeline.blocks) {
        if (block.blockType === 'timer_cycle') {
          const onMs  = (block.settings['on_duration_ms']?.value  as number) ?? 0;
          const offMs = (block.settings['off_duration_ms']?.value as number) ?? 0;
          map.set(`${pipelineName}:${block.index}`, { onMs, offMs });
        }
      }
    }
    return map;
  }, [settings, state?.pipelineOrder]);

  // Partition all telemetry items by pipeline name, preserving server-provided blockIndex.
  // Items with no pipelineName (null/undefined) bucket into '' for the "Other" panel.
  const panelMap = new Map<string, AnyItem[]>();

  const addToPanel = (name: string | null | undefined, entry: AnyItem) => {
    const key = name ?? '';
    if (!panelMap.has(key)) panelMap.set(key, []);
    panelMap.get(key)!.push(entry);
  };

  (state?.adcReadings        ?? []).forEach(item => addToPanel(item.pipelineName, { kind: 'adc',    blockIndex: item.blockIndex ?? 0, item }));
  (state?.pwmOutputs         ?? []).forEach(item => addToPanel(item.pipelineName, { kind: 'pwm',    blockIndex: item.blockIndex ?? 0, item }));

  // Build a map from power-pin GPIO → the pipeline of the sensor it powers,
  // so those GPIO cards render inside the sensor's pipeline group.
  const powerPinToAdcPipeline = new Map<number, string | null | undefined>();
  (state?.adcReadings ?? []).forEach(adc => {
    if (adc.pinPower != null && adc.pinPower >= 0) {
      powerPinToAdcPipeline.set(adc.pinPower, adc.pipelineName);
    }
  });
  (state?.gpioStates ?? []).forEach(item => {
    const adcPipeline = powerPinToAdcPipeline.get(item.pin);
    addToPanel(adcPipeline !== undefined ? adcPipeline : item.pipelineName, { kind: 'gpio', blockIndex: item.blockIndex ?? 0, item });
  });

  (state?.timerStates ?? []).forEach(item => {
    const override = timerSettingsMap.get(`${item.pipelineName}:${item.blockIndex}`);
    // Overlay configured on/off durations — device report may lag behind a recent settings save
    const overlaidItem = override ? { ...item, onMs: override.onMs, offMs: override.offMs } : item;
    addToPanel(item.pipelineName, { kind: 'timer', blockIndex: item.blockIndex ?? 0, item: overlaidItem });
  });
  (state?.peripheralReadings ?? []).forEach(item => addToPanel(item.pipelineName, { kind: 'periph', blockIndex: item.blockIndex ?? 0, item }));

  // Build ordered panel list: pipelineOrder first (server-provided ordering),
  // then any additional panels that have data but weren't in pipelineOrder.
  // This ensures telemetry items always render even if pipelineMeta is stale
  // or a reading arrives with an unexpected pipeline name.
  const pipelineOrder = state?.pipelineOrder ?? [];
  const orderedPanels: Array<{ name: string; displayName: string }> = [];
  const seenPanels = new Set<string>();
  for (const name of pipelineOrder) {
    if (panelMap.has(name)) {
      orderedPanels.push({ name, displayName: name });
      seenPanels.add(name);
    }
  }
  // Append any panels not in pipelineOrder that have data
  for (const name of panelMap.keys()) {
    if (!seenPanels.has(name)) {
      orderedPanels.push({ name, displayName: name || 'Other' });
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Dashboard</h2>
          {state?.capturedAt && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatTs(state.capturedAt, 'time')}
            </span>
          )}
          {state?.deviceTimestampUnix != null && (
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono" title="Device clock (NTP)">
              &#x1F4F6; {new Date(state.deviceTimestampUnix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {loading && <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />}
          <button
            onClick={fetchLatest}
            disabled={loading}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition"
          >
            ↻
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {!state && !loading && (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <p className="text-lg font-medium mb-2">No data yet</p>
          <p className="text-sm">The device will push its first snapshot when it checks in.</p>
        </div>
      )}

      {/* ── Pipeline panels ─────────────────────────────────────────── */}
      {state && orderedPanels.map(({ name, displayName }) => (
        <PipelinePanel
          key={name || '__other__'}
          name={displayName}
          items={panelMap.get(name) ?? []}
          capturedAt={state.capturedAt}
          gpioPinState={gpioPinState}
        />
      ))}
    </div>
  );
};

export default DashboardScreen;
