/**
 * VersionScreen.tsx  (renders at /devices/:id/version)
 *
 * Shows firmware version information for the selected cloud device and
 * lets the user trigger or schedule OTA updates via the cloud API.
 * The device polls GET /pending-sync and downloads the binary autonomously —
 * no direct device IP or hostname is required.
 */

import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../services/apiClient';
import type { DeviceHMIContext } from './DeviceHMIScreen';

interface FirmwareRecord {
  id: string;
  deviceType: string;
  version: string;
  changelog: string | null;
  binarySize: number;
  sha256: string;
  active: boolean;
  releasedAt: string;
}

interface AvailableFirmwareResponse {
  deviceType: string;
  installedVersion: string;
  versions: FirmwareRecord[];
}

const VersionScreen: React.FC = () => {
  const { device } = useOutletContext<DeviceHMIContext>();

  const [available, setAvailable] = useState<FirmwareRecord[]>([]);
  const [fwLoading, setFwLoading] = useState(false);
  const [fwError, setFwError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [otaStatus, setOtaStatus] = useState<'idle' | 'triggering' | 'queued' | 'error'>('idle');
  const [otaError, setOtaError] = useState<string | null>(null);
  const [autoUpdate, setAutoUpdate] = useState<boolean>(device.autoUpdateEnabled ?? false);
  const [autoUpdateSaving, setAutoUpdateSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Poll installed version directly — outlet context device record is a one-shot fetch
  const [installedVersion, setInstalledVersion] = useState<string | null>(device.firmwareVersion ?? null);
  const [pendingOtaVersion, setPendingOtaVersion] = useState<string | null>((device as any).pendingOtaVersion ?? null);
  const [settingsSavedAt, setSettingsSavedAt] = useState<string | null>(device.settingsSavedAt ?? null);
  const [settingsConfirmedAt, setSettingsConfirmedAt] = useState<string | null>(device.settingsConfirmedAt ?? null);

  const refresh = () => {
    setFwError(null);
    setRefreshKey(k => k + 1);
  };

  useEffect(() => {
    if (!device?.id) return;
    setFwLoading(true);
    api.get<AvailableFirmwareResponse>(`/devices/${device.id}/available-firmware`)
      .then(data => {
        setAvailable(data.versions ?? []);
        // Default to the latest active version
        const latest = (data.versions ?? []).find(r => r.active) ?? data.versions?.[0];
        if (latest) setSelectedVersion(latest.version);
      })
      .catch(e => setFwError(e.message || 'Could not load firmware versions'))
      .finally(() => setFwLoading(false));
  }, [device?.id, refreshKey]);

  // Poll device record every 15 s — picks up firmwareVersion after OTA ack
  useEffect(() => {
    if (!device?.id) return;
    const poll = () => {
      api.get<{ firmwareVersion?: string; pendingOtaVersion?: string; settingsSavedAt?: string | null; settingsConfirmedAt?: string | null }>(`/devices/${device.id}`)
        .then(d => {
          if (d.firmwareVersion != null) setInstalledVersion(d.firmwareVersion);
          setPendingOtaVersion(d.pendingOtaVersion ?? null);
          if (d.settingsSavedAt !== undefined) setSettingsSavedAt(d.settingsSavedAt ?? null);
          if (d.settingsConfirmedAt !== undefined) setSettingsConfirmedAt(d.settingsConfirmedAt ?? null);
        })
        .catch(() => {});
    };
    const id = setInterval(poll, 15_000);
    return () => clearInterval(id);
  }, [device?.id]);

  const latest = available.find(r => r.active) ?? available[0] ?? null;
  const hasUpdate = latest && installedVersion && latest.version !== installedVersion;
  const pendingOta = pendingOtaVersion;

  const triggerOta = async () => {
    if (!selectedVersion) return;
    setOtaStatus('triggering');
    setOtaError(null);
    try {
      await api.post(`/devices/${device.id}/ota`, { version: selectedVersion });
      setOtaStatus('queued');
    } catch (e: any) {
      setOtaError(e.message || 'OTA request failed');
      setOtaStatus('error');
    }
  };

  const toggleAutoUpdate = async (enabled: boolean) => {
    setAutoUpdateSaving(true);
    try {
      await api.patch(`/devices/${device.id}`, { autoUpdateEnabled: enabled });
      setAutoUpdate(enabled);
    } catch (e: any) {
      // Revert on failure
      setAutoUpdate(!enabled);
    } finally {
      setAutoUpdateSaving(false);
    }
  };

  const selectedRecord = available.find(r => r.version === selectedVersion) ?? null;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">

      {/* ── Installed firmware ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Installed Firmware</h3>
          <button
            onClick={refresh}
            disabled={fwLoading}
            className="text-xs px-2.5 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition"
          >
            {fwLoading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Device type</p>
            <p className="font-mono text-gray-900 dark:text-white">{device.deviceType}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Installed version</p>
            <p className="font-mono text-gray-900 dark:text-white">
              {installedVersion || <span className="text-gray-400 italic">unknown</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Serial number</p>
            <p className="font-mono text-gray-900 dark:text-white">{device.serialNumber}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Cloud device ID</p>
            <p className="font-mono text-xs text-gray-500 dark:text-gray-400 truncate">{device.id}</p>
          </div>
        </div>

        {/* ── Settings timestamps ─────────────────────────────────────── */}
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3 grid grid-cols-2 gap-3 text-xs text-gray-500 dark:text-gray-400">
          <div>
            <p className="mb-0.5">Last Saved Settings</p>
            <p className="font-medium text-gray-700 dark:text-gray-300">
              {settingsSavedAt
                ? new Date(settingsSavedAt).toLocaleString()
                : <span className="italic">Never</span>}
            </p>
          </div>
          <div>
            <p className="mb-0.5">Settings Confirmed</p>
            <p className="font-medium text-gray-700 dark:text-gray-300">
              {settingsConfirmedAt
                ? new Date(settingsConfirmedAt).toLocaleString()
                : <span className="italic">Pending</span>}
            </p>
          </div>
        </div>
      </div>

      {/* ── Available firmware ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Available Firmware</h3>

        {fwLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
            Checking firmware server…
          </div>
        )}
        {fwError && <p className="text-sm text-red-600 dark:text-red-400">{fwError}</p>}
        {!fwLoading && !fwError && available.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">No firmware found for this device type.</p>
        )}

        {available.length > 0 && (
          <div className="space-y-3">
            {/* Version picker */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Select version</label>
              <select
                value={selectedVersion}
                onChange={e => setSelectedVersion(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {available.map(fw => (
                  <option key={fw.version} value={fw.version}>
                    {fw.version}{fw.active ? ' (latest)' : ''}{fw.version === device.firmwareVersion ? ' — installed' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Selected version details */}
            {selectedRecord && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Released</p>
                  <p className="text-gray-900 dark:text-white">{new Date(selectedRecord.releasedAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Binary size</p>
                  <p className="font-mono text-gray-900 dark:text-white">{(selectedRecord.binarySize / 1024).toFixed(1)} KB</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">SHA-256</p>
                  <p className="font-mono text-xs text-gray-500 dark:text-gray-400 break-all">{selectedRecord.sha256}</p>
                </div>
                {selectedRecord.changelog && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Changelog</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{selectedRecord.changelog}</p>
                  </div>
                )}
              </div>
            )}

            {/* Status badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {hasUpdate && selectedVersion === latest?.version && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                  Update available
                </span>
              )}
              {!hasUpdate && installedVersion && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  Up to date
                </span>
              )}
              {pendingOta && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  ⏳ OTA pending: {pendingOta}
                </span>
              )}
            </div>

            {/* OTA trigger */}
            {otaStatus === 'queued' ? (
              <div className="rounded-md bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-700 px-4 py-3">
                <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                  ✓ Update queued — device will download {selectedVersion} on its next poll cycle (within ~2.5 min).
                </p>
              </div>
            ) : (
              <div className="flex gap-2 items-center">
                <button
                  disabled={!selectedVersion || selectedVersion === installedVersion || otaStatus === 'triggering'}
                  onClick={triggerOta}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 transition font-medium"
                >
                  {otaStatus === 'triggering' ? 'Sending…' : `Install ${selectedVersion || '…'}`}
                </button>
                {selectedVersion === installedVersion && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">Already installed</span>
                )}
              </div>
            )}
            {otaError && <p className="text-sm text-red-600 dark:text-red-400">{otaError}</p>}
          </div>
        )}
      </div>

      {/* ── Auto-update ───────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Automatic Updates</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              When enabled, the cloud automatically queues the latest active firmware whenever the device checks in and a newer version is available.
            </p>
          </div>
          <button
            disabled={autoUpdateSaving}
            onClick={() => toggleAutoUpdate(!autoUpdate)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0 mt-0.5 ${
              autoUpdate ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
            } disabled:opacity-50`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                autoUpdate ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

    </div>
  );
};

export default VersionScreen;
