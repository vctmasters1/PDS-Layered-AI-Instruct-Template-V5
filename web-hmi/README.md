# HMI-WEB: H2o-Tower Browser Control Interface

A **TypeScript/React web application** for controlling H2o-Tower aeroponics systems via browser.

**Status**: 🟢 **FOUNDATION COMPLETE** - Ready for React UI development  
**Latest**: December 18, 2025

---

## Quick Links

| Document | Purpose |
|----------|---------|
| [IMPLEMENTATION_SUMMARY.md](.dev-docs/IMPLEMENTATION_SUMMARY.md) | What was built & what's next |
| [QUICK_REFERENCE.md](.dev-docs/QUICK_REFERENCE.md) | API quick lookup guide |
| [DOCUMENTATION_INDEX.md](.dev-docs/DOCUMENTATION_INDEX.md) | Full documentation navigation |
| [ARCHITECTURE_DIAGRAMS.md](.dev-docs/ARCHITECTURE_DIAGRAMS.md) | System & data flow diagrams |
| [PROJECT_STATUS.md](.dev-docs/PROJECT_STATUS.md) | Detailed progress tracking |
| [AI-INSTRUCT.md](.dev-docs/AI-INSTRUCT-BUILD-HMI-WEB.md) | Comprehensive development guide (moved to .dev-docs/) |

---

## Features

### ✅ Completed Foundation
- **WiFi Communication**
  - Direct connection via mDNS (h2o-tower.local) or IP address
  - Internet-based connection through gateway proxy
  - Self-signed certificate support with pinning
  
- **BLE Provisioning**
  - Web Bluetooth API for initial WiFi setup
  - Unprovisioned device discovery
  - Secure credential exchange with Proof of Possession
  
- **Telemetry & Control**
  - Real-time sensor monitoring (ADC, PWM, GPIO, LED)
  - Binary packet serialization matching device format
  - Command-based control (PWM, GPIO, DAC, Servo)
  
- **Automation Pipelines**
  - Platform-agnostic IF/THEN automation system
  - Condition types: Threshold, Range, GPIO, Timer, PID, Manual
  - Action types: PWM, GPIO, Trigger, DAC, Servo
  - Factory builders for common patterns
  
- **Full Type Safety**
  - TypeScript strict mode
  - Device packet structures
  - Network interfaces
  - Automation definitions

### 🔄 In Development (React Layer)
- React components (App, Dashboard, Controls, Settings)
- State management (hooks & context)
- UI styling (Tailwind CSS)
- Testing suite

### ❌ Future Enhancements
- Authentication & authorization
- WebSocket support for real-time updates
- Data logging & analytics
- Advanced scheduling
- Mobile responsiveness

---

## Architecture

```
Device (ESP32-C3 Firmware)
    │
    ├─ HTTPS REST API (port 8443, mDNS: h2o-tower.local)
    ├─ BLE Service (H2O-TOWER-SETUP, provisioning only)
    └─ Binary Packet Format (little-endian, type-safe)
         │
         │ Direct WiFi (local network)
         │ Internet WiFi (gateway proxy)
         │ BLE (setup only)
         │
         ▼
HMI-WEB (Browser)
    ├─ Network Layer
    │  ├─ PDS_web_NetworkManager (HTTPS client)
    │  ├─ PDS_web_ble_Manager (BLE provisioning)
    │  └─ TelemetrySerializer (binary codec)
    │
    ├─ Automation Layer
    │  ├─ Pipeline definitions (IF/THEN)
    │  ├─ Condition & action types
    │  └─ Builder factory functions
    │
    ├─ UI Layer (React - TODO)
    │  ├─ Device discovery
    │  ├─ Telemetry dashboard
    │  ├─ Control panel
    │  ├─ Automation builder
    │  └─ Settings
    │
    └─ State Management (Context API - TODO)
       ├─ Connection state
       ├─ Telemetry polling
       ├─ Automation pipelines
       └─ UI preferences
```

---

## Getting Started

