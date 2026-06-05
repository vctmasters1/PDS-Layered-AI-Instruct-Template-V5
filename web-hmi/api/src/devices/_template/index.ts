/**
 * ─────────────────────────────────────────────────────────────
 * TEMPLATE DEVICE HANDLER
 * ─────────────────────────────────────────────────────────────
 * Copy this entire directory to create a new device handler.
 *
 * Steps:
 *   1. Copy  _template/  →  <device-type>/    (kebab-case slug)
 *   2. Replace all TODO_DEVICE_TYPE with your slug
 *   3. Replace all TODO_DISPLAY_NAME with a human-readable name
 *   4. Define config parameters in config-schema.ts
 *   5. Set firmware versions in firmware-versions.ts
 *   6. Implement protocol routines in routines.ts (if needed)
 *   7. Register in  devices/index.ts:
 *        import { handler } from "./<device-type>/index.js";
 *        registerDevice(handler);
 *   8. Verify by running the dev server and calling GET /api/devices/types
 * ─────────────────────────────────────────────────────────────
 */

import {
  IDeviceHandler,
  IConfigSchema,
  IFirmwareVersion,
  CommProtocol,
} from "../types.js";
import { configSchemas } from "./config-schema.js";
import { firmwareVersions } from "./firmware-versions.js";

export const handler: IDeviceHandler = {
  type: "TODO_DEVICE_TYPE",
  displayName: "TODO_DISPLAY_NAME",
  protocols: [CommProtocol.HTTP], // adjust as needed

  getConfigSchema(firmwareVersion: string): IConfigSchema {
    // Return the schema matching this firmware, or fall back to latest
    return configSchemas.get(firmwareVersion) ?? configSchemas.values().next().value!;
  },

  validateConfig(
    config: Record<string, unknown>,
    firmwareVersion: string
  ): { valid: boolean; errors?: string[] } {
    const schema = this.getConfigSchema(firmwareVersion);
    const errors: string[] = [];

    for (const param of schema.params) {
      const value = config[param.key];
      if (value === undefined) {
        errors.push(`Missing required parameter: ${param.key}`);
        continue;
      }

      // Type check
      if (param.type === "number" || param.type === "range") {
        if (typeof value !== "number") {
          errors.push(`${param.key} must be a number`);
        } else if (param.type === "range" && Array.isArray(param.options)) {
          const [min, max] = param.options as [number, number];
          if (value < min || value > max) {
            errors.push(`${param.key} must be between ${min} and ${max}`);
          }
        }
      } else if (param.type === "boolean") {
        if (typeof value !== "boolean") {
          errors.push(`${param.key} must be a boolean`);
        }
      } else if (param.type === "enum") {
        const opts = param.options as string[] | undefined;
        if (!opts?.includes(value as string)) {
          errors.push(`${param.key} must be one of: ${opts?.join(", ")}`);
        }
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  },

  listFirmwareVersions(): IFirmwareVersion[] {
    return firmwareVersions;
  },

  // Uncomment and implement if this device uses a binary protocol:
  // getPacketDefinitions(firmwareVersion: string) { ... },
  // encodeConfigPacket(config, firmwareVersion) { ... },
  // decodeConfigPacket(packet, firmwareVersion) { ... },
};
