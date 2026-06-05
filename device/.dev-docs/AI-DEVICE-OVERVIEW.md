# PDS-AutomationSuite-02012026: H2O-Tower Device Firmware - Architecture & Directory Structure

**Status**: Production Ready  
**Platform**: ESP32-C3 (ESP-IDF)  
**Protocol**: HTTPS/REST (port 8443) with binary payloads + BLE Provisioning  
**Last Updated**: December 2025

---

## 1. Directory Structure Overview

```
Device/H2O-DEV-12102025/
├── main/                          ← Application-specific firmware
│   ├── main.c                     ← Entry point
│   ├── CMakeLists.txt             ← Main component build config
│   ├── idf_component.yml          ← IDF component metadata
│   ├── Kconfig.projbuild          ← Build-time configuration
│   ├── AI-INSTRUCT.md             ← Application naming conventions
│   └── [H2O_device_*.h/c]         ← Core device modules (to be added)
│
├── pds/                           ← Proprietary Data System (reusable components)
│   ├── pds_core/                  ← Core data types & utilities
│   ├── pds_network/               ← WiFi, BLE, HTTP, mDNS
│   ├── pds_storage/               ← NVS persistence layer
│   ├── pds_telemetry/             ← Sensor data collection
│   ├── pds_control/               ← Action pipeline & timers
│   ├── pds_hal/                   ← Hardware abstraction layer
│   │   ├── platform/
│   │   │   └── esp32c3_sm/
│   │   │       ├── hwrev_001/     ← Hardware revision 001 (default board)
│   │   │       ├── hwrev_002/     ← Hardware revision 002
│   │   │       └── common/        ← Shared platform files
│   │   ├── include/               ← Platform-agnostic headers
│   │   └── CMakeLists.txt
│   ├── pds_validation/            ← Input validation utilities
│   ├── AI-INSTRUCT.md             ← PDS package conventions
│   └── CMakeLists.txt
│
├── build/                         ← Build artifacts (generated)
├── managed_components/            ← ESP-IDF dependencies (generated)
├── .devcontainer/                 ← Docker dev environment
├── .vscode/                       ← VSCode settings
│
├── CMakeLists.txt                 ← Top-level build config
├── build.ps1                      ← Build helper script
├── sdkconfig*                     ← IDF configuration (generated)
├── README.md                      ← Project overview
└── CONSOLIDATION_GUIDE.md         ← Consolidation reference
```

---

## 2. Main Directory (`main/`)

**Purpose**: Application-specific firmware logic for H2O-Tower aeroponics control.

**Current Contents**: 
- `main.c` - Firmware entry point and main event loop
- `CMakeLists.txt` - Main component build configuration
- `idf_component.yml` - IDF component metadata
- `Kconfig.projbuild` - Build-time configuration options
- `AI-INSTRUCT.md` - Directory-specific naming and integration patterns

### Planned Files & Responsibilities

As the application grows, the following files may be added following the `H2O_device_{name}.{c,h}` naming convention:

| File | Purpose | Key Exports |
|------|---------|-------------|
| **H2O_device_types.h** | Shared type definitions | Pin enums, config structures |
| **H2O_device_pins.h/c** | Pin configuration table & initialization | `H2O_device_pins_init()`, pin table |
| **H2O_device_nvs.h/c** | NVS persistence for pin/timer config | `H2O_device_nvs_load()`, `save()` |
| **H2O_device_pipeline.h/c** | Action pipeline execution engine | `H2O_device_pipeline_execute()` |
| **H2O_device_telemetry.h/c** | Telemetry collection from sensors | `H2O_device_telemetry_collect()` |
| **H2O_device_timer.h/c** | Timer management (cycle, time-of-day) | `H2O_device_timer_check()` |
| **H2O_device_validation.h/c** | Input validation for commands | `H2O_device_validate_config()` |

### Naming Conventions

**Main Directory** (Device Application code):
- **Files**: `H2O_device_{name}.{c,h}` (uppercase `H2O_`, e.g., `H2O_device_pins.c`)
- **Public Functions**: `H2O_device_{function}()` (e.g., `H2O_device_pins_init()`)
- **Private Functions**: `_H2O_device_{function}()` (underscore prefix, e.g., `_H2O_device_validate_pin()`)
- **Type Definitions**: `h2o_{type}_t` (lowercase, e.g., `h2o_pin_def_t`)
- **Constants**: `H2O_CONSTANT_NAME` (UPPERCASE, e.g., `H2O_MAX_PINS`)

