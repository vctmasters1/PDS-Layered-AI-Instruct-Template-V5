# OTA Architecture Diagram

## Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                         MainActivity.kt                          │
│                   (Top-level UI Controller)                      │
└──────────────────────────┬──────────────────────────────────────┘
                          │
                          │ showOtaDialog = true
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│            PlatformOtaUpdateDialog.kt (Platform Agnostic)       │
│                                                                  │
│  • Gets platformId from selectedDevice                          │
│  • Calls OtaProviderFactory.isSupportedPlatform()             │
│  • Routes to correct platform-specific dialog                  │
└──────────────────┬──────────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
   ┌──────────────┐    ┌──────────────┐
   │  ESP32-C3    │    │  EFR32MG24   │
   │  OtaDialog   │    │  OtaDialog   │
   └──────┬───────┘    └──────┬───────┘
          │                   │
          ▼                   ▼
   ┌──────────────┐    ┌──────────────┐
   │  OtaViewModel│    │  OtaViewModel│
   └──────┬───────┘    └──────┬───────┘
          │                   │
          ├───────┬───────────┤
          │       │           │
          ▼       ▼           ▼
     ┌─────────────────────────────────┐
     │  OtaProviderFactory.kt          │
     │  (Factory Pattern)              │
     │                                 │
     │ createOtaProvider(context, id) │
     └──────┬────────────────┬─────────┘
            │                │
            ▼                ▼
       ┌──────────┐    ┌──────────┐
       │ ESP32C3  │    │ EFR32MG24│
       │ OtaManager   │ OtaManager   │
       │ (BLE Proto) │ (.gbl Format)
       └──────┬──────┘    └──────┬───┘
              │                  │
              └──────────┬───────┘
                         ▼
           ┌─────────────────────────────┐
           │  OtaProvider Interface      │
           │                             │
           │ + getAvailableFirmware()   │
           │ + validateFirmware()        │
           │ + startUpdate()             │
           │ + cancelUpdate()            │
           │ + getCurrentProgress()      │
           │ + getFirmwareFileExtension()
           │ + getFirmwareAssetPath()   │
           └──────────────┬──────────────┘
                          │
                          ▼
           ┌─────────────────────────────┐
           │  Assets Directory           │
           │                             │
           │ firmware/                  │
           │  ├─ esp32c3_supermini/    │
           │  │  └─ *.bin files        │
           │  └─ efr32mg24/            │
           │     └─ *.gbl files        │
           └─────────────────────────────┘
```

## Data Flow: Starting an OTA Update

```
User Clicks                  Platform Dialog Routes         OTA Manager Processes
"Firmware Update"                                           Update
      │                             │                             │
      ▼                             ▼                             ▼
MainActivity.showOtaDialog   PlatformOtaUpdateDialog   OtaManager.startUpdate()
      │                      passes platformId              │
      │                             │                       ├─ Validate firmware
      │                             ▼                       │
      │                   Factory creates                   ├─ Read file from assets
      │                   correct OtaProvider               │
      │                             │                       ├─ Upload with progress
      │                             ▼                       │
      │                   Platform Dialog Opens             ├─ Verify checksum
      │                             │                       │
      │                             └─ OtaViewModel         ├─ Reset device
      │                                  │                  │
      │                                  ├─ Displays        └─ Return OtaResult
      │                                  │  firmware list      (Success/Error)
      │                                  │
      │ User selects                    │
      │ firmware version                ▼
      │   │                        OtaManager
      │   │                        .startUpdate()
      │   │                             │
      │   └────────────┬────────────────┘
      │                ▼
      │         Progress updates
      │         via StateFlow<OtaResult>
      │                │
      │                ▼
      │         UI updates with:
      │         • Progress bar (0-100%)
      │         • Log messages
      │         • Status (In Progress → Success/Error)
      │
      │ Update complete
      ▼
Dialog closes, MainActivity updated
```

## Class Hierarchy

```
OtaProvider (Interface)
    │
    ├─ ESP32-C3 OtaManager
    │     └─ Implements: BLE protocol, .bin format
    │
    ├─ EFR32MG24 OtaManager
    │     └─ Implements: Gecko Bootloader protocol, .gbl format
    │
    └─ [Future] Any new platform...
        └─ Must implement all OtaProvider methods

OtaResult (Sealed Class)
    ├─ Success(message: String)
    ├─ InProgress(progress: Int, message: String)
    ├─ Error(exception: Exception)
    └─ Idle
```

## Asset Organization

```
Android/app/src/main/assets/
└── firmware/
    ├── README.md (naming conventions)
    ├── esp32c3_supermini/
    │   ├── esp32c3_supermini-v1.0.0.bin
    │   ├── esp32c3_supermini-v1.2.3.bin
    │   └── esp32c3_supermini-v2.0.0.bin
    │
    └── efr32mg24/
        ├── efr32mg24-hwrev_001-v1.0.0.gbl
        ├── efr32mg24-hwrev_002-v1.0.0.gbl
        └── efr32mg24-v2.0.0.gbl
```

## File Extension Mapping

| Platform | Extension | Format | Transport |
|----------|-----------|--------|-----------|
| ESP32-C3 | .bin | ESP-IDF Binary | BLE/Serial |
| EFR32MG24 | .gbl | Gecko Bootloader | Serial/J-Link |
| Arduino | .hex | Intel HEX (future) | Serial |
| NRF52 | .zip | DFU Package (future) | BLE |

## Error Handling Flow

```
OtaManager.startUpdate()
    │
    ├─ Validate firmware
    │   │
    │   ├─ Success → Continue
    │   └─ Error → Return OtaResult.Error
    │
    ├─ Read file from assets
    │   │
    │   ├─ Success → Continue
    │   └─ Error (FileNotFound) → Return OtaResult.Error
    │
    ├─ Connect to device
    │   │
    │   ├─ Success → Continue
    │   └─ Error (Timeout) → Return OtaResult.Error
    │
    ├─ Upload with retry logic
    │   │
    │   ├─ Success → Continue
    │   └─ Error (Connection lost) → Retry or return Error
    │
    ├─ Verify checksum
    │   │
    │   ├─ Success → Continue
    │   └─ Error (Checksum mismatch) → Return OtaResult.Error
    │
    └─ Return OtaResult.Success or Error
```

## Extension Points for New Platforms

To add support for a new device platform:

1. **Create Platform Package**
   ```
   vm.pds.h2o.dev_platforms.{platform_name}/
   ```

2. **Implement OtaProvider Interface**
   ```kotlin
   class OtaManager(context: Context) : OtaProvider {
       override suspend fun getAvailableFirmware(): List<FirmwareInfo>
       override suspend fun validateFirmware(info: FirmwareInfo): OtaResult
       override suspend fun startUpdate(...): StateFlow<OtaResult>
       // ... implement all required methods
   }
   ```

3. **Register in OtaProviderFactory**
   ```kotlin
   when (platformId) {
       "NEW_PLATFORM_ID" -> NewPlatformOtaManager(context)
   }
   ```

4. **Create UI Components**
   - OtaViewModel.kt
   - OtaUpdateDialog.kt

5. **Add Assets Folder**
   ```
   assets/firmware/{platform_name}/
   ```
