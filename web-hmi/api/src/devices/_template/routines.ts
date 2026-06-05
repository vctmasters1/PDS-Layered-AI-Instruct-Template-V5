/**
 * Device-specific routines for protocol-level interaction.
 *
 * This file is OPTIONAL — only needed if the device uses a
 * binary protocol (BLE, custom serial, etc.) or has provisioning
 * steps beyond simple config writes.
 *
 * For HTTP/JSON-only devices, the default handler in index.ts
 * is sufficient and this file can remain empty or be deleted.
 */

// import { IPacketDefinition } from "../types.js";

// Example BLE packet definition — uncomment and adapt:
//
// export const configWritePacket: IPacketDefinition = {
//   name: "Config Write",
//   totalLength: 20,
//   fields: [
//     { name: "header",   offset: 0, length: 1, type: "uint8" },
//     { name: "command",  offset: 1, length: 1, type: "uint8" },
//     { name: "payload",  offset: 2, length: 16, type: "raw" },
//     { name: "checksum", offset: 18, length: 2, type: "uint16_le" },
//   ],
// };
