# Silicon Labs Development Container

## Quick Start

1. **Open this folder in VS Code**
   ```
   code K:\PDS_AutomationSuite\Device\DEV-Container-SILABS
   ```

2. **Click "Reopen in Container"** when prompted

3. **Wait for container to build** (~2 minutes first time)

4. **You're ready to develop!**

---

## How to Build

### From VS Code Terminal
```bash
cd /build/main
make
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
cd /build/main && make clean && make

# Build verbose output
cd /build/main && make V=1

# View build target
cd /build/main && make help
```

---

## Troubleshooting

**Container won't start?**
- `Ctrl+Shift+P` → "Remote-Containers: Rebuild Container"

**Can't find source files?**
- Check `/src/main` and `/src/pds` exist in container
- If not, mount paths need adjustment (see [../AI-INSTRUCT.md](../AI-INSTRUCT.md))

**Build fails with "Makefile not found"?**
- Make sure Makefile exists in `/src/main`
- Check that source copy happened: `ls -la /build/main`

**Mounts look wrong?**
- Run: `mount | grep /src`
- Should show read-only mounts from K: drive

---

**See also**: [../AI-INSTRUCT.md](../AI-INSTRUCT.md) for technical details

1. Open this directory in VS Code: `code .`
2. Click "Reopen in Container" when prompted
3. Wait for container to build (~10-15 minutes first time)
4. Silicon Labs tools will be available in the terminal

### Include Paths

The container is configured to include source code from the project directories:

```
Container includes:
  - /workspaces/silabs/       → Device/pds/silabs/ (when created)
  - /workspaces/common/       → Device/pds/common/ (shared code)
  - Simplicity Studio SDKs in /opt/silabs/
```

### VS Code Extensions

Automatically installed in container:
- `ms-vscode.cpptools` - C/C++ IntelliSense
- `llvm-vs-code-extensions.vscode-clangd` - Clangd language server
- `ms-vscode.makefile-tools` - Makefile support
- `ms-vscode-remote.remote-containers` - Container support

## Building

```bash
# Build the project (varies by Silicon Labs project type)
make

# Or for Gecko SDK projects:
cmake --build build

# Flash to device
make flash
```

## Port Mapping

When connecting JTAG/serial devices:

```bash
# Linux/Mac: Devices appear as /dev/ttyUSB* or /dev/cu.usbserial*
# Container access requires device mapping in docker-compose or devcontainer.json
```

## Environment Variables

Configured in `.devcontainer/devcontainer.json`:
- `SILABS_SDK_PATH` = /opt/silabs/gecko_sdk
- `SILABS_TOOLS_PATH` = /opt/silabs/tools

## Troubleshooting

**Container won't start?**
```bash
# Rebuild container
docker build --no-cache -t silabs-dev .
```

**VS Code can't find includes?**
- Press Ctrl+K Ctrl+0 to reload IntelliSense
- Check `.clangd` configuration
- Verify path aliases in `devcontainer.json`

**Compilation fails?**
- Verify Silicon Labs SDK installed correctly
- Check environment variables: `env | grep SILABS`
- Review build output for missing components

## Development Workflow

1. Edit code in VS Code (outside or inside container)
2. Build in terminal: `make` or `cmake --build build`
3. Flash to device: `make flash` or tools provided
4. Monitor output: Device-specific commands
5. Debugging: Use VS Code debugger configuration

## More Information

- [Silicon Labs Dev Tools](https://www.silabs.com/developers/simplicity-studio)
- [Gecko SDK Documentation](https://docs.silabs.com/gecko-platform/latest/)
- [Dev Containers Documentation](https://containers.dev/)
- [VS Code Remote Development](https://code.visualstudio.com/docs/remote/remote-overview)
