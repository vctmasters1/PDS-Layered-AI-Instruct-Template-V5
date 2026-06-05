/**
 * PDS Web Network Manager
 * 
 * Handles both WiFi (HTTPS) and BLE communication with devices.
 * Supports direct connection (local network) and internet-based connection (via gateway/tunnel).
 * 
 * Mirrors: Android/app/src/main/java/vm/pds/h2o/network/NetworkManager.kt
 */

import {
  TeldataPacket,
  TeldataHeader,
  AdcReading,
  PwmState,
  GpioState,
  TelconfPacket,
  ConfigType,
  TELEMETRY_VERSION,
} from '../types/pds_telemetry';
import { DeviceAutomation } from '../automation/datamodels';
export { PDS_web_ble_Manager } from './PDS_web_ble';

/**
 * Device connection options
 */
export interface DeviceConnection {
  ipAddress?: string;      // Direct WiFi: IP address (e.g., "192.168.1.100")
  hostname?: string;       // Direct WiFi: mDNS hostname (e.g., "h2o-tower.local")
  port?: number;           // HTTPS port (default 8443)
  gatewayUrl?: string;     // Internet: gateway endpoint (e.g., "https://api.example.com")
  deviceId?: string;       // For internet connection: device ID
}

/**
 * Device status information
 */
export interface DeviceInfo {
  address: string;         // IP address or device ID
  name: string;
  isOnline: boolean;
  lastQueried: number;     // Timestamp
  platformType?: string;   // e.g., "ESP32C3_SUPERMINI"
  fwVersion?: string;
  isFirmwareUpdateAvailable?: boolean;
}

/**
 * Serialization helpers for binary telemetry format
 */
class TelemetrySerializer {
  /**
   * Deserialize binary telemetry packet (device → HMI)
   */
  static deserializeTelemetry(data: ArrayBuffer): TeldataPacket | null {
    try {
      const view = new DataView(data);
      let offset = 0;

      // Read header (16 bytes)
      const timestampMs = view.getUint32(offset, true); offset += 4;
      const timestampUnix = view.getUint32(offset, true); offset += 4;
      const version = view.getUint16(offset, true); offset += 2;
      const packetId = view.getUint16(offset, true); offset += 2;
      const numAdcReadings = view.getUint8(offset++);
      const numPwmOutputs = view.getUint8(offset++);
      const numGpioStates = view.getUint8(offset++);
      const statusFlags = view.getUint8(offset++);

      const header: TeldataHeader = {
        timestampMs,
        timestampUnix,
        version,
        packetId,
        numAdcReadings,
        numPwmOutputs,
        numGpioStates,
        statusFlags,
      };

      // Read ADC readings
      const adcReadings: AdcReading[] = [];
      for (let i = 0; i < numAdcReadings; i++) {
        const pinNumber = view.getUint8(offset++);
        const rawValue = view.getUint16(offset, true); offset += 2;
        const voltage = view.getFloat32(offset, true); offset += 4;
        const calibratedValue = view.getFloat32(offset, true); offset += 4;
        const label = this.readString(data, offset, 32); offset += 32;

        adcReadings.push({ pinNumber, rawValue, voltage, calibratedValue, label });
      }

      // Read PWM outputs
      const pwmOutputs: PwmState[] = [];
      for (let i = 0; i < numPwmOutputs; i++) {
        const pinNumber = view.getUint8(offset++);
        offset++; // padding
        const dutyCycle = view.getUint16(offset, true); offset += 2;
        const frequency = view.getUint32(offset, true); offset += 4;
        const label = this.readString(data, offset, 32); offset += 32;

        pwmOutputs.push({ pinNumber, dutyCycle, frequency, label });
      }

      // Read GPIO states
      const gpioStates: GpioState[] = [];
      for (let i = 0; i < numGpioStates; i++) {
        const pinNumber = view.getUint8(offset++);
        const state = view.getUint8(offset++);
        const label = this.readString(data, offset, 32); offset += 32;
        offset += 2; // padding

        gpioStates.push({ pinNumber, state, label });
      }

      return { header, adcReadings, pwmOutputs, gpioStates };
    } catch (error) {
      console.error('Failed to deserialize telemetry packet:', error);
      return null;
    }
  }

  /**
   * Serialize configuration packet (HMI → device)
   */
  static serializeConfig(packet: TelconfPacket): ArrayBuffer {
    const buffer = new ArrayBuffer(512);
    const view = new DataView(buffer);
    let offset = 0;

    // Write header (16 bytes)
    view.setUint32(offset, packet.header.timestampMs, true); offset += 4;
    view.setUint16(offset, packet.header.version, true); offset += 2;
    view.setUint16(offset, packet.header.configType, true); offset += 2;
    view.setUint32(offset, packet.header.configValue, true); offset += 4;
    view.setUint8(offset++, packet.header.targetPin);
    offset += 3; // reserved bytes

    // Write payload if present
    if (packet.payload) {
      const payloadView = new Uint8Array(buffer, offset);
      payloadView.set(new Uint8Array(packet.payload));
    }

    return buffer.slice(0, offset + (packet.payload?.length || 0));
  }

