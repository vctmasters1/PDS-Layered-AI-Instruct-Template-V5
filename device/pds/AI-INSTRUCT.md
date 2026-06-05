# PDS Package Directory - AI Instructions

## Contents

| § | What's here |
|---|-------------|
| [Purpose](#purpose) | What the PDS package is |
| [Package Structure](#package-structure) | Directory layout of pds/ |
| [Naming Conventions (CRITICAL)](#naming-conventions-critical) | File, function, and component naming rules |
| [Component Guidelines](#component-guidelines) | How to write correct PDS components |
| [Integration with Device Application](#integration-with-device-application) | How pds/ plugs into main/ |
| [What Belongs in PDS Package](#what-belongs-in-pds-package) | Scope boundary |
| [Adding New PDS Components](#adding-new-pds-components) | Checklist for new additions |
| [Reference Documentation](#reference-documentation) | Cross-references to deeper AI-INSTRUCTs |
| [ESP-IDF Component Dependencies — Critical Rules](#esp-idf-component-dependencies--critical-rules) | CMake REQUIRES rules |

## Purpose

This directory contains the **PDS (Platform Device Software) Package** - reusable, platform-independent components that can be used across different device applications and hardware platforms.

## Package Structure

```
pds/
+-- pds_core/          # Core types and definitions (no implementation)
+-- pds_hal/           # Hardware Abstraction Layer (platform-specific)
¦   +-- abstract/      # Public interface headers (the "include/" for pds_hal)
¦   +-- registries/    # Registry .c sources (headers live in abstract/)
¦   +-- peripherals/   # Peripheral component drivers (e.g. led_strip)
¦   +-- platform/      # Platform-specific implementations
+-- pds_network/       # Network stack (WiFi, HTTPS, BLE, mDNS, telemetry)
+-- pds_pipeline/      # 3-layer binary pipeline engine (automation/control)
+-- pds_storage/       # Persistent storage (NVS, usrset, config blobs)
+-- pds_ui/            # Layer 4 UI parameters subsystem (display devices)
+-- pds_validation/    # Input validation utilities
```

> **Archived** (`pds/.old/`): Do not restore.
> - `pds_odbii/` — incomplete BLE OBD-II stub
> - `_led_strip_tmp/` — temporary git clone
> - `platform_esp32c3_sm_common/pds_odbII.c` — orphaned TWAI/CAN stub (also incomplete)
> - `HWTEST-001/` — one-off test role, not production
> - `efr32mg24/` — Silicon Labs EFR32 platform placeholder; never implemented

## Naming Conventions (CRITICAL)

### Files and Directories
- **Files**: `pds_{module}_{name}.{c,h}` (lowercase)
  - Examples: `pds_hal_adc.c`, `pds_network_wifi.c`, `pds_control_pipeline.c`
- **Directories**: `pds_{module}/` (lowercase)
  - Examples: `pds_hal/`, `pds_network/`, `pds_control/`

### Code Symbols
- **Public functions**: `pds_{module}_{action}()` (lowercase)
  - Examples: `pds_hal_adc_init()`, `pds_network_wifi_connect()`
- **Private functions**: `_pds_{module}_{action}()` (underscore prefix, lowercase)
  - Examples: `_pds_hal_validate_pin()`, `_pds_network_parse_response()`
- **Types/structs**: `pds_{type}_t` (lowercase with _t suffix)
  - Examples: `pds_pin_def_t`, `pds_adc_config_t`, `pds_timer_config_t`
- **Enums**: `pds_{enum}_t` (lowercase with _t suffix)
  - Examples: `pds_pin_func_t`, `pds_timer_type_t`
- **Constants/Macros**: `PDS_CONSTANT_NAME` (UPPERCASE)
  - Examples: `PDS_MAX_PINS`, `PDS_PIN_FUNC_ADC`, `PDS_CONFIG_TYPE_SET_PWM`
- **Global variables**: `pds_global_{name}` (lowercase)
  - Examples: `pds_global_pin_def_table`, `pds_global_pin_count`

### Protocol Structs (Device ? Android)
- **Telemetry**: `PDS_TELDATA_{name}` (UPPERCASE prefix, wire format)
  - Examples: `PDS_TELDATA_packet_t`, `PDS_TELDATA_header_t`
- **Configuration**: `PDS_TELCONF_{name}` (UPPERCASE prefix, wire format)
  - Examples: `PDS_TELCONF_packet_t`, `PDS_TELCONF_full_config_t`

## Component Guidelines

### pds_core/
- Contains only type definitions and enums
- No implementation files (.c)
- Shared across all other pds components
- See: `pds_core/include/pds_types.h`

### pds_hal/
- Platform abstraction for hardware peripherals
- Platform-independent headers in `include/`
- Platform-specific implementations in `platform/{platform_name}/`
- Hardware revision and role variants in subdirectories
- See: `pds_hal/AI-INSTRUCT.md` for detailed structure

### pds_pipeline/
- 3-layer binary pipeline engine (replaces `pds_control`)
- Layer 1: pipeline byte stream (block type IDs)
- **Layer 2: hw_vars blobs — pin assignments per function block** (GPIO/ADC/PWM/SPI pins)
  - This is the ONLY place pin assignments live. There is no compile-time static pin table.
  - hw_vars are stored in NVS and sent over-the-air from the Android app.
  - Each `pds_fb_*` function block reads its pins from its own hw_vars blob at init time.
- Layer 3: settings blobs (tunable params per block)
- No hardware-specific code; drives `pds_fb_*` function blocks
- See: `Device/.dev-docs/PIPELINE_SETTINGS_DESIGN.md` for full spec
- **Function block architecture (context pattern, HAL separation, non-blocking state machine,
  peripheral-sourced blocks, mutex, registry wiring, CMake, add-block checklist):**
  ? **`pds_pipeline/pds_fb/AI-INSTRUCT.md`** is the single authoritative source. Do not duplicate here.

### pds_network/
- WiFi connection management (`pds_wifi.c`)
- HTTPS REST API server (`pds_https_server.c`) — binary `application/octet-stream` only, no JSON
- HTTP server (`pds_http_server.c`) — lightweight fallback / local access
- BLE provisioning (`pds_ble_provisioning.c`) — WiFi credential setup only via `wifi_provisioning` component
- mDNS service discovery

**WiFi provisioning uses SoftAP captive-portal** (`pds_wifi.c`).  
The device starts a `h2o-tower-XXXXXX` open AP (last 3 MAC bytes), serves an HTML form at
`http://192.168.4.1`, and on POST saves SSID/password via `esp_wifi_set_config()` (auto-persisted
to NVS by `CONFIG_ESP_WIFI_NVS_ENABLED=y`). Then calls `esp_restart()`. BLE is NOT used.
`pds_ble_provisioning.c` is a no-op stub — do NOT re-enable the `wifi_provisioning` / `bt` components.

**HTTP/HTTPS endpoints serve binary blobs only** (per PROTOCOL.md):  
- `GET /status` ? serialize pipeline sensor readings ? `pds_teldata_packet_t` ? `application/octet-stream`  
- `GET /config`  ? read L2+L3 blobs from NVS ? raw bytes  
- `POST /config` ? receive raw bytes ? write blob to NVS ? pipeline reloads  
- Do NOT use cJSON in endpoint handlers. JSON is incorrect for this protocol.

### pds_pipeline/ — Layer storage
- L1, L2, L3 blobs are stored as **NVS blobs** in the `nvs` flash partition (0x9000)
  - NVS keys: `"pipeline"` (L1), `"hw_vars"` (L2), `"settings"` (L3), **`"ui_params"` (L4)**
  - Read at boot via `pds_device_nvs_read_blob()` in `pds_platform_main.c`
  - Written over-the-air via the HTTP API (`POST /config` or equivalent endpoints)
- The `pds_l1`, `pds_l2`, `pds_l3`, `pds_l4` raw flash partitions (64 KB each) are
  **reserved** for future direct partition access — they are NOT currently read or written by firmware
- **NVS image deploy path (target)**: L1/L2/L3/L4 blobs are generated by the role pack utility,
  then packed into an `nvs_defaults.bin` using ESP-IDF `nvs_partition_generator.py` and flashed
  at 0x9000. This pre-populates a fresh device without requiring an app upload post-flash.
  See `PDS-Role/AI-INSTRUCT.md` §"Blob Generation & NVS Image" and
  `PDS-BuildTools/AI-INSTRUCT.md` §"NVS Defaults Image".

### pds_ui/
- **Layer 4 (L4) `ui_params` blob** — per-device UI layout parameters
- Completely independent of the pipeline engine — no block type IDs, no L3, no registry
- Supports display devices: SSD1306 OLED (I2C), with TFT/LED-matrix reserved for future
- Each UI device instance is identified by its peripheral string ID hash within the L4 blob
- Render loop driven by `pds_ui_tick()`, called from `pds_platform_loop()` alongside pipeline tick
- **Authoritative spec**: `pds_ui/AI-INSTRUCT.md`

### pds_storage/
- NVS (Non-Volatile Storage) operations
- User settings (`pds_usrset`) stored in `nvs` partition
- L1/L2/L3 blob access via dedicated `pds_l1`/`pds_l2`/`pds_l3` partitions
- Settings management

### pds_validation/
- Input validation for configuration commands
- Range checking (PWM duty, GPIO states, pin numbers)
- Packet integrity validation
- Error code definitions

## Integration with Device Application

The device application (`Device/main/`) is platform-agnostic:

```c
// In main.c
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "pds_platform.h"  // From pds_hal

void app_main(void) {
    pds_platform_init();   // Inits HAL, network, loads L1/L2/L3 blobs, starts pipeline
    while (1) {
        pds_platform_loop();  // Ticks pipeline engine
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}
```

`pds_platform_init()` is implemented per-target in `pds_hal/board/<target>/common/pds_platform_main.c`.
```

## What Belongs in PDS Package

? **DO include**:
- Reusable, platform-independent logic
- Hardware abstraction interfaces
- Network protocol implementations
- Data serialization/deserialization
- Common utilities used across applications

? **DO NOT include**:
- Device-specific application logic (? `main/`)
- Device-specific configuration (? `main/`)
- UI-specific code (? Android app)
- Business rules specific to H2O-Tower (? `main/`)

## Adding New PDS Components

1. Create directory: `pds_{new_component}/`
2. Add `CMakeLists.txt` with dependencies
3. Create `include/` subdirectory for public headers
4. Follow naming conventions strictly
5. Update `main/CMakeLists.txt` to add REQUIRES dependency
6. Document in component-specific AI-INSTRUCT.md if complex

## Reference Documentation

- Root-level: `AI-INSTRUCT.md` - Naming conventions and architecture
- GitHub: `.github/copilot-instructions.md` - Hierarchical instruction layering rules
- Protocol: `PROTOCOL.md` - Communication protocol specifications
- Component-specific: Each `pds_{module}/AI-INSTRUCT.md` where applicable

## ESP-IDF Component Dependencies — Critical Rules

### Managed Components (moved out of ESP-IDF 5.x)

Some components were removed from ESP-IDF's bundled tree in v5.x and moved to the
Espressif component registry. They require an `idf_component.yml` to be declared.

**Known managed components used by pds/**:

| Component | Declared in | Reason |
|-----------|-------------|--------|
| `mdns` | `pds_network/idf_component.yml` | Removed from ESP-IDF bundled components in v5.x |

**Rule**: If cmake fails with `Failed to resolve component 'X' required by component 'pds_Y': unknown name`,
and the HINT says "moved to IDF component manager", create `pds_Y/idf_component.yml` declaring
`espressif/X`. Each component that needs a managed dependency must declare it in its own manifest —
the project-level `main/idf_component.yml` only covers the `main` component's own dependencies.

### Wire-Format Struct Static Assertions (`pds_telemetry_types.h`)

`pds_network/include/pds_telemetry_types.h` uses `_Static_assert` to catch struct size mismatches
between device firmware and Android/HMI. These assertions use `__attribute__((packed))`.

**Rule**: When adding/changing a field, always recalculate the packed size manually:
- Count each field's byte size with NO padding (packed = no alignment holes)
- Update the `_Static_assert` expected value AND the comment saying "N bytes per entry"
- Update wire format documentation (comments in the struct)
- The Android `PdsTelemetry.kt` parsing code must match the new layout

**Current sizes (verified against ESP32 xtensa build)**:
- `pds_teldata_adc_reading_t`: 43 bytes (1+2+4+4+32)
- `pds_teldata_pwm_state_t`: 39 bytes (1+2+4+32)
- `pds_teldata_gpio_state_t`: 34 bytes (1+1+32)
- `pds_telconf_pinmap_entry_t`: 128 bytes (1+1+2+2+2+4+4+32+32+16+32)