### Prerequisites
- Node.js 16+
- npm or yarn
- Modern browser (Chrome 85+, Edge, Firefox, Safari)

### Installation
```bash
cd HMI-WEB
npm install
```

### Development (After Configuration)
```bash
# Start dev server
npm run dev

# Type checking
npm run type-check

# Production build
npm run build

# Preview production build
npm run preview
```

### Connect to Device
```typescript
import { PDS_web_NetworkManager } from './network/PDS_web_wifi';

// Direct WiFi (local network)
const manager = new PDS_web_NetworkManager({
  ip: '192.168.1.100',
  port: 8443
});

// Or internet via gateway
const manager = new PDS_web_NetworkManager({
  gatewayUrl: 'https://api.example.com/devices/h2o-001'
});

// Get telemetry
const status = await manager.getDeviceStatus();
console.log('Water level:', status.adcReadings[0].calibratedValue);
```

### Create Automation
```typescript
import { createCycleTimerPipeline } from './automation/pipeline_builders';

// Create 6-hour on/18-hour cycle (misting schedule)
const pipeline = createCycleTimerPipeline(
  'Daily Misting',
  '00:06:00:00',  // On duration
  '00:18:00:00'   // Total cycle
);

// Deploy to device
await manager.sendAutomation(pipeline);
```

### BLE Provisioning (Setup Only)
```typescript
import { PDS_web_ble_Manager } from './network/PDS_web_ble';

const ble = new PDS_web_ble_Manager();

// Check support
if (!ble.isSupported()) {
  console.log('Web Bluetooth not available');
}

// Discover and provision
const devices = await ble.discoverDevices();
await ble.connect(devices[0].id);
await ble.provisionWiFi({
  ssid: 'MyWiFi',
  password: 'MyPassword123',
  proofOfPossession: 'H2o12345'
});
```

---

## Project Structure

```
src/
├── index.ts                    # Public API exports
├── types/
│   └── pds_telemetry.ts       # Device packet structures
├── network/
│   ├── PDS_web_wifi.ts        # HTTPS communication
│   └── PDS_web_ble.ts         # BLE provisioning
├── automation/
│   ├── datamodels.ts          # Pipeline definitions
│   └── pipeline_builders.ts   # Factory functions
├── components/                # React components (TODO)
├── hooks/                     # React hooks (TODO)
└── styles/                    # CSS/styling (TODO)
```

---

## Core APIs

### WiFi Communication
```typescript
// Fetch telemetry
const status = await manager.getDeviceStatus();

// Get configuration
const config = await manager.getDeviceConfig();

// Send PWM command (0-1000 duty cycle)
await manager.sendPwmCommand(2, 750);

// Send GPIO command (0=LOW, 1=HIGH)
await manager.sendGpioCommand(5, 1);

// Send automation pipeline
await manager.sendAutomation(pipeline);

// Health check
const health = await manager.ping();
```

### BLE Provisioning
```typescript
// Check Web Bluetooth support
const supported = ble.isSupported();

// Discover devices
const devices = await ble.discoverDevices();

// Connect to device
await ble.connect(deviceId);

// Send WiFi credentials
await ble.provisionWiFi(config);

// Disconnect
await ble.disconnect();
```

### Automation Builders
```typescript
// Cycle timer (repeating pattern)
createCycleTimerPipeline(name, onTime, totalCycle);

// Threshold safety (ADC cutoff)
createThresholdSafetyPipeline(name, pin, threshold, output, value, delay);

// GPIO safety (digital state cutoff)
createGpioStateSafetyPipeline(name, inputPin, triggerState, output, value, delay);

// Range control (keep value in bounds)
createRangeControlPipeline(name, sensor, min, max, output, increase, decrease, delay);
```

---

## Key Features

### 🌐 Dual Connection Modes
1. **Direct WiFi** (Local Network)
   - mDNS discovery: `h2o-tower.local`
   - Manual IP entry: `192.168.1.100:8443`
   - ~50ms latency

