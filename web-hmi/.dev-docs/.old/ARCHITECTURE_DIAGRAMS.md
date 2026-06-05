# HMI-WEB Architecture & Flow Diagrams

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    H2o-Tower Multi-Platform HMI                  │
└─────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │  Device      │
    │ (ESP32-C3)   │
    │              │
    │ HTTPS Server │
    │ Port 8443    │
    │ mDNS: local  │
    └──────┬───────┘
           │
    ┌──────┴──────┬─────────────────┬──────────────┐
    │             │                 │              │
    ▼             ▼                 ▼              ▼
┌─────────┐  ┌────────────┐  ┌──────────────┐  ┌──────────────┐
│ HMI-WEB │  │   Android  │  │   HMI-IOS    │  │  HMI-BLE     │
│(Browser)│  │  (Kotlin)  │  │   (Swift)    │  │ (Abstraction)│
│         │  │            │  │   (Future)   │  │              │
│TypeScript│  │ Jetpack    │  │ SwiftUI      │  │ Shared Setup │
│ React   │  │ Compose    │  │              │  │ & Discovery  │
└────┬────┘  └──────┬─────┘  └──────┬───────┘  └──────┬───────┘
     │              │                │                │
     └──────────────┴────────────────┴────────────────┘
              │
         Direct WiFi: mDNS + HTTPS (local network)
         Internet WiFi: Gateway proxy + HTTPS (remote)
         BLE: Web Bluetooth API (provisioning only)
```

---

## HMI-WEB Module Architecture

```
┌─────────────────────────────────────────────────┐
│                  HMI-WEB Application             │
│            (React Components Layer)              │
│  App.tsx, Dashboard, ControlPanel, etc.         │
└────────────────────┬────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌────────┐  ┌─────────┐  ┌──────────┐
   │ Hooks  │  │  State  │  │ Styling  │
   │        │  │Mgmt(TODO)  │  (TODO)    │
   └────┬───┘  └────┬────┘  └────┬─────┘
        │            │            │
        └────────────┼────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
    ┌──────────────┐      ┌───────────────┐
    │   Network    │      │  Automation   │
    │   Managers   │      │   Pipeline    │
    │              │      │    System     │
    ├──────────────┤      ├───────────────┤
    │ WiFi (Direct)│      │ Conditions    │
    │ WiFi(Internet)       │ Actions       │
    │ BLE (Setup) │      │ Timers        │
    │              │      │ Builders      │
    └──────┬───────┘      └───────┬───────┘
           │                     │
        ┌──┴─────────────────────┴──┐
        ▼                           ▼
    ┌────────────┐         ┌──────────────────┐
    │  Binary    │         │   Type Definitions│
    │ Serializer │         │   (pds_telemetry)│
    │            │         │                  │
    │ Telemetry  │         │ TeldataPacket    │
    │ Config     │         │ TelconfPacket    │
    │ Automation │         │ PinFunction      │
    └────────────┘         │ ConfigType       │
                           └──────────────────┘
```

---

## Data Flow Diagrams

### 1. Device Discovery & Connection (Direct WiFi)

```
User Opens App
    │
    ▼
┌──────────────────────────┐
│ mDNS Discovery           │
│ (PDS_web_wifi_Discovery) │
│ Look for h2o-tower.local │
└─────────┬────────────────┘
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
 SUCCESS   FAIL (timeout)
    │           │
    │           ▼
    │     ┌────────────────────┐
    │     │ Manual IP Entry    │
    │     │ User enters IP     │
    │     │ e.g., 192.168.1.100
    │     └────────┬───────────┘
    │             │
    └─────┬───────┘
          │
          ▼
    ┌──────────────────────┐
    │ Test Connection      │
    │ /ping endpoint       │
    └─────────┬────────────┘
              │
         ┌────┴────┐
         │         │
         ▼         ▼
      SUCCESS   FAIL
         │         │
         │         ▼
         │    ┌──────────────────┐
         │    │ Show Error       │
         │    │ Retry or Manual  │
         │    └──────────────────┘
         │
         ▼
    ┌──────────────────────┐
    │ CONNECTED            │
    │ Start polling /status│
    │ (1000ms interval)    │
    └──────────────────────┘
```

### 2. Device Discovery & Connection (Internet WiFi)

```
User Configures Gateway URL
    │
    ▼
