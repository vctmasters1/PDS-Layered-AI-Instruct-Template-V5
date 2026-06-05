# Platform File Organization Architecture

**Last Updated**: December 27, 2025  
**Status**: Documentation update for network platform reorganization

## Overview

This document describes the organization of platform-specific files in the PDS HAL (Hardware Abstraction Layer) structure. Following the principle that **all platform-specific implementations belong in `pds_hal/platform/{platform}/common/`**, this ensures consistent architecture and makes platform selection transparent to consumers.

## Directory Structure

```
pds_hal/
├── include/                    ← Generic HAL interfaces (platform-agnostic)
│   ├── pds_hal_adc.h
│   ├── pds_hal_gpio.h
│   ├── pds_hal_pwm.h
│   └── pds_network_platform.h
├── pds_hal_core.c              ← Generic HAL initialization
├── platform/
│   ├── esp32_node32s/          ← ESP32 / ESP32-S3 platform variant
│   │   ├── common/
│   │   │   ├── pds_adc_esp32.c                    ← ESP32 ADC driver
│   │   │   ├── pds_gpio_esp32.c                   ← ESP32 GPIO driver
│   │   │   ├── pds_pwm_esp32.c                    ← ESP32 PWM (LEDC) driver
│   │   │   ├── pds_spi_esp32.c                    ← ESP32 SPI driver
│   │   │   ├── pds_motor_DRV8833_esp32.c         ← H-bridge motor driver (ESP32)
│   │   │   └── pds_network_platform_esp32.c      ← WiFi/BLE/HTTPS (ESP32 version)
│   │   ├── hwrev_001/          ← Hardware revision 001 (Node32S board specific)
│   │   │   └── h2o_001/        ← Role: H2O-Tower aeroponics controller
│   │   │       ├── pds_pins.c                    ← Pin configuration table
│   │   │       └── pds_process_action.c          ← Main automation loop
│   │   └── [other hardware revisions]
│   ├── esp32c3_sm/             ← ESP32-C3 platform variant (RISC-V single-core)
│   │   ├── common/
│   │   │   ├── pds_adc_esp32c3.c                 ← ESP32-C3 ADC driver (single core)
│   │   │   ├── pds_gpio_esp32c3.c                ← ESP32-C3 GPIO driver
│   │   │   ├── pds_pwm_esp32c3.c                 ← ESP32-C3 PWM driver
│   │   │   ├── pds_spi_esp32c3.c                 ← ESP32-C3 SPI driver
│   │   │   ├── pds_motor_DRV8833_esp32c3.c      ← H-bridge motor driver (ESP32-C3)
│   │   │   └── pds_network_platform_esp32c3.c   ← WiFi/BLE/HTTPS (ESP32-C3 version)
│   │   ├── hwrev_001/          ← Hardware revision 001 (SM board specific)
│   │   │   └── h2o_001/        ← Role: H2O-Tower aeroponics controller
│   │   │       ├── pds_pins.c                    ← Pin configuration table
│   │   │       └── pds_process_action.c          ← Main automation loop
│   │   └── [other hardware revisions]
│   └── efr32mg24/              ← Future: EFR32 ARM Cortex M4 variant
│       └── common/
│           ├── pds_adc_efr32.c
│           ├── pds_gpio_efr32.c
│           └── [other drivers]
└── CMakeLists.txt              ← HAL build configuration
```

## Platform File Categories

### 1. Generic HAL Interfaces (pds_hal/abstract/)

**Purpose**: Define platform-agnostic interfaces  
**Location**: `pds_hal/abstract/`  
**Example**: `pds_network_platform.h`

These header files declare function prototypes and types that must be implemented by each platform. They do NOT depend on platform-specific APIs.

**Header**: `pds_network_platform.h`
```c
// Generic interface - works on ANY platform
esp_err_t pds_network_platform_wifi_init(pds_network_wifi_event_cb_t event_cb);
esp_err_t pds_network_platform_wifi_connect(const char *ssid, const char *password);
bool pds_network_platform_wifi_is_connected(void);
// ... 20 more functions
```

### 2. Platform-Specific Drivers (pds_hal/platform/{platform}/common/)

**Purpose**: Implement HAL interfaces for specific platform  
**Location**: `pds_hal/platform/{platform}/common/`  
**Naming**: `pds_{subsystem}_{platform}.c`  
**Example**: `pds_network_platform_esp32.c`

These files implement the generic interfaces using platform-specific APIs from ESP-IDF, ARM CMSIS, etc.

**Driver**: `pds_network_platform_esp32.c`
```c
// ESP32-specific implementation using ESP-IDF APIs
esp_err_t pds_network_platform_wifi_init(pds_network_wifi_event_cb_t event_cb) {
    // Uses ESP32 WiFi driver, LEDC PWM, GPIO APIs
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&cfg);
    // ...
}
```

### 3. Hardware Revision Configuration (pds_hal/platform/{platform}/hwrev_{N}/)

**Purpose**: Hardware variant-specific settings (pin mapping, I2C addresses, etc.)  
**Location**: `pds_hal/platform/{platform}/hwrev_{N}/`  
**Example**: `hwrev_001/` = Hardware revision 001 (first PCB iteration)

