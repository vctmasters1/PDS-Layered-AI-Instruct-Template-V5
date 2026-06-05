# PDS Build System GUI - Quick Start

## Overview

The **Build System GUI** (`go_gui.py`) provides a visual interface for building PDS firmware across different platforms and device configurations.

## Features

- **Three-Column Selector**: Select Platform → Hardware Revision → Device Role
- **Live Terminal Output**: Real-time build progress monitoring
- **Auto-Save**: Remembers your last selection
- **Platform Information**: View detailed platform and role descriptions
- **One-Click Build**: Simple compile button to start building

## Installation

### Prerequisites

PySimpleGUI is required. It's available from a private PyPI server:

```bash
python -m pip install --extra-index-url https://PySimpleGUI.net/install PySimpleGUI
```

**Or use the Windows batch installer** (recommended for Windows):

```cmd
launch_gui.bat
```

This automatically installs/updates PySimpleGUI and launches the GUI.

### Quick Start

**Option 1: Using Batch Launcher (Easiest - Windows)**
```cmd
# Just double-click or run:
launch_gui.bat
```

**Option 2: Direct Launch (Any OS)**
```bash
cd k:\PDS_AutomationSuite\PDS-ConfigAndBuildTools
python go_gui.py
```

**Option 3: From VS Code**
- Open `go_gui.py` in VS Code
- Click the "Run" button (▶️) in the top-right corner

**Troubleshooting Installation**: See [PYSIMPLEGUI_INSTALLATION.md](PYSIMPLEGUI_INSTALLATION.md) if you have issues

## How to Use

### 1. Select Platform
- Click the **PLATFORM** column on the left
- Choose from available platforms:
  - **esp32c3**: Espressif ESP32-C3 with WiFi/BLE
  - **silabs**: Silicon Labs ARM-based microcontroller
- Description appears below the list

### 2. Select Hardware Revision
- Click the **HARDWARE REVISION** column in the middle
- Available revisions depend on selected platform
- Examples: `001`, `002`
- Description shows hardware details

### 3. Select Device Role
- Click the **DEVICE ROLE** column on the right
- Choose the intended use case:
  - **aeroponics**: Complete aeroponics control system
  - **greenhouse**: Environmental control for greenhouses
  - **generic**: Base device with core functionality
  - **sensor_hub**: Sensor aggregation and reporting
- Description shows role features

### 4. Build
- Click the **🔨 COMPILE** button
- Build process starts and output appears in the terminal below
- Status shows "🔨 Building..." while in progress
- Green text indicates successful output, warnings/errors in default color

### 5. Monitor Progress
- Terminal displays real-time build output
- Scrolls automatically as new output arrives
- Shows build steps, compilation, and final status

## Buttons

| Button | Action |
|--------|--------|
| **🔨 COMPILE** | Start building with current selection |
| **📋 List Platforms** | Show all available platforms and capabilities |
| **❌ Clear Output** | Clear the terminal output window |
| **⚙️ Settings** | Configure application behavior |
| **❓ Help** | Show built-in help dialog |

## UI Elements

### Three Columns

Each column is independently scrollable:

- **PLATFORM**: System architecture and build chain
- **HARDWARE REVISION**: Specific hardware version/revision
- **DEVICE ROLE**: Intended application and feature set

### Description Areas

Below each column, descriptions explain the selected item:
- Platform capabilities and build system
- Hardware revision details and active status
- Role description and included features

### Terminal Output

Large green-on-black terminal at the bottom shows:
- Build commands being executed
- Compilation progress
- Warnings and errors
- Build success or failure message

### Status Bar

Bottom-left shows:
- **Ready**: GUI is idle, ready for input
- **🔨 Building...**: Build process in progress

## Configuration

The GUI automatically loads configuration from:

- `config/platforms.json` - Platform definitions
- `config/roles.json` - Device role definitions

Last selection is automatically saved to `.last_selection.json` for next time.

