# DEV-Container Setup Guide

## Overview

The PDS-AutomationSuite uses Docker containers to provide consistent, isolated build environments for different platforms:

- **DEV-Container-ESPIDF**: ESP-IDF v5.4.1 environment for ESP32 devices (esp32c3, esp32_node32s, etc.)
- **DEV-Container-SILABS**: Silicon Labs toolchain for Silabs devices (efr32mg24, etc.)

This document explains how to set up and use these containers.

## Why DEV-Containers?

1. **Consistency**: Same environment across all developers and CI/CD
2. **Isolation**: No conflicts with system Python/toolchains
3. **Reliability**: Pre-built containers with all dependencies
4. **Reproducibility**: Identical builds on different machines
5. **Simplicity**: No manual environment setup needed

## Option 1: VS Code Dev Containers (Easiest)

### Prerequisites
- Visual Studio Code
- Docker Desktop
- VS Code Dev Containers extension

### Setup

1. **Install Dev Containers extension**
   ```
   Search "Dev Containers" in VS Code Extensions marketplace and install
   ```

2. **Open project**
   ```
   File → Open Folder → Select PDS_AutomationSuite
   ```

3. **Reopen in container**
   ```
   Ctrl+Shift+P → "Dev Containers: Reopen in Container"
   ```

4. **Wait for container to start** (2-5 minutes first time)

5. **Build**
   ```bash
   cd PDS-BuildTools
   python go.py
   ```

### Benefits
- Integrated terminal runs inside container automatically
- All tools pre-configured and available
- Simple UI-based management
- Recommended for development

### Workflow

```bash
# Inside VS Code terminal (automatically in container)
cd Device/H2O-DEV-12102025
idf.py build                  # Build ESP32 firmware
idf.py -p /dev/ttyUSB0 flash  # Flash to device (if serial passed through)
idf.py monitor                # Monitor serial output
```

## Option 2: DevContainers CLI (Advanced)

### Prerequisites
- Docker Desktop or Docker daemon running
- Node.js and npm (to install devcontainers CLI)

### Setup

1. **Install devcontainers CLI**
   ```bash
   npm install -g @devcontainers/cli
   ```

2. **Verify installation**
   ```bash
   devcontainer --version
   ```

3. **Use from command line**
   ```bash
   devcontainer exec --workspace-folder Device/DEV-Container-ESPIDF bash -c "cd Device/H2O-DEV-12102025 && idf.py build"
   ```

### When to Use
- Automated builds (GitHub Actions, CI/CD)
- Command-line only environments
- Integration with build scripts
- Running single commands without full IDE

### Example: Building in DevContainer

```bash
# Execute build inside ESP-IDF container
devcontainer exec \
  --workspace-folder Device/DEV-Container-ESPIDF \
  bash -c "cd /workspaces && idf.py build"

# This is equivalent to:
# 1. Start container (if not running)
# 2. Mount host directory to /workspaces
# 3. Run: cd /workspaces && idf.py build
# 4. Return output to terminal
```

## Automatic Selection (Build System)

The build system (`build_selector.py`) automatically detects and offers devcontainer builds:

```bash
cd PDS-BuildTools
python go.py

# Output:
# [*] Starting build for esp32_node32s...
# [*] Found devcontainer at: Device/DEV-Container-ESPIDF
# [*] Found devcontainers CLI
# Build options:
#   1. Build in devcontainer (recommended)
#   2. Build natively
# Choose build method (1 or 2): 
```

### Default Behavior

| Scenario | Action |
|----------|--------|
| devcontainer CLI installed + container exists | Ask user (devcontainer recommended) |
| devcontainer CLI not installed + container exists | Use native build (requires manual setup) |
| Container doesn't exist | Use native build |

## Container Architecture

### ESP-IDF Container

**Location**: `Device/DEV-Container-ESPIDF/`

**Contains**:
- ESP-IDF v5.4.1 (official espressif/idf:v5.4.1 image)
- Python 3.12 with all ESP-IDF dependencies
- ESP32 tools (xtensa-esp32-elf, etc.)
- CMake, ninja, and other build tools
- USB serial support for device flashing

**Mounts**:
- `/workspaces` → Host `Device/H2O-DEV-12102025/`
- Host serial ports passed through for device access

**Available tools**:
- `idf.py` - ESP-IDF build system
- `esptool.py` - Firmware flasher
- `espefuse.py` - eFuse tool
- Standard Unix tools

### Silicon Labs Container

**Location**: `Device/DEV-Container-SILABS/`

**Contains**:
- Silicon Labs Gecko SDK
- ARM GCC toolchain for Cortex-M4
- Build tools (make, cmake, etc.)
- Silicon Labs tools and utilities

**Mounts**:
- `/workspaces` → Host `Device/H2O-DEV-12102025/`
- Host serial ports for device access

## Troubleshooting

### Docker daemon not running

```
Error: Cannot connect to Docker daemon
```