  /**
   * Create PWM config packet
   */
  static createPwmConfig(pinNumber: number, dutyCycle: number): TelconfPacket {
    return {
      header: {
        timestampMs: Date.now(),
        version: TELEMETRY_VERSION,
        configType: ConfigType.SET_PWM_DUTY,
        configValue: dutyCycle,
        targetPin: pinNumber,
      },
    };
  }

  /**
   * Create GPIO config packet
   */
  static createGpioConfig(pinNumber: number, state: boolean): TelconfPacket {
    return {
      header: {
        timestampMs: Date.now(),
        version: TELEMETRY_VERSION,
        configType: ConfigType.SET_GPIO_OUT,
        configValue: state ? 1 : 0,
        targetPin: pinNumber,
      },
    };
  }

  /**
   * Helper to read null-terminated string from buffer
   */
  private static readString(buffer: ArrayBuffer, offset: number, maxLength: number): string {
    const view = new Uint8Array(buffer, offset, maxLength);
    const end = view.indexOf(0);
    const length = end === -1 ? maxLength : end;
    return new TextDecoder().decode(view.slice(0, length));
  }
}

/**
 * PDS Web Network Manager
 * Handles WiFi (direct and internet) communication with devices
 */
export class PDS_web_NetworkManager {
  private connection: DeviceConnection;
  private baseUrl: string;

  constructor(connection: DeviceConnection) {
    this.connection = connection;
    this.baseUrl = this.buildBaseUrl();
  }

  /**
   * Build base URL for device API
   * Supports both direct (local) and internet-based connections
   */
  private buildBaseUrl(): string {
    if (this.connection.gatewayUrl) {
      // Internet connection via gateway
      return `${this.connection.gatewayUrl}/device/${this.connection.deviceId}`;
    }

    // Direct WiFi connection (local network)
    const host = this.connection.hostname || this.connection.ipAddress || 'h2o-tower.local';
    const port = this.connection.port || 8443;
    return `https://${host}:${port}`;
  }

  /**
   * Fetch device status
   * GET /status → TeldataPacket (binary)
   */
  async getDeviceStatus(): Promise<TeldataPacket | null> {
    try {
      const response = await fetch(`${this.baseUrl}/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });

      if (!response.ok) {
        console.error(`Failed to fetch status: ${response.status}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return TelemetrySerializer.deserializeTelemetry(arrayBuffer);
    } catch (error) {
      console.error('Error fetching device status:', error);
      return null;
    }
  }

  /**
   * Fetch device configuration
   * GET /config → TelconfPacket (binary)
   */
  async getDeviceConfig(): Promise<TelconfPacket | null> {
    try {
      const response = await fetch(`${this.baseUrl}/config`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });

      if (!response.ok) {
        console.error(`Failed to fetch config: ${response.status}`);
        return null;
      }

      // TODO: Deserialize config packet format
      return null;
    } catch (error) {
      console.error('Error fetching device config:', error);
      return null;
    }
  }

  /**
   * Send PWM command to device
   * POST /config with SET_PWM_DUTY config type
   */
  async sendPwmCommand(pinNumber: number, dutyCycle: number): Promise<boolean> {
    const packet = TelemetrySerializer.createPwmConfig(pinNumber, dutyCycle);
    return this.sendConfigPacket(packet);
  }

  /**
   * Send GPIO command to device
   * POST /config with SET_GPIO_OUT config type
   */
  async sendGpioCommand(pinNumber: number, state: boolean): Promise<boolean> {
    const packet = TelemetrySerializer.createGpioConfig(pinNumber, state);
    return this.sendConfigPacket(packet);
  }

  /**
   * Send configuration packet to device
   * POST /config
   */
  async sendConfigPacket(packet: TelconfPacket): Promise<boolean> {
    try {
      const arrayBuffer = TelemetrySerializer.serializeConfig(packet);

      const response = await fetch(`${this.baseUrl}/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: arrayBuffer,
      });

      return response.ok;
    } catch (error) {
      console.error('Error sending config packet:', error);
      return false;
    }
  }

  /**
   * Send automation configuration to device
   * POST /automation
   */
  async sendAutomation(automation: DeviceAutomation): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/automation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(automation),
      });

      return response.ok;
    } catch (error) {
      console.error('Error sending automation:', error);
      return false;
    }
  }

  /**
   * Health check endpoint
   * GET /ping
   */
  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/ping`, {
        method: 'GET',
      });

      return response.ok;
    } catch (error) {
      console.error('Ping failed:', error);
      return false;
    }
  }
}

/**
 * mDNS Discovery Helper
 * Discovers devices on local network via mDNS
 * Note: Requires backend support or mDNS.js library
 */
export class PDS_web_wifi_Discovery {
  /**
   * Discover devices on local network via mDNS
   * Returns list of found devices
   */
  static async discoverDevices(_timeout: number = 5000): Promise<DeviceInfo[]> {
    // TODO: Implement mDNS discovery
    // Option 1: Use mDNS.js library
    // Option 2: Query backend for device list
    // Option 3: User manually enters IP/hostname

    console.warn('mDNS discovery not yet implemented');
    return [];
  }

  /**
   * Test connection to a device
   */
  static async testConnection(connection: DeviceConnection): Promise<boolean> {
    const manager = new PDS_web_NetworkManager(connection);
    return manager.ping();
  }
}
