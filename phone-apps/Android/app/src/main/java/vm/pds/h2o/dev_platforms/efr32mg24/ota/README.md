# EFR32MG24 OTA Implementation

This directory contains the EFR32MG24-specific firmware update (OTA) implementation.

## Overview

- **OtaManager.kt** - Implements `OtaProvider` interface for EFR32MG24 Gecko Bootloader protocol
- **OtaViewModel.kt** - Manages firmware selection and update state with Compose Flow
- **OtaUpdateDialog.kt** - Jetpack Compose UI for firmware selection, progress tracking, and logging
- **FirmwareInfo.kt** - Re-exports abstract `FirmwareInfo` data class

## Firmware Format

EFR32MG24 firmware updates use **Gecko Bootloader (.gbl) format**.

### File Naming Convention

```
efr32mg24-hwrev_001-v2.1.0.gbl     (with hardware revision)
efr32mg24-v2.0.0.gbl                (without revision - uses hwrev_001 by default)
```

### Asset Location

Firmware files should be placed in:
```
Android/app/src/main/assets/firmware/efr32mg24/
```

## Update Protocol

The OTA manager supports Gecko Bootloader serial protocol (via UART or Serial-to-Bluetooth adapter).

### Flow

1. **Discovery** - App scans assets for available .gbl files
2. **Validation** - Verifies firmware file integrity (size check, file exists)
3. **Connection** - Establishes connection to device bootloader
4. **Upload** - Transfers firmware data with progress tracking
5. **Verification** - Validates checksum
6. **Reset** - Device reboots into new firmware

### Platform-Specific Details

**Transport**: Serial (UART/USB)  
**Bootloader**: Silicon Labs Gecko Bootloader  
**Protocol**: Gecko Bootloader serial protocol (proprietary)

### Current Implementation Status

- ✅ Asset scanning (firmware discovery)
- ✅ File validation
- ✅ Progress tracking UI
- ✅ Log output for debugging
- ⚠️ **TODO**: Actual Gecko Bootloader serial protocol implementation
  - Currently simulates upload with mock progress
  - Requires: Serial port communication library (e.g., Serial2Bluetooth, USB CDC)
  - Implementation location: `startUpdate()` method

## Hardware Revision Filtering

Firmware filenames can include hardware revision:
- Format: `efr32mg24-hwrev_001-v2.1.0.gbl`
- Parser extracts revision from filename
- Falls back to `hwrev_001` if not specified

This allows the app to warn users if they select firmware for a different hardware revision.

## Usage in MainActivity

The EFR32MG24 OTA dialog is accessed via the factory:

```kotlin
// In MainActivity menu
PlatformOtaUpdateDialog(
    context = context,
    selectedDevicePlatformId = "EFR32MG24_DK",
    onDismiss = { showOtaDialog = false }
)
```

The factory automatically loads the EFR32MG24 implementation when the platform ID is detected.

## Future Enhancements

1. **Serial Protocol Implementation** - Actual Gecko Bootloader communication
2. **Checksum Validation** - CRC32/SHA256 verification
3. **Rollback Prevention** - Warn users about downgrading
4. **Multi-Device Support** - Update multiple devices sequentially
5. **Retry Logic** - Auto-retry on connection failure
6. **Firmware Signing** - Validate digital signatures

## Related Files

- **Abstract Interface**: [../abstract/OtaProvider.kt](../abstract/OtaProvider.kt)
- **Factory**: [../abstract/OtaProviderFactory.kt](../abstract/OtaProviderFactory.kt)
- **ESP32-C3 Implementation**: [../esp32c3_supermini/ota/](../esp32c3_supermini/ota/)
- **UI Integration**: [../../ui/PlatformOtaUpdateDialog.kt](../../ui/PlatformOtaUpdateDialog.kt)
- **Assets**: [../../../assets/firmware/efr32mg24/](../../../assets/firmware/efr32mg24/)
