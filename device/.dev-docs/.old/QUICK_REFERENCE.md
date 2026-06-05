# PDS-AutomationSuite-02012026: H2O-Tower Device - Quick Reference Guide

**Last Updated**: December 16, 2025

---

## Directory Map

### Root Level: `Device/H2O-DEV-12102025/`

| Item | Purpose | Keep? |
|------|---------|-------|
| `main/` | App-specific aero logic | ✅ YES |
| `pds/` | Reusable components (Proprietary Data System) | ✅ YES |
| `build/` | Build artifacts (generated) | ⚠️ Generated |
| `managed_components/` | ESP-IDF dependencies (generated) | ⚠️ Generated |
| `CMakeLists.txt` | Top-level build config | ✅ YES |
| `build.ps1` | Build helper script | ✅ YES |
| `sdkconfig*` | IDF config files | ⚠️ Generated |
| `.vscode/`, `.devcontainer/` | Dev environment | ✅ YES |
| `.gitignore` | Git ignore rules | ✅ YES |

---

## Main Directory Contents

### `main/` - Only These Files Should Be Here

```
main/
├── main.c                          ← Firmware entry point
├── H2O_device_types.h              ← Type definitions
├── H2O_device_pins.h/c             ← Pin configuration table
├── H2O_device_nvs.h/c              ← NVS persistence (device config)
├── H2O_device_pipeline.h/c         ← Action pipeline execution
├── H2O_device_telemetry.h/c        ← Sensor aggregation
├── H2O_device_timer.h/c            ← Timer management
├── H2O_device_validation.h/c       ← Input validation
├── CMakeLists.txt                  ← Build configuration
├── idf_component.yml               ← Component metadata
└── Kconfig.projbuild               ← Build-time options
```

**All files start with `H2O_device_*` because they're device/aero-specific.**

---

## PDS Directory Structure

### `pds/` - Reusable Components

```
pds/
├── h2o_core/                       ← Types, constants, enums
├── h2o_network/                    ← WiFi, HTTP, BLE, mDNS
├── h2o_storage/                    ← NVS, Flash persistence
├── h2o_telemetry/                  ← Sensor data collection
├── h2o_control/                    ← Pipeline framework, timers
├── h2o_hal/                        ← GPIO, ADC, PWM drivers
└── h2o_validation/                 ← Input validation, sanitization
```

**All files start with `h2o_{component}_*` for reusability.**

### Each Component Structure

```
pds/h2o_{component}/
├── include/
│   └── h2o_{component}.h          ← Public interface
├── h2o_{component}.c              ← Implementation
├── CMakeLists.txt                 ← Build config
└── ... (additional source files)
```

---

## Naming Conventions

### Main Directory (Device-Specific)

| Category | Pattern | Example |
|----------|---------|---------|
| Files | `H2O_device_{module}.*` | `H2O_device_pins.c` |
| Public Functions | `H2O_device_{module}_{function}()` | `H2O_device_pins_init()` |
| Private Functions | `_H2O_{module}_{function}()` | `_H2O_pins_read_raw()` |
| Types | `H2O_{context}_{type}` | `H2O_pin_config_t` |
| Enums | `H2O_{context}_{name}_e` | `H2O_pin_functionality_e` |

### PDS Components (Reusable)

| Category | Pattern | Example |
|----------|---------|---------|
| Files | `h2o_{component}_{module}.*` | `h2o_network_wifi.c` |
| Public Functions | `H2o_{component}_{function}()` | `H2o_http_server_init()` |
| Private Functions | `_h2o_{component}_{function}()` | `_http_send_response()` |
| Types | `H2o_{component}_{type}_t` | `H2o_http_response_t` |
| Event Callbacks | `H2O_{component}_event_t` | `H2O_ble_event_t` |

---

## Where to Put New Code

### Decision Tree

```
New code is...?
├─ Device-specific aeroponics logic     → main/H2O_device_{name}.c
├─ Network/WiFi/HTTP/BLE               → pds/h2o_network/h2o_{name}.c
├─ Low-level GPIO/ADC/PWM driver       → pds/h2o_hal/h2o_{name}.c
├─ Data persistence (NVS, Flash)       → pds/h2o_storage/h2o_{name}.c
├─ Action pipeline or timers           → pds/h2o_control/h2o_{name}.c
├─ Sensor data collection              → pds/h2o_telemetry/h2o_{name}.c
├─ Input validation or security        → pds/h2o_validation/h2o_{name}.c
└─ Type definitions or constants       → pds/h2o_core/h2o_{name}.h
```

---

## File Locations by Feature

