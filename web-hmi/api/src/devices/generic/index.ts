import { IDeviceHandler, IConfigSchema, IFirmwareVersion, CommProtocol } from "../types.js";

// Generic fallback handler — used for any deviceType with no dedicated handler registered.
// Returns empty schemas and passes all config validation so the HMI can render any device
// without type-specific code.  Register a dedicated handler to override this behaviour.
export const handler: IDeviceHandler = {
  type: "pds-device",
  displayName: "PDS Device",
  protocols: [CommProtocol.HTTP],

  getConfigSchema(_firmwareVersion: string): IConfigSchema {
    return { version: "0", params: [] };
  },

  validateConfig(_config: Record<string, unknown>, _firmwareVersion: string) {
    return { valid: true };
  },

  listFirmwareVersions(): IFirmwareVersion[] {
    return [];
  },
};