Different PCB revisions may have different:
- GPIO pin assignments
- SPI bus configurations
- I2C slave addresses
- Power supply configurations

### 4. Role-Specific Application Logic (pds_hal/platform/{platform}/hwrev_{N}/{role}/)

**Purpose**: Device-specific functionality  
**Location**: `pds_hal/platform/{platform}/hwrev_{N}/{role}/`  
**Example**: `h2o_001/` = H2O-Tower aeroponics controller

**Files**:
- `pds_pins.c` - Pin configuration table (defines which GPIO does what)
- `pds_process_action.c` - Main application loop (automation logic)

**Example Role Structure**:
```
esp32_node32s/hwrev_001/h2o_001/
├── pds_pins.c                    ← 18 GPIO pins: pump, lights, sensors, etc.
├── pds_process_action.c          ← Aeroponics automation: misting, light cycles
├── AI-ROLE.md                    ← Role documentation
└── AI-HARDWARE.md                ← Hardware pinout for this role
```

## Build System Integration

### CMakeLists.txt - HAL Component (pds_hal/CMakeLists.txt)

```cmake
# Auto-detect platform
if(IDF_TARGET STREQUAL "esp32c3")
    set(PLATFORM_DIR "esp32c3_sm")
elseif(IDF_TARGET STREQUAL "esp32")
    set(PLATFORM_DIR "esp32_node32s")
endif()

# Collect platform drivers
set(HAL_SRCS
    "platform/${PLATFORM_DIR}/common/pds_adc_${IDF_TARGET}.c"
    "platform/${PLATFORM_DIR}/common/pds_gpio_${IDF_TARGET}.c"
    # ... more drivers
)

# Collect role-specific files
list(APPEND HAL_SRCS 
    "platform/${PLATFORM_DIR}/${TARGET_HWREV}/${TARGET_ROLE}/pds_pins.c"
    "platform/${PLATFORM_DIR}/${TARGET_HWREV}/${TARGET_ROLE}/pds_process_action.c"
)

# Export platform path for child components
set(PDS_HAL_PLATFORM_DIR "${CMAKE_CURRENT_SOURCE_DIR}/platform")

idf_component_register(
    SRCS ${HAL_SRCS}
    # ...
)
```

### CMakeLists.txt - Network Component (pds_network/CMakeLists.txt)

```cmake
# Map platform names to directory names
if(IDF_TARGET STREQUAL "esp32c3")
    set(HAL_PLATFORM_DIR "esp32c3_sm")
elseif(IDF_TARGET STREQUAL "esp32" OR IDF_TARGET STREQUAL "esp32s3")
    set(HAL_PLATFORM_DIR "esp32_node32s")
endif()

# Reference platform implementation from pds_hal
set(PDS_HAL_PLATFORM_BASE "${CMAKE_CURRENT_SOURCE_DIR}/../pds_hal/platform")
set(NETWORK_PLATFORM_SRCS 
    "${PDS_HAL_PLATFORM_BASE}/${HAL_PLATFORM_DIR}/common/pds_network_platform_${IDF_TARGET}.c"
)

idf_component_register(
    SRCS "pds_provisioning.c" "pds_wifi.c" ... ${NETWORK_PLATFORM_SRCS}
    # ...
)
```

## Platform Selection Flow

```
CMake Build System
    ↓
IDF_TARGET = esp32c3
    ↓
pds_hal/CMakeLists.txt:
    PLATFORM_DIR = "esp32c3_sm"
    ↓
    Collect drivers from:
    - pds_hal/platform/esp32c3_sm/common/
    ↓
    Collect role files from:
    - pds_hal/platform/esp32c3_sm/hwrev_001/h2o_001/
    ↓
pds_network/CMakeLists.txt:
    HAL_PLATFORM_DIR = "esp32c3_sm"
    ↓
    Reference network implementation from:
    - pds_hal/platform/esp32c3_sm/common/pds_network_platform_esp32c3.c
    ↓
Compiler
    ↓
Binary with all platform-specific implementations linked
```

## Adding New Platform Support

### Step 1: Create Platform Directory
```bash
mkdir -p Device/H2O-DEV-12102025/pds/pds_hal/platform/efr32mg24/common
mkdir -p Device/H2O-DEV-12102025/pds/pds_hal/platform/efr32mg24/hwrev_001/sv_001
```

### Step 2: Implement Platform Drivers
```
efr32mg24/common/
├── pds_adc_efr32.c              ← ADC driver using ARM CMSIS
├── pds_gpio_efr32.c             ← GPIO driver using EFR32 HAL
├── pds_pwm_efr32.c              ← PWM driver (Timer/PCNT)
├── pds_spi_efr32.c              ← SPI driver
└── pds_network_platform_efr32.c ← Network (WiFi/Bluetooth stack)
```

