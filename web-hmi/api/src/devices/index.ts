/**
 * Device Handler Registry
 *
 * Central registry that maps device-type slugs to their handler
 * implementations.  To add a new device:
 *   1. Create a directory under src/devices/<device-type>/
 *   2. Implement IDeviceHandler
 *   3. Import and register it here
 */

import { IDeviceHandler } from "./types.js";

const deviceRegistry = new Map<string, IDeviceHandler>();

/** Register a device handler. Throws if the type slug is already taken. */
export function registerDevice(handler: IDeviceHandler): void {
  if (deviceRegistry.has(handler.type)) {
    throw new Error(`Device type "${handler.type}" is already registered.`);
  }
  deviceRegistry.set(handler.type, handler);
}

/** Retrieve a handler by device-type slug. Falls back to the generic handler if no specific one is registered. */
export function getHandler(deviceType: string): IDeviceHandler {
  return deviceRegistry.get(deviceType) ?? genericHandler;
}

/** List all registered device-type slugs. */
export function listDeviceTypes(): string[] {
  return Array.from(deviceRegistry.keys());
}

/** List all registered handlers with display names. */
export function listDevices(): Array<{ type: string; displayName: string }> {
  return Array.from(deviceRegistry.values()).map((h) => ({
    type: h.type,
    displayName: h.displayName,
  }));
}

// ── Generic fallback handler (active) ─────────────────────────────────────
import { handler as genericHandler } from "./generic/index.js";

// ── Specific handlers ─────────────────────────────────────────────────────
import { handler as aeroCtrl }        from "./aero-ctrl/index.js";
import { handler as h20Chiller }      from "./h20-chiller/index.js";
// import { handler as portioningFeeder } from "./portioning-feeder/index.js";

registerDevice(aeroCtrl);
registerDevice(h20Chiller);
// registerDevice(portioningFeeder);
