/**
 * ChartsScreen.tsx
 *
 * Historical telemetry charts for a device.
 * - Fetches up to 500 rows (server hard cap) for the selected time window.
 * - Groups series by type: ADC, PWM, GPIO, Peripherals.
 * - Group master toggle + per-series checkbox; a line only renders when BOTH are on.
 * - Mouse-wheel zoom centered on cursor; click-drag ReferenceArea zoom; Reset Zoom button.
 * - Bottom Brush for panning within the loaded window.
 * - EC/temp values converted to user preferences in tooltips and Y-axis.
 */

import React, {
  useEffect, useState, useCallback, useRef, useMemo,
} from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Brush, ReferenceArea, ResponsiveContainer,
} from 'recharts';
import { api } from '../services/apiClient';
import type { DeviceHMIContext } from './DeviceHMIScreen';
import { useEcUnits, convertEcValue, EC_UNIT_LABELS } from '../hooks/useEcUnits';
import { useTempUnits, convertTemp, TEMP_LABELS } from '../hooks/useTempUnits';

// ── Color palette ─────────────────────────────────────────────────────────────

const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#e11d48', '#a78bfa', '#34d399', '#fbbf24',
];

// ── Types ─────────────────────────────────────────────────────────────────────

type GroupKey = 'adc' | 'pwm' | 'gpio' | 'periph';

interface SeriesMeta {
  key: string;
  group: GroupKey;
  label: string;
  color: string;
  unit: string;
  field?: string; // for periph: 'ec' | 'temp' | 'humid' | 'ph'
}

type ChartPoint = { t: number } & Record<string, number | undefined>;

interface TelemetryRow {
  id: string;
  deviceTimestampUnix: number;
  snapshot: {
    adcReadings?:        Array<{ pin: number; calibratedValue: number; voltage: number; label: string; alias?: string }>;
    pwmOutputs?:         Array<{ pin: number; dutyCycle: number; label: string }>;
    gpioStates?:         Array<{ pin: number; state: number; label: string }>;
    peripheralReadings?: Array<{ pin: number; field: string; value: number; voltage?: number; label: string; alias?: string }>;
  };
}

type TimeRange = '1h' | '6h' | '24h' | '7d';

const RANGE_LABELS: Record<TimeRange, string> = {
  '1h': 'Last 1 hour',
  '6h': 'Last 6 hours',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
};

const RANGE_MS: Record<TimeRange, number> = {
  '1h':  1 * 60 * 60 * 1000,
  '6h':  6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7 * 24 * 60 * 60 * 1000,
};

