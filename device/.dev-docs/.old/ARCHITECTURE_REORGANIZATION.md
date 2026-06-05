# Architecture Reorganization: Platform-Centric Configuration

**Date**: April 16, 2026  
**Status**: ✅ **Complete**  
**Impact**: Medium (Documentation updates + File reorganization)

---

## Executive Summary

The project architecture was reorganized to be **platform-centric** rather than device-centric. Platform-specific configurations now live in `PDS-HwPlatform/platforms/` instead of scattered across `Device/main/`.

**Key Change**: Partition table moved from `Device/main/partitions.csv` → `PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/memorymap.csv`

**Benefit**: Single source of truth for all platform variants (ESP32-C3, S3, C6, H2) accessible by Pinleaf/Platform Editor tools.

---

## What Changed

### Moved Files

| Old Location | New Location | Purpose |
|--------------|-------------|---------|
| `Device/main/partitions.csv` | `PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/memorymap.csv` | Platform memory map (flash partitions) |

### New Files Created

All created in `PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/`:

| File | Purpose |
|------|---------|
| `platform_spec.json` | Master platform definition (target, flash size, hardware revision) |
| `default_pinmap.json` | Default hardware pin mapping template |
| `default_ladder.st` | Default automation logic template (IEC 61131-3) |
| `default_usrset.json` | Default user settings template |
| `README.md` | Platform integration guide and requirements |

### Updated Documentation

| File | Changes |
|------|---------|
| `Device/docs/README.md` | Added platform-centric architecture update notice |
| `Device/docs/DEVICE_IMPLEMENTATION_GUIDE.md` | Step 1 now references platform directory; added backward compatibility note |
| `Device/docs/DEVICE_STORAGE_ALLOCATION.md` | References memorymap.csv in platform directory instead of Device/main/ |
| `Device/docs/CONFIG_UPLOAD_TESTING.md` | Step 1.1 now copies from platform directory before building |

---

## Architecture Before vs After

### Before (Device-Centric)
```
Device/
├── main/
│   ├── main.c
│   ├── CMakeLists.txt
│   └── partitions.csv    ← Device responsible for partition layout
├── pds/
│   ├── pds_storage/
│   ├── pds_network/
│   └── pds_hal/
└── docs/

PDS-HwPlatform/
├── platforms/
│   └── (nothing here)
└── docs/
```

### After (Platform-Centric) ✅
```
Device/
├── main/
│   ├── main.c           (Generic, no platform-specific config)
│   ├── CMakeLists.txt
│   └── partitions.csv   (Copy from platform dir before building)
├── pds/
│   ├── pds_storage/     (Generic config handlers)
│   ├── pds_network/     (Generic network handlers)
│   └── pds_hal/         (Platform drivers)
└── docs/
    ├── README.md        (With architecture notice)
    ├── DEVICE_IMPLEMENTATION_GUIDE.md (Updated)
    └── ...

PDS-HwPlatform/
├── platforms/
│   └── esp32c3/
│       └── hwrev_001/
│           └── aeroponics_core/
│               ├── platform_spec.json     ← Master definition
│               ├── memorymap.csv          ← Single source of truth
│               ├── default_pinmap.json
│               ├── default_ladder.st
│               ├── default_usrset.json
│               └── README.md              ← Integration guide
└── docs/
```

---

## Integration Timeline

### Phase 3 (Current) - Manual Copy
```bash
# Build process:
1. Developer copies memorymap.csv to Device/main/partitions.csv
2. Runs: idf.py build
3. ESP-IDF reads Device/main/partitions.csv
```

**Workflow**:
```bash
cp PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/memorymap.csv \
   Device/main/partitions.csv
idf.py build
idf.py -p COM3 flash
```

### Phase 4+ (Future) - Automatic Platform Resolution
```bash
# Build will be:
1. Developer specifies: idf.py build --platform-spec PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/
2. Build system reads memorymap.csv directly from platform dir
3. No need to copy file manually
```

**Future Workflow**:
```bash
idf.py build --platform-spec PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/
idf.py -p COM3 flash
```

---

## Multiple Platform Support

The new structure naturally supports multiple hardware variants:

```
PDS-HwPlatform/platforms/
├── esp32c3/
│   └── hwrev_001/
│       ├── aeroponics_core/
│       │   ├── memorymap.csv
│       │   ├── platform_spec.json
│       │   └── ...
│       └── plant_lab/
│           ├── memorymap.csv
│           ├── platform_spec.json
│           └── ...
├── esp32s3/
│   └── hwrev_001/
│       ├── aeroponics_core/
│       │   ├── memorymap.csv  (4/8/16 MB partition options)
│       │   └── ...
│       └── ...
├── esp32c6/
│   └── ...
└── esp32h2/
    └── ...
```

**Pinleaf can now**:
- List all available platform variants
- Create new variants (specify ESP32 model, flash size, hardware revision, role)
- Edit platform-specific configs (partition tables, pin mappings, defaults)
- Export complete platform package as ZIP
- Download to device via Web UI

