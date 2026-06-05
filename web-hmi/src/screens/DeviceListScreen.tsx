/**
 * DeviceListScreen.tsx  (renders at /devices)
 *
 * "My Devices" — the application landing page.
 *
 * Sections:
 *  1. Download App banner  — links to the Android/iOS app (phone-as-relay)
 *  2. Cloud device cards   — shows online/offline status per device
 *  3. Claim Device modal   — register a new device by serial + claim code
 *
 * Online/offline detection: a device is "online" if its `lastSeenAt` is
 * within the last 5 minutes.  The device reports this on each telemetry push.
 *
 * Device card label convention:
 *   {TYPE_CODE} — {friendlyName || serialNumber}
 *   e.g. "AERO — E2E Tower"  or  "FEED — Portioning Feeder #3"
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useCloudDevices } from '../hooks/useCloudDevices';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEVICE_TYPE_CODE: Record<string, string> = {
  'aero-ctrl':        'AERO',
  'h20-chiller':      'CHIL',
  'portioning-feeder': 'FEED',
};
function typeBadge(deviceType: string): string {
  return DEVICE_TYPE_CODE[deviceType]
    ?? deviceType.split('-').map(w => w[0].toUpperCase()).join('');
}

/** Returns true if the device checked in within the last 5 minutes */
function isDeviceOnline(lastSeenAt?: string | Date | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1000;
}

// ── Component ─────────────────────────────────────────────────────────────────

const DeviceListScreen: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { devices: cloudDevices, loading: cloudLoading, error: cloudError, claimDevice } = useCloudDevices(!!user);

  // Claim modal state
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimSerial, setClaimSerial]       = useState('');
  const [claimCode, setClaimCode]           = useState('');
  const [claimName, setClaimName]           = useState('');
  const [claimError, setClaimError]         = useState<string | null>(null);
  const [claiming, setClaiming]             = useState(false);

  const openClaimModal  = () => { setClaimError(null); setShowClaimModal(true); };
  const closeClaimModal = () => { setShowClaimModal(false); setClaimSerial(''); setClaimCode(''); setClaimName(''); setClaimError(null); };

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setClaimError(null);
    setClaiming(true);
    try {
      await claimDevice(claimSerial.trim(), claimCode.trim(), claimName.trim() || undefined);
      closeClaimModal();
    } catch (err: any) {
      setClaimError(err.message || 'Claim failed. Check your serial number and claim code.');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto">

      {/* ── Download App Banner ────────────────────────────────────────── */}
      <div className="flex items-center gap-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl px-5 py-4">
        <div className="text-3xl shrink-0">📱</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-blue-900 dark:text-blue-200 text-sm">
            No cloud plan? Use the app as a local relay
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
            Connect your phone to the device's hotspot — the app lets you monitor from your phone without internet.
            Enable Cloud Features in Settings to access your device from <em>anywhere</em> with internet.
          </p>
        </div>
        <a
          href="#"
          onClick={e => { e.preventDefault(); alert('App coming soon — stay tuned!'); }}
          className="shrink-0 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Download App
        </a>
      </div>

      {/* ── My Devices ────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">My Devices</h2>
          {user && (
            <button
              onClick={openClaimModal}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
            >
              + Claim Device
            </button>
          )}
        </div>

        {/* Sign-in prompt */}
        {!user && (
          <div className="px-5 py-8 text-center space-y-3">
            <p className="text-gray-500 dark:text-gray-400 text-sm">Sign in to see your registered devices.</p>
            <button
              onClick={() => navigate('/login')}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition"
            >
              Sign In
            </button>
          </div>
        )}

        {/* Loading / error */}
        {user && cloudLoading && (
          <div className="px-5 py-6 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        )}
        {user && cloudError && (
          <div className="px-5 py-4">
            <p className="text-sm text-red-600 dark:text-red-400">{cloudError}</p>
          </div>
        )}

        {/* Empty state */}
        {user && !cloudLoading && cloudDevices.length === 0 && !cloudError && (
          <div className="px-5 py-10 text-center space-y-3">
            <p className="text-3xl">🖥️</p>
            <p className="font-semibold text-gray-700 dark:text-gray-200 text-sm">No devices yet</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs mx-auto">
              This is your hub for cloud-connected gizmos created and hosted by PipeDream Systems.{' '}
              <a
                href="https://pipedreamsystems.com"
                className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300"
              >
                Browse the marketplace
              </a>{' '}
              to find one.
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Already have a device? Click <strong>+ Claim Device</strong> above to register it.
            </p>
          </div>
        )}

        {/* Device cards */}
        {cloudDevices.length > 0 && (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {cloudDevices.map(d => {
              const badge  = typeBadge(d.deviceType);
              const title  = d.friendlyName || d.serialNumber;
              const online = isDeviceOnline(d.lastSeenAt);
              return (
                <li key={d.id}>
                  <button
                    onClick={() => navigate(`/devices/${d.id}`)}
                    className="w-full text-left px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Type badge */}
                        <span className="shrink-0 text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                          {badge}
                        </span>
                        {/* Name + meta */}
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white truncate">{title}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {d.displayName} · {d.serialNumber}
                            {d.firmwareVersion && ` · fw ${d.firmwareVersion}`}
                            {d.lastSeenAt && !online && ` · last seen ${new Date(d.lastSeenAt).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Online/offline pill */}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          online
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                        }`}>
                          {online ? '● Online' : '○ Offline'}
                        </span>
                        <span className="text-gray-400 group-hover:text-blue-500 transition">›</span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Claim Device Modal ────────────────────────────────────────── */}
      {showClaimModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) closeClaimModal(); }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Claim a Device</h2>
              <button
                onClick={closeClaimModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400">
              Find the serial number and claim code on the label inside your device or on its packaging.
            </p>

            <form onSubmit={handleClaim} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Serial Number <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  placeholder="e.g. PDAC-2025-00001"
                  value={claimSerial}
                  onChange={e => setClaimSerial(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Claim Code <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  placeholder="e.g. 5222-2RAJ"
                  value={claimCode}
                  onChange={e => setClaimCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Friendly Name <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  placeholder="e.g. Basement Tower"
                  value={claimName}
                  onChange={e => setClaimName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {claimError && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
                  {claimError}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={claiming}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {claiming ? 'Claiming…' : 'Claim Device'}
                </button>
                <button
                  type="button"
                  onClick={closeClaimModal}
                  className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceListScreen;
