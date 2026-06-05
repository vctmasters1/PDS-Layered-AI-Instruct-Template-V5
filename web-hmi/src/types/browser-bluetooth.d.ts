/**
 * Minimal Web Bluetooth API type declarations.
 * The W3C Web Bluetooth spec is not yet in TypeScript's standard DOM lib.
 * These declarations cover only the subset used by PDS_web_ble.ts.
 */

interface BluetoothDevice {
  id: string;
  name?: string;
  rssi?: number;
  uuids?: string[];
  gatt?: BluetoothRemoteGATTServer;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic {
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValue(value: BufferSource): Promise<void>;
  readValue(): Promise<DataView>;
}

type BluetoothServiceUUID = string | number;
type BluetoothCharacteristicUUID = string | number;

interface Bluetooth {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
  getAvailability(): Promise<boolean>;
}

interface RequestDeviceOptions {
  filters?: Array<{ services?: BluetoothServiceUUID[]; name?: string; namePrefix?: string }>;
  optionalServices?: BluetoothServiceUUID[];
  acceptAllDevices?: boolean;
}

interface Navigator {
  bluetooth: Bluetooth;
}
