# ESP32-C3 Development Container - Technical Guide

## Contents

| § | What's here |
|---|-------------|
| [Purpose](#purpose) | What this container does |
| [For End Users](#for-end-users) | How to open and use the container |
| [For AI Agents / Build System](#for-ai-agents--build-system) | How build scripts invoke the container |
| [Related](#related) | Related files and documentation |
| [For Build Systems (PDS-BuildTools)](#for-build-systems-pds-buildtools) | Build invocation from PDS-BuildTools |
| [Verification](#verification) | How to verify the container works |
| [File Edits - The Rules](#file-edits---the-rules) | What files can/cannot be edited in-container |
| [When to Rebuild Container](#when-to-rebuild-container) | When a container rebuild is required |

## Purpose

This container builds ESP32-C3 firmware using ESP-IDF v5.4.1.

## For End Users

**Start here instead**: See [README.md](README.md) for simple setup instructions.

---

## For AI Agents / Build System

### What This Container Does

1. **Builds firmware**: ESP-IDF v5.4.1 targeting ESP32-C3
2. **Mounts source read-only**: `/src/main` and `/src/pds` (from Windows host)
3. **Compiles in container**: `/build/main` (container-local, not synced back)
4. **Outputs binaries**: `/build/main/build/` (stays in container)

### Build Flow

```bash
# 1. Start container
devcontainer up --workspace-folder K:\PDS_AutomationSuite\Device\DEV-Container-esp32c3_sm

# 2. Copy source to writable location
devcontainer exec ... bash -c "mkdir -p /build && cp -r /src/* /build/"

# 3. Build
devcontainer exec ... bash -c "cd /build/main && idf.py build"

# 4. Output stays in container at /build/main/build/
```

### Mount Configuration

**Read-Only Source** (host):
```
K:\PDS_AutomationSuite\Device\main    →  /src/main (readonly)
K:\PDS_AutomationSuite\Device\pds     →  /src/pds (readonly)
```

**Writable Build** (container-local):
```
Container /build/main/     (copy of source, writable)
Container /build/pds/      (copy of source, writable)
Container /build/main/build/     (compiler output, stays in container)
```

### Files in This Directory

| File | Purpose |
|------|---------|
| `.devcontainer/devcontainer.json` | VS Code configuration, mounts, environment |
| `.devcontainer/Dockerfile` | Container image definition (ESP-IDF v5.4.1) |
| `.vscode/` | IDE settings, debugging, extensions |
| `README.md` | Human-readable setup guide |
| `AI-INSTRUCT.md` | This file (for AI agents) |

### Technical Details

**Base Image**: `espressif/idf:v5.4.1`

**Toolchain**: Xtensa (`xtensa-esp32c3-elf-gcc`) — RISC-V single core

**Build Tools Included**:
- ESP-IDF v5.4.1 (pre-installed)
- Python 3.12 with required packages
- GCC toolchain for Xtensa architecture
- CMake and Ninja

**Environment**:
- `IDF_PATH`: `/opt/esp/idf`
- `IDF_PYTHON_ENV_PATH`: `/opt/esp/python_env/idf5.4_py3.12_env`
- Entrypoint: `/opt/esp/entrypoint.sh` (sets up ESP-IDF environment)

### Integration with build_selector.py

The [../../PDS-BuildTools/scripts/build_selector.py](../../PDS-BuildTools/scripts/build_selector.py) script:
1. Derives container path as `DEV-Container-esp32c3_sm` (matches platform dir name exactly)
2. Starts this container via `devcontainer exec`
3. Copies source from `/src/` to `/build/`
4. Runs `IDF_TARGET=esp32c3 idf.py -DPDS_HWREV=<hwrev> -DPDS_ROLE=<role> build` in `/build/main/`

---

## Related

- **Parent Architecture**: [../AI-INSTRUCT.md](../AI-INSTRUCT.md)
- **User Guide**: [README.md](README.md)
- **Build System**: [../../PDS-BuildTools/](../../PDS-BuildTools/)
- **Silabs Container**: [../DEV-Container-SILABS/AI-INSTRUCT.md](../DEV-Container-SILABS/AI-INSTRUCT.md)

**Last Updated**: February 2, 2026


## For Build Systems (PDS-BuildTools)

**File**: `PDS-BuildTools/scripts/build_selector.py`

When building via devcontainer:

```python
# Construct the build command
build_cmd = "cd /build && idf.py build"

# Run inside the container
cmd = f'devcontainer exec --workspace-folder "{container_path}" bash -c "{build_cmd}"'
subprocess.run(cmd, shell=True)
```

**Do NOT**:
- ❌ Try to cd to `/workspaces/Device/` — code is mounted at `/src/`
- ❌ Modify the mount path without updating both containers
- ❌ Assume `/workspaces` contains the code

## Verification

From container terminal:

```bash
$ ls /src/main
CMakeLists.txt  main.c  sdkconfig  ...  ✓ Correct

$ ls /src/pds
pds_hal/  pds_net/  ...  ✓ Correct
```

## File Edits - The Rules

### devcontainer.json
**Only edit if**:
- Changing ESP-IDF version
- Adding VS Code extensions
- Adding mounts (update SILABS copy too!)

**Never change**:
- Mount targets (`/src/main`, `/src/pds`)
- `${localWorkspaceFolder}/../main` and `../pds` sources

### Dockerfile
**Only edit if**:
- Adding additional build tools
- Updating base image

### .vscode/ files
**Edit freely** - IDE configuration, doesn't affect container

## When to Rebuild Container

```bash
Ctrl+Shift+P → "Remote-Containers: Rebuild Container"
```

Use when:
- Updated Dockerfile
- Changed devcontainer.json mounts
- Docker image corrupted

Source code is **never** inside container, so rebuild is safe and fast.

## Related

- **Parent Architecture**: [../AI-INSTRUCT.md](../AI-INSTRUCT.md)
- **Silabs Container**: [../DEV-Container-SILABS/AI-INSTRUCT.md](../DEV-Container-SILABS/AI-INSTRUCT.md)
- **Build System**: [../../PDS-BuildTools/scripts/build_selector.py](../../PDS-BuildTools/scripts/build_selector.py)
- **Actual Code**: [../main/](../main/) and [../pds/](../pds/)

---

**Purpose**: Docker-based ESP-IDF v5.4.1 development  
**Base Image**: espressif/idf:v5.4.1  
**Mount Rule**: `../main` → `/src/main`, `../pds` → `/src/pds`  
**Last Updated**: April 17, 2026