┌────────────────────────────────┐
│ Enter Gateway Endpoint         │
│ https://api.example.com/devices│
└────────────────┬───────────────┘
                 │
                 ▼
          ┌─────────────────┐
          │ Test Connection │
          │ GET /ping       │
          └────────┬────────┘
                   │
              ┌────┴────┐
              │         │
              ▼         ▼
           SUCCESS   FAIL
              │         │
              │         ▼
              │    ┌──────────────────┐
              │    │ Show Error       │
              │    │ Check gateway URL│
              │    └──────────────────┘
              │
              ▼
         ┌─────────────────┐
         │ CONNECTED       │
         │ Start polling   │
         │ (via gateway)   │
         └─────────────────┘
```

### 3. BLE Provisioning Flow (Unprovisioned Device Setup)

```
Device Powers On (No WiFi in NVS)
    │
    ▼
┌──────────────────────────────┐
│ Device enters provisioning   │
│ mode                         │
│ BLE Service: H2O-TOWER-SETUP │
└────────────┬─────────────────┘
             │
             ▼
    ┌────────────────────────┐
    │ User Opens HMI-WEB     │
    │ Clicks "Provision"     │
    └────────────┬───────────┘
                 │
                 ▼
    ┌────────────────────────────────┐
    │ Browser checks Web Bluetooth   │
    │ Support (Chrome/Edge only)     │
    └────────────┬────────────────────┘
                 │
          ┌──────┴──────┐
          │             │
          ▼             ▼
       SUPPORTED   NOT SUPPORTED
          │             │
          │             ▼
          │         ┌──────────────┐
          │         │ Show Error   │
          │         │ Use manual IP│
          │         └──────────────┘
          │
          ▼
    ┌──────────────────────────┐
    │ BLE Discovery            │
    │ (PDS_web_ble_Manager)    │
    │ Scan for H2O-TOWER-SETUP │
    └───────────┬──────────────┘
                │
         ┌──────┴──────┐
         │             │
         ▼             ▼
      FOUND        TIMEOUT
         │             │
         │             ▼
         │         ┌──────────────┐
         │         │ Retry or use │
         │         │ manual IP    │
         │         └──────────────┘
         │
         ▼
    ┌────────────────────────┐
    │ Select Device          │
    │ Connect to GATT Server │
    └────────────┬───────────┘
                 │
                 ▼
    ┌────────────────────────────┐
    │ User enters WiFi creds     │
    │ SSID + Password            │
    └────────────┬───────────────┘
                 │
                 ▼
    ┌────────────────────────────────┐
    │ Send via BLE                   │
    │ (PoP challenge: H2o12345)      │
    │ (Credentials encrypted)         │
    └────────────┬────────────────────┘
                 │
         ┌───────┴───────┐
         │               │
         ▼               ▼
      SUCCESS         FAIL
         │              │
         │              ▼
         │         ┌──────────────┐
         │         │ Show error   │
         │         │ Retry        │
         │         └──────────────┘
         │
         ▼
    ┌───────────────────────────┐
    │ Device connects to WiFi   │
    │ (using provided creds)    │
    └────────────┬──────────────┘
                 │
         ┌───────┴───────┐
         │               │
         ▼               ▼
      SUCCESS         FAIL
         │              │
         │              ▼
         │         ┌──────────────┐
         │         │ Device stays │
         │         │ in prov mode │
         │         │ Try again    │
         │         └──────────────┘
         │
         ▼
    ┌──────────────────────────┐
    │ Device saves creds in NVS│
    │ Sets provisioned flag    │
    │ Disables BLE             │
    │ Starts HTTPS server      │
    └────────────┬─────────────┘
                 │
                 ▼
    ┌──────────────────────────┐
    │ App shows "Ready"        │
    │ Disconnect from BLE      │
    │ Switch to WiFi connection│
    └──────────────────────────┘
```

### 4. Telemetry Polling Loop

```
User Connected to Device
    │
    ▼
┌──────────────────────────────┐
│ Start Telemetry Polling      │
│ Interval: 1000ms (default)   │
└────────────┬─────────────────┘
             │
             ├─────────────────────┐
             │                     │
             ▼                     │ (Repeat every 1000ms)
    ┌────────────────────┐         │
    │ Send GET /status   │         │
    │ to device          │         │
    └────────┬───────────┘         │
             │                     │
         ┌───┴────┐                │
         │        │                │
         ▼        ▼                │
      200 OK  TIMEOUT              │
         │        │                │
         │        ▼                │
         │    ┌────────────┐       │
         │    │ Retry or   │       │
         │    │ Disconnect │       │
         │    │ Check IP   │       │
         │    └────────────┘       │
         │                         │
         ▼                         │
    ┌─────────────────────────┐   │
    │ Deserialize binary data │   │
    │ TeldataPacket parsing   │   │
    │ (using TelemetrySerializer) │
    └────────────┬────────────┘   │
                 │                 │
                 ▼                 │
    ┌─────────────────────────┐   │
    │ Extract:                │   │
    │ - ADC readings          │   │
    │ - PWM states            │   │
    │ - GPIO states           │   │
    │ - Packet ID             │   │
    │ - Timestamp             │   │
    └────────────┬────────────┘   │
                 │                 │
                 ▼                 │
    ┌─────────────────────────┐   │
    │ Update UI Dashboard     │   │
    │ Display sensor values   │   │
    │ Show telemetry graph    │   │
    └────────────┬────────────┘   │
                 │                 │
                 └─────────────────┘
