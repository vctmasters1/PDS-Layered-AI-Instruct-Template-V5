# H2o-Tower Android Controller - Architecture & Developer Guide

## Quick Overview

**H2o-Tower** is a complete aeroponics control system. The **Android Controller** is a Kotlin-based mobile app that:
- Discovers and pairs with H2O-Tower devices via **Bluetooth Low Energy (BLE)** for provisioning
- Manages multiple devices with persistent storage (SharedPreferences)
- Communicates with devices over **Wi-Fi via HTTP REST API**
- Provides a Material Design 3 UI for monitoring and device management
- Supports automation workflows (conditions, actions, timers)
- Manages platform-specific device configurations (ESP32-C3 Super Mini HW Rev 001)

**Package**: `vm.pds.h2o`  
**Min SDK**: 32 | **Target SDK**: 36 | **Java**: 11  
**Build System**: Gradle with Kotlin Compose

## Naming Conventions

**Followed**:
- Files: `CamelCase.kt` (Android/Kotlin standard)
- Classes: `CamelCase` (e.g., `NetworkManager`, `DeviceRepository`, `BluetoothManager`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `PROVISIONING_SERVICE_UUID`)
- Functions: `camelCase()` (e.g., `getDeviceStatus()`, `saveDevice()`)
- Composables: `CamelCase()` (e.g., `HomePanel()`, `AssociateDeviceScreen()`)
- Packages: lowercase (e.g., `vm.pds.h2o.network`, `vm.pds.h2o.ble`)

**Generic Types** (no prefix needed within h2o package):
- `Condition`, `Action`, `Timer` (automation framework)
- `DeviceAutomation`, `DevicePinMap`
- `NetworkManager`, `BluetoothManager`
- File names: `AutomationCore.kt`, `DataTypes.kt`, `Serialization.kt`
**Rationale**:
- Package `vm.pds.h2o` already provides context, so `H2o` prefix is redundant
- Follows standard Kotlin/Android naming conventions for clarity

---

## Project Structure

```
Android/
├── app/
│   ├── build.gradle.kts              # Gradle dependencies and build config
│   ├── src/main/
│   │   ├── AndroidManifest.xml
│   │   ├── java/vm/pds/h2o/
│   │   │   ├── MainActivity.kt                               # App entry point with main navigation
│   │   │   ├── ble/                                          # Bluetooth Low Energy
│   │   │   │   ├── BleConstants.kt
│   │   │   │   └── BluetoothManager.kt
│   │   │   ├── data/                                         # Data models & persistence
│   │   │   │   ├── DeviceRepository.kt
│   │   │   │   └── DeviceStatus.kt
│   │   │   ├── network/                                      # Network communication
│   │   │   │   ├── H2oNetworkManager.kt
│   │   │   │   └── NetworkManager.kt
│   │   │   ├── viewmodel/                                    # ViewModels for UI state
│   │   │   │   ├── AssociateDeviceViewModel.kt
│   │   │   │   ├── HomeViewModel.kt
│   │   │   │   └── MainViewModel.kt
│   │   │   ├── ui/                                           # Compose UI screens
│   │   │   │   ├── AboutDialog.kt
│   │   │   │   ├── AssociateDeviceScreen.kt
│   │   │   │   ├── AutomationScreen.kt
│   │   │   │   ├── HomePanel.kt
│   │   │   │   ├── NoDeviceSelectedScreen.kt
│   │   │   │   ├── SettingsScreen.kt
│   │   │   │   ├── SysconfScreen.kt
│   │   │   │   └── theme/
│   │   │   ├── automation/                                   # Generic automation framework
│   │   │   │   ├── AutomationCore.kt                         # Platform-agnostic automation logic
│   │   │   │   └── ui_widgets/                               # Automation UI components
│   │   │   ├── models/                                       # Generic data models
│   │   │   │   ├── DataTypes.kt
│   │   │   │   └── Serialization.kt
│   │   │   ├── pinconf/                                      # Pin Configuration & UI
│   │   │   │   ├── Adapter.kt
│   │   │   │   ├── Adc.kt
│   │   │   │   ├── Card.kt
│   │   │   │   ├── Details.kt
│   │   │   │   ├── Dropdown.kt
│   │   │   │   ├── Gpio.kt
│   │   │   │   ├── I2C.kt
│   │   │   │   ├── Panel.kt
│   │   │   │   ├── Pwm.kt
│   │   │   │   └── Uart.kt
│   │   │   ├── dev_platforms/                            # Platform-specific implementations
│   │   │   │   ├── abstract/                             # Abstract interfaces and constants
│   │   │   │   │   ├── Actions.kt
│   │   │   │   │   ├── AutomationPipeline.kt
│   │   │   │   │   ├── Condition.kt
│   │   │   │   │   ├── Constants.kt                      # Defines PlatformDefinition interface
│   │   │   │   │   └── Timers.kt
│   │   │   │   ├── esp32c3_supermini/                        # ESP32-C3 Super Mini platform
│   │   │   │   │   ├── common/                           # Code shared across ESP32-C3 revisions
│   │   │   │   │   ├── hwrev_001/                        # Hardware Rev 001
│   │   │   │   │   │   ├── h2o_001/                          # Product: H2O Tower Model 001
│   │   │   │   │   │   └── wh_001/                           # Product: Wellhead Model 001
│   │   │   │   │   ├── hwrev_002/                        # Hardware Rev 002
│   │   │   │   │   └── ota/                                  # Over-The-Air updates
│   │   │   │   └── efr32mg24/                                # EFR32MG24 platform
│   │   │   │       ├── common/
│   │   │   │       ├── hwrev_001/
│   │   │   │       │   ├── h2o_001/                          # Product: H2O Tower Model 001
│   │   │   │       │   └── wh_001/                           # Product: Wellhead Model 001
│   │   │   │       ├── hwrev_002/
│   │   │   │       └── ota/
│   │   └── res/                                              # Android resources
│   └── build.gradle.kts
└── gradle/                                # Gradle wrapper & libs version catalog
```