**Protocol/Wire Format** (shared Device ↔ Android):
- **Telemetry Structs**: `PDS_TELDATA_{name}` (e.g., `PDS_TELDATA_packet_t`, `PDS_TELDATA_adc_readings`)
- **Configuration Structs**: `PDS_TELCONF_{name}` (e.g., `PDS_TELCONF_packet_t`, `PDS_TELCONF_config_t`)

**PDS Package Code** (reusable components in `pds/`):
- See individual `pds/pds_*/AI-INSTRUCT.md` files for component-specific naming rules

### Key Responsibilities

1. **Pin Configuration Management**: Define and initialize all GPIO, ADC, PWM pins via lookup table
2. **Persistent Configuration**: Load/save pin and automation settings to NVS on boot
3. **Action Pipeline Execution**: Execute data flow (ADC → condition → output) each cycle
4. **Timer Management**: Handle time-of-day and cycle timer scheduling
5. **Telemetry Collection**: Aggregate sensor readings and device state
6. **Command Processing**: Receive and validate commands from HTTP server
7. **Event Coordination**: Orchestrate startup sequence (BLE → WiFi → HTTP → mDNS)

---

## 3. PDS Directory (`pds/`)

**Purpose**: Proprietary Data System - Reusable, platform-agnostic components for network, storage, and control.

Each component uses the `pds_` prefix and is self-contained with its own `CMakeLists.txt` and `include/` directory.

### Module Organization

