import {
  IDeviceHandler,
  IConfigSchema,
  IFirmwareVersion,
  CommProtocol,
} from "../types.js";
import { configSchemas } from "./config-schema.js";
import { firmwareVersions } from "./firmware-versions.js";

export const handler: IDeviceHandler = {
  type: "portioning-feeder",
  displayName: "Portioning Feeder",
  protocols: [CommProtocol.HTTP, CommProtocol.BLUETOOTH],

  getConfigSchema(firmwareVersion: string): IConfigSchema {
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
};