const GROUP_LABELS: Record<GroupKey, string> = {
  adc:   'ADC Readings',
  pwm:   'PWM Outputs',
  gpio:  'GPIO States',
  periph:'Peripherals',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function assignColors(keys: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  keys.forEach((k, i) => { map[k] = PALETTE[i % PALETTE.length]; });
  return map;
}

function formatXTick(t: number, rangeMs: number): string {
  const d = new Date(t * 1000);
  if (rangeMs <= RANGE_MS['6h']) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  if (rangeMs <= RANGE_MS['24h']) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// ── Main Component ────────────────────────────────────────────────────────────

const ChartsScreen: React.FC = () => {
  const { deviceId } = useOutletContext<DeviceHMIContext>();
  const { unit: ecUnit }   = useEcUnits();
  const { unit: tempUnit } = useTempUnits();

  const [timeRange, setTimeRange]   = useState<TimeRange>('6h');
  const [rows, setRows]             = useState<TelemetryRow[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const [series, setSeries]         = useState<SeriesMeta[]>([]);
  const [groupEnabled, setGroupEnabled] = useState<Record<GroupKey, boolean>>({
    adc: true, pwm: true, gpio: false, periph: true,
  });
  const [seriesEnabled, setSeriesEnabled] = useState<Record<string, boolean>>({});

  // Zoom state (unix seconds)
  const [viewLeft,  setViewLeft]  = useState<number | null>(null);
  const [viewRight, setViewRight] = useState<number | null>(null);

  // Drag-to-zoom state
  const [refAreaLeft,  setRefAreaLeft]  = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
  const [isDragging,   setIsDragging]   = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);

  // ── Fetch telemetry ─────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sinceMs  = Date.now() - RANGE_MS[timeRange];
      const sinceIso = new Date(sinceMs).toISOString();
      const result = await api.get<{ total: number; rows: TelemetryRow[] }>(
        `/devices/${deviceId}/telemetry?limit=500&offset=0&since=${encodeURIComponent(sinceIso)}`
      );
      // API returns newest-first; reverse for chronological chart order
      setRows([...result.rows].reverse());
      setTotal(result.total);
    } catch (e: any) {
      setError(e.message || 'Failed to load telemetry');
    } finally {
      setLoading(false);
    }
  }, [deviceId, timeRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset zoom whenever data or range changes
  useEffect(() => {
    setViewLeft(null);
    setViewRight(null);
    setRefAreaLeft(null);
    setRefAreaRight(null);
  }, [rows]);

  // ── Build chart data + series metadata ──────────────────────────────────────

  const { chartData, allSeries } = useMemo(() => {
    if (rows.length === 0) return { chartData: [], allSeries: [] };

    // Discover all series keys from first non-empty row of each type
    const adcKeys:   Map<string, string> = new Map(); // key → label
    const pwmKeys:   Map<string, string> = new Map();
    const gpioKeys:  Map<string, string> = new Map();
    const periphKeys:Map<string, { label: string; field: string }> = new Map();

    for (const row of rows) {
      const s = row.snapshot;
      s.adcReadings?.forEach(a => {
        const k = `adc_${a.pin}`;
        if (!adcKeys.has(k)) adcKeys.set(k, a.alias ?? a.label ?? `ADC P${a.pin}`);
      });
      s.pwmOutputs?.forEach(p => {
        const k = `pwm_${p.pin}`;
        if (!pwmKeys.has(k)) pwmKeys.set(k, p.label ?? `PWM P${p.pin}`);
      });
      s.gpioStates?.forEach(g => {
        const k = `gpio_${g.pin}`;
        if (!gpioKeys.has(k)) gpioKeys.set(k, g.label ?? `GPIO P${g.pin}`);
      });
      s.peripheralReadings?.forEach(p => {
        const k = `periph_${p.pin}_${p.field}`;
        if (!periphKeys.has(k)) periphKeys.set(k, { label: p.alias ?? p.label ?? p.field, field: p.field });
      });
    }

    // Build ordered series list with colors
    const allKeys = [
      ...adcKeys.keys(),
      ...pwmKeys.keys(),
      ...gpioKeys.keys(),
      ...periphKeys.keys(),
    ];
    const colorMap = assignColors(allKeys);

    const buildSeries = (): SeriesMeta[] => [
      ...[...adcKeys.entries()].map(([k, label]) => ({
        key: k, group: 'adc' as GroupKey, label, color: colorMap[k], unit: '',
      })),
      ...[...pwmKeys.entries()].map(([k, label]) => ({
        key: k, group: 'pwm' as GroupKey, label, color: colorMap[k], unit: '%',
      })),
      ...[...gpioKeys.entries()].map(([k, label]) => ({
        key: k, group: 'gpio' as GroupKey, label, color: colorMap[k], unit: '',
      })),
      ...[...periphKeys.entries()].map(([k, { label, field }]) => ({
        key: k, group: 'periph' as GroupKey, label, color: colorMap[k], unit: '', field,
      })),
    ];

    const computedSeries = buildSeries();

    // Flatten rows to chart points with unit conversions applied
    const points: ChartPoint[] = rows.map(row => {
      const pt: ChartPoint = { t: row.deviceTimestampUnix };
      const s = row.snapshot;
      s.adcReadings?.forEach(a => {
        pt[`adc_${a.pin}`] = a.calibratedValue;
      });
      s.pwmOutputs?.forEach(p => {
        pt[`pwm_${p.pin}`] = p.dutyCycle;
      });
      s.gpioStates?.forEach(g => {
        pt[`gpio_${g.pin}`] = g.state;
      });
      s.peripheralReadings?.forEach(p => {
        const k = `periph_${p.pin}_${p.field}`;
        let v = p.value;
        if (p.field === 'ec')   v = convertEcValue(v, ecUnit);
        if (p.field === 'temp') v = convertTemp(v, tempUnit);
        pt[k] = v;
      });
      return pt;
    });

    return { chartData: points, allSeries: computedSeries };
  }, [rows, ecUnit, tempUnit]);

  // Sync series metadata → enable map (preserve user toggles across re-renders)
  useEffect(() => {
    if (allSeries.length === 0) return;
    setSeries(allSeries);
    setSeriesEnabled(prev => {
      const next = { ...prev };
      allSeries.forEach(s => {
        if (!(s.key in next)) next[s.key] = true; // default on
      });
      return next;
    });
  }, [allSeries]);

  // ── Zoom handlers ────────────────────────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (chartData.length < 2) return;
    e.preventDefault();

    const dataMin = chartData[0].t;
    const dataMax = chartData[chartData.length - 1].t;
    const left  = viewLeft  ?? dataMin;
    const right = viewRight ?? dataMax;
    const span  = right - left;

    // Determine cursor position as fraction (0..1) of chart area
    const rect = chartContainerRef.current?.getBoundingClientRect();
    const marginLeft  = 70; // approximate recharts left margin
    const marginRight = 20;
    let fraction = 0.5;
    if (rect) {
      const chartW = rect.width - marginLeft - marginRight;
      const relX   = e.clientX - rect.left - marginLeft;
      fraction = Math.max(0, Math.min(1, relX / chartW));
    }

    const factor = e.deltaY > 0 ? 1.25 : 0.8; // zoom out / in
    const newSpan  = span * factor;
    const center   = left + fraction * span;
    const newLeft  = Math.max(dataMin, center - fraction * newSpan);
    const newRight = Math.min(dataMax, newLeft + newSpan);

    setViewLeft(newLeft);
    setViewRight(newRight);
  }, [chartData, viewLeft, viewRight]);

  const handleMouseDown = useCallback((e: any) => {
    if (!e || e.activeLabel == null) return;
    setRefAreaLeft(Number(e.activeLabel));
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: any) => {
    if (!isDragging || !e || e.activeLabel == null) return;
    setRefAreaRight(Number(e.activeLabel));
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    if (refAreaLeft != null && refAreaRight != null && refAreaLeft !== refAreaRight) {
      const l = Math.min(refAreaLeft, refAreaRight);
      const r = Math.max(refAreaLeft, refAreaRight);
      setViewLeft(l);
      setViewRight(r);
    }
    setRefAreaLeft(null);
    setRefAreaRight(null);
  }, [isDragging, refAreaLeft, refAreaRight]);

  const resetZoom = () => {
    setViewLeft(null);
    setViewRight(null);
  };

  // ── Filter chart data to current view domain ─────────────────────────────────

  const visibleData = useMemo(() => {
    if (!viewLeft && !viewRight) return chartData;
    const l = viewLeft  ?? -Infinity;
    const r = viewRight ??  Infinity;
    return chartData.filter(pt => pt.t >= l && pt.t <= r);
  }, [chartData, viewLeft, viewRight]);

  // ── Tooltip ──────────────────────────────────────────────────────────────────

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: any }) => {
    if (!active || !payload || !label) return null;
    const d = new Date(Number(label) * 1000);
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-3 text-xs max-w-xs">
        <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">
          {d.toLocaleString()}
        </p>
        <div className="space-y-0.5">
          {payload.map((entry: any) => {
            if (entry.value == null) return null;
            const s = series.find(s => s.key === entry.dataKey);
            let unit = s?.unit ?? '';
            if (s?.field === 'ec')   unit = EC_UNIT_LABELS[ecUnit];
            if (s?.field === 'temp') unit = TEMP_LABELS[tempUnit];
            return (
              <div key={entry.dataKey as string} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-none" style={{ background: entry.color }} />
                <span className="text-gray-600 dark:text-gray-300 flex-1">{entry.name}</span>
                <span className="font-mono text-gray-900 dark:text-white">
                  {Number(entry.value).toFixed(2)}{unit && <span className="text-gray-400 ml-0.5">{unit}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const hasZoom = viewLeft != null || viewRight != null;
  const groupedSeries = (Object.keys(GROUP_LABELS) as GroupKey[]).map(g => ({
    group: g,
    label: GROUP_LABELS[g],
    items: series.filter(s => s.group === g),
  })).filter(g => g.items.length > 0);

  const xDomain: [number, number] | undefined =
    (viewLeft != null && viewRight != null) ? [viewLeft, viewRight] : undefined;

  return (
    <div className="p-4 max-w-full space-y-4">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Time range:</span>
        <div className="flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
          {(Object.keys(RANGE_LABELS) as TimeRange[]).map(r => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                timeRange === r
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition"
        >
          {loading ? 'Loading…' : '↺ Refresh'}
        </button>
        {hasZoom && (
          <button
            onClick={resetZoom}
            className="px-3 py-1.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border border-orange-300 dark:border-orange-700 rounded-md hover:bg-orange-200 dark:hover:bg-orange-900/50 transition"
          >
            ✕ Reset Zoom
          </button>
        )}
        <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
          {rows.length} points loaded
          {total > 500 && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">
              · {total.toLocaleString()} total — narrow range for full coverage
            </span>
          )}
        </span>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {rows.length === 0 && !loading && !error && (
        <div className="text-center py-20 text-gray-500 dark:text-gray-400">
          <p className="text-lg font-medium mb-1">No telemetry in this window</p>
          <p className="text-sm">Try a wider time range or wait for the device to check in.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* ── Series Selector sidebar ────────────────────────────────── */}
          <div className="lg:w-56 flex-none">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Series
              </p>
              {groupedSeries.map(({ group, label, items }) => (
                <div key={group} className="space-y-1">
                  {/* Group toggle */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={groupEnabled[group]}
                      onChange={e => setGroupEnabled(prev => ({ ...prev, [group]: e.target.checked }))}
                      className="w-3.5 h-3.5 rounded accent-blue-600"
                    />
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                      {label}
                    </span>
                  </label>
                  {/* Per-series checkboxes */}
                  <div className="ml-5 space-y-0.5">
                    {items.map(s => (
                      <label
                        key={s.key}
                        className={`flex items-center gap-2 cursor-pointer select-none ${
                          !groupEnabled[group] ? 'opacity-40 pointer-events-none' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={seriesEnabled[s.key] ?? true}
                          onChange={e => setSeriesEnabled(prev => ({ ...prev, [s.key]: e.target.checked }))}
                          className="w-3 h-3 rounded"
                          style={{ accentColor: s.color }}
                        />
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-none"
                          style={{ background: s.color }}
                        />
                        <span className="text-xs text-gray-600 dark:text-gray-300 truncate" title={s.label}>
                          {s.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
              Scroll wheel to zoom · Drag chart to select region · Use Brush below to pan
            </p>
          </div>

          {/* ── Chart ──────────────────────────────────────────────────── */}
          <div
            className="flex-1 min-w-0"
            ref={chartContainerRef}
            onWheel={handleWheel}
            style={{ userSelect: 'none' }}
          >
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <ResponsiveContainer width="100%" height={420}>
                <ComposedChart
                  data={visibleData}
                  margin={{ top: 10, right: 20, left: 50, bottom: 10 }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={xDomain ?? ['dataMin', 'dataMax']}
                    tickFormatter={t => formatXTick(t, RANGE_MS[timeRange])}
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    tickLine={false}
                    width={45}
                  />
                  <Tooltip content={<CustomTooltip />} />

                  {/* Drag-to-zoom reference area */}
                  {isDragging && refAreaLeft != null && refAreaRight != null && (
                    <ReferenceArea
                      x1={Math.min(refAreaLeft, refAreaRight)}
                      x2={Math.max(refAreaLeft, refAreaRight)}
                      fill="#3b82f6"
                      fillOpacity={0.15}
                      stroke="#3b82f6"
                      strokeOpacity={0.4}
                    />
                  )}

                  {/* One Line per visible series */}
                  {series.map(s => {
                    const visible = groupEnabled[s.group] && (seriesEnabled[s.key] ?? true);
                    return (
                      <Line
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.label}
                        stroke={s.color}
                        strokeWidth={visible ? 1.5 : 0}
                        dot={false}
                        activeDot={visible ? { r: 3 } : false}
                        isAnimationActive={false}
                        connectNulls
                        legendType={visible ? 'line' : 'none'}
                        hide={!visible}
                      />
                    );
                  })}

                  {/* Brush for panning */}
                  <Brush
                    dataKey="t"
                    height={24}
                    travellerWidth={8}
                    tickFormatter={t => formatXTick(t, RANGE_MS[timeRange])}
                    fill="#f9fafb"
                    stroke="#d1d5db"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartsScreen;
