# PDS Build System Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    User Interface Layer                              │
├─────────────────────────────┬───────────────────────────────────────┤
│                             │                                       │
│  GUI Interface              │  CLI Interface                        │
│  ┌──────────────────────┐   │  ┌─────────────────────────────────┐ │
│  │  go_gui.py           │   │  │  go.py                          │ │
│  │                      │   │  │                                 │ │
│  │  • 3-column selector │   │  │  • Interactive mode             │ │
│  │  • Live terminal     │   │  │  • CLI parameters               │ │
│  │  • Compile button    │   │  │  • Help system                  │ │
│  │  • Auto-save config  │   │  │  • Platform listing             │ │
│  └──────┬───────────────┘   │  └──────┬──────────────────────────┘ │
│         │ (PySimpleGUI)     │         │ (argparse)                 │
└─────────┼───────────────────┼─────────┼──────────────────────────────┘
          │                   │         │
          └───────────────────┴─────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Configuration Loading Layer                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  config/platforms.json           config/roles.json                 │
│  ┌──────────────────────┐        ┌──────────────────────┐          │
│  │ esp32c3              │        │ aeroponics           │          │
│  │  ├─ hwrev: 001       │        │  ├─ components       │          │
│  │  ├─ hwrev: 002       │        │  └─ features         │          │
│  │  └─ roles: [...]     │        │                      │          │
│  │                      │        │ greenhouse           │          │
│  │ silabs               │        │  ├─ components       │          │
│  │  ├─ hwrev: 001       │        │  └─ features         │          │
│  │  └─ roles: [...]     │        │                      │          │
│  └──────────────────────┘        │ generic              │          │
│                                  │  ├─ components       │          │
│                                  │  └─ features         │          │
│                                  │                      │          │
│                                  │ sensor_hub           │          │
│                                  │  ├─ components       │          │
│                                  │  └─ features         │          │
│                                  └──────────────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
          │                            │
          └────────────────┬───────────┘
                           │ (Load & Validate)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│            Selection & Validation Layer                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  build_selector.py                                                  │
│  ┌──────────────────────────────────────────────────────┐          │
│  │ Input: Platform, Hardware Revision, Device Role     │          │
│  │                                                      │          │
│  │ Validates:                                           │          │
│  │ ├─ Platform exists in config                        │          │
│  │ ├─ Hardware revision is supported                   │          │
│  │ ├─ Role is available for platform                   │          │
│  │ └─ All required components are defined              │          │
│  │                                                      │          │
│  │ Output: Build configuration (JSON)                  │          │
│  └──────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
          │
          │ (Validated config)
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│         Platform-Specific Build Layer                                │
├──────────────────────────┬──────────────────────────────────────────┤
│                          │                                          │
│  build_espidf.py         │  build_silabs.py                        │
│  ┌────────────────────┐  │  ┌────────────────────┐                │
│  │ ESP-IDF Build      │  │  │ Silicon Labs Build │                │
│  │                    │  │  │                    │                │
│  │ • Setup ESP-IDF    │  │  │ • Setup ARM GCC    │                │
│  │   environment      │  │  │ • Load SDK config  │                │
│  │ • Run idf.py build │  │  │ • Run cmake        │                │
│  │ • Collect output   │  │  │ • Build binaries   │                │
│  │ • Return exit code │  │  │ • Return exit code │                │
│  └────────────────────┘  │  └────────────────────┘                │
└──────────────────────────┴──────────────────────────────────────────┘
          │                          │
          ▼                          ▼
┌────────────────────┐  ┌────────────────────────────────┐
│ idf.py build       │  │ cmake / arm-gcc                │
│ (ESP-IDF)          │  │ (Silicon Labs SDK)             │
└────────────────────┘  └────────────────────────────────┘
          │                          │
          ▼                          ▼
┌────────────────────┐  ┌────────────────────────────────┐
│ Device Firmware    │  │ Device Firmware                │
│ (esp32c3_firmware) │  │ (silabs_firmware)              │
└────────────────────┘  └────────────────────────────────┘
```

## Data Flow

### 1. User Selection (GUI/CLI)
```
User Input
    │
    ├─ Platform: "esp32c3"
    ├─ HWREV: "001"
    └─ Role: "aeroponics"
         │
         ▼
    ↓ (passed to build system)
```

### 2. Configuration Loading
```
Input Parameters
    │
    ├─ Load platforms.json → Find esp32c3 config
    ├─ Validate hwrev 001 exists
    ├─ Load roles.json → Find aeroponics role
    └─ Merge configurations
         │
         ▼
    ↓ (Build config object created)
```

### 3. Platform-Specific Execution
```
Build Config
    │
    ├─ Platform = esp32c3? → build_espidf.py
    └─ Platform = silabs? → build_silabs.py
         │
         ▼
    ↓ (Environment setup, compilation)
```

### 4. Output & Completion
```
Build Process
    │
    ├─ Compilation complete
    ├─ Binaries generated
    └─ Exit status reported
         │
         ▼
    ↓ (GUI/CLI displays result)
