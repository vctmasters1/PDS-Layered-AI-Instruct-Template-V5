/**
 * useEcUnits.ts
 *
 * Persists the user's preferred EC display scale to localStorage and exposes
 * it app-wide.  The device firmware always reports EC readings in mS/cm
 * (electrical conductivity). This hook converts to the user's chosen display
 * unit for rendering on the dashboard and logs.
 *
 * Firmware output: mS/cm (e.g. 1.0 mS/cm at 1 mS/cm actual conductivity)
 *
 * Conversion reference:
 *   PPM500  = EC_mS_cm × 500   (Truncheon / US-standard)
 *   PPM700  = EC_mS_cm × 700   (Hanna & Bluelab meters)
 *   CF      = EC_mS_cm × 10    (Conductivity Factor, unitless)
 *   EC      = mS/cm as-is
 *
 * Scale calibration in role JSON:
 *   scale_min = 0 mS/cm, scale_max = 2.0 mS/cm (= 1000 PPM500)
 *   All alarm thresholds stored in mS/cm.
 *
 * The CalibrationScreen shows and saves values in mS/cm directly.
 * Dashboard and Logs apply this hook to convert for display only.
 */

import { useState, useEffect } from 'react';

export type EcUnit = 'EC' | 'CF' | 'PPM500' | 'PPM700';

const STORAGE_KEY = 'pds_ec_unit';
const DEFAULT_UNIT: EcUnit = 'PPM500';

// Factors to convert the firmware's mS/cm value into each display unit.
const FROM_EC: Record<EcUnit, number> = {
  PPM500: 500,
  PPM700: 700,
  EC:     1,
  CF:     10,
};

export const EC_UNIT_LABELS: Record<EcUnit, string> = {
  PPM500: 'PPM',
  PPM700: 'PPM',
  EC:     'mS/cm',
  CF:     'CF',
};

export const EC_UNIT_DECIMALS: Record<EcUnit, number> = {
  PPM500: 0,
  PPM700: 0,
  EC:     2,
  CF:     1,
};

/** Convert a firmware mS/cm reading to the requested display unit. */
export function convertEcValue(ec_ms_cm: number, unit: EcUnit): number {
  return ec_ms_cm * FROM_EC[unit];
}

// ── Global helpers (usable outside React) ────────────────────────────────────

export function getEcUnit(): EcUnit {
  const stored = localStorage.getItem(STORAGE_KEY) as EcUnit | null;
  if (stored && stored in FROM_EC) return stored;
  return DEFAULT_UNIT;
}

export function setEcUnitGlobal(unit: EcUnit) {
  localStorage.setItem(STORAGE_KEY, unit);
  window.dispatchEvent(new CustomEvent('pds-ec-unit-changed', { detail: unit }));
}

// ── React hook ────────────────────────────────────────────────────────────────

export function useEcUnits() {
  const [unit, setUnitState] = useState<EcUnit>(getEcUnit);

  useEffect(() => {
    const handler = (e: Event) => {
      setUnitState((e as CustomEvent<EcUnit>).detail);
    };
    window.addEventListener('pds-ec-unit-changed', handler);
    return () => window.removeEventListener('pds-ec-unit-changed', handler);
  }, []);

  const setUnit = (u: EcUnit) => {
    setUnitState(u);
    setEcUnitGlobal(u);
  };

  return { unit, setUnit };
}
