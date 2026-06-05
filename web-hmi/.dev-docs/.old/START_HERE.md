# Quick Start - HMI-WEB Development

## Prerequisites
- Node.js 16+ installed
- npm or yarn
- A device running H2O-Tower firmware (or mock it)

## Setup (First Time)

```bash
# Navigate to HMI-WEB directory
cd HMI-WEB

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your device settings
# Example:
# VITE_DEVICE_HOSTNAME=h2o-tower.local
# VITE_DEVICE_IP=192.168.1.100
# VITE_DEVICE_PORT=8443
```

## Development

### Start Development Server
```bash
npm run dev
```
- Opens at `http://localhost:5173`
- Hot reload enabled (changes auto-refresh)
- Press `q` to quit

### Check Types
```bash
npm run type-check
```
- Run TypeScript compiler without emitting
- Catches type errors during development

### Lint Code
```bash
npm run lint
```
- Same as type-check, validates TypeScript

## Building

### Development Build
```bash
npm run build
```
- Creates optimized bundle in `dist/`
- Ready for deployment
- ~40-50KB gzipped

### Preview Production Build
```bash
npm run preview
```
- Serves the built app locally
- Test before deployment

## Deployment Options

### Option 1: Vercel (Recommended)
```bash
npm install -g vercel
vercel
# Follow prompts to deploy
```

### Option 2: Netlify
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

### Option 3: GitHub Pages
1. Push code to GitHub
2. Go to Settings → Pages
3. Set branch to `gh-pages` (after building)
4. Enable GitHub Actions workflow

## Environment Variables

### Required for Connection
- `VITE_DEVICE_HOSTNAME` - Device mDNS hostname (default: h2o-tower.local)
- `VITE_DEVICE_IP` - Device static IP address
- `VITE_DEVICE_PORT` - HTTPS port (default: 8443)

### Optional for Remote Access
- `VITE_GATEWAY_URL` - Gateway proxy URL for internet access
- `VITE_CONNECTION_MODE` - 'direct' | 'internet' | 'auto' (default: auto)

### Telemetry Settings
- `VITE_TELEMETRY_POLL_INTERVAL` - Polling interval in ms (default: 1000)
- `VITE_BLE_POP` - BLE Proof of Possession (default: H2o12345)

### UI Settings
- `VITE_THEME` - 'light' | 'dark' | 'auto' (default: auto)
- `VITE_CHART_HISTORY_MINUTES` - Historical data retention (default: 5)

### Security
- `VITE_API_TIMEOUT` - Request timeout in ms (default: 5000)
- `VITE_ENABLE_CERT_PINNING` - Enable SSL certificate pinning (default: true)
- `VITE_DEVICE_CERT_FINGERPRINT` - Device cert SHA256 fingerprint

## Testing

### Manual Testing Checklist
- [ ] Device connection (all 3 modes)
- [ ] Real-time telemetry display
- [ ] PWM control slider
- [ ] GPIO on/off toggle
- [ ] Settings panel
- [ ] Dark mode toggle
- [ ] Mobile responsive view
- [ ] Error handling (disconnect device and reconnect)

### Automated Testing (Coming Soon)
```bash
npm run test
npm run test:e2e
```

## Troubleshooting

### Device Not Found
1. Check device IP/hostname in .env.local
2. Ensure device is on same WiFi network
3. Try ping: `ping h2o-tower.local`
4. Check device serial monitor for WiFi status

### Connection Timeout
1. Increase `VITE_API_TIMEOUT` in .env.local
2. Check device firewall (port 8443)
3. Try direct IP instead of mDNS
4. Try gateway mode if local connection fails

### Slow Build
1. Delete `node_modules` and reinstall
2. Clear Vite cache: `rm -rf node_modules/.vite`
3. Check disk space (need ~200MB)

### TypeScript Errors
1. Run `npm install` to ensure all types are installed
2. Check `tsconfig.json` strict settings
3. Restart IDE/editor for type checking

## Architecture Quick Reference

```
App.tsx (Main router)
  ↓
AppProvider (Context wrapper)
  ├── useDeviceConnection (WiFi/BLE connection)
  ├── useDeviceTelemetry (Real-time polling)
  └── useDeviceAutomation (Pipeline management)
  ↓
Screens (5 main screens)
  ├── DeviceListScreen (Connection UI)
  ├── DashboardScreen (Telemetry display)
  ├── ControlPanel (PWM/GPIO controls)
  ├── AutomationBuilder (Pipeline editor)
  └── SettingsScreen (App settings)
```

## File Structure

```
src/
├── App.tsx              ← Main component
├── index.tsx            ← Entry point
├── context/
│   └── AppContext.tsx   ← Global state
├── screens/
│   ├── DeviceListScreen.tsx
│   ├── DashboardScreen.tsx
│   ├── ControlPanel.tsx
│   ├── AutomationBuilder.tsx
│   └── SettingsScreen.tsx
├── hooks/
│   ├── useDeviceConnection.ts
│   ├── useDeviceTelemetry.ts
│   └── useDeviceAutomation.ts
├── network/
│   ├── PDS_web_wifi.ts
│   └── PDS_web_ble.ts
├── automation/
│   ├── datamodels.ts
│   └── pipeline_builders.ts
├── types/
│   └── pds_telemetry.ts
└── styles/
    └── index.css
```

## Common Commands

```bash
# Start development
npm run dev

# Build for production
npm run build

# Type check
npm run type-check

# Install new dependency
npm install <package-name>

# Update dependencies
npm update

# Clean build
rm -rf dist node_modules
npm install
npm run build
```

## Next Steps

1. **Run development server**: `npm run dev`
2. **Connect to device**: Enter device IP/hostname
3. **View telemetry**: Dashboard tab
4. **Control device**: Control tab
5. **Create automations**: Automation tab

## Documentation

- See [README.md](./README.md) for full project overview
- See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for API reference
- See [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md) for architecture
- See [PHASE_3_COMPLETION.md](./PHASE_3_COMPLETION.md) for what's new

---

**Ready to build?** Run `npm run dev` now!
