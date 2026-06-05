/**
 * PDS Web BLE Support
 * 
 * Handles BLE provisioning for initial WiFi setup.
 * Used to send WiFi credentials to unprovisioned devices.
 * 
 * Mirrors: Android/app/src/main/java/vm/pds/h2o/ble/BluetoothManager.kt
 */

/**
 * BLE provisioning options
 */
export interface BleProvisioningConfig {
  ssid: string;           // WiFi network name
  password: string;       // WiFi password
  proofOfPossession?: string; // Default: "H2o12345"
}

/**
 * BLE device discovered via scan
 */
export interface BleDevice {
  id: string;            // Bluetooth MAC address
  name: string;          // Device name
  rssi: number;          // Signal strength
  uuid: string;          // BLE UUID (H2o-TOWER-SETUP)
}

/**
 * PDS Web BLE Manager
 * Handles device discovery and WiFi provisioning via BLE
 */
export class PDS_web_ble_Manager {
  private bluetooth: Bluetooth | null = null;
  private device: BluetoothDevice | null = null;

  constructor() {
    // Check for Web Bluetooth API support
    if ('bluetooth' in navigator) {
      this.bluetooth = navigator.bluetooth;
    }
  }

  /**
   * Check if Web Bluetooth API is available
   */
  isSupported(): boolean {
    return this.bluetooth !== null;
  }

  /**
   * Scan for BLE devices with H2o-TOWER-SETUP service
   */
  async discoverDevices(): Promise<BleDevice[]> {
    if (!this.bluetooth) {
      throw new Error('Web Bluetooth API not supported');
    }

    const devices: BleDevice[] = [];

    try {
      const device = await this.bluetooth.requestDevice({
        filters: [
          {
            name: 'H2o-TOWER-SETUP',
          },
        ],
        optionalServices: ['wifi-provisioning'],
      });

      if (device) {
        devices.push({
          id: device.id,
          name: device.name || 'Unknown',
          rssi: device.rssi || 0,
          uuid: device.uuids?.[0] || '',
        });

        this.device = device;
      }
    } catch (error) {
      console.error('BLE discovery error:', error);
      // User cancelled or device not found
    }

    return devices;
  }

  /**
   * Connect to device via BLE
   */
  async connect(): Promise<boolean> {
    if (!this.device) {
      console.error('No device selected');
      return false;
    }

    try {
      const server = await this.device.gatt?.connect();
      if (!server) {
        console.error('Failed to connect to GATT server');
        return false;
      }

      console.log('Connected to device:', this.device.name);
      return true;
    } catch (error) {
      console.error('Connection error:', error);
      return false;
    }
  }

  /**
   * Provision WiFi credentials to device
   * Sends SSID and password via BLE
   */
  async provisionWiFi(config: BleProvisioningConfig): Promise<boolean> {
    if (!this.device || !this.device.gatt?.connected) {
      console.error('Device not connected');
      return false;
    }

    try {
      const server = await this.device.gatt.connect();
      if (!server) {
        console.error('No GATT server');
        return false;
      }

      // Get WiFi provisioning service
      const service = await server.getPrimaryService('wifi-provisioning');
      if (!service) {
        console.error('WiFi provisioning service not found');
        return false;
      }

      // Get SSID characteristic
      const ssidChar = await service.getCharacteristic('ssid');
      if (ssidChar) {
        await ssidChar.writeValue(new TextEncoder().encode(config.ssid));
      }

      // Get password characteristic
      const passChar = await service.getCharacteristic('password');
      if (passChar) {
        await passChar.writeValue(new TextEncoder().encode(config.password));
      }

      // Trigger provisioning if available
      const provisionChar = await service.getCharacteristic('provision');
      if (provisionChar) {
        await provisionChar.writeValue(new Uint8Array([1]));
      }

      console.log('WiFi provisioning sent successfully');
      return true;
    } catch (error) {
      console.error('WiFi provisioning error:', error);
      return false;
    }
  }

  /**
   * Disconnect from device
   */
  disconnect(): void {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
      console.log('Disconnected from device');
    }
  }

  /**
   * Get current device
   */
  getConnectedDevice(): BluetoothDevice | null {
    return this.device || null;
  }
}

/**
 * BLE provisioning flow
 * High-level helper for typical provisioning sequence
 */
export async function provisionDeviceOverBle(
  ssid: string,
  password: string,
  proofOfPossession?: string
): Promise<boolean> {
  const manager = new PDS_web_ble_Manager();

  if (!manager.isSupported()) {
    console.error('Web Bluetooth API not supported on this browser/device');
    return false;
  }

  try {
    // 1. Discover device
    console.log('Scanning for devices...');
    const devices = await manager.discoverDevices();

    if (devices.length === 0) {
      console.error('No devices found');
      return false;
    }

    console.log(`Found ${devices.length} device(s)`);

    // 2. Connect
    console.log('Connecting to device...');
    const connected = await manager.connect();

    if (!connected) {
      console.error('Failed to connect');
      return false;
    }

    // 3. Provision WiFi
    console.log('Provisioning WiFi credentials...');
    const provisioned = await manager.provisionWiFi({
      ssid,
      password,
      proofOfPossession: proofOfPossession || 'H2o12345',
    });

    // 4. Disconnect
    manager.disconnect();

    if (provisioned) {
      console.log('Device provisioned successfully!');
    }

    return provisioned;
  } catch (error) {
    console.error('Provisioning failed:', error);
    return false;
  }
}
