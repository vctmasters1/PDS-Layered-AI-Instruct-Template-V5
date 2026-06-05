# HMI-WEB Quick Reference

## Project Overview

**HMI-WEB** is a browser-based TypeScript/React application for controlling H2o-Tower aeroponics systems via HTTPS REST API (port 8443).

- **Direct Connection**: mDNS + local WiFi (`https://h2o-tower.local:8443`)
- **Internet Connection**: Gateway proxy + remote access (`https://api.example.com/devices/h2o-001`)
- **Provisioning**: Web Bluetooth API for WiFi setup on unprovisioned devices

---

## Quick Start (After Configuration)

```bash
cd HMI-WEB
npm install           # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build
npm run type-check   # Type checking only
```

---

## Core APIs

### WiFi Communication (Direct)
```typescript
import { PDS_web_NetworkManager } from './network/PDS_web_wifi';

const manager = new PDS_web_NetworkManager({
  ip: '192.168.1.100',
  port: 8443
});

const status = await manager.getDeviceStatus();
await manager.sendPwmCommand(2, 750); // Pin 2, 75% duty
```

### WiFi Communication (Internet)
```typescript
const manager = new PDS_web_NetworkManager({
  gatewayUrl: 'https://api.example.com/devices/h2o-001'
});

const status = await manager.getDeviceStatus();
```

### BLE Provisioning
```typescript
import { PDS_web_ble_Manager } from './network/PDS_web_ble';

const ble = new PDS_web_ble_Manager();
const devices = await ble.discoverDevices();
await ble.connect(devices[0].id);
await ble.provisionWiFi({
  ssid: 'MyWiFi',
  password: 'MyPassword123',
  proofOfPossession: 'H2o12345'
});
```

### Automation Pipelines
```typescript
import { createCycleTimerPipeline } from './automation/pipeline_builders';

// Create 6-hour on, 18-hour total cycle (misting schedule)
const pipeline = createCycleTimerPipeline(
  'Daily Misting',
  '00:06:00:00',  // On duration
  '00:18:00:00'   // Total cycle
);

await manager.sendAutomation(pipeline);
```

---

## File Structure

```
src/
├── index.ts                    # Public API exports
├── types/
│   └── pds_telemetry.ts       # Device packet definitions
├── network/
│   ├── PDS_web_wifi.ts        # HTTPS client (direct + internet)
│   └── PDS_web_ble.ts         # BLE provisioning
├── automation/
│   ├── datamodels.ts          # Pipeline interfaces and enums
│   └── pipeline_builders.ts   # Factory functions for common patterns
├── components/                # React components (TODO)
├── hooks/                     # React hooks (TODO)
└── styles/                    # CSS/styling (TODO)
```

---

## Key Enums

### ConditionType
- `NONE`, `THRESHOLD_ABOVE`, `THRESHOLD_BELOW`, `RANGE`, `GPIO_STATE`
- `TIMER`, `PID_SLEW_LOW`, `PID_SLEW_HIGH`, `MANUAL_BUTTON`, `AND`, `OR`

### ActionType
- `NONE`, `SET_PWM`, `SET_GPIO`, `TOGGLE_GPIO`, `SET_DAC`, `SERVO`, `TRIGGER_ACTION`

### TimerType
- `NONE`, `TIME_OF_DAY` (daily schedule), `CYCLE` (repeating pattern)

### PinFunction
- `NONE`, `ADC`, `PWM`, `GPIO_IN`, `GPIO_OUT`, `I2C_SDA`, `I2C_SCL`, `UART_TX`, `UART_RX`, `LED_ADDRESSABLE`

---

## Common Patterns

### Cycle Timer (Repeating Schedule)
```typescript
// Mist 6 hours every 18 hours
createCycleTimerPipeline('Misting', '00:06:00:00', '00:18:00:00')
```

### Threshold Safety (ADC Cutoff)
```typescript
// Turn off pump if water level < 200
createThresholdSafetyPipeline('Water Low', 3, 200, 5, 1, 1)
// Parameters: name, adcPin, threshold, outputPin, turnOffValue, delaySeconds
```

### GPIO Safety (Float Switch)
```typescript
// Turn off pump if float switch LOW
createGpioStateSafetyPipeline('Float Switch', 4, 0, 5, 1, 1)
// Parameters: name, inputPin, triggerState, outputPin, actionValue, delaySeconds
```

### Range Control (pH/Temperature)
```typescript
// Control heater to keep temp 22-28°C
createRangeControlPipeline('Temp Control', 3, 150, 200, 2, 700, 300, 1)
// Parameters: name, sensorPin, minValue, maxValue, outputPin, increaseValue, decreaseValue, delaySeconds
```

---

## Type Definitions (Key Interfaces)

### TeldataPacket (Device → Browser)
```typescript
interface TeldataPacket {
  header: TeldataHeader;
  adcReadings: AdcReading[];
  pwmOutputs: PwmState[];
  gpioStates: GpioState[];
  ledStates?: LedState[];
}

interface AdcReading {
  pinNumber: number;
  rawValue: number;
  voltage: number;
  calibratedValue: number;
  label: string;
}
```

### TelconfPacket (Browser → Device)
```typescript
interface TelconfPacket {
  header: TelconfHeader;
  targetPin: number;
  configValue: number;
}
```

