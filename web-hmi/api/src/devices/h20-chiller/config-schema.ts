import { IConfigSchema } from "../types.js";

/** Config schema for h20-chiller, keyed by firmware version (newest first) */
export const configSchemas = new Map<string, IConfigSchema>([
  [
    "C02.0.1.045",
    {
      version: "C02.0.1.045",
      params: [
        {
          key: "chillerEnabled",
          label: "Chiller Enabled",
          type: "boolean",
          defaultValue: true,
        },
        {
          key: "targetTempC",
          label: "Target Temperature (°C)",
          type: "range",
          options: [0, 30],
          defaultValue: 18,
        },
        {
          key: "tempHysteresis",
          label: "Temperature Hysteresis (°C)",
          type: "range",
          options: [0.5, 5.0],
          defaultValue: 1.0,
        },
      ],
    },
  ],
]);