2. **Internet WiFi** (Remote Access)
   - Gateway proxy endpoint
   - ~100-500ms latency

### 🔐 Security
- HTTPS encryption (TLS 1.2+)
- Certificate pinning
- Proof of Possession (PoP) for BLE
- Self-signed certificate support

### 📡 Real-Time Monitoring
- Configurable polling (500ms-5s)
- Binary packet deserialization
- ADC, PWM, GPIO, LED telemetry
- Packet ID tracking for dropped packets

### ⚙️ Automation Platform
- Condition-action pipelines (IF/THEN)
- Multiple condition types
- Multiple action types
- Timer support (cycle & time-of-day)
- Platform-agnostic (same model as Android)

### 🎨 Type-Safe Development
- Full TypeScript support
- Strict mode enabled
- Device packet structures
- Interface-based design
- Factory pattern for complex objects

---

## Data Models

### Telemetry Packet (Device → Browser)
```typescript
interface TeldataPacket {
  header: {
    timestampMs: number;
    timestampUnix: number;
    version: 0x0001;
    packetId: number;
  };
  adcReadings: Array<{
    pinNumber: number;
    rawValue: number;
    voltage: number;
    calibratedValue: number;
    label: string;
  }>;
  pwmOutputs: Array<{
    pinNumber: number;
    dutyCycle: number;
    frequency: number;
    label: string;
  }>;
  gpioStates: Array<{
    pinNumber: number;
    state: number;
    label: string;
  }>;
  ledStates?: Array<{
    pinNumber: number;
    color: number;
    intensity: number;
    label: string;
  }>;
}
```

### Configuration Packet (Browser → Device)
```typescript
interface TelconfPacket {
  header: {
    timestampMs: number;
    version: 0x0001;
    configType: number; // SET_PWM_DUTY, SET_GPIO_OUT, etc.
  };
  targetPin: number;
  configValue: number;
}
```

### Automation Pipeline
```typescript
interface Pipeline {
  id: string;
  name: string;
  conditions: Condition[];  // AND together
  actions: Action[];        // Execute all if conditions met
  timer?: TimerConfig;      // Optional scheduling
  enabled: boolean;
}
```

---

## Naming Conventions

### Classes
- `PDS_web_NetworkManager` - HTTPS client
- `PDS_web_ble_Manager` - BLE provisioning

### Functions
- `provisionDeviceOverBle()` - Public exports (camelCase)
- `createCycleTimerPipeline()` - Factory functions (verb-first)

### Enums
- `ConditionType` - PascalCase with concrete values
- `ActionType` - PascalCase

### Interfaces
- `TeldataPacket` - PascalCase, data containers
- `Pipeline` - PascalCase

### Constants
- `TELEMETRY_VERSION` - UPPERCASE for protocol constants
- `ConfigType.SET_PWM_DUTY` - UPPERCASE enum values

See [.ai/instruct.md](.ai/instruct.md) for complete naming rules.

---

## Browser Compatibility

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| HTTPS | ✅ | ✅ | ✅ | ✅ |
| Web Bluetooth | ✅ | ✅ | ⚠️ | ❌ |
| Fetch API | ✅ | ✅ | ✅ | ✅ |
| React 18 | ✅ | ✅ | ✅ | ✅ |
| localStorage | ✅ | ✅ | ✅ | ✅ |

**Notes**:
- Web Bluetooth: Chrome/Edge only (use manual IP in Firefox/Safari)
- mDNS: May require network configuration on some systems

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Page load | < 2 seconds |
| Device discovery | < 5 seconds |
| Telemetry poll | 1000ms (configurable 500-5000ms) |
| Command latency | < 100ms |
| Memory usage | < 50MB |

---

## Troubleshooting

### Device Not Found
- Verify device is powered on and connected to WiFi
- Try manual IP entry instead of mDNS
- Check browser is on same WiFi network

### Certificate Error
- Expected for self-signed certificates
- Click "Advanced" → "Proceed anyway"
- Will be fixed with CA-signed cert or gateway