## Troubleshooting

### GUI Window Doesn't Appear

1. Check Python version: `python --version` (should be 3.8+)
2. Verify PySimpleGUI is installed: `pip show PySimpleGUI`
3. Try running with explicit Python: `python.exe go_gui.py`

### Build Fails with "WinError 193"

This is a Windows-specific subprocess issue with `idf.py`. Solutions:

1. **Use Dev Container** (Recommended):
   ```powershell
   # Use ESP-IDF container instead
   code .
   # Reopen in Container (ESP-IDF)
   ```

2. **Activate ESP-IDF Environment** (Before launching GUI):
   ```powershell
   . C:\Users\vctma\DEV\ESP-IDF\v5.4.1\esp-idf\export.ps1
   python go_gui.py
   ```

3. **Use go.py (CLI)** instead:
   ```powershell
   python go.py --platform esp32c3 --hwrev 001 --role aeroponics
   ```

### Platform/Role Lists Are Empty

1. Verify config files exist:
   - `PDS-ConfigAndBuildTools/config/platforms.json`
   - `PDS-ConfigAndBuildTools/config/roles.json`

2. Check JSON syntax:
   ```bash
   python -m json.tool config/platforms.json
   ```

3. Ensure files are properly formatted (no trailing commas)

### Output Terminal Scrolls Too Fast

Use "❌ Clear Output" button to clean up old output, then run new build.

### GUI is Frozen / Not Responding

The build process runs in a background thread, so GUI should remain responsive. If frozen:

1. Wait 30 seconds (build might still be processing)
2. Try clicking another button to refresh
3. Close and reopen GUI if unresponsive

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Click list item | Select item |
| Scroll in list | Navigate items |
| Alt+Tab | Switch windows |
| Ctrl+C in terminal | (Not applicable - GUI handles it) |

## Example Workflows

### Build Aeroponics System (ESP32-C3)

1. Launch: `python go_gui.py`
2. Select **Platform**: esp32c3
3. Select **HWREV**: 001
4. Select **Role**: aeroponics
5. Click **🔨 COMPILE**
6. Wait for "Build completed successfully!"

### Build Sensor Hub (Silicon Labs)

1. Launch: `python go_gui.py`
2. Select **Platform**: silabs
3. Select **HWREV**: 001
4. Select **Role**: sensor_hub
5. Click **🔨 COMPILE**
6. Monitor output terminal

### Check Available Configurations

1. Launch: `python go_gui.py`
2. Click **📋 List Platforms**
3. Dialog shows all platforms, revisions, and roles
4. Read descriptions to understand capabilities

## Command Line Alternative

If you prefer CLI without GUI:

```bash
# Interactive mode
python go.py

# Direct build
python go.py --platform esp32c3 --hwrev 001 --role aeroponics
```

## Advanced

### Modify Theme

Edit line 15 in `go_gui.py`:
```python
sg.theme('DarkBlue3')  # Change to: 'Dark', 'LightBlue2', 'DarkGreen6', etc.
```

Available themes: `sg.theme_list()` in Python shell

### Disable Auto-Save

Edit line 157 in `BuildSystemGUI.save_selection()`:
```python
# Comment out or remove the save_selection() call
```

## Related Documentation

- **[GO_QUICK_START.md](GO_QUICK_START.md)** - CLI version quick start
- **[BUILD_SYSTEM_TEST_RESULTS.md](BUILD_SYSTEM_TEST_RESULTS.md)** - Detailed build system documentation
- **[../PROTOCOL.md](../PROTOCOL.md)** - Communication protocol details
- **[../AI-INSTRUCT.md](../AI-INSTRUCT.md)** - Project conventions and architecture

## Support

For issues or questions:

1. Check this troubleshooting section
2. Review build system documentation
3. Check output terminal for specific error messages
4. Verify configuration files are valid JSON

---

**Last Updated**: February 1, 2026  
**Status**: Ready for Use ✅
