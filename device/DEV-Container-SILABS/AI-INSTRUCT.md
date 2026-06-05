# Silicon Labs Development Container - Technical Guide

## Contents

| § | What's here |
|---|-------------|
| [Purpose](#purpose) | What this container does |
| [For End Users](#for-end-users) | How to open and use the container |
| [For AI Agents / Build System](#for-ai-agents--build-system) | How build scripts invoke the container |
| [Related](#related) | Related files and documentation |
| [Toolchain](#toolchain) | Silicon Labs toolchain details |
| [Integration with build_selector.py](#integration-with-build_selectorpy) | How PDS-BuildTools invokes this container |
| [Verification](#verification) | How to verify the container works |
| [Troubleshooting](#troubleshooting) | Common issues and fixes |

## Purpose

This container builds Silicon Labs firmware using Make-based build system.

## For End Users

**Start here instead**: See [README.md](README.md) for simple setup instructions.

---

## For AI Agents / Build System

### What This Container Does

1. **Builds firmware**: Silicon Labs (Make-based) build system
2. **Mounts source read-only**: `/src/main` and `/src/pds` (from Windows host)
3. **Compiles in container**: `/build/main` (container-local, not synced back)
4. **Outputs binaries**: `/build/main/` (stays in container)

### Build Flow

```bash
# 1. Start container
devcontainer up --workspace-folder K:\PDS_AutomationSuite\Device\DEV-Container-SILABS

# 2. Copy source to writable location
devcontainer exec ... bash -c "mkdir -p /build && cp -r /src/* /build/"

# 3. Build
devcontainer exec ... bash -c "cd /build/main && make"

# 4. Output stays in container at /build/main/
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
Container /build/main/     (compiler output, stays in container)
```

### Files in This Directory

| File | Purpose |
|------|---------|
| `.devcontainer/devcontainer.json` | VS Code configuration, mounts, environment |
| `.devcontainer/Dockerfile` | Container image definition (Ubuntu 22.04 + build tools) |
| `.vscode/` | IDE settings, debugging, extensions |
| `README.md` | Human-readable setup guide |
| `AI-INSTRUCT.md` | This file (for AI agents) |

### Technical Details

**Base Image**: `ubuntu:22.04`

**Build Tools Included**:
- build-essential (gcc, make, etc.)
- CMake 3.22.1
- Ninja 1.10.1
- Python 3.10
- Git

**Environment**:
- `SILABS_SDK_PATH`: `/opt/silabs/gecko_sdk` (for future Silicon Labs SDKs)
- `SILABS_TOOLS_PATH`: `/opt/silabs/tools`
- Shell: `/bin/bash`

### Integration with build_selector.py

The [../../PDS-BuildTools/scripts/build_selector.py](../../PDS-BuildTools/scripts/build_selector.py) script:
1. Detects Silicon Labs platform
2. Starts this container
3. Copies source from `/src/` to `/build/`
4. Runs `make` in `/build/main/`

---

## Related

- **Parent Architecture**: [../AI-INSTRUCT.md](../AI-INSTRUCT.md)
- **User Guide**: [README.md](README.md)
- **Build System**: [../../PDS-BuildTools/](../../PDS-BuildTools/)
- **ESP-IDF Container**: [../DEV-Container-ESPIDF/AI-INSTRUCT.md](../DEV-Container-ESPIDF/AI-INSTRUCT.md)

**Last Updated**: February 2, 2026

   ```bash
   mkdir -p /build && cp -r /src/main /build/ && cp -r /src/pds /build/
   ```
4. **Execute build**:
   ```bash
   devcontainer exec ... bash -c 'cd /build/main && make'
   ```
5. **Build output** stays in container at `/build/main/`

## Toolchain

This container uses the Silicon Labs build system (typically CMake or make). Ensure:

- **Makefile** or **CMakeLists.txt** exists in `/src/main/`
- **Toolchain files** are installed in container or referenced from build system
- **Build output directory**: `/build/main/` (container-local)

## Integration with build_selector.py

The build selector automatically:

1. Detects platform type (ESP32 vs Silabs) from project structure
2. Routes to appropriate container (DEV-Container-ESPIDF vs DEV-Container-SILABS)
3. Removes old containers: `docker ps -a -q | xargs docker rm -f`
4. Starts fresh container with current mounts
5. Copies source from `/src/` to `/build/`
6. Executes: `devcontainer exec ... bash -c 'cd /build/main && make'`

### Key Differences from ESP-IDF

| Aspect | ESP-IDF | Silabs |
|--------|---------|--------|
| **Build Command** | `idf.py build` | `make` |
| **Environment Setup** | `/opt/esp/entrypoint.sh` | Direct shell |
| **Config File** | `sdkconfig` | (Silabs specific) |
| **Output Dir** | `/build/main/build/` | `/build/main/` |

## Verification

Check that mounts are correct:

```bash
devcontainer up --workspace-folder K:\PDS_AutomationSuite\Device\DEV-Container-SILABS
devcontainer exec --workspace-folder K:\PDS_AutomationSuite\Device\DEV-Container-SILABS bash -c "ls -la /src/main && ls -la /build"
```

Expected:

```
/src/main     ← read-only source
/build        ← empty initially, populated on first build
```

## Troubleshooting

**Build artifacts syncing back to host**
- This is by design—only source syncs, not build output
- To extract binaries: `devcontainer exec ... bash -c 'cat /build/main/output.bin' > output.bin`

**Source changes not appearing in build**
- Source is mounted read-only, which is correct
- Changes on host automatically appear in `/src/` in container
- They get copied to `/build/` on next build

**Container using old source**
- `docker system prune -a -f --volumes` clears all containers
- `build_selector.py` automatically removes old containers before building

**Make command not found**
- Ensure `build-essential` or `make` is installed in Dockerfile
- Or update base image to one with build tools pre-installed

---

**Last Updated**: February 2, 2026  
**Status**: ✅ Synchronized with ESP-IDF container architecture
**Scope**: Silicon Labs container mount and build system documentation
**See Also**: [../AI-INSTRUCT.md](../AI-INSTRUCT.md) for parent architecture