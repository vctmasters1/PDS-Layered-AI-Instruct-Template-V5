/**
 * AboutScreen.tsx  (renders at /devices/:id/about)
 *
 * Static device information panel — identity, ownership, registration date.
 * Uses outlet context from DeviceHMIScreen.
 */

import React, { useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import type { DeviceHMIContext } from './DeviceHMIScreen';
import { useTimezone } from '../hooks/useTimezone';
import { api } from '../services/apiClient';

const AboutScreen: React.FC = () => {
  const { device, deviceId } = useOutletContext<DeviceHMIContext>();
  const { formatTs } = useTimezone();
  const navigate = useNavigate();

  // Release device state
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  const handleRelease = async () => {
    setReleasing(true);
    setReleaseError(null);
    try {
      await api.post(`/devices/${deviceId}/release`, {});
      navigate('/devices');
    } catch (err: any) {
      setReleaseError(err.message || 'Release failed. Please try again.');
      setReleasing(false);
    }
  };

  // hw_code is the first segment of firmwareVersion (e.g. "C02" from "C02.0.1.017").
  // If the device hasn't checked in yet, fall back to board / hwrev.
  const hwCode = device.firmwareVersion?.split('.')[0]
    ?? (device.board ? [device.board, device.hwrev].filter(Boolean).join(' / ') : null);

  const rows: Array<{ label: string; value: string | undefined | null }> = [
    { label: 'Hardware',        value: hwCode },
    { label: 'Device type',     value: device.deviceType },
    { label: 'Display name',    value: device.displayName },
    { label: 'Device ID',       value: device.id },
    { label: 'Serial number',   value: device.serialNumber },
    { label: 'Firmware version',value: device.firmwareVersion },
    { label: 'Friendly name',   value: device.friendlyName },
    { label: 'Status',          value: device.active ? 'Active' : 'Inactive' },
    { label: 'Registered',      value: device.createdAt  ? formatTs(device.createdAt)  : undefined },
    { label: 'Last seen',       value: device.lastSeenAt ? formatTs(device.lastSeenAt) : undefined },
  ];

  const hasPipeline = device.pipelineRole || device.pipelinePushedAt;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Device Information</h3>

        <dl className="divide-y divide-gray-100 dark:divide-gray-700">
          {rows.map(({ label, value }) => (
            value != null && value !== '' ? (
              <div key={label} className="py-3 flex items-start justify-between gap-4 text-sm">
                <dt className="text-gray-500 dark:text-gray-400 shrink-0 w-36">{label}</dt>
                <dd className="font-mono text-gray-900 dark:text-white text-right break-all">{value}</dd>
              </div>
            ) : null
          ))}
        </dl>
      </div>

      {hasPipeline && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Pipeline</h3>
          <dl className="divide-y divide-gray-100 dark:divide-gray-700">
            {device.pipelineRole && (
              <div className="py-3 flex items-start justify-between gap-4 text-sm">
                <dt className="text-gray-500 dark:text-gray-400 shrink-0 w-36">Role</dt>
                <dd className="font-mono text-gray-900 dark:text-white text-right">{device.pipelineRole}</dd>
              </div>
            )}
            {device.pipelinePushedAt && (
              <div className="py-3 flex items-start justify-between gap-4 text-sm">
                <dt className="text-gray-500 dark:text-gray-400 shrink-0 w-36">Last pushed</dt>
                <dd className="text-gray-900 dark:text-white text-right">{formatTs(device.pipelinePushedAt)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-2">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Application</h3>
        <dl className="divide-y divide-gray-100 dark:divide-gray-700">
          {[
          { label: 'App name',  value: 'PDS-WEB-HMI' },
            { label: 'Version',   value: '1.0.0' },
            { label: 'Platform',  value: 'Web (React + TypeScript)' },
          ].map(({ label, value }) => (
            <div key={label} className="py-3 flex items-start justify-between gap-4 text-sm">
              <dt className="text-gray-500 dark:text-gray-400 shrink-0 w-36">{label}</dt>
              <dd className="text-gray-900 dark:text-white text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── Danger Zone ─────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-red-200 dark:border-red-900/50 p-5 space-y-3">
        <h3 className="text-base font-semibold text-red-700 dark:text-red-400">Danger Zone</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Releasing this device removes it from your account. The device will be reset to
          unclaimed state and can be re-registered by another user using a new claim code.
          Your telemetry history is preserved on the server for admin review.
        </p>

        {!confirmRelease ? (
          <button
            onClick={() => setConfirmRelease(true)}
            className="px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"
          >
            Release Device
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              Are you sure? This will remove <span className="font-mono">{device.serialNumber}</span> from your account immediately.
            </p>
            {releaseError && (
              <p className="text-sm text-red-600 dark:text-red-400">{releaseError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleRelease}
                disabled={releasing}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition"
              >
                {releasing ? 'Releasing…' : 'Yes, release this device'}
              </button>
              <button
                onClick={() => { setConfirmRelease(false); setReleaseError(null); }}
                disabled={releasing}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AboutScreen;
