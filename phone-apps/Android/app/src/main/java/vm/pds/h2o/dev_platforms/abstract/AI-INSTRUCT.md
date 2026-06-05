# Abstract Platform Layer

This directory holds abstract interfaces and factory classes that define platform-agnostic contracts for device operations. Each platform (ESP32-C3, EFR32MG24, etc.) implements these interfaces with platform-specific behavior.

## Purpose

- **Platform Abstraction**: Define common interfaces that all platforms must implement
- **Factory Pattern**: Provide factory methods for creating platform-specific implementations
- **Decoupling**: Allow UI and business logic to work with any platform without knowing implementation details

## Core Files

### `DevicePinMap.kt`
Abstract interface for pin configuration across platforms.

### `Constants.kt`
Base configuration constants for all platforms.

### `OtaProvider.kt`
**Abstract OTA (Over-The-Air) firmware update interface**

Defines the contract for firmware update operations:
- `getAvailableFirmware()` - List available firmware versions
- `validateFirmware()` - Verify firmware before upload
- `startUpdate()` - Initiate firmware update with progress tracking
- `cancelUpdate()` - Abort ongoing update
- `getCurrentProgress()` - Query update progress
- `getFirmwareFileExtension()` - Platform-specific file format (.bin, .gbl, .elf, etc.)
- `getFirmwareAssetPath()` - Location of firmware files in app assets

See [OtaProvider.kt](OtaProvider.kt) for complete documentation.

### `OtaProviderFactory.kt`
**Factory for creating platform-specific OTA providers**

Usage:
```kotlin
val otaProvider = OtaProviderFactory.createOtaProvider(
    context = context,
    platformId = "ESP32C3_SUPERMINI"  // or "EFR32MG24_DK"
)
```

Supported platforms:
- `ESP32C3_SUPERMINI` → [esp32c3_supermini/ota/](../esp32c3_supermini/ota/)
- `EFR32MG24_DK` → [efr32mg24/ota/](../efr32mg24/ota/)

## Platform Implementation Structure

Each platform folder (e.g., `esp32c3_supermini/`, `efr32mg24/`) contains:

```
platform/
├── common/
│   ├── Constants.kt          (implements PlatformDefinition)
│   └── AI-INSTRUCT.md
├── hwrev_*/                  (hardware revision-specific)
│   └── role_*/               (role-specific: h2o_001, sv_001, etc.)
└── ota/
    ├── FirmwareInfo.kt       (re-exports from abstract)
    ├── OtaManager.kt         (implements OtaProvider)
    ├── OtaViewModel.kt       (Compose state management)
    └── OtaUpdateDialog.kt    (UI component)
```

## Adding a New Platform

To support a new platform (e.g., `Arduino-MKR-WiFi-1010`):

1. **Create platform directory**:
   ```
   Android/app/src/main/java/vm/pds/h2o/dev_platforms/arduino_mkr_wifi1010/
   ```

2. **Implement Constants.kt**:
   ```kotlin
   object Constants : PlatformDefinition {
       override val platformId = "ARDUINO_MKR_1010"
       override val platformName = "Arduino MKR WiFi 1010"
       // ... other properties
   }
   ```

3. **Implement OtaManager.kt** (implements `OtaProvider`):
   ```kotlin
   class OtaManager(context: Context) : OtaProvider {
       override suspend fun getAvailableFirmware(): List<FirmwareInfo> { ... }
       override suspend fun validateFirmware(...) { ... }
       // ... other required methods
   }
   ```

4. **Add to OtaProviderFactory.kt**:
   ```kotlin
   when (platformId) {
       "ARDUINO_MKR_1010" -> ArduinoOtaManager(context)
       // ... other platforms
   }
   ```

5. **Implement OTA UI** (`OtaViewModel.kt`, `OtaUpdateDialog.kt`)

6. **Create assets folder**:
   ```
   Android/app/src/main/assets/firmware/arduino_mkr_wifi1010/
   ```

## Related Documentation

- **Parent Documentation**: See [AI-OVERVIEW-ANDROID.md](../../AI-OVERVIEW-ANDROID.md)
- **ESP32-C3 OTA**: [esp32c3_supermini/ota/](../esp32c3_supermini/ota/)
- **EFR32MG24 OTA**: [efr32mg24/ota/](../efr32mg24/ota/)
- **Protocol**: [PROTOCOL.md](../../../../PROTOCOL.md)