```

### 5. Command Sending Flow (Example: PWM Control)

```
User Moves PWM Slider
    │
    ▼
┌──────────────────────────┐
│ Slider Value Changed     │
│ New value: 750 (75%)     │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ Validation               │
│ Check: 0 ≤ duty ≤ 1000? │
└────────────┬─────────────┘
             │
         ┌───┴────┐
         │        │
         ▼        ▼
      VALID   INVALID
         │        │
         │        ▼
         │    ┌───────────────┐
         │    │ Show error    │
         │    │ Reset slider  │
         │    └───────────────┘
         │
         ▼
┌──────────────────────────┐
│ Create TelconfPacket     │
│ config_type: SET_PWM_DUTY│
│ target_pin: 2            │
│ config_value: 750        │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ Serialize to binary      │
│ (using TelemetrySerializer)
│ 16 bytes header + data   │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ Send POST /config        │
│ Content-Type: octet-stream
│ Payload: binary packet   │
└────────────┬─────────────┘
             │
         ┌───┴────┐
         │        │
         ▼        ▼
      200 OK    ERROR
         │        │
         │        ▼
         │    ┌─────────────┐
         │    │ Retry with  │
         │    │ exponential │
         │    │ backoff     │
         │    └─────────────┘
         │
         ▼
┌──────────────────────────┐
│ Device receives config   │
│ Validates packet         │
│ Updates PWM output       │
│ Returns 200 OK           │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ Browser shows success    │
│ UI slider confirmed      │
│ PWM output updated       │
│ (Verified in next poll)  │
└──────────────────────────┘
```

### 6. Automation Pipeline Deployment

```
User Creates Pipeline
    │
    ▼
┌──────────────────────────────┐
│ Automation Builder           │
│ Select condition type        │
│ Define threshold values      │
│ Select action               │
│ Set delays                  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Pipeline Object Created      │
│ {                            │
│   id, name,                 │
│   conditions[], actions[],   │
│   timer (optional)           │
│ }                            │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Validation                   │
│ - Check pin numbers valid?   │
│ - Check values in range?     │
│ - Check logic sound?         │
└──────────────┬───────────────┘
               │
           ┌───┴────┐
           │        │
           ▼        ▼
        VALID    INVALID
           │        │
           │        ▼
           │    ┌──────────────┐
           │    │ Show error   │
           │    │ Correct form │
           │    └──────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Serialize Pipeline           │
│ (Custom serialization)       │
│ Condition array +            │
│ Action array +               │
│ Timer config (if present)    │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Send POST /automation        │
│ Content-Type: octet-stream   │
│ Payload: serialized pipeline │
└──────────────┬───────────────┘
               │
           ┌───┴────┐
           │        │
           ▼        ▼
        200 OK    ERROR
           │        │
           │        ▼
           │    ┌──────────────┐
           │    │ Show error   │
           │    │ Retry        │
           │    └──────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Device receives pipeline     │
