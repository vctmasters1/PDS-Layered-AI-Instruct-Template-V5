# Firmware Directory

Place firmware binary files in this directory:

## Naming Conventions

### ESP32-C3 Super Mini
- Format: `esp32c3_supermini-v{VERSION}.bin`
- Example: `esp32c3_supermini-v1.0.0.bin`, `esp32c3_supermini-v1.2.3.bin`
- Expected in: `firmware/esp32c3_supermini/`

### EFR32MG24
- Format: `efr32mg24-hwrev_{REVISION}-v{VERSION}.gbl` or `efr32mg24-v{VERSION}.gbl`
- Example: `efr32mg24-hwrev_001-v2.1.0.gbl`, `efr32mg24-v2.0.0.gbl`
- Expected in: `firmware/efr32mg24/`
- Note: .gbl = Gecko Bootloader firmware format

## Version Sorting

Versions are sorted in descending order (newest first). Use semantic versioning: `v{MAJOR}.{MINOR}.{PATCH}`

## Build Integration

These directories are embedded in the APK during build. To add firmware:
1. Place binary files in the appropriate directory
2. Rebuild app: `./gradlew assembleDebug`
3. Firmware files will be accessible via AssetManager

## Development Notes

- Firmware files should be tested before adding to the app
- Keep older versions for rollback testing
- Document any breaking changes in release notes
