# ESP32-C3 Development Container

## Quick Start

1. **Open this folder in VS Code**
   ```
   code K:\PDS_AutomationSuite\Device\DEV-Container-ESPIDF
   ```

2. **Click "Reopen in Container"** when prompted

3. **Wait for container to build** (~2 minutes first time)

4. **You're ready to develop!**

---

## How to Build

### From VS Code Terminal
```bash
cd /build/main
idf.py build
```

### Or use the build script
```bash
python ../../PDS-BuildTools/scripts/build_selector.py
```

---

## How to Edit Source

**Edit files on your Windows machine** in:
- `K:\PDS_AutomationSuite\Device\main\` - Main application
- `K:\PDS_AutomationSuite\Device\pds\` - Hardware abstraction layer

Changes appear instantly in the container. On next build, they're compiled.

---

## What Happens Behind the Scenes

- **Your source code** is mounted read-only from Windows at `/src/main` and `/src/pds`
- **Build process** copies source to container-local `/build/` (writable)
- **All compiler output** stays in container (binaries, object files, etc.)
- **Nothing syncs back** to Windows — only your edits matter

This keeps your Windows machine clean and builds fast.

---

## Useful Commands

```bash
# Clean rebuild
cd /build/main && idf.py fullclean && idf.py build

# Set menuconfig
cd /build/main && idf.py menuconfig

# Flash to device (if ESP32 connected)
cd /build/main && idf.py -p /dev/ttyUSB0 flash monitor

# Just monitor (see device output)
cd /build/main && idf.py -p /dev/ttyUSB0 monitor
```

---

## Troubleshooting

**Container won't start?**
- `Ctrl+Shift+P` → "Remote-Containers: Rebuild Container"

**Can't find source files?**
- Check `/src/main` and `/src/pds` exist in container
- If not, mount paths need adjustment (see [../AI-INSTRUCT.md](../AI-INSTRUCT.md))

**Build fails with "file not found"?**
- Make sure you edited source on Windows, not in container
- Run clean build: `idf.py fullclean && idf.py build`

**Mounts look wrong?**
- Run: `mount | grep /src`
- Should show read-only mounts from K: drive

---

**See also**: [../AI-INSTRUCT.md](../AI-INSTRUCT.md) for technical details

- `ms-vscode.cpptools` - C/C++ IntelliSense
- `llvm-vs-code-extensions.vscode-clangd` - Clangd language server

## Building

```bash
# Build the project
idf.py build

# Flash to device
idf.py -p /dev/ttyUSB0 flash monitor

# Clean build
idf.py fullclean
```

## Port Mapping

When connecting USB devices:

```bash
# Linux/Mac: Devices appear as /dev/ttyUSB*
# Windows: Use COM port if host-mounted, or:
docker run --device /dev/ttyUSB0:/dev/ttyUSB0
```

## Environment Variables

Configured in `.devcontainer/devcontainer.json`:
- `IDF_PATH` = /opt/esp/idf
- `IDF_TOOLS_PATH` = /opt/esp/tools
- `IDF_PYTHON_ENV_PATH` = /opt/esp/python_env

## Troubleshooting

**Container won't start?**
```bash
# Rebuild container
docker build --no-cache -t esp-idf-dev .
```

**VS Code can't find includes?**
- Press Ctrl+K Ctrl+0 to reload IntelliSense
- Check `.clangd` configuration
- Verify path aliases in `devcontainer.json`

**Port not found?**
- Check: `ls /dev/tty*` (Linux)
- Try different port or add `--device` flag

## Development Workflow

1. Edit code in VS Code (outside or inside container)
2. Build in terminal: `idf.py build`
3. Flash to device: `idf.py flash`
4. Monitor output: `idf.py monitor`
5. Debugging: Use VS Code debugger configuration

## More Information

- [ESP-IDF Documentation](https://docs.espressif.com/projects/esp-idf/en/latest/)
- [Dev Containers Documentation](https://containers.dev/)
- [VS Code Remote Development](https://code.visualstudio.com/docs/remote/remote-overview)
