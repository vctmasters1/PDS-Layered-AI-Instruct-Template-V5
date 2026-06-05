/**
 * useDeviceTelemetry Hook
 * Manages real-time telemetry polling from device
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { PDS_web_NetworkManager } from '../network/PDS_web_wifi';
import type { TeldataPacket } from '../types/pds_telemetry';

export interface TelemetryState {
  data: TeldataPacket | null;
  loading: boolean;
  error: string | null;
  lastUpdate: number | null;
  isPolling: boolean;
  pollCount: number;
  pollErrors: number;
}

interface UseDeviceTelemetryReturn {
  state: TelemetryState;
  startPolling: (interval?: number) => void;
  stopPolling: () => void;
  setPollInterval: (interval: number) => void;
  fetchNow: () => Promise<void>;
  getTelemetryHistory: () => TeldataPacket[];
  clearHistory: () => void;
  clearError: () => void;
}

// Store telemetry history (limited to configurable size)
const HISTORY_MAX_SIZE = 300; // ~5 minutes at 1s polling
let telemetryHistory: TeldataPacket[] = [];

export const useDeviceTelemetry = (
  manager: PDS_web_NetworkManager | null
): UseDeviceTelemetryReturn => {
  const [state, setState] = useState<TelemetryState>({
    data: null,
    loading: false,
    error: null,
    lastUpdate: null,
    isPolling: false,
    pollCount: 0,
    pollErrors: 0,
  });

  const pollIntervalRef = useRef<number>(1000);
  const pollingTimeoutRef = useRef<NodeJS.Timeout>();
  const pollAbortRef = useRef<boolean>(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
      }
      pollAbortRef.current = true;
    };
  }, []);

  // Auto-stop polling when manager disconnects
  useEffect(() => {
    if (!manager) {
      stopPolling();
    }
  }, [manager]);

  const fetchNow = useCallback(async () => {
    if (!manager) {
      setState((prev) => ({
        ...prev,
        error: 'No device connected',
      }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const telemetry = await manager.getDeviceStatus();

      // Add to history (only if packet was successfully received)
      if (telemetry) {
        telemetryHistory.push(telemetry);
        if (telemetryHistory.length > HISTORY_MAX_SIZE) {
          telemetryHistory.shift();
        }
      }

      setState((prev) => ({
        ...prev,
        data: telemetry,
        loading: false,
        lastUpdate: Date.now(),
        pollCount: prev.pollCount + 1,
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to fetch telemetry';
      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMsg,
        pollErrors: prev.pollErrors + 1,
      }));
    }
  }, [manager]);

  const startPolling = useCallback(
    (interval: number = pollIntervalRef.current) => {
      pollIntervalRef.current = interval;
      pollAbortRef.current = false;

      setState((prev) => ({
        ...prev,
        isPolling: true,
      }));

      // Initial fetch
      fetchNow();

      // Set up recurring polls
      const poll = () => {
        if (!pollAbortRef.current) {
          pollingTimeoutRef.current = setTimeout(async () => {
            await fetchNow();
            poll(); // Schedule next poll
          }, interval);
        }
      };

      poll();
    },
    [fetchNow]
  );

  const stopPolling = useCallback(() => {
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
    }
    pollAbortRef.current = true;

    setState((prev) => ({
      ...prev,
      isPolling: false,
    }));
  }, []);

  const setPollInterval = useCallback(
    (interval: number) => {
      // Clamp to valid range
      const validInterval = Math.max(500, Math.min(5000, interval));
      pollIntervalRef.current = validInterval;

      // Restart polling with new interval
      if (state.isPolling) {
        stopPolling();
        startPolling(validInterval);
      }
    },
    [state.isPolling, stopPolling, startPolling]
  );

  const getTelemetryHistory = useCallback(() => {
    return [...telemetryHistory];
  }, []);

  const clearHistory = useCallback(() => {
    telemetryHistory = [];
    setState((prev) => ({
      ...prev,
      data: null,
      lastUpdate: null,
      pollCount: 0,
      pollErrors: 0,
    }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      error: null,
    }));
  }, []);

  return {
    state,
    startPolling,
    stopPolling,
    setPollInterval,
    fetchNow,
    getTelemetryHistory,
    clearHistory,
    clearError,
  };
};
