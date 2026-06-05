# AI-INSTRUCT: PhoneApps/Ios

**Last Updated**: May 5, 2026  
**Authority Level**: DEEP (Authoritative for all work in `PhoneApps/Ios/`)  
**Parent context**: `PhoneApps/AI-INSTRUCT.md` (cross-platform mandate applies)

---

## Contents

| § | What's here |
|---|-------------|
| [Overview](#overview) | App identity and tech stack |
| [Guiding Principle](#guiding-principle) | iOS mirror of Android; feature parity mandate |
| [Required Directory Structure](#required-directory-structure) | Xcode project layout |
| [BLE UUIDs](#ble-uuids) | Service and characteristic UUIDs |
| [NetworkManager Pattern](#networkmanager-pattern) | Cloud API networking pattern |
| [Binary Deserialization (Telemetry)](#binary-deserialization-telemetry) | Telemetry decode pattern |
| [Authentication & Credential Storage](#authentication--credential-storage) | JWT auth and Keychain storage |
| [Cloud API Surface](#cloud-api-surface) | Implemented API calls |
| [Screen Inventory](#screen-inventory) | Required screens list |
| [What Is Not Implemented Yet](#what-is-not-implemented-yet) | Known gaps |

## Overview for the PDS ecosystem. This is the **iOS mirror** of `PhoneApps/Android/`. Every feature, screen, and architectural layer that exists in the Android app must exist here, implemented natively in Swift.

**Current Status**: Scaffold only — directory exists, no source files yet.

**Language**: Swift 5.9+  
**UI Framework**: SwiftUI  
**Async**: Swift Concurrency (`async/await`, `AsyncStream`, `@MainActor`)  
**Architecture**: MVVM via `@Observable` (iOS 17+) or `ObservableObject` (iOS 15/16)  
**Build**: Xcode, `Package.swift` or `.xcodeproj`

---

## Guiding Principle

> This app is not a port of the Android app. It is a parallel implementation of the same architecture in Swift idioms.

Do not translate Kotlin line-by-line. Use Swift-idiomatic equivalents:

| Android (Kotlin) | iOS (Swift) |
|---|---|
| `StateFlow` / `MutableStateFlow` | `@Published` / `@Observable` |
| Coroutines + `viewModelScope` | `async/await` + `Task` |
| `BluetoothManager` (Android BT stack) | `CBCentralManager` (CoreBluetooth) |
| `HttpURLConnection` | `URLSession` |
| `ByteBuffer.order(LITTLE_ENDIAN)` | `Data` + `withUnsafeBytes` / `Codable` |
| `Jetpack Compose` | `SwiftUI` |
| `@AndroidViewModel` | `@Observable class` / `ObservableObject` |

---

## Required Directory Structure

Mirror the Android package layout. Create this structure when implementing:

```
PhoneApps/Ios/
├── PDS.xcodeproj/  (or Package.swift for SPM)
├── PDS/
│   ├── App/
│   │   └── PDSApp.swift                  ← @main entry point, NavigationStack setup
│   ├── Ble/
│   │   ├── BleConstants.swift            ← BLE UUIDs (must exactly mirror BleConstants.kt)
│   │   └── BleManager.swift              ← CBCentralManager: scan, connect, write characteristics
│   ├── Network/
│   │   └── NetworkManager.swift          ← REST client: cloud (JWT) + local relay (X-Device-Token)
│   ├── Models/
│   │   ├── DataTypes.swift               ← Swift structs mirroring device C structs (PDS_TELDATA_*)
│   │   └── Serialization.swift           ← Binary deserializer: TeldataPacket from Data
│   ├── DevicePlatforms/
│   │   ├── Abstract/
│   │   │   ├── OtaProvider.swift         ← Protocol: getAvailableFirmware(), startUpdate()
│   │   │   ├── PlatformInterface.swift   ← Protocol: pin caps, condition/action serialization
│   │   │   ├── DevicePinMap.swift        ← Protocol: pinNumber → label/function
│   │   │   └── FirmwareInfo.swift        ← Value type: version, filePath, checksum, hwRevision
│   │   ├── Esp32Node32s/
│   │   │   ├── PinCapabilities.swift
│   │   │   └── Hwrev001/H2o001/
│   │   │       ├── DefaultPinMap.swift
│   │   │       └── DefaultAutomation.swift
│   │   └── Esp32c3Supermini/
│   │       ├── PinCapabilities.swift
│   │       └── Hwrev001/<Role>/
│   ├── Automation/
│   │   ├── DataModels/                   ← Condition, Action, Pipeline, Timer structs
│   │   ├── PlatformInterface.swift       ← Protocol: serializePipeline → Data
│   │   └── PipelineBuilders.swift        ← Factory helpers for pipeline objects
│   ├── Data/
│   │   ├── DeviceRepository.swift        ← Persistent device list (Keychain / UserDefaults)
│   │   └── DeviceStatus.swift            ← Cloud device status model
│   ├── ViewModel/
│   │   ├── MainViewModel.swift           ← App-wide state: device list, selected device, BLE, network
│   │   ├── HomeViewModel.swift
│   │   └── AssociateDeviceViewModel.swift
│   └── UI/
│       ├── HomeView.swift
│       ├── AutomationView.swift
│       ├── AssociateDeviceView.swift
│       ├── SettingsView.swift
│       ├── SysconfView.swift
│       ├── VersionView.swift             ← OTA version picker + auto-update toggle
│       └── Theme/
│           ├── Colors.swift
│           └── Typography.swift
```

---

## BLE UUIDs

Copy **exactly** from `PhoneApps/Android/…/ble/BleConstants.kt`. Do not invent new ones.

```swift
// BleConstants.swift
import CoreBluetooth

enum BleConstants {
    static let provisioningServiceUUID    = CBUUID(string: "0000181c-0000-1000-8000-00805f9b34fb")
    static let ssidCharacteristicUUID     = CBUUID(string: "00002a3d-0000-1000-8000-00805f9b34fb")
    static let passwordCharacteristicUUID = CBUUID(string: "00002a3e-0000-1000-8000-00805f9b34fb")
    static let connectCharacteristicUUID  = CBUUID(string: "00002a3f-0000-1000-8000-00805f9b34fb")
}
```

---

## NetworkManager Pattern

`NetworkManager.swift` must support the same three modes as the Android version:

1. **Cloud mode**: `Authorization: Bearer <jwt>` on all requests to HMI API
2. **Local relay mode**: `X-Device-Token: <token>` header, direct device IP
3. **Mock mode**: hardcoded responses (dev only, never ship enabled)

```swift
// Sketch — not final implementation
actor NetworkManager {
    var apiBaseUrl: String = ""
    var jwtToken: String = ""
    private var localRelayIp: String = ""
    private var deviceToken: String = ""

    func getDeviceStatus(deviceId: String) async throws -> DeviceStatus { ... }
    func getDeviceTelemetry(deviceId: String) async throws -> String? { ... }
    func getAvailableFirmware(deviceId: String) async throws -> AvailableFirmwareResponse { ... }
    func queueOta(deviceId: String, version: String) async throws { ... }
    func patchDevice(deviceId: String, patch: DevicePatch) async throws { ... }
}
```

---

## Binary Deserialization (Telemetry)

`Serialization.deserializeTelemetryPacket(Data) -> TeldataPacket?` must decode the same little-endian binary format as `Serialization.kt`:

- `TeldataHeader`: 16 bytes (2× UInt32, 2× UInt16, 3× UInt8, 1 reserved)
- Per ADC reading: 1 UInt8 pin + 2 UInt8 pad/short + 1 UInt16 raw + 2 Float + 32-byte label string
- Per PWM output: 1 UInt8 pin + 1 pad + 1 UInt16 duty + 1 UInt32 freq + 32-byte label
- Per GPIO state: 1 UInt8 pin + 1 UInt8 state + 32-byte label + 2 pad

If the device firmware changes the struct, both `Serialization.kt` and `Serialization.swift` must update together.

---

## Authentication & Credential Storage

- JWT token → `Keychain` (never `UserDefaults`)
- Local relay token → in-memory only; never persisted
- No plaintext credential storage anywhere

---

## Cloud API Surface

Implement the same endpoints as Android's `NetworkManager.kt`:

| Endpoint | Purpose |
|---|---|
| `POST /v1/auth/login` | Obtain JWT |
| `GET /v1/devices` | Device list |
| `GET /v1/devices/:id` | Device details + live state |
| `GET /v1/devices/:id/telemetry?limit=1` | Latest telemetry snapshot |
| `GET /v1/devices/:id/available-firmware` | Available firmware versions |
| `POST /v1/devices/:id/ota` | Queue cloud OTA |
| `PATCH /v1/devices/:id` | Update friendlyName, autoUpdateEnabled |

---

## Screen Inventory

Mirror the Android screen inventory exactly:

| Screen | SwiftUI View |
|---|---|
| Login | `LoginView.swift` |
| Device List | `DeviceListView.swift` |
| Device Home (live telemetry) | `HomeView.swift` |
| Automation / Pipeline | `AutomationView.swift` |
| Settings | `SettingsView.swift` |
| Associate Device (BLE provisioning) | `AssociateDeviceView.swift` |
| Version / OTA | `VersionView.swift` |
| Sysconf | `SysconfView.swift` |

---

## What Is Not Implemented Yet

Everything. This is a scaffold. When implementing:

1. Start with `NetworkManager.swift` + `Models/DataTypes.swift` — these define the data contract.
2. Add `BleManager.swift` + `BleConstants.swift` — copy UUIDs from Android exactly.
3. Add ViewModels top-down from `MainViewModel.swift`.
4. Add UI screens last — screens are thin consumers of ViewModel state.

Do not implement platform-specific OTA (BLE/serial push) until cloud OTA is working end-to-end.
