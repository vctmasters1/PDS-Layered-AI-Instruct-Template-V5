/**
 * Shared interfaces for the device module.
 *
 * Every device type implements IDeviceHandler so the registry and
 * routes can interact with any device in a uniform way.
 */

// ---------- Config Schema ----------

/** One adjustable parameter exposed to the user via the web UI. */
export interface IConfigParam {
  /** Machine-readable key used in the config payload */
  key: string;
  /** Human-readable label */
  label: string;
  /** UI control type */
  type: "number" | "boolean" | "string" | "enum" | "range";
  /** Allowed values for enum type, or [min, max] for range */
  options?: string[] | [number, number];
  /** Default value */
  defaultValue: string | number | boolean;
  /** Optional help text shown in the UI */
  description?: string;
}

/** Full config schema a device type exposes. */
export interface IConfigSchema {
  /** Schema version — bump when parameters change across firmware */
  version: string;
  params: IConfigParam[];
}

// ---------- Firmware ----------

export interface IFirmwareVersion {
  /** Semver string, e.g. "1.2.3" */
  version: string;
  /** Minimum firmware version required to apply this update (if any) */
  minPreviousVersion?: string;
  /** Human-readable changelog */
  changelog: string;
  /** Size in bytes of the binary */
  binarySize: number;
  /** SHA-256 hex digest for integrity check */
  sha256: string;
}

// ---------- Communication Protocol ----------

/** Describes how data is exchanged with a device type. */
export enum CommProtocol {
  HTTP = "http",
  BLUETOOTH = "bluetooth",
  WEBSOCKET = "websocket",
  MQTT = "mqtt",
}

/**
 * Raw packet definition — used when a device communicates via
 * Bluetooth (BLE) or other binary protocol.  The handler maps
 * between these raw structures and the normalised config JSON.
 */
export interface IPacketField {
  /** Field name */
  name: string;
  /** Byte offset in the packet */
  offset: number;
  /** Length in bytes */
  length: number;
  /** How to interpret the bytes */
  type: "uint8" | "uint16_le" | "uint16_be" | "uint32_le" | "uint32_be" | "float32_le" | "utf8" | "raw";
}

export interface IPacketDefinition {
  /** Human-readable name, e.g. "Config Write" */
  name: string;
  /** Total expected packet length in bytes */
  totalLength: number;
  fields: IPacketField[];
}

// ---------- Device Handler ----------

/** Every device type plugin must export an object satisfying this interface. */
export interface IDeviceHandler {
  /** Unique device-type slug (kebab-case), e.g. "silabs-widget" */
  type: string;
  /** Human-readable display name */
  displayName: string;
  /** Supported communication protocols */
  protocols: CommProtocol[];

  /**
   * Return the config schema appropriate for the given firmware version.
   * Different firmware versions may support different parameters.
   */
  getConfigSchema(firmwareVersion: string): IConfigSchema;

  /** Validate a user-submitted config payload against the schema. */
  validateConfig(config: Record<string, unknown>, firmwareVersion: string): { valid: boolean; errors?: string[] };

  /** List known firmware versions (newest first). */
  listFirmwareVersions(): IFirmwareVersion[];

  /**
   * Packet definitions for binary protocols (BLE, etc.).
   * Return undefined if the device only uses HTTP / JSON.
   */
  getPacketDefinitions?(firmwareVersion: string): IPacketDefinition[];

  /**
   * Encode a normalised config object into a binary packet buffer
   * for protocols that require it (e.g. Bluetooth).
   */
  encodeConfigPacket?(config: Record<string, unknown>, firmwareVersion: string): Buffer;

  /**
   * Decode a raw binary packet buffer into a normalised config object.
   */
  decodeConfigPacket?(packet: Buffer, firmwareVersion: string): Record<string, unknown>;
}