│ Validates structure          │
│ Loads conditions & actions   │
│ Starts timer (if present)    │
│ Returns 200 OK               │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Browser shows success        │
│ Display pipeline summary     │
│ Show "Active" status         │
│ Can edit/disable if needed   │
└──────────────────────────────┘
```

---

## Component Hierarchy (To Be Implemented)

```
App.tsx (Root)
├── Router (React Router or custom)
│
├── AppLayout
│   ├── Header
│   │   ├── Title
│   │   ├── Connection Status
│   │   └── Settings Button
│   │
│   ├── Sidebar / Navigation
│   │   ├── Dashboard (current)
│   │   ├── Control Panel
│   │   ├── Automation
│   │   ├── Settings
│   │   └── Help
│   │
│   └── Main Content Area
│
├── DeviceListScreen
│   ├── Discovery Results
│   │   ├── mDNS Results List
│   │   ├── BLE Device List (if available)
│   │   └── Manual IP Entry Form
│   │
│   └── Connection Controls
│       ├── Connect Button
│       ├── Test Connection
│       └── Save Connection
│
├── DashboardScreen
│   ├── Telemetry Display
│   │   ├── ADC Readings (graphs/gauges)
│   │   ├── PWM States (bars)
│   │   ├── GPIO States (indicators)
│   │   └── LED States (if present)
│   │
│   ├── Status Indicators
│   │   ├── WiFi Signal Strength
│   │   ├── Connection Status
│   │   ├── Device Uptime
│   │   └── Last Update Time
│   │
│   └── Quick Actions
│       ├── Refresh Now
│       ├── Emergency Stop
│       └── Connection Settings
│
├── ControlPanel
│   ├── PWM Controls
│   │   ├── Slider (0-1000 range)
│   │   ├── Manual Value Input
│   │   ├── Frequency Selector
│   │   └── Apply Button
│   │
│   ├── GPIO Controls
│   │   ├── Toggle Button (ON/OFF)
│   │   ├── Pulse Control (optional)
│   │   └── Apply Button
│   │
│   └── DAC/Servo Controls (if applicable)
│
├── AutomationBuilder
│   ├── Pipeline List
│   │   ├── Existing Pipelines
│   │   ├── Enable/Disable Toggle
│   │   ├── Edit Button
│   │   └── Delete Button
│   │
│   ├── Pipeline Creator
│   │   ├── Name Input
│   │   │
│   │   ├── Conditions Section
│   │   │   ├── Add Condition Button
│   │   │   ├── Condition Type Selector
│   │   │   ├── Parameter Inputs
│   │   │   └── Condition List
│   │   │
│   │   ├── Logical Operator (AND/OR)
│   │   │
│   │   ├── Actions Section
│   │   │   ├── Add Action Button
│   │   │   ├── Action Type Selector
│   │   │   ├── Parameter Inputs
│   │   │   └── Action List
│   │   │
│   │   ├── Timer Section (Optional)
│   │   │   ├── Timer Type Selector
│   │   │   └── Timer Parameters
│   │   │
│   │   └── Deploy / Test / Cancel
│   │
│   └── Pipeline Templates
│       ├── Cycle Timer Template
│       ├── Threshold Safety
│       ├── GPIO Safety
│       └── Range Control
│
└── SettingsScreen
    ├── Connection Settings
    │   ├── Direct WiFi (IP/hostname)
    │   ├── Internet WiFi (gateway URL)
    │   └── Connection Test
    │
    ├── Telemetry Settings
    │   ├── Poll Interval (500ms-5s)
    │   ├── Graph History Duration
    │   └── Auto-Refresh Toggle
    │
    ├── UI Settings
    │   ├── Theme (Light/Dark)
    │   ├── Units (Metric/Imperial)
    │   └── Chart Type (Graph/Gauge/Text)
    │
    ├── Device Info
    │   ├── Device Name
    │   ├── Firmware Version
    │   ├── Uptime
    │   └── Connected Duration
    │
    └── Reset / Help
        ├── Disconnect Device
        ├── Clear Cache
        └── View Documentation
```

---

## State Management Architecture (To Be Implemented)

```
Context / Store Structure:

┌──────────────────────────────────────────┐
│          DeviceConnectionContext         │
├──────────────────────────────────────────┤
│ State:                                   │
│  - connectionMode (direct|internet|ble)  │
│  - ipAddress / hostname                  │
│  - gatewayUrl                            │
│  - connectionStatus (connected|failed)   │
│  - lastConnectTime                       │
│  - error (if any)                        │
│                                          │
│ Methods:                                 │
│  - connectDirect(ip, port)               │
│  - connectInternet(gateway)              │
│  - disconnect()                          │
│  - testConnection()                      │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│        DeviceTelemetryContext            │
├──────────────────────────────────────────┤
│ State:                                   │
│  - lastTelemetry (TeldataPacket)         │
│  - telemetryHistory (rolling buffer)     │
│  - isPolling (true|false)                │
│  - pollInterval (ms)                     │
│  - lastUpdateTime                        │
│  - pollError (if any)                    │
│                                          │
│ Methods:                                 │
│  - startPolling()                        │
│  - stopPolling()                         │
│  - setPollInterval()                     │
│  - getTelemetryHistory()                 │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│       DeviceAutomationContext            │
├──────────────────────────────────────────┤
│ State:                                   │
│  - pipelines (Map<id, Pipeline>)         │
│  - activePipeline (current editing)      │
│  - deployedPipelines (Set<id>)           │
│  - lastDeployTime                        │
│  - deployError (if any)                  │
│                                          │
│ Methods:                                 │
│  - loadPipelines()                       │
│  - createPipeline()                      │
│  - deployPipeline()                      │
│  - editPipeline()                        │
│  - deletePipeline()                      │
│  - describePipeline()                    │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│         UISettingsContext                │
├──────────────────────────────────────────┤
│ State:                                   │
│  - theme (light|dark)                    │
│  - units (metric|imperial)               │
│  - chartType (graph|gauge|text)          │
│  - pollInterval (user preference)        │
│  - autoRefresh (true|false)              │
│  - sidebarCollapsed (true|false)         │
│                                          │
│ Methods:                                 │
│  - setTheme()                            │
│  - setUnits()                            │
│  - setChartType()                        │
│  - savePreferences() → localStorage      │
└──────────────────────────────────────────┘
```

---

## Error Handling Strategy

```
┌─────────────────────────────────────────┐
│      Error Handling Hierarchy            │
└─────────────────────────────────────────┘

