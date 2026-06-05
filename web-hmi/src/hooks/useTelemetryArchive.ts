/**
 * useTelemetryArchive.ts
 *
 * Throttled hook that batches browser-polled telemetry samples and
 * POSTs them to WEB-HMI/api for persistent cloud archival.
 *
 * Archiving happens every ARCHIVE_EVERY_N polls (default: every 5 seconds
 * when polling at 1 Hz) so we don't hammer the API on every sample.
 *
 * Usage:
 *   const { archiveCount } = useTelemetryArchive(deviceId, telemetry, pollCount);
 */

import { useEffect, useRef, useCallback } from 'react';
import type { TeldataPacket } from '../types/pds_telemetry';
import { api } from '../services/apiClient';

/** Archive one sample to the cloud for every N polled samples. */
const ARCHIVE_EVERY_N = 5;

interface ArchiveResult {
  /** Total rows archived to the cloud this session */
  archiveCount: number;
}

export const useTelemetryArchive = (
  deviceId: string | null,
  telemetry: TeldataPacket | null,
  pollCount: number,
): ArchiveResult => {
  const archiveCountRef = useRef(0);

  const archive = useCallback(async (
    devId: string,
    packet: TeldataPacket,
  ) => {
    try {
      await api.post(`/devices/${devId}/telemetry`, {
        deviceTimestampUnix: packet.header.timestampUnix,
        deviceUptimeMs: packet.header.timestampMs,
        packetId: packet.header.packetId,
        statusFlags: packet.header.statusFlags,
        snapshot: {
          adcReadings: packet.adcReadings,
          pwmOutputs: packet.pwmOutputs,
          gpioStates: packet.gpioStates,
        },
      });
      archiveCountRef.current += 1;
    } catch {
      // Archival is best-effort — a failed POST doesn't affect live display.
    }
  }, []);

  useEffect(() => {
    if (!deviceId || !telemetry || pollCount === 0) return;
    if (pollCount % ARCHIVE_EVERY_N !== 0) return;
    archive(deviceId, telemetry);
  }, [pollCount, deviceId, telemetry, archive]);

  return { archiveCount: archiveCountRef.current };
};