| Feature | File Location | Functions |
|---------|---------------|-----------|
| **Pin Configuration** | `main/H2O_device_pins.c` | `H2O_device_pins_init()`, pin table |
| **Timer Scheduling** | `main/H2O_device_timer.c` | `H2O_device_timer_check()` |
| **WiFi Connection** | `pds/h2o_network/h2o_wifi.c` | `H2o_device_wifi_init()` |
| **BLE Provisioning** | `pds/h2o_network/h2o_ble_provisioning.c` | `H2o_ble_provisioning_init()` |
| **HTTP REST API** | `pds/h2o_network/h2o_http_server.c` | `H2o_http_server_init()` |
| **mDNS Discovery** | `pds/h2o_network/h2o_mdns.c` | `H2o_mdns_start()` |
| **GPIO Control** | `pds/h2o_hal/h2o_gpio.c` | `H2o_gpio_write()` |
| **ADC Reading** | `pds/h2o_hal/h2o_adc.c` | `H2o_adc_read()` |
| **NVS Save/Load** | `pds/h2o_storage/h2o_nvs.c` | `H2o_storage_save_config()` |
| **Telemetry** | `pds/h2o_telemetry/h2o_telemetry.c` | `H2o_telemetry_collect()` |
| **Pipeline** | `pds/h2o_control/h2o_pipeline.c` | `H2o_pipeline_execute()` |
| **Validation** | `pds/h2o_validation/h2o_validator.c` | `H2o_validate_config()` |

---

## Build Commands

```bash
# Clean and rebuild
idf.py clean && idf.py build

# Build only
idf.py build

# Flash to device (Windows - adjust COM port)
idf.py -p COM5 flash monitor

# Flash to device (Linux)
idf.py -p /dev/ttyUSB0 flash monitor

# Monitor serial output
idf.py monitor -p COM5

# Set target before build (if needed)
idf.py set-target esp32c3
```

---

## Key Data Flows

### Boot Sequence

```
1. app_main() in main.c
   ↓
2. Initialize hardware (GPIO, ADC, PWM)
   ↓
3. Load config from NVS
   ↓
4. H2o_device_wifi_init()
   ├─ Check for WiFi credentials
   ├─ If none: Start BLE provisioning (wait)
   ├─ If found: Connect to WiFi
   ↓
5. Start HTTP server (port 80)
   ↓
6. Start mDNS (h2o-tower.local)
   ↓
7. Main loop (50ms cycles)
```

### Main Event Loop

```
Every 50ms:
  1. H2o_hal_adc_read_all()        ← Read sensor values
  2. H2o_hal_gpio_read_all()       ← Read digital inputs
  3. H2o_device_timer_check()      ← Evaluate timers
  4. H2o_device_pipeline_execute() ← Run action pipeline
  5. H2o_hal_pwm_update()          ← Update PWM outputs
  6. H2o_hal_gpio_write_all()      ← Update digital outputs
  7. Sleep remainder of cycle

Every 500ms (10 cycles):
  - H2o_device_telemetry_collect()    ← Aggregate metrics
  
On HTTP request:
  - Handle /status, /config, /command, /ping
```

### HTTP Request Flow

```
GET /status
  ↓
H2o_http_server → H2O_device_telemetry_collect()
                 ↓
              Return JSON with sensor data
                 ↓
             Send HTTP 200 OK with JSON body
```

---

## API Quick Reference

### Core Functions

```c
// Boot & Initialization
void app_main(void);
esp_err_t H2O_device_pins_init(void);
esp_err_t H2o_device_wifi_init(void);

// Runtime
void H2O_device_pipeline_execute(void);
H2O_TELDATA_packet_t H2O_device_telemetry_collect(void);
bool H2O_device_timer_check(void);

// Configuration
esp_err_t H2O_device_nvs_load_config(void);
esp_err_t H2O_device_nvs_save_config(void);
bool H2O_device_validate_config(const char *json);

// Network (pds/)
esp_err_t H2o_http_server_start(void);
esp_err_t H2o_ble_provisioning_init(H2O_ble_callback_t cb);
esp_err_t H2o_mdns_start(void);

// Hardware (pds/)
int H2o_adc_read(int channel);
void H2o_pwm_write(int pin, int duty);
void H2o_gpio_write(int pin, bool value);
```

---

## Documentation Files

| Document | Purpose |
|----------|---------|
| [AI-DEVICE-OVERVIEW.md](AI-DEVICE-OVERVIEW.md) | Complete architecture guide |
| [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) | Visual diagrams and flows |
| [MAIN_DIRECTORY_STATUS.md](MAIN_DIRECTORY_STATUS.md) | Main/ directory verification |
| [../AI-INSTRUCT.md](../AI-INSTRUCT.md) | Naming conventions and architecture |
| [BUILD_AND_TEST.md](../BUILD_AND_TEST.md) | Build and test procedures |
| [PROTOCOL.md](../PROTOCOL.md) | Protocol specifications |

---

## Troubleshooting

### Build Fails: "Component not found"
→ Check CMakeLists.txt REQUIRES section has all needed components

### Build Fails: "Undefined reference to H2o_*"
→ Ensure function is exported in component header, and header is included

### Compiler Error: "Unknown type H2O_pin_t"
→ Check that h2o_core is in REQUIRES, and h2o_types.h is included

### HTTP Server Doesn't Start
→ Check H2o_http_server_init() called after WiFi connected
→ Verify port 80 not already in use

### mDNS Not Visible
→ Check H2o_mdns_start() called after HTTP server started
→ Verify device name format: h2o-tower.local

---

## Status Summary

✅ **Directory Structure**: Clean and organized  
✅ **Naming Conventions**: Consistent throughout  
✅ **Build System**: Working (ESP-IDF CMake)  
✅ **Components**: Modular and reusable  
✅ **Documentation**: Complete  

**Ready for Development** ✨

