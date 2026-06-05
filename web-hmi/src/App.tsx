/**
 * App.tsx
 *
 * Route-based application shell using React Router v6.
 *
 * WEB-HMI is cloud-only — there is no direct physical connection from this
 * web app to any device.  All device ↔ cloud communication is routed through
 * the cloud API (or via the Android app relay over the phone hotspot).
 *
 * URL structure:
 *   /                        → redirect → /devices
 *   /login                   → Sign-in
 *   /devices                 → My Devices (cloud registry)
 *   /devices/:id             → Device HMI wrapper
 *   /devices/:id/settings    → Device config (friendly name, pipeline config)
 *   /devices/:id/logs        → Cloud telemetry & config history
 *   /devices/:id/versions    → Firmware version & OTA
 *   /devices/:id/preferences → App-level preferences
 *   /devices/:id/about       → Device information & cloud subscription
 *   /devices/:id/dashboard   → Live dashboard (requires device online)
 *   /devices/:id/control     → Live control  (requires device online)
 *   /devices/:id/automation  → Automation    (requires device online)
 */

import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
} from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import ErrorBoundary from './components/ErrorBoundary';
import DeviceListScreen from './screens/DeviceListScreen';
import DeviceHMIScreen from './screens/DeviceHMIScreen';
import DashboardScreen from './screens/DashboardScreen';
import ControlPanel from './screens/ControlPanel';
import AutomationBuilder from './screens/AutomationBuilder';
import CalibrationScreen from './screens/CalibrationScreen';
import SettingsScreen from './screens/SettingsScreen';
import PreferencesScreen from './screens/PreferencesScreen';
import AboutScreen from './screens/AboutScreen';
import LogsScreen from './screens/LogsScreen';
import ChartsScreen from './screens/ChartsScreen';
import VersionScreen from './screens/VersionScreen';
import LoginScreen from './screens/LoginScreen';

// ── Shell layout — header + footer, wraps every route via <Outlet> ──────────
const AppShell: React.FC = () => {
  const { user, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow flex-none">
        {/* ── PDS Suite Bar ── */}
        <div className="bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center py-1 gap-0">
            <a href="/marketplace/" className="font-bold text-gray-900 dark:text-white mr-5 hover:text-blue-600 dark:hover:text-blue-400 transition" style={{ fontSize: 13, letterSpacing: '-0.01em' }}>
              PipeDream Systems
            </a>
            <a href="/marketplace/" className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition px-2 py-0.5 rounded">Marketplace</a>
            <span className="text-gray-300 dark:text-gray-600 mx-1">|</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30">Device Network</span>
            <span className="text-gray-300 dark:text-gray-600 mx-1">|</span>
            <a href="/property/" className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition px-2 py-0.5 rounded">Property Portal</a>
          </div>
        </div>
        {/* ── App header row ── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate('/devices')}
            className="text-xl font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition"
          >
            PDS Device Network
          </button>
          <div className="flex items-center gap-3">
            {!authLoading && (
              user ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400 hidden sm:block">
                    {user.email}
                  </span>
                  <button
                    onClick={() => { logout(); navigate('/devices'); }}
                    className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => navigate('/login')}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition"
                >
                  Sign In
                </button>
              )
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto min-h-0">
        <Outlet />
      </main>

      <footer className="bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-3 flex-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-gray-500 dark:text-gray-500">
          H2o-Tower Aeroponics Control System · v1.0.0 · {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
};

// ── Route tree ────────────────────────────────────────────────────────────────
const AppRoutes: React.FC = () => (
  <Routes>
    <Route element={<AppShell />}>
      {/* Default */}
      <Route index element={<Navigate to="/devices" replace />} />

      {/* Sign-in */}
      <Route path="/login" element={<LoginScreen />} />

      {/* My Devices — cloud registry + local connect */}
      <Route path="/devices" element={<DeviceListScreen />} />

      {/* Per-cloud-device HMI */}
      <Route path="/devices/:id" element={<DeviceHMIScreen />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="settings"    element={<SettingsScreen />} />
        <Route path="logs"        element={<LogsScreen />} />
        <Route path="versions"    element={<VersionScreen />} />
        <Route path="preferences" element={<PreferencesScreen />} />
        <Route path="about"       element={<AboutScreen />} />
        <Route path="dashboard"   element={<DashboardScreen />} />
        <Route path="control"     element={<ControlPanel />} />
        <Route path="calibration" element={<CalibrationScreen />} />
        <Route path="automation"  element={<AutomationBuilder />} />
        <Route path="charts"      element={<ChartsScreen />} />
      </Route>
    </Route>
  </Routes>
);

// ── Root ──────────────────────────────────────────────────────────────────────
// VITE_BASE_PATH is set in Railway dashboard (e.g. /hmi/). Defaults to empty for local dev.
const _basePath = (import.meta.env.VITE_BASE_PATH as string | undefined)?.replace(/\/$/, '') ?? '';

const App: React.FC = () => (
  <ErrorBoundary>
    <BrowserRouter basename={_basePath}>
      <AuthProvider>
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;
