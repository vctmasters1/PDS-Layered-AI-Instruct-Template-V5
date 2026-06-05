/**
 * Config schemas keyed by firmware version.
 * The first entry is the "latest" / fallback schema.
 *
 * Each schema lists the adjustable parameters the user sees
 * in the browser-based configuration UI.
 */

import { IConfigSchema } from "../types.js";

export const configSchemas = new Map<string, IConfigSchema>([
  [
    "1.0.0",
    {
      version: "1.0.0",
      params: [
        // ── Replace these example params with real ones ──
        {
          key: "exampleToggle",
          label: "Example Toggle",
          type: "boolean",
          defaultValue: false,
          description: "An example boolean parameter — replace or remove",
        },
        {
          key: "exampleLevel",
          label: "Example Level",
          type: "range",
          options: [0, 100],
          defaultValue: 50,
          description: "An example range parameter — replace or remove",
        },
        {
          key: "exampleMode",
          label: "Example Mode",
          type: "enum",
          options: ["auto", "manual", "off"],
          defaultValue: "auto",
          description: "An example enum parameter — replace or remove",
        },
      ],
    },
  ],
]);
