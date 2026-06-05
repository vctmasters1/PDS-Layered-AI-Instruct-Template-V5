# PDS Configuration and Build Tools

Central location for platform selection, build configuration, and build execution scripts.

## Quick Start (⭐ Start Here!)

### 🖥️ GUI Version (Easiest!)
```bash
python go_gui.py
```
**or** double-click `launch_gui.bat`

Visual interface with:
- Three-column selector (Platform → HWREV → Role)
- Live terminal output
- One-click compile button
- Auto-saved selections

**See [GUI_QUICKSTART.md](GUI_QUICKSTART.md) for detailed usage.**

### ⌨️ CLI Version (go.py)
```bash
# Interactive mode
python go.py

# Command-line parameters
python go.py --platform esp32c3 --hwrev 001 --role aeroponics

# Use last selection
python go.py --last

# See available options
python go.py --list-platforms
```

**See [GO_QUICK_START.md](GO_QUICK_START.md) for detailed usage.**

## Directory Structure

```
PDS-ConfigAndBuildTools/
├── go.py                       # ⭐ MAIN ENTRY POINT - Start here!
├── README.md                   # This file
├── GO_QUICK_START.md          # Quick reference for go.py
├── BUILD_SYSTEM_TEST_RESULTS.md # Test results and architecture
├── config/
│   ├── platforms.json         # Supported platforms and hwrevs
│   ├── roles.json             # Available device roles
│   └── build_templates/       # Build configuration templates
├── scripts/
│   ├── build_selector.py      # Platform/hwrev/role selector (called by go.py)
│   ├── build_executor.py      # Build execution engine
│   ├── build_espidf.py        # ESP-IDF build wrapper
│   └── build_silabs.py        # Silicon Labs build wrapper
└── cache/
    └── last_selection.json    # Cache of last user selection
```
- **Roles**: 
  - `aeroponics` - Aeroponics control system
  - `greenhouse` - Greenhouse environmental control
  - `generic` - Generic sensor/actuator platform

### Silicon Labs (Future)
- **Hardware Revisions**: 001
- **Roles**:
  - `generic` - Generic control system

## Configuration System

### platforms.json
Defines available platforms, hardware revisions, and their characteristics:
```json
{
  "esp32c3": {
    "name": "ESP32-C3",
    "build_system": "esp-idf",
    "idf_version": "5.4.1",
    "target": "esp32c3",
    "hwrevs": ["001", "002"],
    "available_roles": ["aeroponics", "greenhouse", "generic"]
  }
}
```

### roles.json
Defines device roles and their configurations:
```json
{
  "aeroponics": {
    "description": "Aeroponics Tower Control System",
    "components": ["pds_core", "pds_hal", "pds_network"],
    "features": ["BLE_PROVISIONING", "HTTPS_API", "TELEMETRY"]
  }
}
```

## Build Process

1. **Selection Phase** (build_selector.py)
   - User selects platform
   - User selects hardware revision
   - User selects device role
   - Generates build configuration

2. **Preparation Phase** (build_executor.py)
   - Validates configuration
   - Sets environment variables
   - Prepares source directories
   - Validates CMakeLists.txt

3. **Compilation Phase** (platform-specific script)
   - Runs platform build tool (idf.py, make, cmake)
   - Monitors build output
   - Handles errors and warnings

4. **Output Phase**
   - Generates build artifacts
   - Creates firmware binary
   - Reports success/failure

## Environment Variables

Build scripts set the following environment variables:

- `PDS_PLATFORM` - Selected platform (e.g., esp32c3)
- `PDS_HWREV` - Hardware revision (e.g., 001)
- `PDS_ROLE` - Device role (e.g., aeroponics)
- `PDS_BUILD_DIR` - Build output directory
- `IDF_PATH` - ESP-IDF installation path (ESP-IDF only)
- `IDF_TARGET` - ESP-IDF target chip (ESP-IDF only)

## Build Outputs

After successful build:

```
Device/H2O-DEV-12102025/build/
├── H2O-DEV-12102025.elf           # Executable
├── H2O-DEV-12102025.bin           # Application binary
├── bootloader/bootloader.bin      # Bootloader
├── partition_table/               # Partition table
└── [other ESP-IDF artifacts]
```

## Troubleshooting

### "Platform not found"
Check `platforms.json` for supported platforms:
```bash
python build_selector.py --list-platforms
```

### "Build failed: CMakeLists.txt not found"
Ensure project structure is correct:
```
Device/
├── H2O-DEV-12102025/
│   ├── CMakeLists.txt
│   ├── main/
│   │   └── CMakeLists.txt
├── pds/
│   ├── pds_core/
│   ├── pds_hal/
│   └── [other components]
```

### ESP-IDF environment errors
Verify installation:
```bash
python build_espidf.py --check-env
```

## Development

### Adding a New Platform
1. Update `config/platforms.json`
2. Create `scripts/build_<platform>.py`
3. Test with `python build_selector.py --platform <new_platform>`

### Adding a New Hardware Revision
1. Update `config/platforms.json` with hwrev and capabilities
2. Add platform-specific configuration if needed
3. Test build process

### Adding a New Device Role
1. Update `config/roles.json`
2. Create role-specific CMake configuration
3. Update build scripts to apply role settings

## Integration with Dev Containers

Build scripts work seamlessly with dev containers:

```bash
# Build inside ESP-IDF container
cd Device/DEV-Container-ESPIDF
/usr/bin/python3 ../../PDS-ConfigAndBuildTools/build_selector.py

# Build inside Silicon Labs container
cd Device/DEV-Container-SILABS
/usr/bin/python3 ../../PDS-ConfigAndBuildTools/build_selector.py
```

## Related Documentation

- [Device Build Instructions](../AI-INSTRUCT-BUILD-DEVICE.md)
- [Platform Configuration](../Device/pds/AI-INSTRUCT.md)
- [Container Setup](../Device/DEV-Container-ESPIDF/README.md)

---

**Last Updated**: February 1, 2026  
**Version**: 1.0.0
