import { IConfigSchema } from "../types.js";

export const configSchemas = new Map<string, IConfigSchema>([
  [
    "1.0.0",
    {
      version: "1.0.0",
      params: [
        {
          key: "portionSizeGrams",
          label: "Portion Size",
          type: "range",
          options: [1, 500],
          defaultValue: 50,
          description: "Weight of each portion in grams",
        },
        {
          key: "feedingsPerDay",
          label: "Feedings Per Day",
          type: "range",
          options: [1, 12],
          defaultValue: 2,
          description: "Number of scheduled feedings per day",
        },
        {
          key: "scheduleEnabled",
          label: "Schedule Enabled",
          type: "boolean",
          defaultValue: true,
          description: "Enable automatic scheduled dispensing",
        },
        {
          key: "dispensingSpeed",
          label: "Dispensing Speed",
          type: "enum",
          options: ["slow", "normal", "fast"],
          defaultValue: "normal",
          description: "Motor speed during dispensing",
        },
        {
          key: "lowFoodAlert",
          label: "Low Food Alert",
          type: "boolean",
          defaultValue: true,
          description: "Alert when food level is low",
        },
        {
          key: "lowFoodThresholdPercent",
          label: "Low Food Threshold",
          type: "range",
          options: [5, 50],
          defaultValue: 15,
          description: "Percentage remaining to trigger low food alert",
        },
      ],
    },
  ],
]);
