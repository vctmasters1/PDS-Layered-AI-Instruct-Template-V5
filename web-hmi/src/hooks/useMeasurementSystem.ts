/**
 * useMeasurementSystem.ts
 *
 * Persists the user's measurement system preference ('metric' | 'imperial')
 * to localStorage and exposes it app-wide.
 *
 * Usage:
 *   const { system, setSystem } = useMeasurementSystem();
 *
 * Direct access (outside React):
 *   getMeasurementSystem()
 */

import { useState, useEffect } from 'react';

export type MeasurementSystem = 'metric' | 'imperial';

const STORAGE_KEY = 'pds_measurement_system';

export function getMeasurementSystem(): MeasurementSystem {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'imperial' ? 'imperial' : 'metric';
}

export function setMeasurementSystemGlobal(system: MeasurementSystem) {
  localStorage.setItem(STORAGE_KEY, system);
  window.dispatchEvent(new CustomEvent('pds-measurement-changed', { detail: system }));
}

export function useMeasurementSystem() {
  const [system, setSystemState] = useState<MeasurementSystem>(getMeasurementSystem);

  useEffect(() => {
    const handler = (e: Event) => {
      setSystemState((e as CustomEvent<MeasurementSystem>).detail);
    };
    window.addEventListener('pds-measurement-changed', handler);
    return () => window.removeEventListener('pds-measurement-changed', handler);
  }, []);

  const setSystem = (s: MeasurementSystem) => {
    setSystemState(s);
    setMeasurementSystemGlobal(s);
  };

  return { system, setSystem };
}
