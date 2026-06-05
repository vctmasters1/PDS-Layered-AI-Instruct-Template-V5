# PDS Build System

Build automation for PDS-AutomationSuite firmware compilation.

## Quick Start

### GUI (Recommended)
```bash
python go_gui_tkinter.py
```
- Three-column selector: Platform → Hardware Revision → Role
- Real-time command preview
- Live build output terminal
- Works on Windows, Mac, Linux

### CLI
```bash
python go.py --platform esp32c3 --hwrev hwrev_001 --role aeroponics
```

## Features

- ✅ Native Python GUI (tkinter - no external dependencies)
- ✅ Automatic discovery from HAL directory structure
- ✅ Live terminal output (green text on black)
- ✅ Selection persistence
- ✅ Cross-platform (Windows/Mac/Linux)

## Documentation

See `docs/` directory for detailed documentation.

**New to this project?** Read `AI-INSTRUCT.md` first.

## Directory Structure

```
├── go.py                   # CLI interface
├── go_gui_tkinter.py       # Python GUI (main entry point)
├── scripts/                # Build orchestration
├── config/                 # Configuration (auto-discovery enabled)
├── docs/                   # Documentation
└── AI-INSTRUCT.md          # This project's instruction set
```

## Build System

Platforms and roles are auto-discovered from:
```
K:\PDS_AutomationSuite\Device\pds\pds_hal\platform\
```

Add new platform/hwrev/role by creating directories - no code changes needed!

---

See `AI-INSTRUCT.md` for full technical documentation.
