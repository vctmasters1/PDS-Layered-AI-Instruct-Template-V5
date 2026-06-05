/**
 * useTempUnits.ts
 *
 * Persists the user's preferred temperature display unit (°C / °F) to
 * localStorage and exposes it app-wide.  The device firmware always reports
 * temperature in degrees Celsius; this hook applies conversion for display
 * only — no device setting is changed.
 */

import { useState, useEffect } from 'react';

export type TempUnit = 'C' | 'F';

const STORAGE_KEY = 'pds_temp_unit';
const DEFAULT_UNIT: TempUnit = 'C';

export const TEMP_LABELS: Record<TempUnit, string> = {
  C: '°C',
  F: '°F',
};

export const TEMP_DECIMALS: Record<TempUnit, number> = {
  C: 1,
  F: 1,
};

/** Convert a Celsius value to the requested display unit. */
export function convertTemp(celsius: number, unit: TempUnit): number {
  return unit === 'F' ? (celsius * 9) / 5 + 32 : celsius;
}

// ── Global helpers (usable outside React) ────────────────────────────────────

export function getTempUnit(): TempUnit {
  const stored = localStorage.getItem(STORAGE_KEY) as TempUnit | null;
  return stored === 'F' ? 'F' : DEFAULT_UNIT;
}

export function setTempUnitGlobal(unit: TempUnit) {
  localStorage.setItem(STORAGE_KEY, unit);
  window.dispatchEvent(new CustomEvent('pds-temp-unit-changed', { detail: unit }));
}

// ── React hook ───────────────────────────────────────────────────────────────

export function useTempUnits() {
  const [unit, setUnitState] = useState<TempUnit>(getTempUnit);

  useEffect(() => {
    const handler = (e: Event) => {
      setUnitState((e as CustomEvent<TempUnit>).detail);
    };
    window.addEventListener('pds-temp-unit-changed', handler);
    return () => window.removeEventListener('pds-temp-unit-changed', handler);
  }, []);

  const setUnit = (u: TempUnit) => {
    setUnitState(u);
    setTempUnitGlobal(u);
  };

  return { unit, setUnit };
}
