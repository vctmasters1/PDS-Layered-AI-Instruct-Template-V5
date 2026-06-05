/**
 * useOtaUpdate.ts
 *
 * Manages OTA firmware update flow:
 *  1. Query WEB-FwServer for latest available firmware for a device type.
 *  2. Compare against the device's current firmware version.
 *  3. Trigger the update: POST /ota/trigger to the physical device's HTTPS API,
 *     which causes the device to pull the binary from WEB-FwServer and apply it.
 *
 * The device HTTPS endpoint is reached directly (local WiFi, port 8443).
 */

import { useState, useCallback } from 'react';
import { api } from '../services/apiClient';

export interface FirmwareVersion {
  id: string;
  version: string;
  deviceType: string;
  changelog: string | null;
  binarySize: number;
  sha256: string;
  active: boolean;
  releasedAt: string;
}

interface OtaState {
  checking: boolean;
  triggering: boolean;
  available: FirmwareVersion | null;
  error: string | null;
  success: boolean;
}

interface UseOtaUpdateReturn extends OtaState {
  checkForUpdate: (deviceType: string, currentVersion: string) => Promise<void>;
  triggerOta: (deviceIpOrHostname: string, port?: number) => Promise<void>;
  clearOtaError: () => void;
}

export const useOtaUpdate = (): UseOtaUpdateReturn => {
  const [state, setState] = useState<OtaState>({
    checking: false,
    triggering: false,
    available: null,
    error: null,
    success: false,
  });

  const checkForUpdate = useCallback(async (
    deviceType: string,
    currentVersion: string,
  ) => {
    setState(s => ({ ...s, checking: true, error: null, available: null, success: false }));
    try {
      const versions = await api.get<FirmwareVersion[]>(`/firmware/${encodeURIComponent(deviceType)}`);
      // Versions are returned newest-first from the server.
      // Find the latest active version that is newer than currentVersion.
      const latest = versions.find(v => v.active);
      if (latest && latest.version !== currentVersion) {
        setState(s => ({ ...s, checking: false, available: latest }));
      } else {
        setState(s => ({ ...s, checking: false, available: null }));
      }
    } catch (err: any) {
      setState(s => ({ ...s, checking: false, error: err.message || 'Failed to check for updates' }));
    }
  }, []);

  const triggerOta = useCallback(async (
    deviceIpOrHostname: string,
    port = 8443,
  ) => {
    if (!state.available) return;
    setState(s => ({ ...s, triggering: true, error: null, success: false }));

    try {
      // Tell the device to pull the new firmware from WEB-FwServer.
      // The device firmware handles the actual HTTPS download + OTA partition write.
      const url = `https://${deviceIpOrHostname}:${port}/ota/trigger`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: state.available.version,
          sha256: state.available.sha256,
        }),
        // Device uses a self-signed cert — not avoidable in the browser without user trust.
        // In practice the user will have already accepted the cert when navigating directly.
      });

      if (!response.ok) {
        throw new Error(`Device returned HTTP ${response.status}`);
      }

      setState(s => ({ ...s, triggering: false, success: true }));
    } catch (err: any) {
      setState(s => ({
        ...s,
        triggering: false,
        error: err.message || 'OTA trigger failed',
      }));
    }
  }, [state.available]);

  const clearOtaError = useCallback(() => {
    setState(s => ({ ...s, error: null }));
  }, []);

  return { ...state, checkForUpdate, triggerOta, clearOtaError };
};
