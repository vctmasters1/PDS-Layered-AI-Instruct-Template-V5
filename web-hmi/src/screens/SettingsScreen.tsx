/**
 * SettingsScreen.tsx  (renders at /devices/:id/settings)
 *
 * User-facing device settings:
 *   - Device identity (editable friendly name)
 *   - Pipeline settings — decoded from L3 binary, rendered via PipelineBlockPanel
 *     (same visual language as the PDS-Role VS Code extension centre panel)
 *   - Cloud subscription
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
import { useMeasurementSystem } from '../hooks/useMeasurementSystem';

// Visual design reference: PipelineBlockPanel replicates the centre panel of the
// PDS-Role VS Code extension (PDS-vscode-extension/role-webview.js +
// role-webview-styles.js).  Specifically:
//   • Collapsible .func-card with hue-tinted left border (8-hue cycle)
//   • .instance-var rows: monospace label | input/toggle | type/unit badge
//   • .pipelines-heading divider between pipeline groups
// The component wraps PipelineBlockPanel which mirrors those CSS patterns in
// Tailwind.  mode='settings' hides readOnly fields (pin assignments); mode='full'
// shows everything for a future pipeline editor tab.

interface CloudStatus {
  id: string;
  cloudEnabled: boolean;
  cloudSubscriptionId: string | null;
  cloudPeriodEnd: string | null;
}

const SettingsScreen: React.FC = () => {
  const { device, deviceId } = useOutletContext<DeviceHMIContext>();
  const { system: measurementSystem } = useMeasurementSystem();

  // ── Friendly name ─────────────────────────────────────────────────────────
  const [friendlyName, setFriendlyName] = useState(device.friendlyName ?? '');
  const [nameStatus, setNameStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const saveFriendlyName = async () => {
    setNameStatus('saving');
    try {
      await api.patch(`/devices/${deviceId}`, { friendlyName });
      setNameStatus('saved');
      setTimeout(() => setNameStatus('idle'), 2000);
    } catch {
      setNameStatus('error');
      setTimeout(() => setNameStatus('idle'), 3000);
    }
  };

  // ── Pipeline settings (decoded from L3 binary) ────────────────────────────
  // Server endpoint: GET/PATCH /v1/devices/:id/pipeline-settings
  // Server decodes currentPipeline (framed L1+L2+L3) using pipeline-codec.ts
  // which is a TypeScript port of PDS-Role/tools/blob_packer.py BLOCK_DEFS.
  const [pipelineSettings, setPipelineSettings] = useState<DecodedPipelineSettings | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('user');
  const [localSavedAt, setLocalSavedAt] = useState<Date | null>(
    device.settingsSavedAt ? new Date(device.settingsSavedAt) : null
  );

  // Local edits accumulate here as (pipelineIdx, blockIdx, fieldName) → value.
  // Sent as-is to PATCH /pipeline-settings — server merges with existing L3.
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
      // Mirror into pipelineSettings so the UI reflects the change immediately
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

  const handleBlockAction = async (pipelineIdx: number, blockIdx: number, action: string) => {
    if (action === 'reset_cumulative') {
      try {
        await api.post(`/devices/${deviceId}/command`, {
          type: 'reset_cumulative',
          pipelineIndex: pipelineIdx,
          blockIndex: blockIdx,
        });
      } catch {
        // non-fatal — command is best-effort
      }
    }
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

  // ── Cloud subscription ───────────────────────────────────────────────────────
  const [cloudStatus, setCloudStatus] = useState<CloudStatus | null>(null);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);

  const loadCloudStatus = useCallback(async () => {
    try {
      const statuses = await api.get<CloudStatus[]>('/cloud/status');
      const mine = statuses.find(s => s.id === deviceId) ?? null;
      setCloudStatus(mine);
    } catch { /* ignore — cloud status is non-critical */ }
  }, [deviceId]);

  useEffect(() => { loadCloudStatus(); }, [loadCloudStatus]);

  const handleSubscribe = async () => {
    setCloudLoading(true);
    setCloudMsg(null);
    try {
      const result = await api.post<CloudStatus>('/cloud/subscribe', { deviceId });
      setCloudStatus(result);
      setCloudMsg('Cloud features enabled!');
    } catch (err: any) {
      setCloudMsg(err.message || 'Subscription failed');
    } finally {
      setCloudLoading(false);
    }
  };

  const handleCancelCloud = async () => {
    if (!confirm('Cancel cloud subscription for this device? Features will remain until end of billing period.')) return;
    setCloudLoading(true);
    setCloudMsg(null);
    try {
      await api.post('/cloud/cancel', { deviceId });
      setCloudMsg('Cancellation scheduled — cloud features remain active until period end.');
      loadCloudStatus();
    } catch (err: any) {
      setCloudMsg(err.message || 'Cancellation failed');
    } finally {
      setCloudLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">

      {/* Device identity */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Device Identity</h3>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
            Friendly name
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={friendlyName}
              onChange={e => setFriendlyName(e.target.value)}
              placeholder={device.serialNumber}
              className="flex-1 px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <button
              onClick={saveFriendlyName}
              disabled={nameStatus === 'saving'}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {nameStatus === 'saving' ? 'Saving...' : nameStatus === 'saved' ? 'Saved' : nameStatus === 'error' ? 'Error' : 'Save'}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            How this device appears in My Devices. Defaults to serial number if not set.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm pt-1">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Serial number</p>
            <p className="font-mono text-gray-900 dark:text-white">{device.serialNumber}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Device type</p>
            <p className="font-mono text-gray-900 dark:text-white">{device.deviceType}</p>
          </div>
        </div>
      </div>

      {/* Cloud subscription */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Cloud Features</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              $1 / month — monitor &amp; control from anywhere with internet
            </p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            cloudStatus?.cloudEnabled
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
          }`}>
            {cloudStatus?.cloudEnabled ? 'Active' : 'Inactive'}
          </span>
        </div>

        {cloudStatus?.cloudEnabled && cloudStatus.cloudPeriodEnd && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Renews {new Date(cloudStatus.cloudPeriodEnd).toLocaleDateString()}
          </p>
        )}

        {cloudMsg && (
          <p className="text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-md">
            {cloudMsg}
          </p>
        )}

        {!cloudStatus?.cloudEnabled ? (
          <button
            onClick={handleSubscribe}
            disabled={cloudLoading}
            className="w-full py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {cloudLoading ? 'Processing…' : 'Enable Cloud Features — $1/month'}
          </button>
        ) : (
          <button
            onClick={handleCancelCloud}
            disabled={cloudLoading}
            className="text-xs text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-50"
          >
            {cloudLoading ? 'Processing…' : 'Cancel cloud subscription'}
          </button>
        )}

        <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1">
          <p>Without cloud: device must be reachable via your phone's hotspot (app required).</p>
          <p>With cloud: access from any browser, any network, anywhere.</p>
          <p className="pt-0.5">Requires a payment method on file in your PDS Marketplace account.</p>
        </div>
      </div>

      {/* Pipeline settings panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Pipeline Settings</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Editable parameters from the running pipeline's L3 binary.
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
            measurementSystem={measurementSystem}
            onChange={handleFieldChange}
            onAction={handleBlockAction}
            // ALL-STOP is shown in ControlPanel only, not here
            pipelineFilter={p => !/all.?stop/i.test(p.name ?? '')}
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

export default SettingsScreen;
