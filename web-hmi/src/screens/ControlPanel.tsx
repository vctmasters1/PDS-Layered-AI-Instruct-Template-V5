/**
 * ControlPanel.tsx
 * HMI routine controls — surfaces hmi_toggle and hmi_momentary blocks from
 * the decoded pipeline-settings as named operator-facing controls.
 *
 * hmi_toggle  → latching ON/OFF switch (writes value=true/false via PATCH /pipeline-settings)
 * hmi_momentary → momentary pulse button (writes value=true, self-clears after pulse_ms on device)
 *
 * Groups controls by pipeline name. Only enabled blocks are shown.
 * Only shown when device.lastSeenAt < 5 min (isOnline gating in DeviceHMIScreen).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../services/apiClient';
import type { DeviceHMIContext } from './DeviceHMIScreen';
import type { DecodedPipelineSettings } from '@pds/pipeline';
import PipelineBlockPanel from '../components/PipelineBlockPanel';

interface HmiBlock {
  pipelineIndex: number;
  pipelineName: string;
  blockIndex: number;
  blockType: 'hmi_toggle' | 'hmi_momentary' | 'hmi_initiate';
  displayName: string;
  /** current value field (toggle: bool, momentary/initiate: irrelevant) */
  value: boolean;
  enabled: boolean;
  /** pulse_ms for momentary blocks */
  pulseMs?: number;
}

// ── Timer blocks ─────────────────────────────────────────────────────────────

const TIMER_BLOCK_TYPES = ['timer_cycle', 'timer_countdown', 'timer_countup', 'timer_tod'] as const;
type TimerBlockType = typeof TIMER_BLOCK_TYPES[number];

interface TimerBlock {
  pipelineIndex: number;
  pipelineName: string;
  blockIndex: number;
  blockType: TimerBlockType;
  displayName: string;
  enabled: boolean;
}

function extractTimerBlocks(settings: DecodedPipelineSettings): TimerBlock[] {
  const out: TimerBlock[] = [];
  for (const pl of settings.pipelines) {
    for (const blk of pl.blocks) {
      if (!(TIMER_BLOCK_TYPES as readonly string[]).includes(blk.blockType)) continue;
      const enabled = (blk.settings['enabled']?.value as boolean) ?? true;
      out.push({
        pipelineIndex: pl.index,
        pipelineName: pl.name ?? `Pipeline ${pl.index}`,
        blockIndex: blk.index,
        blockType: blk.blockType as TimerBlockType,
        displayName: blk.displayName,
        enabled,
      });
    }
  }
  return out;
}

/** Flatten pipeline-settings into the HMI blocks the operator can interact with */
function extractHmiBlocks(settings: DecodedPipelineSettings): HmiBlock[] {
  const out: HmiBlock[] = [];
  for (const pl of settings.pipelines) {
    for (const blk of pl.blocks) {
      if (blk.blockType !== 'hmi_toggle' && blk.blockType !== 'hmi_momentary' && blk.blockType !== 'hmi_initiate') continue;
      const enabled = (blk.settings['enabled']?.value as boolean) ?? true;
      // Always show HMI control blocks regardless of enabled state — operator may need to re-enable
      out.push({
        pipelineIndex: pl.index,
        pipelineName: pl.name ?? `Pipeline ${pl.index}`,
        blockIndex: blk.index,
        blockType: blk.blockType as 'hmi_toggle' | 'hmi_momentary' | 'hmi_initiate',
        displayName: blk.displayName,
        value: (blk.settings['value']?.value as boolean) ?? false,
        enabled,
        pulseMs: blk.blockType === 'hmi_momentary'
          ? (blk.settings['pulse_ms']?.value as number) ?? 500
          : undefined,
      });
    }
  }
  return out;
}

/** True if the pipeline name matches the ALL-STOP pattern */
const isAllStopPipeline = (name: string) => /all.?stop/i.test(name);