**Solution**:
- On Windows: Start Docker Desktop
- On Mac: Start Docker Desktop
- On Linux: `sudo service docker start`

### Container fails to start

```
Error: Command 'devcontainer' not found
```

**Solution**:
```bash
npm install -g @devcontainers/cli
```

### Port/Serial not accessible in container

For serial port access (flashing), you may need to:

**VS Code**: Automatically handled by Dev Containers extension

**Command line**:
```bash
# On Linux: expose serial device
devcontainer exec \
  --workspace-folder Device/DEV-Container-ESPIDF \
  --mount type=bind,source=/dev/ttyUSB0,target=/dev/ttyUSB0 \
  bash -c "idf.py -p /dev/ttyUSB0 flash"

# On Windows: use COM port directly
devcontainer exec \
  --workspace-folder Device/DEV-Container-ESPIDF \
  bash -c "idf.py -p COM3 flash"
```

### Slow first build

The first build might be slow because:
1. Container is building (2-5 min)
2. ESP-IDF toolchain downloading (1-2 min)
3. First full compilation (5-10 min)

**Subsequent builds are much faster** (< 1 min for incremental builds).

### Container changes not visible

```
Issue: Modified file in host, but container doesn't see changes
```

**Solution**:
- Container has live mount to host directory
- Changes should be visible immediately
- If not, restart container:
  ```bash
  devcontainer rebuild --workspace-folder Device/DEV-Container-ESPIDF
  ```

## File Reference

### Configuration Files

- `Device/DEV-Container-ESPIDF/.devcontainer/devcontainer.json` - Container definition (VS Code)
- `Device/DEV-Container-ESPIDF/.devcontainer/Dockerfile` - Docker image builder
- `Device/DEV-Container-SILABS/.devcontainer/devcontainer.json` - Silicon Labs container
- `Device/DEV-Container-SILABS/.devcontainer/Dockerfile` - Silicon Labs Dockerfile

### Build Integration

- `PDS-BuildTools/scripts/build_selector.py` - Auto-detects and offers container builds
- `PDS-BuildTools/scripts/build_in_devcontainer.py` - Helper for container execution
- `PDS-BuildTools/ESP_IDF_SETUP.md` - Environment setup guide

## Migration from Native Build

If you were building natively and want to switch to containers:

### Before (Native)
```bash
cd Device/H2O-DEV-12102025
idf.py build
```

### After (Container)
```bash
cd PDS-BuildTools
python go.py
# Choose option 1: "Build in devcontainer"
```

### Or use CLI directly
```bash
devcontainer exec \
  --workspace-folder Device/DEV-Container-ESPIDF \
  bash -c "cd /workspaces && idf.py build"
```

## Performance Notes

### Speed Comparison

| Operation | VS Code Container | CLI Container | Native |
|-----------|-------------------|---------------|--------|
| First build | 15-20 min | 15-20 min | Depends on setup |
| Incremental build | 30 sec | 30 sec | 30 sec |
| Container startup | Integrated | ~2 sec | N/A |
| Container rebuild | 5 min | 5 min | N/A |

The slight overhead of container startup is negligible for builds that take 30+ seconds anyway.

### Optimization Tips

1. **Keep containers running** (VS Code does this automatically)
2. **Use incremental builds** (only recompile changed files)
3. **Don't rebuild container** unless dependencies change
4. **Use `idf.py` directly** instead of full clean builds when possible

```bash
# Fast (incremental)
idf.py build

# Slow (full rebuild)
idf.py fullclean
idf.py build
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build Device Firmware

on: [push, pull_request]

jobs:
  build-esp32:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Install DevContainers CLI
        run: npm install -g @devcontainers/cli
      
      - name: Build ESP32 firmware
        run: |
          devcontainer exec \
            --workspace-folder Device/DEV-Container-ESPIDF \
            bash -c "cd Device/H2O-DEV-12102025 && idf.py build"
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: esp32-firmware
          path: Device/H2O-DEV-12102025/build/
```

## Additional Resources

- [VS Code Dev Containers](https://code.visualstudio.com/docs/devcontainers/containers)
- [DevContainers Specification](https://containers.dev/)
- [ESP-IDF Docker Image](https://hub.docker.com/r/espressif/idf)
- [Docker Documentation](https://docs.docker.com/)

## Best Practices

1. **Always use containers for development** if possible
2. **Keep containers updated** (rebuild if ESP-IDF updates)
3. **Don't modify container files** (use host mounts for code)
4. **Use VS Code** for interactive development
5. **Use CLI** for automated/batch builds
6. **Document any custom tool versions** needed

## Summary

| Aspect | VS Code | CLI | Native |
|--------|---------|-----|--------|
| Ease of setup | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| IDE integration | ⭐⭐⭐⭐⭐ | ⭐ | ⭐ |
| Build speed | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Automation | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Reliability | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| Recommended | ✅ | ✅ | ❌ |

**Recommendation**: Use VS Code Dev Containers for development, CLI containers for CI/CD.

