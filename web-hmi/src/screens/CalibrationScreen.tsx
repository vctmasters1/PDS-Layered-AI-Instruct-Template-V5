/**
 * CalibrationScreen.tsx  (renders at /devices/:id/calibration)
 *
 * Sensor calibration tab — shows only sensor_* block types from the decoded
 * pipeline settings.  Defaults to 'tuner' access level so calibration
 * voltages (Vmin/Vmax, scale_min/scale_max) are visible alongside user-level
 * fields (sample_interval_ms, enabled).
 *
 * This tab is device-agnostic: any pipeline that contains sensor_* blocks
 * (sensor_analog, sensor_dht22_temp, sensor_dht22_humid, or any future
 * sensor_* type) will appear here automatically.
 *
 * Uses outlet context from DeviceHMIScreen.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../services/apiClient';
import type { DeviceHMIContext } from './DeviceHMIScreen';
import PipelineBlockPanel, {
  type DecodedPipelineSettings,
  type AccessLevel,
} from '../components/PipelineBlockPanel';

const CalibrationScreen: React.FC = () => {
  const { device, deviceId } = useOutletContext<DeviceHMIContext>();

  const [pipelineSettings, setPipelineSettings] = useState<DecodedPipelineSettings | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Default to 'tuner' so calibration voltages are visible
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('tuner');
  const [localSavedAt, setLocalSavedAt] = useState<Date | null>(
    device.settingsSavedAt ? new Date(device.settingsSavedAt) : null
  );

  const [pendingEdits, setPendingEdits] = useState<
    Array<{ index: number; blocks: Array<{ index: number; blockType: string; settings: Record<string, { value: number | boolean }> }> }>
  >([]);

  const loadPipelineSettings = useCallback(async () => {
    setPipelineLoading(true);
    setPipelineError(null);
    setPendingEdits([]);
    try {
      const data = await api.get<DecodedPipelineSettings>(`/devices/${deviceId}/pipeline-settings`);
      setPipelineSettings(data);
    } catch (e: any) {
      if (e?.status === 404) {
        setPipelineError('No pipeline has been pushed to this device yet.');
      } else {
        setPipelineError(e.message || 'Could not load pipeline settings');
      }
    } finally {
      setPipelineLoading(false);
    }
  }, [deviceId]);

  useEffect(() => { loadPipelineSettings(); }, [loadPipelineSettings]);

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

  const saveSettings = async () => {
    if (pendingEdits.length === 0) return;
    setSaveStatus('saving');
    try {
      const result = await api.patch<{ queued: boolean; settings: DecodedPipelineSettings }>(
        `/devices/${deviceId}/pipeline-settings`,
        { pipelines: pendingEdits },
      );
      setPipelineSettings(result.settings);
      setPendingEdits([]);
      setSaveStatus('saved');
      setLocalSavedAt(new Date());
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Sensor Calibration</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Calibration parameters for all sensor blocks in the running pipeline.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Level selector */}
            <div className="flex rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden text-[11px] font-medium">
              {(['user', 'tuner'] as AccessLevel[]).map(lvl => (
                <button
                  key={lvl}
                  onClick={() => setAccessLevel(lvl)}
                  className={`px-2.5 py-1 transition-colors ${
                    accessLevel === lvl
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
            <button onClick={loadPipelineSettings} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Refresh
            </button>
          </div>
        </div>

        {pipelineLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
            Decoding pipeline...
          </div>
        )}

        {pipelineError && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4 italic">{pipelineError}</p>
        )}

        {pipelineSettings && !pipelineLoading && (
          <PipelineBlockPanel
            data={pipelineSettings}
            mode={accessLevel}
            onChange={handleFieldChange}
            blockFilter={bt => bt.startsWith('sensor_') && bt !== 'sensor_value'}
          />
        )}

        {pipelineSettings && !pipelineLoading && (
          <button
            onClick={saveSettings}
            disabled={saveStatus === 'saving' || pendingEdits.length === 0}
            className="w-full py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {saveStatus === 'saving' ? 'Saving...' :
             saveStatus === 'saved'  ? 'Queued — device will apply on next poll' :
             saveStatus === 'error'  ? 'Error — try again' :
             pendingEdits.length > 0 ? 'Save & Queue to Device' : 'No changes'}
          </button>
        )}

        {/* ── Settings timestamps ─────────────────────────────────────── */}
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3 grid grid-cols-2 gap-3 text-xs text-gray-500 dark:text-gray-400">
          <div>
            <p className="mb-0.5">Last Saved Settings</p>
            <p className="font-medium text-gray-700 dark:text-gray-300">
              {localSavedAt
                ? localSavedAt.toLocaleString()
                : <span className="italic">Never</span>}
            </p>
          </div>
          <div>
            <p className="mb-0.5">Settings Confirmed</p>
            <p className="font-medium text-gray-700 dark:text-gray-300">
              {device.settingsConfirmedAt
                ? new Date(device.settingsConfirmedAt).toLocaleString()
                : <span className="italic">Pending</span>}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalibrationScreen;