| Module | Purpose | Files |
|--------|---------|-------|
| **pds_core/** | Core data types & utilities | Type definitions, enums, constants |
| **pds_network/** | WiFi, BLE, HTTP, mDNS | Network stack and API server |
| **pds_storage/** | NVS persistence layer | Configuration and data persistence |
| **pds_telemetry/** | Sensor data collection | Telemetry aggregation and formatting |
| **pds_control/** | Action pipeline & timers | Automation engine and scheduling |
| **pds_hal/** | Hardware abstraction layer | Platform-independent peripheral drivers |
| **pds_validation/** | Input validation utilities | Command and config validation |

**Naming Convention**: All PDS components use `pds_` prefix for modules, functions, types, and constants. See `pds/AI-INSTRUCT.md` for detailed rules.

---

### 3.1 pds_core/

**Purpose**: Core data types, enums, and shared utilities.

| Item | Purpose |
|------|---------|
| `include/h2o_types.h` | Global type definitions (pin functionality enums, etc.) |
| `include/h2o_constants.h` | System constants (timeouts, limits, etc.) |
| `include/h2o_errors.h` | Error codes and status enums |

**Key Exports**:
- Pin functionality enums: `ADC=0`, `PWM=1`, `GPIO_IN=2`, `GPIO_OUT=3`, etc.
- Configuration structures shared across device and Android

---

### 3.2 pds_network/

**Purpose**: Communication stack - WiFi, BLE provisioning, HTTP REST API, mDNS discovery.

**Subcomponents**:

| Module | Purpose | Key Functions |
|--------|---------|----------------|
| **h2o_wifi.c/h** | WiFi connection & coordinate startup | `h2o_device_wifi_init()` |
| **h2o_ble_provisioning.c/h** | BLE GATT service for WiFi setup | `h2o_ble_provisioning_init()`, `is_active()` |
| **h2o_http_server.c/h** | HTTP REST API on port 80 | `h2o_http_server_init()`, `register_handler()` |
| **h2o_mdns.c/h** | mDNS discovery (h2o-tower.local) | `h2o_mdns_init()`, `start()`, `stop()` |
| **h2o_https_server.c/h** | Legacy HTTPS server (port 8443) | For backward compatibility |
| **h2o_provisioning.c/h** | Legacy provisioning framework | Deprecated |
| **certs/** | Embedded SSL certificates | servercert.pem, prvtkey.pem |

**BLE Provisioning Details**:
```
Service: 0000181c-0000-1000-8000-00805f9b34fb
├── SSID Char:     00002a3d-0000-1000-8000-00805f9b34fb (write SSID)
├── Password Char: 00002a3e-0000-1000-8000-00805f9b34fb (write password)
└── Connect Char:  00002a3f-0000-1000-8000-00805f9b34fb (write 1 to trigger)
```

**HTTP REST Endpoints**:
```
GET  /status   → { "connected": true, "uptime_seconds": 12345, ... }
GET  /config   → { "pins": [...], "timers": [...] }
POST /config   → Update configuration (JSON body)
POST /command  → Execute command (JSON body)
GET  /ping     → { "status": "ok" }
```

**Naming Conventions**:
- Functions: `h2o_{module}_*` (e.g., `h2o_http_server_start()`)
- Event callbacks: `H2O_{module}_event_t` enums

---

### 3.3 pds_storage/

**Purpose**: NVS (Non-Volatile Storage) persistence layer for config, credentials, calibration.

| Module | Purpose |
|--------|---------|
| **pds_nvs.c/h** | NVS read/write wrapper with encryption |
| **pds_flash.c/h** | Flash memory utilities |

**Key Functions**:
- `pds_storage_save_config()` - Persist pin configuration
- `pds_storage_load_config()` - Restore config on boot
- `pds_storage_save_wifi_credentials()` - Encrypted WiFi SSID/password
- `pds_storage_clear_credentials()` - Reset WiFi (enable provisioning)

---

### 3.4 pds_telemetry/

**Purpose**: Sensor data collection, aggregation, and serialization.

| Module | Purpose |
|--------|---------|
| **pds_telemetry.c/h** | Telemetry collection & JSON serialization |
| **pds_metrics.c/h** | Metrics aggregation and statistics |

**Data Collection Pipeline**:
```
ADC Reads → Filter/Average → Telemetry Struct → JSON Encode → HTTP /status
```

**Key Exports**:
- `pds_telemetry_collect()` - Gather all sensor readings
- `pds_telemetry_to_json()` - Serialize to JSON for HTTP response

---

### 3.5 pds_control/

**Purpose**: Action pipeline execution and timer management.

| Module | Purpose |
|--------|---------|
| **pds_pipeline.c/h** | Data flow pipeline (ADC → condition → action) |
| **pds_timer.c/h** | Time-of-day and cycle timer execution |
| **pds_conditions.c/h** | Condition evaluation (high/low limits, PID, etc.) |

**Data Flow Patterns**:
```
Timer → Pin (time-based actuation)
ADC → Condition → Pin (sensor-driven digital output)
ADC → Condition → PWM (sensor-driven PWM output)
Pin → Condition → Action (limit control, interlocks)
```

**Key Functions**:
- `h2o_pipeline_execute()` - Run one cycle of action pipeline
- `h2o_timer_check()` - Evaluate scheduled timers
- `h2o_condition_evaluate()` - Test condition against current state

---

### 3.6 h2o_hal/

**Purpose**: Hardware Abstraction Layer - platform-agnostic interface with platform-specific implementations.

**Structure**:
```
h2o_hal/
├── include/                       ← Platform-agnostic APIs
│   ├── h2o_gpio.h                ← GPIO interface
│   ├── h2o_adc.h                 ← ADC interface
│   ├── h2o_pwm.h                 ← PWM interface
│   ├── h2o_spi.h                 ← SPI interface
│   └── h2o_pins.h                ← Pin definitions
├── h2o_pins.c                    ← Generic pin management
├── platform/                      ← Platform-specific implementations
│   └── esp32c3_sm/               ← ESP32-C3 specific
│       ├── HWVER_001/            ← Hardware revision 001
│       │   ├── h2o_gpio_esp32c3.c
│       │   ├── h2o_adc_esp32c3.c
│       │   ├── h2o_pwm_esp32c3.c
│       │   └── h2o_spi_esp32c3.c
│       └── HWVER_002/            ← Hardware revision 002
│           ├── h2o_gpio_esp32c3.c
│           ├── h2o_adc_esp32c3.c
│           ├── h2o_pwm_esp32c3.c
│           └── h2o_spi_esp32c3.c
└── CMakeLists.txt
```

**Modules**:

| Module | Purpose | File |
|--------|---------|------|
| **GPIO** | GPIO input/output control | `h2o_gpio.h` |
| **ADC** | ADC sampling and conversion | `h2o_adc.h` |
| **PWM** | PWM generation control | `h2o_pwm.h` |
| **SPI** | SPI communication (sensors, DACs) | `h2o_spi.h` |

**Key Features**:
- Platform-agnostic interface in `include/`
- Platform-specific implementations in `platform/{chip}/{hwver}/`
- Single configuration table for all pins
- Deterministic initialization order
- Abstraction from ESP-IDF specifics
- Support for multiple hardware revisions

---

### 3.7 pds_validation/

**Purpose**: Input validation and security checks.

| Module | Purpose |
|--------|---------|
| **h2o_validator.c/h** | Command/config validation |
| **h2o_sanitizer.c/h** | JSON sanitization |

**Key Functions**:
- `h2o_validate_pin_config()` - Check pin configuration bounds
- `h2o_validate_timer_config()` - Validate timer parameters
- `h2o_sanitize_json_string()` - Prevent injection attacks

---

## 4. Data Flow Architecture

### Boot Sequence

```
1. ESP32 boots → app_main()
   ↓
2. main.c initializes core hardware (GPIO, ADC, PWM)
   ↓
3. h2o_device_wifi_init() called
   ├─→ WiFi system initialized
   ├─→ Check NVS for saved WiFi credentials
   │   ├─ If found: Connect directly → HTTP/mDNS start
   │   └─ If not: Start BLE provisioning
   │       ├─ Wait for Android BLE connection
   │       ├─ Receive SSID/password via BLE characteristics
   │       ├─ Save to NVS (encrypted)
   │       └─ Connect to WiFi → HTTP/mDNS start
   ↓
4. h2o_http_server_init() starts listening on port 80
   ↓
5. h2o_mdns_start() advertises h2o-tower.local
   ↓
6. Main control loop begins
   ├─ Every 50ms: h2o_device_pipeline_execute()
   ├─ Every 500ms: h2o_device_telemetry_collect()
   └─ On HTTP request: Handle /status, /config, /command, /ping
```

### Normal Operation Loop

```
┌─────────────────────────────────────────────┐
│ Main Event Loop (50ms cycle)                │
├─────────────────────────────────────────────┤
│ 1. Read ADC values                          │
│ 2. Read GPIO digital inputs                 │
│ 3. Evaluate timers (time-of-day, cycle)     │
│ 4. Run action pipeline                      │
│    └─ For each pin: condition → output      │
│ 5. Update PWM outputs                       │
│ 6. Update GPIO outputs                      │
│ 7. Collect metrics                          │
│ 8. Check HTTP server (non-blocking)         │
│ 9. Sleep remainder of cycle                 │
└─────────────────────────────────────────────┘
```

### HTTP Request Handling

```
Android App (Poll every 500ms-5s)
   │
   ├─→ GET /status  → h2o_http_server_init() handler
   │   └─→ h2o_device_telemetry_collect()
   │       └─→ Return JSON: { ADC, PWM, GPIO, timers, ... }
   │
   ├─→ GET /config  → Return current pin/timer configuration
   │
   ├─→ POST /config → Parse JSON update
   │   └─→ h2o_device_validate_config()
   │       └─→ h2o_device_nvs_save()
   │           └─→ Restart affected subsystems
   │
   ├─→ POST /command → Parse JSON command
   │   └─→ Execute immediate action (e.g., toggle relay)
   │
   └─→ GET /ping    → { "status": "ok" }
```

---

## 5. Component Dependencies

### Build Dependency Graph

```
main/
  ├─ pds/pds_core           (types, constants)
  ├─ pds/pds_network        (WiFi, HTTP, BLE, mDNS)
  │  ├─ pds/pds_core
  │  ├─ pds/pds_storage     (NVS config persistence)
  │  └─ esp-idf (esp_wifi, esp_http_server, mbedtls, etc.)
  │
  ├─ pds/pds_hal            (GPIO, ADC, PWM drivers)
  │  ├─ pds/pds_core
  │  └─ esp-idf (driver_gpio, driver_adc, etc.)
  │
  ├─ pds/pds_control        (pipeline, timers)
  │  ├─ pds/pds_core
  │  ├─ pds/pds_hal
  │  └─ pds/pds_validation
  │
  ├─ pds/pds_telemetry      (sensor data, JSON)
  │  ├─ pds/pds_core
  │  └─ cjson (JSON serialization)
  │
  ├─ pds/pds_storage        (NVS, Flash)
  │  ├─ pds/pds_core
  │  └─ esp-idf (nvs_flash, mbedtls)
  │
  └─ pds/h2o_validation     (input checks)
     └─ pds/h2o_core
```

---

## 6. Build Configuration

### ESP-IDF Structure

**Top-level CMakeLists.txt**:
```cmake
# Declares main as the app
idf_build_executable(
    SRCS main/main.c
    COMPONENTS main
)
```

**main/CMakeLists.txt**:
```cmake
# Declares main as a component, depends on pds/*
idf_component_register(
    SRCS H2O_device_*.c
    INCLUDE_DIRS .
    REQUIRES pds/h2o_core pds/h2o_network pds/h2o_storage ...
)
```

**pds/h2o_network/CMakeLists.txt**:
```cmake
# Declares network component, depends on esp-idf libs
idf_component_register(
    SRCS h2o_ble_provisioning.c h2o_http_server.c h2o_mdns.c h2o_wifi.c ...
    INCLUDE_DIRS include
    REQUIRES esp_wifi esp_http_server mdns bt mbedtls cjson ...
)
```

### Build Commands

```bash
# Full clean build
idf.py clean && idf.py build

# Build only
idf.py build

# Flash to device (port varies by OS)
idf.py -p COM5 flash monitor      # Windows
idf.py -p /dev/ttyUSB0 flash monitor  # Linux

# Monitor serial output
idf.py monitor -p COM5
```

---

## 7. File Organization Principles

### ✅ Should Be in `main/`

- **Application Logic**: Pin configuration, automation rules, device behavior
- **High-Level Coordination**: Event loops, startup sequences, app state
- **Device-Specific Modules**: `H2O_device_*` for aeroponics control
- **IDF Project Files**: `CMakeLists.txt`, `idf_component.yml`, `Kconfig.projbuild`
- **Entry Point**: `main.c` with `app_main()`

### ✅ Should Be in `pds/{component}/`

- **Reusable Subsystems**: WiFi, HTTP, storage, validation
- **Hardware Abstraction**: GPIO, ADC, PWM drivers
- **Platform-Agnostic Code**: Code that could be used in other projects
- **Library-Style Components**: Self-contained, well-defined interfaces

### ❌ Should NOT Be in `main/`

- Network/communication code (belongs in `pds/h2o_network/`)
- Storage/NVS code (belongs in `pds/h2o_storage/`)
- Hardware drivers (belongs in `pds/h2o_hal/`)
- Validation logic (belongs in `pds/h2o_validation/`)
- Generic telemetry (belongs in `pds/h2o_telemetry/`)

---

## 8. Communication Protocols

### WiFi → HTTP REST (Primary)

**Discovery**: mDNS (`h2o-tower.local:80`)  
**Protocol**: HTTP 1.1, JSON body  
**Port**: 80 (plain text, no TLS)  
**Initiated By**: Android app (polling)  
**Typical Interval**: 500ms - 5s

**Example Flow**:
```
Android: GET /status HTTP/1.1
Device:  HTTP/1.1 200 OK
         Content-Type: application/json
         {
           "timestamp_ms": 1702756800000,
           "connected": true,
           "uptime_seconds": 86400,
           "telemetry": [
             {"pin": 0, "type": "ADC", "value": 2048},
             {"pin": 5, "type": "PWM", "duty": 75}
           ]
         }
```

### BLE Provisioning (First-Time Setup Only)

**Service**: `0000181c-0000-1000-8000-00805f9b34fb`  
**Characteristics**:
- SSID: `00002a3d-0000-1000-8000-00805f9b34fb` (write)
- Password: `00002a3e-0000-1000-8000-00805f9b34fb` (write)
- Connect: `00002a3f-0000-1000-8000-00805f9b34fb` (write 1 to trigger)

**Flow**:
```
1. Device boots without WiFi credentials
   └─ Advertises as H2O-TOWER-{MAC_LAST_4}

2. Android scans for BLE, finds device
   └─ Connects, opens provisioning service

3. Android writes SSID to characteristic
4. Android writes password to characteristic
5. Android writes 1 to connect characteristic
   └─ Device saves to NVS, connects to WiFi

6. On WiFi connect, BLE disconnects
   └─ HTTP server starts, mDNS advertising begins
```

---

## 9. Persistence & Configuration

### NVS Layout

```
WiFi Credentials
├─ ssid (32 bytes)
├─ password (64 bytes)
└─ encryption_key (16 bytes)

Device Configuration
├─ pin_table (serialized JSON)
├─ timer_config (serialized JSON)
├─ automation_rules (serialized JSON)
└─ calibration_data (key-value pairs)

System State
├─ uptime (milliseconds)
├─ reboot_count
└─ last_error (string)
```

**Persistence Strategy**:
1. On boot: Load NVS → restore pin/timer configuration
2. On change: Validate → save to NVS → apply to hardware
3. On error: Log to NVS → optionally revert to last good config

---

## 10. Development Workflow

### Adding a New Feature

1. **Determine Scope**: Is it device-specific or reusable?
   - Device-specific → Add to `main/H2O_device_*.c`
   - Reusable → Add to `pds/h2o_{component}/`

2. **Create Source File**: Follow naming: `h2o_{namespace}_{feature}.h/c`

3. **Add Header to `include/`**: Public interface only

4. **Update CMakeLists.txt**: Add source file to `SRCS`

5. **Implement with Conventions**:
   - Public: `h2o_component_function()`
   - Private: `_component_function()`
   - Structs: `h2o_component_config_t`

6. **Test**: Build and flash
   ```bash
   idf.py build
   idf.py -p COM5 flash monitor
   ```

### Example: Adding a New Sensor

```c
// pds/h2o_hal/include/h2o_sensor_co2.h
#ifndef H2O_SENSOR_CO2_H
#define H2O_SENSOR_CO2_H

esp_err_t h2o_sensor_co2_init(int adc_pin);
int h2o_sensor_co2_read_ppm(void);

#endif

// pds/h2o_hal/h2o_sensor_co2.c
#include "h2o_sensor_co2.h"
static int _adc_pin;

esp_err_t h2o_sensor_co2_init(int adc_pin) {
    _adc_pin = adc_pin;
    // Configure ADC, calibration, etc.
    return ESP_OK;
}

int h2o_sensor_co2_read_ppm(void) {
    int raw = _read_adc(_adc_pin);
    return _convert_to_ppm(raw);  // Private function
}
```

---

## 11. Quick Reference: File Locations

| Need | Location | File Pattern |
|------|----------|--------------|
| Pin definitions | `main/` | `H2O_device_pins.h` |
| Timer logic | `main/` | `H2O_device_timer.h` |
| WiFi config | `pds/h2o_network/` | `h2o_wifi.h` |
| HTTP endpoints | `pds/h2o_network/` | `h2o_http_server.h` |
| NVS persistence | `pds/h2o_storage/` | `h2o_nvs.h` |
| ADC reading | `pds/h2o_hal/` | `h2o_adc.h` |
| GPIO control | `pds/h2o_hal/` | `h2o_gpio.h` |
| Action pipeline | `pds/h2o_control/` | `h2o_pipeline.h` |
| Data types | `pds/h2o_core/` | `h2o_types.h` |
| Input validation | `pds/h2o_validation/` | `h2o_validator.h` |

---

## 12. Next Steps & Future Enhancements

- [ ] Implement complete JSON parsing for `/config` endpoint
- [ ] Add telemetry ring buffer for historical data
- [ ] Implement PID controller for PWM modulation
- [ ] Add time-of-day scheduling with cron-like syntax
- [ ] Migrate from HTTP to WebSocket for real-time updates
- [ ] Add HTTPS support (HTTPS server already exists on port 8443)
- [ ] Implement OTA firmware update mechanism
- [ ] Add comprehensive unit test suite

---

## References

- **Architecture**: See [../AI-INSTRUCT.md](../AI-INSTRUCT.md) and [../.github/copilot-instructions.md](../.github/copilot-instructions.md)
- **Build & Test**: See [BUILD_AND_TEST.md](../BUILD_AND_TEST.md)
- **Protocol Details**: See [PROTOCOL.md](../PROTOCOL.md)
- **Hardware**: See [HARDWARE.md](../HARDWARE.md)

