/**
 * PreferencesScreen.tsx  (renders at /devices/:id/preferences)
 *
 * App-level user preferences: theme, telemetry poll interval, notifications.
 * These are local/session preferences — not device-specific.
 */

import React, { useState, useMemo } from 'react';
import { useMeasurementSystem } from '../hooks/useMeasurementSystem';
import { useTimezone, formatTimestamp } from '../hooks/useTimezone';
import { useEcUnits, type EcUnit } from '../hooks/useEcUnits';
import { useTempUnits, type TempUnit } from '../hooks/useTempUnits';

// Build timezone list once — grouped by region for readability.
const ALL_TIMEZONES: string[] = (() => {
  try {
    return (Intl as any).supportedValuesOf('timeZone') as string[];
  } catch {
    // Fallback for older browsers
    return [
      'UTC',
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Anchorage', 'Pacific/Honolulu',
      'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Helsinki',
      'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore',
      'Asia/Tokyo', 'Asia/Seoul', 'Australia/Sydney', 'Pacific/Auckland',
    ];
  }
})();

const PreferencesScreen: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('auto');
  const [enableNotifications, setEnableNotifications] = useState(true);
  const { system: measurementSystem, setSystem: setMeasurementSystem } = useMeasurementSystem();
  const { timezone, setTimezone } = useTimezone();
  const { unit: ecUnit, setUnit: setEcUnit } = useEcUnits();
  const { unit: tempUnit, setUnit: setTempUnit } = useTempUnits();
  const [showCalModal, setShowCalModal] = useState(false);

  // Preview: current time formatted in the selected timezone
  const tzPreview = useMemo(
    () => formatTimestamp(new Date(), 'full', timezone),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timezone],
  );

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">

      {/* ── Display ────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Display</h3>

        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Theme</label>
        <div className="space-y-2">
          {(['light', 'dark', 'auto'] as const).map(t => (
            <label key={t} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="theme"
                value={t}
                checked={theme === t}
                onChange={() => setTheme(t)}
                className="w-4 h-4 text-blue-600 border-gray-300"
              />
              <span className="text-sm text-gray-900 dark:text-white capitalize">{t}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Notifications ──────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Notifications</h3>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enableNotifications}
            onChange={e => setEnableNotifications(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded"
          />
          <span className="text-sm text-gray-900 dark:text-white">Enable browser notifications</span>
        </label>

        {enableNotifications && (
          <p className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2">
            Get notified when pipelines trigger or sensor thresholds are exceeded.
          </p>
        )}
      </div>

      {/* ── Measurement Units ──────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Measurement Units</h3>
        <div className="space-y-2">
          {([
            { value: 'metric',   label: 'Metric',   desc: '°C, mL, mm, kg' },
            { value: 'imperial', label: 'Imperial', desc: '°F, fl oz, in, lb' },
          ] as const).map(opt => (
            <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="measurementSystem"
                value={opt.value}
                checked={measurementSystem === opt.value}
                onChange={() => setMeasurementSystem(opt.value)}
                className="w-4 h-4 text-blue-600 border-gray-300"
              />
              <span className="text-sm text-gray-900 dark:text-white">
                {opt.label}
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({opt.desc})</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Volume and length fields in device settings will be displayed using these units.
          Duration fields always display as <span className="font-mono">DD:HH:MM:SS</span>.
        </p>
      </div>

      {/* ── Timezone ───────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Timezone</h3>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
            Display timezone for all timestamps
          </label>
          <select
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {ALL_TIMEZONES.map(tz => (
              <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Preview: <span className="font-mono text-gray-700 dark:text-gray-300">{tzPreview}</span>
        </p>
      </div>

      {/* ── Temperature Display Units ──────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Temperature</h3>
        <div className="space-y-2">
          {([
            { value: 'C' as TempUnit, label: 'Celsius (°C)',    desc: 'SI standard — used worldwide' },
            { value: 'F' as TempUnit, label: 'Fahrenheit (°F)', desc: 'Common in the United States' },
          ]).map(opt => (
            <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="tempUnit"
                value={opt.value}
                checked={tempUnit === opt.value}
                onChange={() => setTempUnit(opt.value)}
                className="w-4 h-4 text-blue-600 border-gray-300"
              />
              <span className="text-sm text-gray-900 dark:text-white">
                {opt.label}
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({opt.desc})</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Applies to all temperature readings on the dashboard and in logs. The device always reports in °C internally.
        </p>
      </div>

      {/* ── EC / TDS Display Units ─────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">EC / TDS Display Units</h3>
          <button
            onClick={() => setShowCalModal(true)}
            className="text-xs text-blue-600 dark:text-blue-400 underline hover:no-underline"
          >
            Calibration help
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Choose how nutrient-concentration readings are displayed across the dashboard and logs.
          The device always measures in PPM (500-scale internally); this setting converts for display only.
        </p>
        <div className="space-y-2">
          {([
            { value: 'PPM500', label: 'PPM 500 (Truncheon)',  desc: 'Most common in US/Canada — 1 mS/cm = 500 ppm' },
            { value: 'PPM700', label: 'PPM 700 (Hanna)',      desc: 'Used by Hanna & Bluelab meters — 1 mS/cm = 700 ppm' },
            { value: 'EC',     label: 'EC (mS/cm)',           desc: 'Electrical conductivity — preferred by scientists' },
            { value: 'CF',     label: 'CF (Conductivity Factor)', desc: 'CF = EC × 10, common in Australia/UK' },
          ] as { value: EcUnit; label: string; desc: string }[]).map(opt => (
            <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="ecUnit"
                value={opt.value}
                checked={ecUnit === opt.value}
                onChange={() => setEcUnit(opt.value)}
                className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300"
              />
              <span className="text-sm text-gray-900 dark:text-white leading-tight">
                {opt.label}
                <span className="block text-xs text-gray-500 dark:text-gray-400">{opt.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Data ───────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Chart History</h3>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
            Visible time range on dashboard charts
          </label>
          <select className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            <option>Last 5 minutes</option>
            <option>Last 15 minutes</option>
            <option>Last 1 hour</option>
            <option>Last 24 hours</option>
          </select>
        </div>
      </div>

      {/* ── Calibration Help Modal ─────────────────────────────────────── */}
      {showCalModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowCalModal(false)}
        >
          <div
            className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-t-2xl">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">TDS Meter Calibration Guide</h2>
              <button
                onClick={() => setShowCalModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none px-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 text-sm text-gray-700 dark:text-gray-300">

              {/* Intro */}
              <p>
                Your TDS meter can only read up to <strong>1000 ppm</strong>. Your calibration
                liquid is <strong>2.77 EC</strong>, which is too strong — it's about 1385–1940 ppm
                depending on the scale you use. That's over the limit, so the meter can't read it
                properly.
              </p>
              <p>
                The fix? Mix your strong calibration liquid with distilled water (which has 0 ppm)
                to make it weaker but still a known value. This is called <strong>diluting</strong>.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                It's like adding water to strong juice to make it less sweet. The more water you
                add, the weaker it gets.
              </p>

              {/* Table */}
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
                  Easy Dilution Table — for 500-scale TDS meters
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        <th className="px-2 py-1.5 text-left font-semibold border border-gray-200 dark:border-gray-600">Target reading</th>
                        <th className="px-2 py-1.5 text-left font-semibold border border-gray-200 dark:border-gray-600">2.77 EC solution</th>
                        <th className="px-2 py-1.5 text-left font-semibold border border-gray-200 dark:border-gray-600">Distilled water</th>
                        <th className="px-2 py-1.5 text-left font-semibold border border-gray-200 dark:border-gray-600">Ratio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { target: '700 ppm ★ best', sol: '100 ml', water: '100 ml', ratio: '1 : 1' },
                        { target: '500 ppm',         sol: '70 ml',  water: '130 ml', ratio: '1 : 1.8' },
                        { target: '350 ppm',         sol: '50 ml',  water: '150 ml', ratio: '1 : 3' },
                      ].map((row, i) => (
                        <tr
                          key={i}
                          className={i === 0
                            ? 'bg-blue-50 dark:bg-blue-900/20 font-semibold text-blue-800 dark:text-blue-300'
                            : 'text-gray-700 dark:text-gray-300'}
                        >
                          <td className="px-2 py-1.5 border border-gray-200 dark:border-gray-600">{row.target}</td>
                          <td className="px-2 py-1.5 border border-gray-200 dark:border-gray-600 font-mono">{row.sol}</td>
                          <td className="px-2 py-1.5 border border-gray-200 dark:border-gray-600 font-mono">{row.water}</td>
                          <td className="px-2 py-1.5 border border-gray-200 dark:border-gray-600 font-mono">{row.ratio}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">
                  Most people should use the <strong>700 ppm row</strong> — just mix equal parts and
                  it gives a good number in the middle of your meter's range.
                </p>
              </div>

              {/* Steps */}
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-200 mb-2">How to do it — step by step</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Get a clean cup or bottle.</li>
                  <li>Measure the amounts from the table (use a measuring cup or syringe).</li>
                  <li>Pour the 2.77 EC solution first, then add the distilled water.</li>
                  <li>Stir or shake it really well.</li>
                  <li>Wait until the liquid is room temperature (around 77°F / 25°C).</li>
                  <li>Put your TDS probe in it and calibrate your meter to the target value.</li>
                </ol>
              </div>

              {/* Tips */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2 space-y-1 text-xs text-amber-800 dark:text-amber-300">
                <p>⚠ Only use <strong>distilled water</strong> — not tap water!</p>
                <p>⚠ This mix is not permanent — use it right away.</p>
                <p>✔ After calibrating, rinse your probe with distilled water.</p>
                <p>✔ For future use, buy pre-mixed calibration packets instead.</p>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setShowCalModal(false)}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PreferencesScreen;
