/**
 * useCloudDevices.ts
 * Fetches and manages the list of devices registered to the logged-in user
 * via GET /v1/devices/mine on WEB-HMI/api.
 *
 * Returns an empty list (not an error) when the user is not logged in.
 */

import { useState, useCallback, useEffect } from 'react';
import { api } from '../services/apiClient';

export interface CloudDevice {
  id: string;
  deviceType: string;
  displayName: string;
  serialNumber: string;
  friendlyName: string | null;
  firmwareVersion: string;
  board: string | null;
  hwrev: string | null;
  active: boolean;
  lastSeenAt: string | null;
  hasPendingConfig: boolean;
  createdAt: string;
  pipelineRole: string | null;
  pipelinePushedAt: string | null;
  pipelineNames: string[] | null;
  settingsSavedAt: string | null;
  settingsConfirmedAt: string | null;
  autoUpdateEnabled: boolean;
}

interface UseCloudDevicesReturn {
  devices: CloudDevice[];
  loading: boolean;
  error: string | null;
  fetchDevices: () => Promise<void>;
  claimDevice: (serialNumber: string, claimCode: string, friendlyName?: string) => Promise<void>;
}

export const useCloudDevices = (loggedIn: boolean): UseCloudDevicesReturn => {
  const [devices, setDevices] = useState<CloudDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<CloudDevice[]>('/devices/mine');
      setDevices(result);
    } catch (err: any) {
      if (err.status === 401) {
        setDevices([]); // not logged in — silent
      } else {
        setError(err.message || 'Failed to load devices');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const claimDevice = useCallback(async (
    serialNumber: string,
    claimCode: string,
    friendlyName?: string,
  ) => {
    await api.post('/devices/register', { serialNumber, claimCode, friendlyName });
    await fetchDevices();
  }, [fetchDevices]);

  // Auto-fetch when the user logs in
  useEffect(() => {
    if (loggedIn) fetchDevices();
    else setDevices([]);
  }, [loggedIn, fetchDevices]);

  return { devices, loading, error, fetchDevices, claimDevice };
};
