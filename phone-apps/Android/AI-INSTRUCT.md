# AI-INSTRUCT: PhoneApps/Android

**Last Updated**: May 5, 2026  
**Authority Level**: DEEP (Authoritative for all work in `PhoneApps/Android/`)  
**Parent context**: `PhoneApps/AI-INSTRUCT.md` (cross-platform mandate applies)

---

## Contents

| § | What's here |
|---|-------------|
| [Overview](#overview) | App identity and tech stack |
| [Directory Structure](#directory-structure) | Android project layout |
| [Key Patterns](#key-patterns) | MVVM, coroutines, BLE patterns |
| [BLE UUIDs (Authoritative Source)](#ble-uuids-authoritative-source) | Service and characteristic UUIDs |
| [Cloud API Calls (What's Implemented)](#cloud-api-calls-whats-implemented) | Implemented API calls |
| [OTA](#ota) | OTA update flow |
| [Known Gaps (as of May 5, 2026)](#known-gaps-as-of-may-5-2026) | What is not yet implemented |

## Overview for the PDS ecosystem. Cloud-first: talks to WEB-HMI API via JWT. BLE used for first-time device provisioning only.

**Language**: Kotlin  
**UI Framework**: Jetpack Compose  
**Async**: Coroutines + `StateFlow`  
**Architecture**: MVVM  
**Package root**: `vm.pds.h2o`  
**Build**: Gradle (Kotlin DSL), `app/build.gradle.kts`

---

## Directory Structure

```
PhoneApps/Android/
├── app/src/main/java/vm/pds/h2o/
│   ├── MainActivity.kt                   ← Entry point, NavController setup
│   ├── ble/
│   │   ├── BleConstants.kt               ← BLE UUIDs (authoritative — iOS mirrors these)
│   │   └── BluetoothManager.kt           ← BLE scan, GATT connect, characteristic writes
│   ├── data/
│   │   ├── DeviceRepository.kt           ← Persistent device list (local storage)
│   │   └── DeviceStatus.kt               ← Cloud device status model (maps HMI API response)
│   ├── dev_platforms/
│   │   ├── abstract/                     ← Platform-agnostic interfaces
│   │   │   ├── OtaProvider.kt            ← Interface: getAvailableFirmware, startUpdate
│   │   │   ├── OtaProviderFactory.kt     ← Factory: returns OtaProvider for given platformId
│   │   │   ├── PlatformInterface.kt      ← Interface: pin caps, condition/action serialization
│   │   │   ├── DevicePinMap.kt           ← Interface: maps pin numbers → labels/functions
│   │   │   ├── DefaultPinMapProvider.kt  ← Interface: provides default pin map for a platform
│   │   │   ├── DefaultAutomationProvider.kt ← Interface: provides starter automation for a platform
│   │   │   └── Constants.kt              ← Shared constants
│   │   ├── esp32_node32s/                ← NodeMCU ESP32 platform impl
│   │   │   ├── common/PinCapabilities.kt
│   │   │   └── hwrev001/h2o001/
│   │   │       ├── DefaultPinMap.kt
│   │   │       └── DefaultAutomation.kt
│   │   ├── esp32c3_supermini/            ← ESP32-C3 Super Mini platform impl
│   │   │   ├── common/PinCapabilities.kt
│   │   │   ├── ota/OtaManager.kt         ← BLE OTA (stub — cloud OTA is preferred)
│   │   │   └── hwrev_001/<role>/
│   │   └── efr32mg24/                    ← EFR32MG24 platform impl (stub)
│   ├── models/
│   │   ├── DataTypes.kt                  ← Kotlin mirrors of device C structs (telemetry)
│   │   └── Serialization.kt             ← Binary deserializer: TeldataPacket from ByteArray
│   ├── network/
│   │   └── NetworkManager.kt             ← REST client: cloud mode (JWT) + local relay (X-Device-Token)
│   ├── automation/
│   │   ├── datamodels/                   ← Generic pipeline models (Condition, Action, Pipeline, Timer)
│   │   ├── PlatformInterface.kt          ← Abstract platform serializer
│   │   ├── PipelineBuilders.kt           ← Helpers for constructing pipeline objects
│   │   └── ui_widgets/                   ← Compose widgets for automation editing
│   ├── pinconf/                          ← Pin configuration widgets (ADC, PWM, GPIO, I2C, UART)
│   ├── ui/                               ← Compose screens
│   │   ├── HomePanel.kt
│   │   ├── AutomationScreen.kt
│   │   ├── AssociateDeviceScreen.kt
│   │   ├── SettingsScreen.kt
│   │   ├── SysconfScreen.kt
│   │   ├── PlatformOtaUpdateDialog.kt
│   │   └── theme/
│   └── viewmodel/
│       ├── MainViewModel.kt              ← App-wide state: device list, selected device, BLE, network
│       ├── HomeViewModel.kt
│       └── AssociateDeviceViewModel.kt
```

---

## Key Patterns

### MVVM + StateFlow
ViewModels hold `MutableStateFlow`. Compose screens collect as `collectAsState()`. No business logic in `@Composable` functions.

```kotlin
// ViewModel
private val _deviceStatus = MutableStateFlow<DeviceStatus?>(null)
val deviceStatus: StateFlow<DeviceStatus?> = _deviceStatus

// Screen
val status by viewModel.deviceStatus.collectAsState()
```

### NetworkManager Modes
`NetworkManager` supports three modes — never add a fourth without updating iOS mirror:
1. **Cloud mode** (`apiBaseUrl` set, `jwtToken` set) — calls HMI REST API with `Authorization: Bearer` header
2. **Local relay mode** (`localRelayIp` set) — calls device IP directly with `X-Device-Token` header
3. **Mock mode** (`useMocks = true`, `apiBaseUrl` empty) — returns hardcoded responses (dev only)

### Binary Deserialization (Telemetry)
`Serialization.deserializeTelemetryPacket(ByteArray)` reads a `TeldataPacket` from a little-endian binary blob.

- Field order and size must match `PDS_TELDATA_*` C structs in `Device/pds/`
- If the device adds a new field, add it here and in iOS simultaneously
- String fields use fixed 32-byte null-padded UTF-8 buffers

### Platform Abstraction
When adding a new MCU target:
1. Create `dev_platforms/<targetId>/common/PinCapabilities.kt` implementing `PlatformPinCapabilities`
2. Create `dev_platforms/<targetId>/hwrev_<n>/<roleId>/DefaultPinMap.kt`
3. Register in `OtaProviderFactory`
4. Mirror the same structure in iOS

---

## BLE UUIDs (Authoritative Source)

Defined in `ble/BleConstants.kt`. iOS must mirror these exactly.

| Constant | UUID |
|---|---|
| `PROVISIONING_SERVICE_UUID` | `0000181c-0000-1000-8000-00805f9b34fb` |
| `SSID_CHARACTERISTIC_UUID` | `00002a3d-0000-1000-8000-00805f9b34fb` |
| `PASSWORD_CHARACTERISTIC_UUID` | `00002a3e-0000-1000-8000-00805f9b34fb` |
| `CONNECT_CHARACTERISTIC_UUID` | `00002a3f-0000-1000-8000-00805f9b34fb` |

---

## Cloud API Calls (What's Implemented)

All calls go through `NetworkManager`. Reference for completeness:

| Method | Endpoint | Used For |
|---|---|---|
| `GET` | `/v1/devices` | Device list |
| `GET` | `/v1/devices/:id` | Device status / config |
| `GET` | `/v1/devices/:id/telemetry?limit=1` | Latest telemetry snapshot |
| `GET` | `/v1/devices/:id/available-firmware` | Firmware version list |
| `POST` | `/v1/devices/:id/ota { version }` | Queue cloud OTA |
| `PATCH` | `/v1/devices/:id { friendlyName, autoUpdateEnabled }` | Update device settings |

---

## OTA

Cloud OTA is the primary path (see `PhoneApps/AI-INSTRUCT.md` OTA flow). The legacy `OtaManager.kt` files under each platform's `ota/` directory implement direct BLE/serial OTA for offline scenarios — they remain but are stubs.

---

## Known Gaps (as of May 5, 2026)

- BLE OTA (`esp32c3_supermini/ota/OtaManager.kt`): stub — `startUpdate` not implemented
- `Adc.kt` (pinconf): `onValueChange` callbacks don't persist to cloud
- `ConditionWidget.kt`: manual trigger button not wired to any API call
- `EFR32MG24` platform: scaffold only
