/**
 * Known firmware versions for this device type (newest first).
 *
 * Add new entries at the TOP of the array as firmware is released.
 * The Firmware DB entity stores binary file metadata;
 * this list is the handler's in-code reference for validation
 * and schema lookups.
 */

import { IFirmwareVersion } from "../types.js";

export const firmwareVersions: IFirmwareVersion[] = [
  {
    version: "1.0.0",
    changelog: "Initial release — replace this with real release notes",
    binarySize: 0,
    sha256: "",
  },
];