### Step 3: Update HAL CMakeLists.txt
```cmake
elseif(IDF_TARGET STREQUAL "efr32mg24")
    set(TARGET_PLATFORM "EFR32MG24")
    set(PLATFORM_DIR "efr32mg24")
    set(HAL_SRCS
        "platform/efr32mg24/common/pds_adc_efr32.c"
        "platform/efr32mg24/common/pds_gpio_efr32.c"
        # ... more drivers
    )
endif()
```

### Step 4: Update Network CMakeLists.txt
```cmake
if(IDF_TARGET STREQUAL "efr32mg24")
    set(HAL_PLATFORM_DIR "efr32mg24")
endif()
```

### Step 5: Implement Role Configuration
```bash
# For EFR32 variant of H2O-Tower
Device/H2O-DEV-12102025/pds/pds_hal/platform/efr32mg24/hwrev_001/h2o_001/
├── pds_pins.c
└── pds_process_action.c
```

## File Naming Conventions

**Platform Drivers** (in `platform/{platform}/common/`):
- Format: `pds_{subsystem}_{platform}.c`
- Examples:
  - `pds_adc_esp32.c` - ADC for ESP32/S3
  - `pds_adc_esp32c3.c` - ADC for ESP32-C3
  - `pds_network_platform_esp32.c` - Network stack for ESP32
  - `pds_network_platform_esp32c3.c` - Network stack for ESP32-C3

**Generic Interfaces** (in `include/`):
- Format: `pds_hal_{subsystem}.h` or `pds_{subsystem}_platform.h`
- Examples:
  - `pds_hal_adc.h` - Generic ADC interface
  - `pds_network_platform.h` - Generic network platform interface

**Role-Specific Files** (in `platform/{platform}/hwrev_{N}/{role}/`):
- Format: `pds_pins.c`, `pds_process_action.c`
- Always these two files for any role

## Generic Abstraction Layer (pds_hal/common/)

**Note**: This directory may be renamed to `pds/abstraction/` in future refactoring to clarify its purpose.

**Purpose**: Generic abstractions that are NOT platform-specific  
**Location**: `pds_hal/common/` (future: `pds/abstraction/`)  
**Contains**:
- Condition evaluation logic (threshold checks, PID calculations)
- Timer management (cycle timers, time-of-day scheduling)
- Configuration validation
- Pipeline orchestration

**Example File**: `pds_control_pipeline.c`
```c
// Generic pipeline logic - works on ANY platform
esp_err_t pds_control_pipeline_evaluate_condition(pds_condition_t *cond, ...) {
    // Does NOT use platform-specific APIs
    // Uses standard C and generic abstractions only
}
```

This abstraction layer ensures platform-agnostic business logic is separate from platform-specific HAL implementations.

## Build Time Platform Selection

The build system automatically selects platform files based on `IDF_TARGET`:

```bash
# Build for ESP32
idf.py set-target esp32
idf.py build
# Uses: pds_hal/platform/esp32_node32s/common/pds_*.c

# Build for ESP32-C3
idf.py set-target esp32c3
idf.py build
# Uses: pds_hal/platform/esp32c3_sm/common/pds_*.c

# Build for ESP32-S3
idf.py set-target esp32s3
idf.py build
# Uses: pds_hal/platform/esp32_node32s/common/pds_*.c (same as ESP32)
```

## Summary Table

| Layer | Location | Purpose | Platform? | Example |
|-------|----------|---------|-----------|---------|
| **Interface** | `pds_hal/abstract/` | Function declarations | No | `pds_network_platform.h` |
| **Platform Implementation** | `pds_hal/platform/{platform}/common/` | Concrete implementation | **YES** | `pds_network_platform_esp32.c` |
| **Abstraction** | `pds_hal/common/` | Generic logic | No | `pds_control_pipeline.c` |
| **Hardware Config** | `pds_hal/platform/{platform}/hwrev_{N}/` | PCB variant settings | **YES** | (reserved for future) |
| **Application** | `pds_hal/platform/{platform}/hwrev_{N}/{role}/` | Role logic | **YES** | `pds_pins.c`, `pds_process_action.c` |

---

**Benefits of This Organization:**

✅ **Clear Separation**: Platform-specific code isolated in `platform/` subdirectory  
✅ **Scalability**: Easy to add new platforms without modifying core logic  
✅ **Maintainability**: All drivers for a platform in one place  
✅ **Build Transparency**: CMake automatically selects correct implementation  
✅ **Role Isolation**: Application logic separate from infrastructure  
✅ **Role Portability**: Same role (e.g., `h2o_001`) can run on multiple platforms  

---

## Related Documentation

- **[pds_hal/abstract/pds_network_platform.h](abstract/pds_network_platform.h)** - Generic network platform interface
- **[pds_hal/platform/esp32_node32s/common/pds_network_platform_esp32.c](platform/esp32_node32s/common/pds_network_platform_esp32.c)** - ESP32 implementation
- **[pds_hal/platform/esp32c3_sm/common/pds_network_platform_esp32c3.c](platform/esp32c3_sm/common/pds_network_platform_esp32c3.c)** - ESP32-C3 implementation
- **[pds_hal/CMakeLists.txt](CMakeLists.txt)** - HAL build configuration

