import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// Configure testing library
configure({ testIdAttribute: 'data-testid' });

// Mock window.matchMedia for Tailwind dark mode tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock environment variables
process.env['VITE_DEVICE_HOSTNAME'] = 'h2o-tower.local';
process.env['VITE_DEVICE_IP'] = '192.168.1.100';
process.env['VITE_DEVICE_PORT'] = '8443';
process.env['VITE_CONNECTION_MODE'] = 'auto';
process.env['VITE_TELEMETRY_POLL_INTERVAL'] = '1000';
process.env['VITE_TELEMETRY_MAX_HISTORY'] = '300';
process.env['VITE_NETWORK_TIMEOUT'] = '5000';
process.env['VITE_BLE_PROOF_OF_POSSESSION'] = 'H2o12345';
