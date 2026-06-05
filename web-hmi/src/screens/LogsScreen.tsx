/**
 * LogsScreen.tsx
 *
 * Two-tab view:
 *   1. Telemetry Archive — paginated table of cloud-archived sensor snapshots
 *   2. Config History    — list of config snapshots saved to the cloud
 *
 * Both require: a device selected + user logged in.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { api } from '../services/apiClient';
import { useTimezone } from '../hooks/useTimezone';
import { useEcUnits, convertEcValue, EC_UNIT_LABELS, EC_UNIT_DECIMALS } from '../hooks/useEcUnits';
import { useTempUnits, convertTemp, TEMP_LABELS, TEMP_DECIMALS } from '../hooks/useTempUnits';

// ── PeriphReadingCell ─────────────────────────────────────────────────────────
// Owns the reactive unit hooks so TelemetryTable itself does NOT re-render
// (and re-fetch) when the user changes their EC/temp preference.
const PeriphReadingCell: React.FC<{
  p: { pin: number; field: string; value: number; voltage?: number; label: string; alias?: string };
}> = ({ p }) => {
  const { unit: ecUnit }   = useEcUnits();
  const { unit: tempUnit } = useTempUnits();
  const isEc   = p.field === 'ec';
  const isTemp = p.field === 'temp';
  const displayVal  = isEc   ? convertEcValue(p.value, ecUnit)
                   : isTemp  ? convertTemp(p.value, tempUnit)
                   : p.value;
  const displayUnit = isEc   ? EC_UNIT_LABELS[ecUnit]
                   : isTemp  ? TEMP_LABELS[tempUnit]
                   : '';
  const decimals    = isEc   ? EC_UNIT_DECIMALS[ecUnit]
                   : isTemp  ? TEMP_DECIMALS[tempUnit]
                   : 1;
  return (
    <React.Fragment>
      <span className="text-gray-500 dark:text-gray-400 text-xs text-right">{(p.alias ?? p.label) || `${p.field}:${p.pin}`}:</span>
      <span className="font-mono text-purple-600 dark:text-purple-400 text-xs">
        {displayVal.toFixed(decimals)}
        {displayUnit && <span className="text-gray-400 text-[10px] ml-0.5">{displayUnit}</span>}
        {(p.field === 'ph' || p.field === 'ec') && p.voltage != null && (
          <span className="text-gray-400"> ({p.voltage.toFixed(2)}V)</span>
        )}
      </span>
    </React.Fragment>
  );
};

// ── Types ──────────────────────────────────────────────────────────────────

interface TelemetryRow {
  id: string;
  deviceTimestampUnix: number;
  deviceUptimeMs: number;
  packetId: number;
  statusFlags: number;
  snapshot: {
    adcReadings?:         Array<{ pin: number; calibratedValue: number; label: string; voltage: number }>;
    pwmOutputs?:          Array<{ pin: number; dutyCycle: number; label: string }>;
    gpioStates?:          Array<{ pin: number; state: number; label: string }>;
    timerStates?:         Array<{ timerId: number; active: boolean; value: number; label: string;
                                  blockType?: string | null; onMs?: number | null; offMs?: number | null;
                                  elapsedMs?: number | null }>;
    peripheralReadings?:  Array<{ pin: number; field: string; value: number; voltage?: number; label: string; alias?: string }>;
  };
  capturedAt: string;
}

/** Format milliseconds as HH:MM:SS (always shows all three segments) */
function fmtHms(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${String(h).padStart(2, '0')}:${p2(m)}:${p2(s)}`;
}

interface ConfigSnapshot {
  id: string;
  firmwareVersion: string;
  config: Record<string, unknown>;
  submittedBy: string | null;
  acknowledged: boolean;
  createdAt: string;
}

// ── Sub-components ─────────────────────────────────────────────────────────

const TelemetryTable: React.FC<{ deviceId: string }> = ({ deviceId }) => {
  const { formatTs } = useTimezone();
  const [rows, setRows] = useState<TelemetryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limit = 50;

  const fetchPage = useCallback(async (off: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<{ total: number; rows: TelemetryRow[] }>(
        `/devices/${deviceId}/telemetry?limit=${limit}&offset=${off}`
      );
      setRows(result.rows);
      setTotal(result.total);
      setOffset(off);
    } catch (e: any) {
      setError(e.message || 'Failed to load telemetry log');
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => { fetchPage(0); }, [fetchPage]);

  if (loading && rows.length === 0) return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  if (error) return (
    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
      <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
    </div>
  );

  if (rows.length === 0) return (
    <div className="text-center py-16 text-gray-500 dark:text-gray-400">
      <p className="text-lg font-medium mb-2">No archived telemetry yet</p>
      <p className="text-sm">Telemetry is pushed by the device on each check-in. Use the <strong>Sync from Device</strong> button to request an immediate push.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {total.toLocaleString()} total rows · showing {offset + 1}–{Math.min(offset + limit, total)}
        </p>
        <div className="flex gap-2">
          <button
            disabled={offset === 0 || loading}
            onClick={() => fetchPage(Math.max(0, offset - limit))}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition"
          >
            ← Prev
          </button>
          <button
            disabled={offset + limit >= total || loading}
            onClick={() => fetchPage(offset + limit)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition"
          >
            Next →
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 uppercase text-xs tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Captured</th>
              <th className="px-4 py-3 text-left">Pkt #</th>
              <th className="px-4 py-3 text-left">Uptime</th>
              <th className="px-4 py-3 text-left">ADC Readings</th>
              <th className="px-4 py-3 text-left">PWM</th>
              <th className="px-4 py-3 text-left">GPIO</th>
              <th className="px-4 py-3 text-left">Timers</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map(row => {
              const adcs   = row.snapshot?.adcReadings   ?? [];
              const pwms   = row.snapshot?.pwmOutputs    ?? [];
              const gpios  = row.snapshot?.gpioStates    ?? [];
              const timers = row.snapshot?.timerStates   ?? [];
              return (
                <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {formatTs(row.deviceTimestampUnix)}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-600 dark:text-gray-400">
                    {row.packetId}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-600 dark:text-gray-400">
                    {(row.deviceUptimeMs / 1000).toFixed(1)}s
                  </td>
                  <td className="px-4 py-3">
                    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-1">
                      {adcs.map(a => (
                        <React.Fragment key={`adc-${a.pin}`}>
                          <span className="text-gray-500 dark:text-gray-400 text-xs text-right">{a.label || `P${a.pin}`}:</span>
                          <span className="text-xs">
                            <span className="font-mono text-blue-600 dark:text-blue-400">{a.calibratedValue.toFixed(2)}</span>
                            <span className="text-gray-400"> ({a.voltage.toFixed(2)}V)</span>
                          </span>
                        </React.Fragment>
                      ))}
                      {(row.snapshot?.peripheralReadings ?? []).map(p => (
                          <PeriphReadingCell key={`periph-${p.pin}-${p.field}`} p={p} />
                        ))}
                      {adcs.length === 0 && (row.snapshot?.peripheralReadings ?? []).length === 0 && <span className="text-gray-400 text-xs col-span-2">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-1">
                      {pwms.map(p => (
                        <React.Fragment key={p.pin}>
                          <span className="text-gray-500 dark:text-gray-400 text-xs text-right">{p.label || `PWM${p.pin}`}:</span>
                          <span className="font-mono text-green-600 dark:text-green-400 text-xs">{(p.dutyCycle / 10).toFixed(1)}%</span>
                        </React.Fragment>
                      ))}
                      {pwms.length === 0 && <span className="text-gray-400 text-xs col-span-2">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-1">
                      {gpios.map(g => (
                        <React.Fragment key={g.pin}>
                          <span className="text-gray-500 dark:text-gray-400 text-xs text-right">{g.label || `GPIO${g.pin}`}:</span>
                          <span className={`font-mono text-xs ${g.state ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                            {g.state ? 'HIGH' : 'LOW'}
                          </span>
                        </React.Fragment>
                      ))}
                      {gpios.length === 0 && <span className="text-gray-400 text-xs col-span-2">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-1">
                      {timers.map(t => {
                        const isCycle = t.blockType === 'timer_cycle';
                        // Prefer device-reported elapsedMs; fall back to computed cycles × period
                        const cycleElapsedMs =
                          (t.elapsedMs != null && t.elapsedMs > 0)
                            ? t.elapsedMs
                            : (t.onMs != null && t.offMs != null)
                              ? t.value * (t.onMs + t.offMs)
                              : null;
                        return (
                          <React.Fragment key={t.timerId}>
                            <span className="text-gray-500 dark:text-gray-400 text-xs text-right">{t.label || `Timer${t.timerId}`}:</span>
                            <span className="text-xs flex items-baseline gap-1">
                              {isCycle ? (
                                <span className="flex items-baseline justify-between w-full gap-2">
                                  <span className="flex items-baseline gap-1">
                                    {cycleElapsedMs != null ? (
                                      <span className="font-mono text-blue-600 dark:text-blue-400">{fmtHms(cycleElapsedMs)}</span>
                                    ) : (
                                      <span className="font-mono text-gray-400">—</span>
                                    )}
                                  </span>
                                  <span className="font-mono text-gray-400 dark:text-gray-500 text-[10px] whitespace-nowrap">{t.value} cyc</span>
                                </span>
                              ) : (
                                <span className={`font-mono ${t.active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
                                  {fmtHms(t.value)}
                                </span>
                              )}
                              <span className={`text-[10px] font-medium px-1 rounded ${
                                t.active
                                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                              }`}>{t.active ? 'ON' : 'OFF'}</span>
                            </span>
                          </React.Fragment>
                        );
                      })}
                      {timers.length === 0 && <span className="text-gray-400 text-xs col-span-2">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-mono ${
                      row.statusFlags === 0
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                    }`}>
                      0x{row.statusFlags.toString(16).toUpperCase().padStart(2, '0')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ConfigHistoryTable: React.FC<{ deviceId: string }> = ({ deviceId }) => {
  const { formatTs } = useTimezone();
  const [snapshots, setSnapshots] = useState<ConfigSnapshot[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const limit = 20;

  const fetchPage = useCallback(async (off: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<{ total: number; snapshots: ConfigSnapshot[] }>(
        `/devices/${deviceId}/config-history?limit=${limit}&offset=${off}`
      );
      setSnapshots(result.snapshots);
      setTotal(result.total);
      setOffset(off);
    } catch (e: any) {
      setError(e.message || 'Failed to load config history');
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => { fetchPage(0); }, [fetchPage]);

  if (loading && snapshots.length === 0) return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  if (error) return (
    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
      <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
    </div>
  );

  if (snapshots.length === 0) return (
    <div className="text-center py-16 text-gray-500 dark:text-gray-400">
      <p className="text-lg font-medium mb-2">No config history yet</p>
      <p className="text-sm">Config changes are stored here when settings are saved to the cloud.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {total} snapshots · showing {offset + 1}–{Math.min(offset + limit, total)}
        </p>
        <div className="flex gap-2">
          <button disabled={offset === 0 || loading} onClick={() => fetchPage(Math.max(0, offset - limit))}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition">
            ← Prev
          </button>
          <button disabled={offset + limit >= total || loading} onClick={() => fetchPage(offset + limit)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition">
            Next →
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {snapshots.map(snap => (
          <div key={snap.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === snap.id ? null : snap.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition text-left"
            >
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${snap.acknowledged ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatTs(snap.createdAt)}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">fw {snap.firmwareVersion}</span>
                {snap.acknowledged && (
                  <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
                    ACK'd
                  </span>
                )}
              </div>
              <span className="text-gray-400 text-sm">{expanded === snap.id ? '▲' : '▼'}</span>
            </button>
            {expanded === snap.id && (
              <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
                <pre className="mt-3 text-xs bg-gray-50 dark:bg-gray-900 rounded-md p-3 overflow-auto max-h-64 text-gray-700 dark:text-gray-300">
                  {JSON.stringify(snap.config, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main screen ─────────────────────────────────────────────────────────────

type LogTab = 'telemetry' | 'config';

const LogsScreen: React.FC = () => {
  const { id: cloudDeviceId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<LogTab>('telemetry');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const handleSyncRequest = async () => {
    if (!cloudDeviceId) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const result = await api.post<{ message: string }>(`/devices/${cloudDeviceId}/sync-request`, {});
      setSyncMsg(result.message || 'Sync requested.');
    } catch (err: any) {
      setSyncMsg(`Error: ${err.message || 'Sync request failed'}`);
    } finally {
      setSyncing(false);
    }
  };

  if (!user) {
    return (
      <div className="p-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-2 font-medium">Sign in required</p>
          <p className="text-gray-500 dark:text-gray-500 text-sm">
            Cloud log archival requires a PDS account. Sign in to view telemetry history and config changes.
          </p>
        </div>
      </div>
    );
  }

  if (!cloudDeviceId) {
    return (
      <div className="p-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-2 font-medium">No device in context</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Device Logs</h2>
        <div className="flex items-center gap-3">
          {syncMsg && (
            <span className="text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">{syncMsg}</span>
          )}
          <button
            onClick={handleSyncRequest}
            disabled={syncing}
            title="Ask the device to push its locally buffered logs to the cloud"
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition"
          >
            {syncing ? 'Requesting…' : '↻ Sync from Device'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {([['telemetry', 'Telemetry Archive'], ['config', 'Config History']] as [LogTab, string][]).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'telemetry' && <TelemetryTable deviceId={cloudDeviceId} />}
      {activeTab === 'config' && <ConfigHistoryTable deviceId={cloudDeviceId} />}
    </div>
  );
};

export default LogsScreen;