---

## Platform Abstraction (`dev_platforms`)

The `dev_platforms` directory is structured to create a clear hierarchy of functionality, from abstract definitions to specific hardware implementations.

### 1. **Abstract Layer** (`dev_platforms/abstract/`)
- **Purpose**: Defines the contracts and common constants that all device platforms must adhere to.
- **`Constants.kt`**: Contains the core `PlatformDefinition` interface, which specifies the properties and functions required for any platform (e.g., `platformId`, `availablePins`, `isPinAdcCapable()`). It also defines shared enums like `PinFunction`, `ConditionType`, etc., that are consistent across all devices.
- **Automation Interfaces**: `Actions.kt`, `Condition.kt`, `Timers.kt` define the structure for automation rules.

### 2. **Platform Layer** (`dev_platforms/{platform_name}/`)
- **Purpose**: Provides the implementation for a specific hardware platform (e.g., `esp32c3_supermini`).
- **`common/` sub-directory**: Contains code that is shared across all hardware revisions of that specific platform.
- **Hardware Revisions** (`hwrev_XXX`): Contains revision specific logic.

### 3. **Hardware Revision Layer** (`dev_platforms/{platform_name}/{hw_rev}/`)
- **Purpose**: Holds configurations specific to a hardware revision (e.g., `hwrev_001`).

### 4. **Product Layer** (`dev_platforms/{platform_name}/{hw_rev}/{product_name}/`)
- **Purpose**: Contains the most specific configurations, such as the default pin maps for a final product (e.g., `h2o_001`, `wh_001`).

This hierarchical structure ensures that code is reused effectively and that new devices or products can be added by implementing the required interfaces at the appropriate level.

---

## Pin Configuration (`pinconf/`)
This directory contains an abstract and flexible implementation of pin configuration. These classes and routines coordinate between the abstract definitions and the concrete platform implementations.

---

## Automation Framework (`automation/`)

Platform-agnostic automation for condition-based actions and time-based scheduling. The `AutomationCore.kt` file defines the generic data structures (`Condition`, `Action`, `Timer`) that are used throughout the app.

#### Automation UI (`automation/ui_widgets/`)
- Reusable UI components for building automation rules.

---

## Version History

- **v2.3** (Current): Structure Update
  - Refined `dev_platforms` structure including `hwrev_001`, `hwrev_002` for ESP32C3 and EFR32MG24.
  - Added `pinconf` directory for pin configuration UI and logic.
  - Added `models` directory for serialization and data types.

- **v2.2**: Architectural Refinement
  - Established a hierarchical `dev_platforms` structure with an `abstract` layer.
  - Consolidated common platform code into `common` directories.
  - Updated platform constants to implement the `PlatformDefinition` interface.

- **v2.1**: Refactoring & Naming Conventions
  - Enforced `{Platform}{HwRev}{Role}` naming for device platforms.
  - Extracted automation UI widgets into `automation/ui_widgets/`.

- **v2.0**: Major architecture update
  - Initial multi-device and platform adapter implementation.

---

**Last Updated**: December 16, 2025  
**Status**: Active Development  
**Package**: `vm.pds.h2o`