### Pipeline (Automation)
```typescript
interface Pipeline {
  id: string;
  name: string;
  conditions: Condition[];
  actions: Action[];
  timer?: TimerConfig;
  enabled: boolean;
}

interface Condition {
  type: ConditionType;
  sourcePin: number;
  param1?: number;
  param2?: number;
  enableDelayMs?: number;
  disableDelayMs?: number;
}

interface Action {
  type: ActionType;
  targetPin: number;
  value: number;
  delayMs?: number;
}
```

---

## Configuration

### Device Connection (Direct WiFi)
```typescript
{
  ip: '192.168.1.100',        // or hostname 'h2o-tower.local'
  port: 8443                  // HTTPS port
}
```

### Device Connection (Internet)
```typescript
{
  gatewayUrl: 'https://api.example.com/devices/h2o-001'
}
```

### BLE Provisioning Config
```typescript
{
  ssid: 'MyWiFi',
  password: 'MyPassword123',
  proofOfPossession: 'H2o12345'  // Default PoP (change in production)
}
```

---

## Binary Packet Format (Reference)

### Telemetry Packet (Device → Browser)
```
Offset  Type        Size  Field
------  ----------  ----  -----------
0       uint32_t    4     timestamp_ms
4       uint32_t    4     timestamp_unix
8       uint16_t    2     version (0x0001)
10      uint16_t    2     packet_id
12      uint8_t     1     num_adc_readings
13      uint8_t     1     num_pwm_outputs
14      uint8_t     1     num_gpio_states
15      uint8_t     1     status_flags
16+     [variable]  var   ADC readings (42 bytes each)
...     [variable]  var   PWM states (38 bytes each)
...     [variable]  var   GPIO states (34 bytes each)
```

### Config Packet (Browser → Device)
```
Offset  Type        Size  Field
------  ----------  ----  -----------
0       uint32_t    4     timestamp_ms
4       uint16_t    2     version (0x0001)
6       uint16_t    2     config_type
8       uint8_t     1     target_pin
9       uint8_t     1     reserved
10      uint8_t     1     reserved
11      uint8_t     1     reserved
12      uint32_t    4     config_value
16      bytes       var   Optional payload
```

---

## Helper Functions

### Describe Condition (Human-Readable)
```typescript
import { describeCondition } from './automation/datamodels';

describeCondition({
  type: ConditionType.THRESHOLD_BELOW,
  sourcePin: 3,
  param1: 200
}, 'Water Level')
// Output: "Water Level < 200"
```

### Describe Action (Human-Readable)
```typescript
import { describeAction } from './automation/datamodels';

describeAction({
  type: ActionType.SET_PWM,
  targetPin: 2,
  value: 750
}, 'Pump')
// Output: "Pump PWM = 750 (75%)"
```

### Summarize Pipeline
```typescript
import { summarizePipeline } from './automation/datamodels';

const summary = summarizePipeline(pipeline);
// Output: "IF [conditions] THEN [actions]"
```

---

## Testing Device Connection

### Test Direct WiFi
```bash
# From terminal
curl -k https://h2o-tower.local:8443/ping

# Should return: {"status":"ok","uptime":12345}
```

### Test BLE Discovery
```typescript
const ble = new PDS_web_ble_Manager();
const devices = await ble.discoverDevices();
console.log(devices); // H2O-TOWER-SETUP devices
```

### Test Telemetry
```typescript
const manager = new PDS_web_NetworkManager({ ip: '192.168.1.100', port: 8443 });
const status = await manager.getDeviceStatus();
console.log(status.adcReadings[0].calibratedValue); // Water level
```

---

## Debugging

### Enable Verbose Logging
```typescript
// Add to network manager before use
const manager = new PDS_web_NetworkManager({ ... });

// Check browser console for network logs
// DevTools → Network tab → Filter for 'status', 'config', 'command'
```

### Check BLE Availability
```typescript
if (!navigator.bluetooth) {
  console.log('Web Bluetooth not available');
  // Fall back to manual IP entry
}
```

### Verify Certificate Pinning
```typescript
// Browser security warnings are expected for self-signed certs
// In production: use CA-signed cert or configure gateway proxy
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Page load | < 2s |
| Device discovery | < 5s |
| Telemetry poll | 500ms-5s (configurable) |
| Command latency | < 100ms |
| Memory usage | < 50MB |

---

## Browser Support

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| HTTPS | ✅ | ✅ | ✅ | ✅ |
| Web Bluetooth | ✅ | ✅ | ⚠️ | ❌ |
| React 18 | ✅ | ✅ | ✅ | ✅ |
| Fetch API | ✅ | ✅ | ✅ | ✅ |

---

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Connection refused" | Device offline or wrong IP | Check IP address, verify device on WiFi |
| "Certificate error" | Self-signed cert not trusted | Click "Advanced" → "Proceed anyway" |
| "BLE not supported" | Browser doesn't support Web Bluetooth | Use Chrome/Edge or manual IP entry |
| "Timeout" | Device taking too long to respond | Check network latency, increase timeout |
| "Invalid packet" | Corrupted telemetry data | Restart device, check WiFi signal |

---

## Related Files

- [AI-INSTRUCT.md](AI-INSTRUCT.md) - Full development guide
- [PROJECT_STATUS.md](PROJECT_STATUS.md) - Detailed progress tracking
- [../PROTOCOL.md](../PROTOCOL.md) - Device communication protocol
- [../Device/](../Device/) - Device firmware source

---

**Version**: 1.0.0  
**Last Updated**: December 18, 2025  
**Maintainer**: H2o-Tower Development Team