const ControlPanel: React.FC = () => {
  const { deviceId } = useOutletContext<DeviceHMIContext>();

  const [blocks, setBlocks] = useState<HmiBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** blockKey → pending (sending to API) */
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [timerPending, setTimerPending] = useState<Record<string, boolean>>({});

  // Raw pipeline settings for the block-settings panel below
  const [pipelineSettings, setPipelineSettings] = useState<DecodedPipelineSettings | null>(null);
  const [pendingEdits, setPendingEdits] = useState<
    Array<{ index: number; blocks: Array<{ index: number; blockType: string; settings: Record<string, { value: number | boolean }> }> }>
  >([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [blockSettingsOpen, setBlockSettingsOpen] = useState(false);

  const blockKey = (b: HmiBlock) => `${b.pipelineIndex}-${b.blockIndex}`;
  const timerKey = (pipelineIndex: number, blockIndex: number) => `${pipelineIndex}-${blockIndex}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await api.get<DecodedPipelineSettings>(`/devices/${deviceId}/pipeline-settings`);
      setBlocks(extractHmiBlocks(settings));
      setPipelineSettings(settings);
      setPendingEdits([]);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  const handleFieldChange = (pipelineIdx: number, blockIdx: number, fieldName: string, value: number | boolean) => {
    setPendingEdits(prev => {
      const next = prev.map(p => ({ ...p, blocks: p.blocks.map(b => ({ ...b, settings: { ...b.settings } })) }));
      let pl = next.find(p => p.index === pipelineIdx);
      if (!pl) { pl = { index: pipelineIdx, blocks: [] }; next.push(pl); }
      let bl = pl.blocks.find(b => b.index === blockIdx);
      if (!bl) {
        const srcBlock = pipelineSettings?.pipelines[pipelineIdx]?.blocks[blockIdx];
        bl = { index: blockIdx, blockType: srcBlock?.blockType ?? '', settings: {} };
        pl.blocks.push(bl);
      }
      bl.settings[fieldName] = { value };
      setPipelineSettings(s => {
        if (!s) return s;
        const copy = JSON.parse(JSON.stringify(s)) as DecodedPipelineSettings;
        if (copy.pipelines[pipelineIdx]?.blocks[blockIdx]?.settings[fieldName]) {
          copy.pipelines[pipelineIdx].blocks[blockIdx].settings[fieldName].value = value;
        }
        return copy;
      });
      return next;
    });
  };

  const saveHmiSettings = async () => {
    if (pendingEdits.length === 0) return;
    setSaveStatus('saving');
    try {
      const result = await api.patch<{ queued: boolean; settings: DecodedPipelineSettings }>(
        `/devices/${deviceId}/pipeline-settings`,
        { pipelines: pendingEdits },
      );
      setPipelineSettings(result.settings);
      setBlocks(extractHmiBlocks(result.settings));
      setPendingEdits([]);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  /** Send an HMI state trigger via POST /command (never touches L3) */
  const sendCommand = async (b: HmiBlock, action: 'toggle' | 'trigger', newValue?: boolean) => {
    const key = blockKey(b);
    setPending(p => ({ ...p, [key]: true }));
    try {
      if (action === 'toggle') {
        await api.post(`/devices/${deviceId}/command`, {
          type: 'hmi_toggle',
          pipelineIndex: b.pipelineIndex,
          blockIndex: b.blockIndex,
          value: newValue,
        });
        setBlocks(prev => prev.map(blk =>
          blockKey(blk) === key ? { ...blk, value: newValue! } : blk
        ));
      } else {
        await api.post(`/devices/${deviceId}/command`, {
          type: b.blockType, // 'hmi_momentary' or 'hmi_initiate'
          pipelineIndex: b.pipelineIndex,
          blockIndex: b.blockIndex,
        });
      }
    } catch {
      // non-fatal — state stays as-is
    } finally {
      setPending(p => ({ ...p, [key]: false }));
    }
  };

  const handleToggle = (b: HmiBlock) => sendCommand(b, 'toggle', !b.value);

  const handleInitiate = async (b: HmiBlock) => {
    const key = blockKey(b);
    if (pending[key]) return;
    setBlocks(prev => prev.map(blk => blockKey(blk) === key ? { ...blk, value: true } : blk));
    await sendCommand(b, 'trigger');
    setTimeout(() => {
      setBlocks(prev => prev.map(blk => blockKey(blk) === key ? { ...blk, value: false } : blk));
    }, 1500);
  };

  const handleMomentary = async (b: HmiBlock) => {
    const key = blockKey(b);
    if (pending[key]) return;
    // Optimistic pulse visual
    setBlocks(prev => prev.map(blk => blockKey(blk) === key ? { ...blk, value: true } : blk));
    await sendCommand(b, 'trigger');
    setTimeout(() => {
      setBlocks(prev => prev.map(blk => blockKey(blk) === key ? { ...blk, value: false } : blk));
    }, Math.min(b.pulseMs ?? 500, 2000));
  };

  const sendForceExpire = async (pipelineIndex: number, blockIndex: number) => {
    const key = timerKey(pipelineIndex, blockIndex);
    setTimerPending(p => ({ ...p, [key]: true }));
    try {
      await api.post(`/devices/${deviceId}/command`, {
        type: 'timer_force_expire',
        pipelineIndex,
        blockIndex,
      });
    } catch {
      // non-fatal
    } finally {
      setTimerPending(p => ({ ...p, [key]: false }));
    }
  };

  // Group by pipeline — exclude ALL-STOP pipelines (shown separately)
  const byPipeline = blocks.reduce<Record<string, HmiBlock[]>>((acc, b) => {
    if (isAllStopPipeline(b.pipelineName)) return acc;
    const k = b.pipelineName;
    if (!acc[k]) acc[k] = [];
    acc[k].push(b);
    return acc;
  }, {});

  // Timer blocks for force-expire controls
  const timerBlocks = pipelineSettings ? extractTimerBlocks(pipelineSettings) : [];
  const timerByPipeline = timerBlocks.reduce<Record<string, TimerBlock[]>>((acc, t) => {
    if (!acc[t.pipelineName]) acc[t.pipelineName] = [];
    acc[t.pipelineName].push(t);
    return acc;
  }, {});

  // ALL-STOP blocks — first hmi_toggle found in any ALL-STOP pipeline
  const allStopBlock = blocks.find(
    b => isAllStopPipeline(b.pipelineName) && b.blockType === 'hmi_toggle',
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  if (blocks.length === 0 && timerBlocks.length === 0) {
    return (
      <div className="p-6 text-center py-16 text-gray-500 dark:text-gray-400">
        <p className="text-lg font-medium mb-2">No HMI controls</p>
        <p className="text-sm">Add <code className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">hmi_toggle</code>, <code className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">hmi_momentary</code>, or <code className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">hmi_initiate</code> blocks to a pipeline to create operator controls.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Control</h2>
        <button
          onClick={load}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition"
        >
          ↻
        </button>
      </div>

      {/* ━━ ALL-STOP — always shown at the top, prominent red styling ━━━━━━━━━━━━━━ */}
      {allStopBlock !== undefined ? (
        <div className={`rounded-xl border-2 p-5 flex items-center justify-between gap-4 transition-colors ${
          allStopBlock.value
            ? 'bg-red-50 dark:bg-red-900/20 border-red-500'
            : 'bg-white dark:bg-gray-800 border-red-300 dark:border-red-700'
        }`}>
          <div>
            <p className="text-base font-bold text-red-700 dark:text-red-300 leading-tight">ALL-STOP</p>
            <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">
              {allStopBlock.value ? 'Active — all pipelines suspended' : 'Tap to trigger emergency stop'}
            </p>
          </div>
          <button
            onClick={() => handleToggle(allStopBlock)}
            disabled={!!pending[blockKey(allStopBlock)]}
            aria-pressed={allStopBlock.value}
            className={`relative flex-shrink-0 w-16 h-8 rounded-full transition-colors focus:outline-none disabled:opacity-60 ${
              allStopBlock.value ? 'bg-red-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow transition-transform ${
              allStopBlock.value ? 'translate-x-8' : 'translate-x-0'
            }`} />
          </button>
        </div>
      ) : (
        /* ALL-STOP pipeline not found or has no hmi_toggle — show disabled placeholder */
        <div className="rounded-xl border-2 border-dashed border-red-200 dark:border-red-900 p-5 flex items-center gap-3 opacity-60">
          <span className="text-red-400 text-xl">⛔</span>
          <div>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">ALL-STOP not configured</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Add an <code className="font-mono text-xs">hmi_toggle</code> block to the ALL-STOP pipeline to enable this control.</p>
          </div>
        </div>
      )}

      {Object.entries(byPipeline).map(([pipelineName, pipelineBlocks]) => (
        <section key={pipelineName}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">
            {pipelineName}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pipelineBlocks.map(b => {
              const key = blockKey(b);
              const isBusy = !!pending[key];

              if (b.blockType === 'hmi_toggle') {
                const on = b.value;
                return (
                  <button
                    key={key}
                    onClick={() => handleToggle(b)}
                    disabled={isBusy}
                    className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                      on
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-400 hover:border-green-500'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-400'
                    } disabled:opacity-50`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900 dark:text-white text-sm leading-tight">{b.displayName}</p>
                      {/* Toggle pill */}
                      <div className={`flex-shrink-0 ml-3 w-11 h-6 rounded-full transition-colors ${on ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                        <div className={`mt-0.5 ml-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
                      </div>
                    </div>
                    <p className={`text-xs mt-1 ${on ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      {on ? 'ON' : 'OFF'}
                    </p>
                    {isBusy && <div className="absolute inset-0 rounded-xl flex items-center justify-center bg-white/50 dark:bg-gray-900/50"><div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" /></div>}
                  </button>
                );
              }

              // hmi_momentary
              if (b.blockType === 'hmi_momentary') {
                const fired = b.value;
                return (
                  <button
                    key={key}
                    onClick={() => handleMomentary(b)}
                    disabled={isBusy}
                    className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                      fired
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-400'
                    } disabled:opacity-50 active:scale-95`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900 dark:text-white text-sm leading-tight">{b.displayName}</p>
                      <span className={`ml-3 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold ${fired ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                        ▶
                      </span>
                    </div>
                    <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">
                      Pulse · {b.pulseMs ?? 500} ms
                    </p>
                    {isBusy && <div className="absolute inset-0 rounded-xl flex items-center justify-center bg-white/50 dark:bg-gray-900/50"><div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" /></div>}
                  </button>
                );
              }

              // hmi_initiate — confirm-style one-shot trigger
              const confirmed = b.value;
              return (
                <button
                  key={key}
                  onClick={() => handleInitiate(b)}
                  disabled={isBusy}
                  className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                    confirmed
                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-400'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-amber-400'
                  } disabled:opacity-50 active:scale-95`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900 dark:text-white text-sm leading-tight">{b.displayName}</p>
                    <span className={`ml-3 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-base font-bold ${
                      confirmed ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}>
                      ⚡
                    </span>
                  </div>
                  <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">
                    Confirm to initiate
                  </p>
                  {isBusy && <div className="absolute inset-0 rounded-xl flex items-center justify-center bg-white/50 dark:bg-gray-900/50"><div className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" /></div>}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {/* ━━ Timer Controls ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {timerBlocks.length > 0 && (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Timer Controls</h3>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">(force-expire)</span>
          </div>
          {Object.entries(timerByPipeline).map(([pipelineName, timers]) => (
            <section key={pipelineName}>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">
                {pipelineName}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {timers.map(t => {
                  const key = timerKey(t.pipelineIndex, t.blockIndex);
                  const isBusy = !!timerPending[key];
                  return (
                    <div
                      key={key}
                      className="rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-gray-900 dark:text-white text-sm leading-tight">{t.displayName}</p>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                          {t.blockType}
                        </span>
                      </div>
                      <button
                        onClick={() => sendForceExpire(t.pipelineIndex, t.blockIndex)}
                        disabled={isBusy || !t.enabled}
                        title={!t.enabled ? 'Block is disabled' : 'Force the timer to expire immediately'}
                        className="w-full py-1.5 text-xs font-medium rounded-md border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20 disabled:opacity-40 transition"
                      >
                        {isBusy ? '…' : '⏭ Force Expire'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* HMI Block Settings — collapsible section for enabled toggle, pulse_ms, etc. */}
      {pipelineSettings && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setBlockSettingsOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition"
          >
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Block Settings</span>
            <span className={`text-gray-400 text-xs transition-transform duration-150 ${blockSettingsOpen ? '' : '-rotate-90'}`}>▾</span>
          </button>
          {blockSettingsOpen && (
            <div className="p-4 space-y-4 bg-white dark:bg-gray-900/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Enable / disable HMI control blocks and adjust block parameters.
              </p>
              <PipelineBlockPanel
                data={pipelineSettings}
                mode="user"
                onChange={handleFieldChange}
                blockFilter={bt => bt.startsWith('hmi_')}
              />
              <button
                onClick={saveHmiSettings}
                disabled={saveStatus === 'saving' || pendingEdits.length === 0}
                className="w-full py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {saveStatus === 'saving' ? 'Saving...' :
                 saveStatus === 'saved'  ? 'Queued — device will apply on next poll' :
                 saveStatus === 'error'  ? 'Error — try again' :
                 pendingEdits.length > 0 ? 'Save & Queue to Device' : 'No changes'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ControlPanel;