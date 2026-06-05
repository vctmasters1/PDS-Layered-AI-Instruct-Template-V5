/**
 * useTimezone.ts
 *
 * Persists the user's preferred IANA timezone to localStorage and provides a
 * formatTs() helper that all timestamp displays should use.
 *
 * Usage (in a component):
 *   const { timezone, setTimezone, formatTs } = useTimezone();
 *   formatTs(someIsoString)          // → "May 2, 2026, 10:30:00 AM"
 *   formatTs(someIsoString, 'time')  // → "10:30:00 AM"
 *   formatTs(someIsoString, 'date')  // → "May 2, 2026"
 *
 * Direct access (outside React, e.g. data-prep code):
 *   formatTimestamp(isoString)
 */

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'pds_timezone';

export type TsFormat = 'full' | 'date' | 'time';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the stored timezone, falling back to the browser's local timezone. */
export function getTimezone(): string {
  return localStorage.getItem(STORAGE_KEY) ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function setTimezoneGlobal(tz: string) {
  localStorage.setItem(STORAGE_KEY, tz);
  window.dispatchEvent(new CustomEvent('pds-timezone-changed', { detail: tz }));
}

/**
 * Format a date value using the stored (or given) timezone.
 * @param value  ISO string, Unix seconds number, or Date object
 * @param format 'full' | 'date' | 'time'   (default: 'full')
 * @param tz     Override timezone (default: getTimezone())
 */
export function formatTimestamp(
  value: string | number | Date | null | undefined,
  format: TsFormat = 'full',
  tz: string = getTimezone(),
): string {
  if (value == null) return '—';
  // Numbers < 1e10 are assumed to be Unix seconds; ≥ 1e10 are Unix ms.
  // Strings that are purely numeric (bigint columns from PostgreSQL) are
  // parsed first so they go through the same seconds/ms detection logic.
  let date: Date;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = parseInt(value, 10);
    date = new Date(n < 1e10 ? n * 1000 : n);
  } else if (typeof value === 'number') {
    date = new Date(value < 1e10 ? value * 1000 : value);
  } else {
    date = value instanceof Date ? value : new Date(value);
  }
  if (isNaN(date.getTime())) return '—';

  const opts: Intl.DateTimeFormatOptions = { timeZone: tz };
  if (format === 'full' || format === 'date') {
    opts.year  = 'numeric';
    opts.month = 'short';
    opts.day   = 'numeric';
  }
  if (format === 'full' || format === 'time') {
    opts.hour   = '2-digit';
    opts.minute = '2-digit';
    opts.second = '2-digit';
  }
  return new Intl.DateTimeFormat(undefined, opts).format(date);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTimezone() {
  const [timezone, setTimezoneState] = useState<string>(getTimezone);

  useEffect(() => {
    const handler = (e: Event) => {
      setTimezoneState((e as CustomEvent<string>).detail);
    };
    window.addEventListener('pds-timezone-changed', handler);
    return () => window.removeEventListener('pds-timezone-changed', handler);
  }, []);

  const setTimezone = (tz: string) => {
    setTimezoneState(tz);
    setTimezoneGlobal(tz);
  };

  const formatTs = (
    value: string | number | Date | null | undefined,
    format: TsFormat = 'full',
  ) => formatTimestamp(value, format, timezone);

  return { timezone, setTimezone, formatTs };
}
