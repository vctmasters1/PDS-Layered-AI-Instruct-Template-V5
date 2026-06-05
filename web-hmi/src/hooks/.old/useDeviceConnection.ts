/**
 * useDeviceConnection Hook
 * Manages WiFi and BLE device connection state
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  PDS_web_NetworkManager,
  PDS_web_ble_Manager,
  PDS_web_wifi_Discovery,
} from '../network/PDS_web_wifi';

export interface ConnectionState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  connectionMode: 'direct' | 'internet' | 'ble' | null;
  deviceIp?: string;
  deviceHostname?: string;
  gatewayUrl?: string;
  lastConnectTime?: number;
  uptime?: number;
}

interface UseDeviceConnectionReturn {
  state: ConnectionState;
  manager: PDS_web_NetworkManager | null;
  bleManager: PDS_web_ble_Manager | null;

  // Connection methods
  connectDirect: (ip: string, port?: number) => Promise<void>;
  connectViaHostname: (hostname: string, port?: number) => Promise<void>;
  connectInternet: (gatewayUrl: string) => Promise<void>;
  disconnect: () => Promise<void>;
  testConnection: () => Promise<boolean>;

  // Discovery methods
  discoverViaMdns: () => Promise<Array<{ ip: string; hostname: string }>>;
  discoverViaBle: () => Promise<any[]>;

  // Reset
  clearError: () => void;
}

export const useDeviceConnection = (): UseDeviceConnectionReturn => {
  const [state, setState] = useState<ConnectionState>({
    connected: false,
    connecting: false,
    error: null,
    connectionMode: null,
  });

  const managerRef = useRef<PDS_web_NetworkManager | null>(null);
  const bleManagerRef = useRef<PDS_web_ble_Manager | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout>();

  // Initialize managers
  useEffect(() => {
    bleManagerRef.current = new PDS_web_ble_Manager();
    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
    };
  }, []);

  const connectDirect = useCallback(async (ip: string, port: number = 8443) => {
    setState((prev) => ({ ...prev, connecting: true, error: null }));

    try {
      const manager = new PDS_web_NetworkManager({ ipAddress: ip, port });
      managerRef.current = manager;

      // Test connection
      await manager.ping();

      setState((prev) => ({
        ...prev,
        connected: true,
        connecting: false,
        connectionMode: 'direct',
        deviceIp: ip,
        lastConnectTime: Date.now(),
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Connection failed';
      setState((prev) => ({
        ...prev,
        connected: false,
        connecting: false,
        error: errorMsg,
      }));
      throw error;
    }
  }, []);

  const connectViaHostname = useCallback(
    async (hostname: string, port: number = 8443) => {
      setState((prev) => ({ ...prev, connecting: true, error: null }));

      try {
        // Try to resolve hostname
        const manager = new PDS_web_NetworkManager({ ipAddress: hostname, port });
        managerRef.current = manager;

        // Test connection
        await manager.ping();

        setState((prev) => ({
          ...prev,
          connected: true,
          connecting: false,
          connectionMode: 'direct',
          deviceHostname: hostname,
          lastConnectTime: Date.now(),
        }));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Connection failed';
        setState((prev) => ({
          ...prev,
          connected: false,
          connecting: false,
          error: errorMsg,
        }));
        throw error;
      }
    },
    []
  );

  const connectInternet = useCallback(async (gatewayUrl: string) => {
    setState((prev) => ({ ...prev, connecting: true, error: null }));

    try {
      const manager = new PDS_web_NetworkManager({ gatewayUrl });
      managerRef.current = manager;

      // Test connection
      await manager.ping();

      setState((prev) => ({
        ...prev,
        connected: true,
        connecting: false,
        connectionMode: 'internet',
        gatewayUrl,
        lastConnectTime: Date.now(),
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Connection failed';
      setState((prev) => ({
        ...prev,
        connected: false,
        connecting: false,
        error: errorMsg,
      }));
      throw error;
    }
  }, []);

  const disconnect = useCallback(async () => {
    managerRef.current = null;
    setState({
      connected: false,
      connecting: false,
      error: null,
      connectionMode: null,
    });
  }, []);

  const testConnection = useCallback(async (): Promise<boolean> => {
    if (!managerRef.current) {
      return false;
    }

    try {
      await managerRef.current.ping();
      return true;
    } catch {
      return false;
    }
  }, []);

  const discoverViaMdns = useCallback(async () => {
    try {
      const devices = await PDS_web_wifi_Discovery.discoverDevices();
      return devices.map((d) => ({
        ip: d.address,
        hostname: d.name,
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'mDNS discovery failed';
      setState((prev) => ({ ...prev, error: errorMsg }));
      return [];
    }
  }, []);

  const discoverViaBle = useCallback(async () => {
    if (!bleManagerRef.current) {
      return [];
    }

    try {
      if (!bleManagerRef.current.isSupported()) {
        throw new Error('Web Bluetooth not supported on this browser');
      }

      const devices = await bleManagerRef.current.discoverDevices();
      return devices;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'BLE discovery failed';
      setState((prev) => ({ ...prev, error: errorMsg }));
      return [];
    }
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    state,
    manager: managerRef.current,
    bleManager: bleManagerRef.current,
    connectDirect,
    connectViaHostname,
    connectInternet,
    disconnect,
    testConnection,
    discoverViaMdns,
    discoverViaBle,
    clearError,
  };
};
