# PDS HAL Directory - AI Instructions

## Contents

| § | What's here |
|---|-------------|
| [Purpose](#purpose) | What pds_hal provides |
| [Naming Convention](#naming-convention) | Board file and function naming rules |
| [Adding New Board Support](#adding-new-board-support) | Steps to add a new board/hwrev |
| [Board Abstraction Pattern](#board-abstraction-pattern) | How abstract headers map to platform impls |
| [Hardware Revision vs Role](#hardware-revision-vs-role) | The distinction between hwrev and role |
| [CMakeLists.txt REQUIRES (April 2026)](#cmakeliststxt-requires-april-2026) | Required component dependency declarations |
| [What Belongs Here](#what-belongs-here) | Scope boundary |
| [abstract/ — Public Interface Headers](#abstract--public-interface-headers) | Header-only platform contract |
| [registries/ — Registry Sources](#registries--registry-sources) | Peripheral registry sources |
| [peripherals/ — Peripheral Component Drivers](#peripherals--peripheral-component-drivers) | Per-peripheral ESP-IDF components |
| [Peripheral Auto-Include System (Role JSON → Build)](#peripheral-auto-include-system-role-json--build) | How role JSON drives peripheral selection |
| [.old/ — Archived / Deprecated Files](#old--archived--deprecated-files) | Archived files |
| [What Does NOT Belong Here](#what-does-not-belong-here) | Scope boundary |

## Purpose

This directory contains the **PDS Hardware Abstraction Layer** - platform-independent HAL declarations with platform-specific implementations. Part of the reusable PDS package, not device application code.

## Naming Convention

- **Files**: `pds_hal_{peripheral}.{c,h}` or `pds_{peripheral}_esp32c3.c` for platform implementations
- **Functions**: `pds_hal_{peripheral}_{action}()` (public), `_pds_hal_{peripheral}_{action}()` (private)
- **Types**: `pds_hal_{type}_t` (lowercase)
- **Enum values**: `PDS_HAL_ENUM_VALUE` (UPPERCASE)
- **Constants**: `PDS_HAL_CONSTANT_NAME` (UPPERCASE)
- **Header guards**: `PDS_HAL_{NAME}_H` (UPPERCASE, e.g., `PDS_HAL_ADC_H`, `PDS_HAL_PINS_H`)

**Source of truth**: See root `AI-INSTRUCT.md` for complete naming rules.

```
hwrev_001/
├── AERO-002/
│   ├── pds_process_action.c  # role init: usrset defaults + pipeline registration
│   └── usrset_defaults.h     # compile-time usrset defaults
└── ...
```

**For role-specific documentation**, see `AI-ROLE.md` within each role directory.

## Adding New Board Support

1. Create `board/{board_name}/` directory (e.g., `efr32mg24`)
2. Implement common HAL in `board/{board_name}/common/`
3. Create hardware revision subdirectories: `hwrev_001/`, `hwrev_002/`, etc.
4. Create role subdirectories under each hwrev: `h2o_001/`, `wh_001/`, etc.
5. Define `pds_process_action.c` in `hwrev_xxx/role_xxx/` for role init and usrset defaults
6. Update CMakeLists.txt to conditionally compile based on target board and role

> **No `pds_pins.c` needed** — pin assignments are Layer 2 hw_vars blobs, not compiled in.

## Board Abstraction Pattern

**Header (include/pds_adc.h)**: Board-independent interface
```c
esp_err_t pds_hal_adc_init(uint8_t pin, pds_adc_config_t* config);
esp_err_t pds_hal_adc_read(uint8_t pin, uint32_t* value);
```

**Implementation (board/esp32c3_sm/common/pds_adc_esp32c3.c)**: ESP32-C3 specific
```c
#include "pds_adc.h"
#include "driver/adc.h"

esp_err_t pds_hal_adc_init(uint8_t pin, pds_adc_config_t* config) {
    // ESP32-C3 ADC initialization using ESP-IDF driver
    return adc1_config_width(ADC_WIDTH_BIT_12);
}
```

## Hardware Revision vs Role

- **hwrev_xxx**: Physical hardware PCB revision (different pin mappings, component layouts, BOM changes)
  - Example: hwrev_001 might have ADC on GPIO3, hwrev_002 moves it to GPIO5
  - Hardware revisions reflect physical design iterations
  
- **Role subdirectories (h2o_001, wh_001, sv_001, etc.)**: Application/device-specific configurations using the same PCB
  - Each role represents a different use case or application for the same hardware
  - Roles define: pin assignments, automation logic, processing loops
  - The role identifier (e.g., "h2o", "wh", "sv") describes the application domain
  - The suffix (001, 002) indicates configuration variant within that role
  
**Key Point**: Role identifiers are **NOT** part of the PDS package naming convention. They identify which device application is using this hardware platform. The PDS package code itself always uses `pds_` prefixes and remains generic.

**Role subdirectory files (one `pds_process_action.c` per role)**:
- `pds_process_action.c` — role init: usrset defaults, pipeline registration

> **CRITICAL — No compile-time pin tables**: `pds_pins.c` and `pds_global_pin_def_table`
> are **REMOVED**. The header `pds_pins.h` has been archived to `pds_hal/.old/pds_pins.h`.
> Pin assignments are **Layer 2 (hw_vars blobs)** in the pipeline engine.
> Each function block (`pds_fb_*`) receives its GPIO/ADC/PWM pin via its `hw_vars` blob,
> loaded at runtime from NVS or sent over-the-air from the Android app.
> There is NO static compile-time pin table. Do NOT recreate `pds_pins.c`.

## CMakeLists.txt REQUIRES (April 2026)

**`pds_hal` does NOT require `pds_pipeline`** — adding it creates a circular dependency:

```
pds_hal → pds_pipeline → pds_fb → pds_hal  (CYCLE — do not recreate)
```

**`pds_platform_main.c` is compiled inside the `main` component** (not `pds_hal`) to break this cycle.  
It lives at `Device/pds/pds_hal/board/common/esp32/pds_platform_main.c` (shared source)  
but is registered in `Device/main/main/CMakeLists.txt` SRCS with a relative path.

`main/main` REQUIRES: `freertos pds_hal pds_pipeline pds_storage nvs_flash esp_timer pds_network`

Correct dependency chain (no cycles):
```
main → pds_hal          (hardware init headers)
main → pds_pipeline     (pipeline engine symbols from pds_platform_main.c)
main → pds_network      (wifi/BLE/HTTP init)
pds_pipeline → pds_fb   (function block registry)
pds_fb → pds_hal        (GPIO/ADC/LEDC peripheral APIs)
pds_hal → pds_storage   (NVS)
pds_hal → pds_core      (types)
```

## What Belongs Here

- Platform-agnostic HAL interface headers
- Platform-specific peripheral drivers (ADC, GPIO, PWM, SPI, I2C, UART)
- Hardware revision pin mappings
- Low-level hardware initialization

## abstract/ — Public Interface Headers

`pds_hal/abstract/` is the `include/` for the `pds_hal` component — all public headers live
here. CMakeLists exports `INCLUDE_DIRS "abstract"` so every consumer of `pds_hal` can reach
them with flat `#include` names. This includes both HAL interface headers (`pds_adc.h`, etc.)
and peripheral registry headers (`pds_adc_registry.h`, etc.).

See `abstract/AI-INSTRUCT.md` for the full file list.

## registries/ — Registry Sources

`pds_hal/registries/` holds the `.c` implementation files for ADC, GPIO, and PWM registries.
The public `.h` headers for these registries live in `abstract/` (they are public pds_hal API).
See `registries/AI-INSTRUCT.md` for architecture details.

## peripherals/ — Peripheral Component Drivers

`pds_hal/peripherals/` holds self-contained ESP-IDF component drivers for hardware peripherals
that are not part of the ESP-IDF SDK itself. Each subdirectory is its own CMake component
discoverable via `EXTRA_COMPONENT_DIRS ../pds/pds_hal/peripherals` in the project root.

| Directory | Component | Used by |
|-----------|-----------|---------|
| `led_strip/` | `led_strip` | `pds_fb_led_addr.c` (addressable LED block) |
| `dht22/` | `dht22` | `pds_fb_dht22.c` (DHT22/AM2302 temperature+humidity sensor) |
| `hx711/` | `hx711` | `pds_fb_hx711.c` (HX711 24-bit load-cell ADC) |
| `ads1115/` | `ads1115` | Role init (`pds_process_action.c`) via `pds_adc_reg_register_ext()` |
| `ph_001/` | `ph_001` | `pds_fb_sensor_ph.c` (analog pH electrode, circuit rev 001) |
| `ec_001/` | `ec_001` | `pds_fb_sensor_ec.c` (analog EC/PPM electrode, circuit rev 001) |

Add new peripheral drivers here when they are self-contained components not suitable
for `pds_hal/board/` (i.e., not platform-specific, but hardware-peripheral-specific).
See `peripherals/AI-INSTRUCT.md` for the full convention and step-by-step guide.

## Peripheral Auto-Include System (Role JSON → Build)

Peripheral drivers are **not compiled unconditionally**. The build system infers which
drivers are needed from the role JSON declared peripherals, so each firmware binary only
contains what the hardware actually has.

### Data flow

```
Role JSON  (PDS-Role/configs/<ROLE>.json)
    │  "peripherals": [{"type": "dht22", ...}, {"type": "hx711", ...}]
    ▼
role_builder.py  (_PERIPH_TYPE_MAP lookup)
    │  Generates per-role:
    ▼
board/<target>/<hwrev>/<ROLE>/pds_periph_drivers.cmake
    │  sets: PDS_PERIPH_TYPES "dht22;hx711"
    │
    ├─► pds_fb/CMakeLists.txt  (includes the same file)
    │       Adds pds_fb_dht22.c + pds_fb_hx711.c to SRCS
    │       Adds PDS_PERIPH_HAS_DHT22=1 etc. to compile defs
    │       Adds dht22, hx711 to component REQUIRES  ← headers pulled in here
    │
    └─► pds_hal/CMakeLists.txt  (includes the same file)
            For role-level peripherals (e.g. ads1115):
            Adds ads1115 to REQUIRES, PDS_PERIPH_HAS_ADS1115=1 to defs
            pds_process_action.c can then #include "ads1115.h" and call ads1115_init()
```

### Two peripheral categories

**Category A — fb-block peripherals** (`dht22`, `hx711`):
- Have a corresponding `pds_fb_<name>.c` block in `pds_pipeline/pds_fb/`
- The fb CMakeLists adds the `.c` source, compile def, and component REQUIRES
- The fb block `#include`s the peripheral header — no conditional guard needed

**Category B — role-init peripherals** (`ads1115`):
- No fb block — the driver is called directly from `pds_process_action.c`
- `pds_hal/CMakeLists.txt` adds the component REQUIRES and compile def
- `pds_process_action.c` guards the init call with `#ifdef PDS_PERIPH_HAS_ADS1115`

### How to add a new peripheral to the system

1. **Create the driver** in `pds_hal/peripherals/<name>/` with `include/<name>.h`, `<name>.c`, `CMakeLists.txt`
2. **Choose a category** (A = fb block, B = role-init)
3. **For Category A**: Create `pds_fb/pds_fb_<name>.c` and update `pds_fb/CMakeLists.txt` foreach block
4. **For Category B**: Guard init code in `pds_process_action.c` with `#ifdef PDS_PERIPH_HAS_<NAME>`
5. **Register in role_builder.py**: Add `"<name>": "<name>"` to `_PERIPH_TYPE_MAP`
6. **Add to role JSON** `peripherals[]` array with `"type": "<name>"`
7. **Regenerate** the affected role(s) via `python PDS-Role/go.py --config <ROLE>`
8. **Update** this file and `peripherals/AI-INSTRUCT.md`

### Role directory required files

Every role directory under `board/<target>/<hwrev>/<ROLE>/` **must** contain:
- `pds_process_action.c` — role init and telemetry provider
- `usrset_defaults.h` — compile-time usrset defaults
- `pds_periph_drivers.cmake` — peripheral type list (empty `set(PDS_PERIPH_TYPES "")` is valid)

**Missing `pds_periph_drivers.cmake` will cause the build to silently skip all peripheral
driver sources and REQUIRES for that role.** Always regenerate after adding peripherals to a role JSON.

## .old/ — Archived / Deprecated Files

`pds_hal/.old/` holds headers that are no longer part of the active build:

- `pds_pins.h` — Declared `pds_global_pin_def_table[]`. Archived May 2026. Pin assignments are L2 hw_vars blobs; this compile-time table does not exist.

## What Does NOT Belong Here

- Application logic → `Device/main/`
- Network protocols → `pds_network/`
- Business logic (pipelines, timers) → `pds_pipeline/`
- Data storage → `pds_storage/`