Network Errors:
├── Connection Timeout
│   └─> Show: "Device not responding"
│   └─> Action: Retry with 2s backoff
│   └─> Max 3 retries before disconnect
│
├── Certificate Error (Self-Signed)
│   └─> Show: "Security warning (expected)"
│   └─> Action: Allow user to accept anyway
│   └─> Use certificate pinning
│
├── 404 Not Found
│   └─> Show: "Invalid device/endpoint"
│   └─> Action: Check IP address
│   └─> Suggest manual IP entry
│
└── Connection Lost
    └─> Show: "Disconnected from device"
    └─> Action: Auto-reconnect or prompt

Device Errors:
├── Invalid Config Packet
│   └─> Show: "Invalid command parameters"
│   └─> Action: Correct and retry
│   └─> Validate before sending
│
├── Pin Out of Range
│   └─> Show: "Pin number invalid (0-21)"
│   └─> Action: Suggest valid pins
│   └─> Prevent user input validation
│
└── Value Out of Range
    └─> Show: "PWM must be 0-1000"
    └─> Action: Clamp to valid range
    └─> Provide visual feedback

BLE Errors:
├── Device Not Found
│   └─> Show: "No H2O-TOWER-SETUP found"
│   └─> Action: Retry discovery or manual IP
│   └─> Check Bluetooth is enabled
│
├── Connection Failed
│   └─> Show: "Could not connect to device"
│   └─> Action: Retry or switch browser
│   └─> Suggest Chrome/Edge for Web Bluetooth
│
└── Provisioning Failed
    └─> Show: "WiFi credentials rejected"
    └─> Action: Check SSID/password
    └─> Restart device and retry

UI Errors:
├── Component Crash
│   └─> Show: Error boundary with fallback
│   └─> Action: Reload page or go home
│   └─> Log to console for debugging
│
└── Data Serialization Error
    └─> Show: "Unexpected data format"
    └─> Action: Disconnect and reconnect
    └─> Check firmware version match
```

---

## Performance Optimization Strategy

```
Optimization Areas:

1. Telemetry Polling
   ├─ Configurable interval (500ms - 5s)
   ├─ Skip update if data unchanged
   ├─ Use useCallback to prevent re-renders
   └─ Debounce UI updates

2. React Rendering
   ├─ Use React.memo for components
   ├─ useMemo for derived data
   ├─ useCallback for event handlers
   ├─ Split large components
   └─ Virtual scrolling for long lists

3. Binary Serialization
   ├─ Use typed arrays (Uint8Array)
   ├─ Reuse buffers where possible
   ├─ Lazy parse only visible data
   └─ Cache schema definitions

4. Network Efficiency
   ├─ Reuse HTTP connections
   ├─ Enable gzip compression
   ├─ Cache GET /config responses
   └─ Batch commands if possible

5. Bundle Size
   ├─ Tree-shake unused code
   ├─ Lazy load components
   ├─ Code split by route
   └─ Minify for production

6. Asset Loading
   ├─ Lazy load images/icons
   ├─ CSS critical path optimization
   ├─ Preload fonts
   └─ Use SVG for icons (scalable)
```

---

**Diagram Legend**:
- `┌─────┐` = Box / Component / Container
- `│` = Vertical connection / hierarchy
- `─` = Horizontal connection / flow
- `▼` = Down arrow / progression
- `┬` = T-junction / splitting
- `├` = Left branch
- `└` = Final branch
- `→` = Right arrow / alternative

---

**Document**: HMI-WEB Architecture & Flow Diagrams  
**Date**: December 18, 2025  
**Purpose**: Visual reference for system architecture and data flows
