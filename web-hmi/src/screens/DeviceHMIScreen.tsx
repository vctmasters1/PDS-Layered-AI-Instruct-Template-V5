/**
 * DeviceHMIScreen.tsx  (renders at /devices/:id/*)
 *
 * Layout wrapper for the per-device HMI.  Fetches the cloud device record
 * and provides it to child routes via outlet context.
 *
 * Online/offline detection uses `lastSeenAt` — a device that checked in
 * within the last 5 minutes is considered "online".
 *
 * Live tabs (Dashboard / Control / Automation) are only shown when the
 * device is online so the user isn't presented with dead UI.
 */

import React, { useEffect, useState } from 'react';
import {
  useParams,
  useNavigate,
  useLocation,
  Outlet,
  Link,
} from 'react-router-dom';
import { api } from '../services/apiClient';
import type { CloudDevice } from '../hooks/useCloudDevices';

export interface DeviceHMIContext {
  device: CloudDevice;
  deviceId: string;
}

// Short type codes — same mapping used by DeviceListScreen
const DEVICE_TYPE_CODE: Record<string, string> = {
  'aero-ctrl':        'AERO',
  'h20-chiller':      'CHIL',
  'portioning-feeder': 'FEED',
};
function typeBadge(deviceType: string): string {
  return DEVICE_TYPE_CODE[deviceType]
    ?? deviceType.split('-').map(w => w[0].toUpperCase()).join('');
}

type TabKey = 'settings' | 'logs' | 'versions' | 'preferences' | 'about' | 'dashboard' | 'control' | 'automation' | 'calibration' | 'charts';

const DeviceHMIScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [device, setDevice] = useState<CloudDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get<CloudDevice>(`/devices/${id}`)
      .then(d => setDevice(d))
      .catch(e => setFetchError(e.message || 'Device not found'))
      .finally(() => setLoading(false));
  }, [id]);

  // Background poll every 30 s — keeps firmwareVersion / lastSeenAt current
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(() => {
      api.get<CloudDevice>(`/devices/${id}`)
        .then(d => setDevice(d))
        .catch(() => {}); // silent — don't flash error on background poll
    }, 30_000);
    return () => clearInterval(interval);
  }, [id]);

  // Device is "online" if it checked in within the last 5 minutes
  const isOnline = device?.lastSeenAt
    ? Date.now() - new Date(device.lastSeenAt).getTime() < 5 * 60 * 1000
    : false;

  // Determine which tab is active from the URL
  const subPath = location.pathname.split('/').pop() as TabKey | undefined;
  const activeTab: TabKey = (['settings', 'logs', 'versions', 'preferences', 'about', 'dashboard', 'control', 'automation', 'calibration', 'charts'].includes(subPath ?? ''))
    ? (subPath as TabKey)
    : (isOnline ? 'dashboard' : 'settings');

  // Tab order: Dashboard → Control → Settings → … (live tabs first, always-visible after)
  const tabs: Array<{ key: TabKey; label: string; liveOnly?: boolean }> = ([
    { key: 'dashboard',   label: 'Dashboard',    liveOnly: true },
    { key: 'control',     label: 'Control',      liveOnly: true },
    { key: 'calibration', label: 'Calibration',  liveOnly: true },
    { key: 'settings',    label: 'Settings' },
    { key: 'logs',        label: 'Logs' },
    { key: 'charts',      label: 'Charts' },
    { key: 'versions',    label: 'Versions' },
    { key: 'preferences', label: 'Preferences' },
    { key: 'about',       label: 'About' },
    // Automation tab hidden until visual pipeline builder is implemented (FUTURE)
    // { key: 'automation',  label: 'Automation',   liveOnly: true },
  ] as Array<{ key: TabKey; label: string; liveOnly?: boolean }>).filter(t => !t.liveOnly || isOnline);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (fetchError || !device) {
    return (
      <div className="p-6 text-center space-y-3">
        <p className="text-gray-600 dark:text-gray-400">{fetchError || 'Device not found.'}</p>
        <button
          onClick={() => navigate('/devices')}
          className="text-blue-600 dark:text-blue-400 text-sm hover:underline"
        >
          ← Back to My Devices
        </button>
      </div>
    );
  }

  const badge = typeBadge(device.deviceType);
  const title = device.friendlyName || device.serialNumber;

  return (
    <div className="flex flex-col min-h-full">
      {/* ── Device header / breadcrumb ───────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2 flex-wrap">
          <Link
            to="/devices"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition"
          >
            My Devices
          </Link>
          <span className="text-gray-300 dark:text-gray-600 text-sm">/</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
            {badge}
          </span>
          {/* Online / Offline indicator */}
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
            isOnline
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
          }`}>
            {isOnline ? '● Online' : '○ Offline'}
          </span>
        </div>
      </div>

      {/* ── Sub-navigation ───────────────────────────────────────────── */}
      <nav className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 flex-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => navigate(`/devices/${id}/${tab.key}`)}
                className={`px-4 py-3 border-b-2 font-medium text-sm whitespace-nowrap transition ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ── Child route content ──────────────────────────────────────── */}
      <div className="flex-1">
        <Outlet context={{ device, deviceId: id ?? '' } satisfies DeviceHMIContext} />
      </div>
    </div>
  );
};

export default DeviceHMIScreen;