```

## Component Responsibilities

### go.py / go_gui.py
**Responsibility**: User interface and orchestration

- Presents selection options
- Validates user input
- Shows platform/role descriptions
- Calls build_selector.py with parameters
- Displays build output/status
- Saves user selections

**Input**: User selections (interactive or CLI args)  
**Output**: None (delegates to downstream)  
**Error Handling**: Input validation, shows error dialogs/messages

### build_selector.py
**Responsibility**: Configuration selection and delegation

- Loads configuration files
- Validates platform/hwrev/role combination
- Generates build configuration
- Calls platform-specific builder
- Streams output to caller
- Returns exit code

**Input**: Platform, HWREV, Role (strings)  
**Output**: Build configuration, exit code  
**Error Handling**: Invalid selection detection, helpful error messages

### build_espidf.py
**Responsibility**: ESP-IDF build execution

- Sets up ESP-IDF environment
- Configures target and components
- Runs `idf.py build`
- Collects and streams output
- Returns compilation exit code

**Input**: Build configuration object  
**Output**: Build output stream  
**Error Handling**: Environment validation, idf.py error capture

### build_silabs.py
**Responsibility**: Silicon Labs build execution

- Sets up ARM GCC environment
- Loads Silicon Labs SDK configuration
- Runs cmake and make
- Collects and streams output
- Returns compilation exit code

**Input**: Build configuration object  
**Output**: Build output stream  
**Error Handling**: Environment validation, build error capture

## Configuration Files

### platforms.json
```json
{
  "platforms": {
    "esp32c3": {
      "description": "...",
      "build_system": "esp-idf",
      "hwrevs": [
        {"id": "001", "name": "...", "description": "..."},
        {"id": "002", "name": "...", "description": "..."}
      ],
      "available_roles": ["aeroponics", "greenhouse", "generic"]
    },
    "silabs": {
      "description": "...",
      "build_system": "cmake",
      "hwrevs": [{"id": "001", ...}],
      "available_roles": ["generic", "sensor_hub"]
    }
  }
}
```

### roles.json
```json
{
  "roles": {
    "aeroponics": {
      "description": "Complete aeroponics system...",
      "components": ["pds_core", "pds_hal", ...],
      "features": ["BLE_PROVISIONING", "HTTPS_API", ...]
    },
    "greenhouse": {...},
    "generic": {...},
    "sensor_hub": {...}
  }
}
```

## Execution Sequences

### Happy Path (Successful Build)

```
go_gui.py                    build_selector.py        build_espidf.py
    │                            │                         │
    ├─ Load config ─────────────>│                         │
    │                            ├─ Validate ──────────────>│
    │                            │                         │
    │                            │<─ OK ─────────────────  │
    │                            │                         │
    ├─ Display choices           │                         │
    │                            │                         │
    ├─ User selects & clicks     │                         │
    │                            │                         │
    ├─ Validate selection ───────>│                         │
    │                            ├─ Build environment ───>│
    │                            │                         │
    │<─ Build output stream ────────────────────────────  │
    │                            │<─ Output stream ──────  │
    │<─ Build output stream ────────────────────────────  │
    │                            │                         │
    │<─ Exit code 0 ─────────────────────────────────────  │
    │                            │                         │
    ├─ Show "Success!" message   │                         │
    │                            │                         │
    └─ Display compiled binary   │                         │
```

### Error Path (Build Failure)

```
go_gui.py                    build_selector.py        build_espidf.py
    │                            │                         │
    ├─ Validate selection ───────>│                         │
    │                            ├─ Check platform ──────>│
    │                            │                         │
    │                            │<─ Error ──────────────  │
    │<─ Error message ─────────────────────────────────   │
    │                            │                         │
    ├─ Show error dialog         │                         │
    │                            │                         │
    └─ Ready for retry           │                         │
```

## Threading Model

### go_gui.py
- **Main Thread**: GUI event loop, user interaction
- **Build Thread**: Build execution (subprocess)
- **Queue**: Output from build thread to GUI (thread-safe)

### go.py
- **Main Thread**: Single-threaded, wait for subprocess completion

## Entry Points

### GUI Entry
```bash
# Start: launch_gui.bat or python go_gui.py
#
# 1. Window appears
# 2. User selects platform/hwrev/role
# 3. User clicks "Compile"
# 4. Build starts in background thread
# 5. Output displays live in terminal
# 6. Build completes, status updates
```

### CLI Entry
```bash
# Interactive: python go.py
# 1. Menu appears
# 2. User selects options
# 3. Confirmation shown
# 4. Build starts
# 5. Output displayed
# 6. Exit with status code
#
# Direct: python go.py --platform esp32c3 --hwrev 001 --role aeroponics
# 1. Validation
# 2. Build starts
# 3. Output displayed
# 4. Exit with status code
```

## Error Handling

### Configuration Errors
- Missing config files → Error dialog + exit
- Invalid JSON → Error message + exit
- Missing platform → Selection error + retry

### Validation Errors
- Invalid platform → "Platform not found" + list options
- Invalid hwrev → "Hardware revision not supported"
- Invalid role → "Role not available for platform"

### Build Errors
- Build command failure → Display exit code + output
- Subprocess crash → Capture exception + show message
- Output capture failure → Generic error message

## Caching

### Last Selection
- File: `.last_selection.json`
- Auto-saved after successful validation
- Auto-loaded on GUI/CLI startup
- Provides user convenience
- Format:
  ```json
  {
    "platform": "esp32c3",
    "hwrev": "001",
    "role": "aeroponics"
  }
  ```

## Future Enhancements

1. **Progress Bar**: Show build progress percentage
2. **Build Parallelization**: Run multiple builds in parallel
3. **History**: Track all builds (date, time, status)
4. **Presets**: Save named build configurations
5. **Notifications**: Email/Slack on build completion
6. **Metrics**: Track build times and success rates
7. **Logging**: Persistent build logs per configuration
8. **CI Integration**: Trigger from GitHub Actions or Jenkins

---

**Last Updated**: February 1, 2026  
**Architecture Version**: 2.0 (GUI + CLI)
