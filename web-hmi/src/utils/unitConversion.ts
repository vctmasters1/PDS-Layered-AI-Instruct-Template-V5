/**
 * unitConversion.ts
 *
 * Conversion utilities for measurement-aware field display and input.
 *
 * Duration (ms) ↔ DD:HH:MM:SS display
 * Temperature °C ↔ °F
 * Volume mL ↔ fl oz
 */

import type { MeasurementSystem } from '../hooks/useMeasurementSystem';
import type { MeasurementCategory } from '@pds/pipeline';

// ── Duration: ms ↔ DD:HH:MM:SS ───────────────────────────────────────────

/**
 * Format milliseconds as DD:HH:MM:SS
 * Days and hours are omitted when zero.
 */
export function msToDuration(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.round(ms / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600) % 24;
  const d = Math.floor(totalSec / 86400);

  const ss = String(s).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const hh = String(h).padStart(2, '0');
  const dd = String(d).padStart(2, '0');

  if (d > 0) return `${dd}:${hh}:${mm}:${ss}`;
  if (h > 0) return `${hh}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

/**
 * Parse DD:HH:MM:SS (or HH:MM:SS or MM:SS) back to milliseconds.
 * Returns NaN on invalid input.
 */
export function durationToMs(str: string): number {
  const parts = str.trim().split(':').map(Number);
  if (parts.some(isNaN)) return NaN;
  switch (parts.length) {
    case 2: return (parts[0] * 60 + parts[1]) * 1000;
    case 3: return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    case 4: return (parts[0] * 86400 + parts[1] * 3600 + parts[2] * 60 + parts[3]) * 1000;
    default: return NaN;
  }
}

// ── Time of day: sec ↔ HH:MM:SS ───────────────────────────────────────

/**
 * Format seconds-since-midnight as HH:MM (or HH:MM:SS if seconds ≠ 0).
 * Reuses msToDuration by scaling. Always shows at least HH:MM (no day component).
 */
export function secToHms(sec: number): string {
  if (sec <= 0) return '00:00';
  const s = Math.round(sec) % 60;
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600) % 24;
  const ss = String(s).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const hh = String(h).padStart(2, '0');
  return s > 0 ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

/**
 * Parse HH:MM or HH:MM:SS back to seconds-since-midnight.
 * Returns NaN on invalid input.
 */
export function hmsToSec(str: string): number {
  const parts = str.trim().split(':').map(Number);
  if (parts.some(isNaN)) return NaN;
  switch (parts.length) {
    case 2: return parts[0] * 3600 + parts[1] * 60;
    case 3: return parts[0] * 3600 + parts[1] * 60 + parts[2];
    default: return NaN;
  }
}

// ── Temperature °C ↔ °F ──────────────────────────────────────────────────

export function cToF(c: number): number { return c * 9 / 5 + 32; }
export function fToC(f: number): number { return (f - 32) * 5 / 9; }

// ── Volume mL ↔ fl oz ────────────────────────────────────────────────────

export function mlToFlOz(ml: number): number { return ml / 29.5735; }
export function flOzToMl(oz: number): number { return oz * 29.5735; }

// ── Generic: convert stored value → display value ─────────────────────────

export function toDisplay(
  storedValue: number,
  category: MeasurementCategory | undefined,
  system: MeasurementSystem,
): number {
  if (!category || system === 'metric') return storedValue;
  switch (category) {
    case 'temperature': return cToF(storedValue);
    case 'volume_ml':   return mlToFlOz(storedValue);
    default:            return storedValue;
  }
}

export function fromDisplay(
  displayValue: number,
  category: MeasurementCategory | undefined,
  system: MeasurementSystem,
): number {
  if (!category || system === 'metric') return displayValue;
  switch (category) {
    case 'temperature': return fToC(displayValue);
    case 'volume_ml':   return flOzToMl(displayValue);
    default:            return displayValue;
  }
}

/** Return the display unit label for a field. */
export function displayUnits(
  baseUnits: string | undefined,
  category: MeasurementCategory | undefined,
  system: MeasurementSystem,
): string | undefined {
  if (!category || system === 'metric') return baseUnits;
  switch (category) {
    case 'temperature': return '°F';
    case 'volume_ml':   return 'fl oz';
    case 'length_mm':   return 'in';
    default:            return baseUnits;
  }
}