### Web Bluetooth Not Available
- Use Chrome or Edge browsers
- Check Bluetooth is enabled on computer
- Try manual IP entry instead

### Connection Timeout
- Verify IP address is correct
- Check device is responding: `ping 192.168.1.100`
- Check network connectivity

---

## Testing

### Test Connection
```bash
# From terminal
curl -k https://h2o-tower.local:8443/ping
# Should return: {"status":"ok","uptime":12345}
```

### Test Telemetry
```typescript
const manager = new PDS_web_NetworkManager({ ip: '192.168.1.100', port: 8443 });
const status = await manager.getDeviceStatus();
console.log(status.adcReadings[0]); // Water level
```

### Test BLE Discovery
```typescript
const ble = new PDS_web_ble_Manager();
const devices = await ble.discoverDevices();
console.log(devices); // H2O-TOWER-SETUP devices
```

---

## Development Workflow

### Phase 1: Foundation ✅ COMPLETE
- [x] Type definitions
- [x] Network communication (WiFi + BLE)
- [x] Automation pipeline system
- [x] Binary serialization
- [x] Documentation

### Phase 2: React UI 🔄 IN PROGRESS
- [ ] Create Vite config
- [ ] Create TypeScript config
- [ ] Build React components
- [ ] Implement state management
- [ ] Add styling

### Phase 3: Testing 📋 PLANNED
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E tests
- [ ] Browser compatibility tests

### Phase 4: Deployment 📋 PLANNED
- [ ] CI/CD setup (GitHub Actions)
- [ ] Production build optimization
- [ ] Deployment (Vercel/Netlify)
- [ ] Monitoring & logging

---

## Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| **IMPLEMENTATION_SUMMARY** | Overview of what was built | Everyone |
| **QUICK_REFERENCE** | API quick lookup | Developers |
| **AI-INSTRUCT** | Comprehensive guide | Developers |
| **PROJECT_STATUS** | Detailed progress | Project leads |
| **ARCHITECTURE_DIAGRAMS** | Visual reference | Architects |
| **DOCUMENTATION_INDEX** | Navigation guide | Everyone |

Start with [.dev-docs/DOCUMENTATION_INDEX.md](.dev-docs/DOCUMENTATION_INDEX.md) for full navigation.

---

## Related Projects

- **Device**: [../Device/](../Device/) - ESP32-C3 firmware
- **Android**: [../Android/](../Android/) - Kotlin app
- **HMI-BLE**: [../HMI-BLE/](../HMI-BLE/) - Shared provisioning (planned)
- **Protocol**: [../PROTOCOL.md](../PROTOCOL.md) - Communication spec

---

## Contributing

See [.ai/instruct.md](.ai/instruct.md) for:
- Naming conventions (strict compliance required)
- Code style guidelines
- Testing requirements
- PR review checklist

---

## License

Part of PDS-AutomationSuite project. See project-level LICENSE.

---

## Support

**Questions?** Check the [.dev-docs/DOCUMENTATION_INDEX.md](.dev-docs/DOCUMENTATION_INDEX.md) for which document to read.

**Bug reports?** Open an issue with device IP, error message, and browser used.

**Feature requests?** See [.dev-docs/IMPLEMENTATION_SUMMARY.md](.dev-docs/IMPLEMENTATION_SUMMARY.md) → "Next Steps"

---

## Status Summary

🟢 **FOUNDATION COMPLETE**
- 1,850+ lines TypeScript implementation
- All core network, serialization, and automation systems
- Comprehensive documentation (1,850+ lines)
- Ready for React UI development

📊 **Progress**: Foundation 100%, UI Layer 0%

⏱️ **ETA to MVP**: 2-3 weeks with 1 developer

---

**Project**: PDS-AutomationSuite H2o-Tower HMI-WEB  
**Latest**: December 18, 2025  
**Status**: 🟢 Foundation Complete  
**Next**: React UI Components

For more details, see [.dev-docs/DOCUMENTATION_INDEX.md](.dev-docs/DOCUMENTATION_INDEX.md)
