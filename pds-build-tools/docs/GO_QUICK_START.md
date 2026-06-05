# go.py Quick Start Guide

**TL;DR**: Just run `python go.py` and follow the menus!

---

## Installation

No installation needed! Just:
```bash
cd k:\PDS_AutomationSuite
python go.py
```

---

## Three Ways to Build

### Way 1: Interactive (Recommended) 🎯
```bash
python go.py
```
**Best for**: First-time users, exploring options

**What happens**:
1. Shows welcome message
2. Menu: Pick your platform (ESP32-C3 or Silicon Labs)
3. Menu: Pick your hardware revision (001, 002, etc.)
4. Menu: Pick your device role (aeroponics, greenhouse, generic, etc.)
5. Shows a summary of what's about to build
6. Asks "Ready? y/n"
7. Build starts!

---

### Way 2: Command-Line (Scriptable) ⚡
```bash
python go.py --platform esp32c3 --hwrev 001 --role aeroponics
```
**Best for**: CI/CD, automation, scripts

**Parameters**:
- `--platform` or `-p`: Platform name (esp32c3, silabs)
- `--hwrev` or `-r`: Hardware revision (001, 002, etc.)
- `--role` or `-o`: Device role (aeroponics, greenhouse, etc.)

---

### Way 3: Quick Repeat 🚀
```bash
python go.py --last
```
**Best for**: Rebuilding the same config after making code changes

**What it does**: Uses your last selection automatically

---

## See What's Available

```bash
python go.py --list-platforms
```

Shows:
- All available platforms (ESP32-C3, Silicon Labs)
- Hardware revisions for each
- Available roles (aeroponics, greenhouse, generic, sensor_hub)
- Build system for each (esp-idf, cmake)

**Example output**:
```
esp32c3
  Description: Espressif ESP32-C3 RISC-V microcontroller
  Build System: esp-idf
  Hardware Revisions: 001, 002
  Roles: aeroponics, greenhouse, generic

silabs
  Description: Silicon Labs EFM32GG Gecko microcontroller
  Build System: cmake
  Hardware Revisions: 001
  Roles: generic, sensor_hub
```

---

## Get Help

```bash
python go.py --help
```

Shows all available options and examples.

---

## Examples

### Build ESP32-C3 for Aeroponics
```bash
# Interactive
python go.py
# Select: esp32c3 → 001 → aeroponics

# Or command-line
python go.py -p esp32c3 -r 001 -o aeroponics
```

### Build Silicon Labs for Sensor Hub
```bash
# Interactive
python go.py
# Select: silabs → 001 → sensor_hub

# Or command-line
python go.py -p silabs -r 001 -o sensor_hub
```

### Rebuild Last Config
```bash
python go.py --last
```

### Check Available Options
```bash
python go.py --list-platforms
```

---

## What Happens After You Confirm?

1. **Build configuration summary** is displayed
2. **You answer**: "Proceed with build? (y/n):"
3. **Build system loads**:
   - Role components (which features to include)
   - Hardware configuration
   - Build tools setup
4. **Compilation starts** (esp-idf or cmake)
5. **Binary is created** in the build directory

---

## Color Meanings

- 🟢 **Green** `[+]` = Success
- 🔴 **Red** `[-]` = Error
- 🔵 **Blue** `[*]` = Information
- 🟡 **Yellow** `[!]` = Warning

---

## Troubleshooting

### "Configuration file not found"
**Problem**: Can't find platforms.json or roles.json  
**Solution**: Make sure you're in the right directory:
```bash
cd k:\PDS_AutomationSuite
python PDS-ConfigAndBuildTools\go.py
```

### "Invalid choice. Please select 1-2"
**Problem**: You typed a number outside the valid range  
**Solution**: Type a number from the menu (like 1 or 2)

### "Unknown platform: xyz"
**Problem**: You used --platform with a platform that doesn't exist  
**Solution**: Check `python go.py --list-platforms` for valid names

### "No last selection found"
**Problem**: You used `--last` but haven't built anything yet  
**Solution**: Run `python go.py` first to create a saved selection

### Build fails with idf.py error
**Problem**: "WinError 193: %1 is not a valid Win32 application"  
**Status**: Known Windows subprocess issue (not go.py specific)  
**Workaround**: Use dev container (Docker) instead of direct Windows build

---

## What Gets Built?

Depending on your selections:

### ESP32-C3 Aeroponics
- Full aeroponics control system
- WiFi connectivity (HTTPS + BLE provisioning)
- Sensor monitoring (ADC, temperature, humidity)
- Actuator control (pumps, relays, fans)
- Automatic scheduling and pipelines
- Telemetry broadcasting

### Silicon Labs Sensor Hub
- Generic sensor aggregation
- BLE communication
- Configurable inputs/outputs
- Real-time monitoring

---

## Quick Reference

| What | Command |
|------|---------|
| Build interactively | `python go.py` |
| See options | `python go.py --list-platforms` |
| Build with parameters | `python go.py -p esp32c3 -r 001 -o aeroponics` |
| Rebuild last config | `python go.py --last` |
| Get help | `python go.py --help` |
| Short platform name | `python go.py -p esp32c3` |
| Short hwrev | `python go.py -r 001` |
| Short role | `python go.py -o aeroponics` |

---

## Next Steps After Building

1. **Flash device**: Use your platform-specific flash tool
2. **Monitor output**: Watch serial console for boot messages
3. **Test**: Try sending commands via WiFi or BLE
4. **Debug**: Check logs in .idf/build/logs (if available)

---

**You're ready to build! Try:** `python go.py`