---

## Device Code Remains Generic

The Device code does not change:

- **pds_config_store.c** - Generic NVS handler (works with any partition layout)
- **pds_https_config_handler.c** - Generic HTTPS handler (works with any config)
- **main.c** - Configurable via environment variables and sdkconfig
- **pds_hal/** - Platform drivers (ESP32-C3 specific code isolated here)

The firmware works the same way on all platforms because:
1. Partition sizes vary (2MB, 4MB, 8MB) but storage handlers are generic
2. Pin assignments come from NVS (uploaded by user) not compiled in
3. Automation logic loaded from NVS at runtime

---

## Backward Compatibility

For teams still using Phase 3:

1. Platform directory has `README.md` with copy instructions
2. `Device/main/partitions.csv` still works if manually copied
3. Existing build procedures unchanged
4. No breaking changes to Device code

**Migration Path**:
- Phase 3 (now): Manual copy of `memorymap.csv` → `partitions.csv`
- Phase 3.5 (future): Add copy step to build script: `cp PDS-HwPlatform/... Device/main/partitions.csv && idf.py build`
- Phase 4 (future): Update idf.py wrapper to use `--platform-spec` parameter

---

## What Developers Need to Know

### Building the Device
```bash
# Phase 3 (now):
cp PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/memorymap.csv Device/main/partitions.csv
idf.py build
idf.py -p COM3 flash

# Phase 4+ (future):
idf.py build --platform-spec PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/
idf.py -p COM3 flash
```

### Finding Platform-Specific Settings
All platform-specific configs are in:
```
PDS-HwPlatform/platforms/[variant]/[hwrev]/[role]/
```

For ESP32-C3 aeroponics:
```
PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/
```

### Documentation
- See `Device/docs/DEVICE_IMPLEMENTATION_GUIDE.md` Step 1 for build instructions
- See `PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/README.md` for platform integration
- See `Device/docs/README.md` for complete documentation index

---

## Verification Checklist

- [x] Moved `Device/main/partitions.csv` to platform directory as `memorymap.csv`
- [x] Created `platform_spec.json` with platform metadata
- [x] Created default config templates (pinmap, ladder, usrset)
- [x] Created platform directory `README.md` with integration guide
- [x] Updated `Device/docs/README.md` with architecture notice
- [x] Updated `DEVICE_IMPLEMENTATION_GUIDE.md` to reference platform directory
- [x] Updated `DEVICE_STORAGE_ALLOCATION.md` to reference platform directory
- [x] Updated `CONFIG_UPLOAD_TESTING.md` to reference platform directory
- [x] Verified backward compatibility (Phase 3 still works)
- [x] Documented future Phase 4 workflow

---

## Q&A

**Q: Will my existing build process still work?**  
A: Yes. Just copy `memorymap.csv` to `Device/main/partitions.csv` before building. See `DEVICE_IMPLEMENTATION_GUIDE.md` Step 1.

**Q: What if I have multiple hardware revisions?**  
A: Create separate directories under `PDS-HwPlatform/platforms/esp32c3/`:
- `hwrev_001/aeroponics_core/`
- `hwrev_002/aeroponics_core/`
- etc.

**Q: Can I edit the partition table?**  
A: Yes. Edit `memorymap.csv` in the platform directory. Use Pinleaf/Platform Editor for visual editing (coming in Phase 4).

**Q: Do I need to rebuild the device firmware to change partitions?**  
A: Only if the partition sizes change. Otherwise, just upload new configs via HMI.

**Q: What about adding a new platform (e.g., ESP32-S3)?**  
A: Create new directory structure:
```
PDS-HwPlatform/platforms/esp32s3/hwrev_001/aeroponics_core/
```
Copy and adapt:
- `memorymap.csv` (S3 has 4/8/16 MB variants)
- `platform_spec.json` (update target, flash_size_mb)
- Default config templates

---

## Next Steps

1. **For Firmware Developers**: Use updated build procedure in `DEVICE_IMPLEMENTATION_GUIDE.md` Step 1
2. **For Pinleaf Developers**: Implement support for managing platform directories (see `PDS-HwPlatform/platforms/*/README.md`)
3. **For HMI Developers**: No changes needed (configs still come from device via HTTPS)
4. **For QA/Testing**: Follow updated `CONFIG_UPLOAD_TESTING.md` procedures

---

## References

- Architecture overview: [Device/docs/GENERIC_COREBINARY_ARCHITECTURE.md](GENERIC_COREBINARY_ARCHITECTURE.md)
- Build integration: [Device/docs/DEVICE_IMPLEMENTATION_GUIDE.md](DEVICE_IMPLEMENTATION_GUIDE.md)
- Platform structure: [PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/README.md](../../../../PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/README.md)
- Storage design: [Device/docs/DEVICE_STORAGE_ALLOCATION.md](DEVICE_STORAGE_ALLOCATION.md)
