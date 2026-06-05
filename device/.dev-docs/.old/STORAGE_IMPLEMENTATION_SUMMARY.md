# Storage & Configuration Implementation Summary

**Date**: April 16, 2026  
**Status**: 🟢 **ARCHITECTURE & ALLOCATION COMPLETE** - Ready for implementation

---

## What's Done

### ✅ Phase 1: Architecture Definition
- [GENERIC_COREBINARY_ARCHITECTURE.md](GENERIC_COREBINARY_ARCHITECTURE.md) - Complete system design
- Three-packet model formalized: PINMAP, LADDER, USRSET
- C structs in [Device/pds/pds_network/include/pds_telemetry_types.h](Device/pds/pds_network/include/pds_telemetry_types.h)
- TypeScript types in [HMI-WEB/src/types/pds_runtime_config.ts](HMI-WEB/src/types/pds_runtime_config.ts)

### ✅ Phase 2: Storage Allocation
- [DEVICE_STORAGE_ALLOCATION.md](DEVICE_STORAGE_ALLOCATION.md) - Complete storage strategy
- Custom partition table designed (partitions.csv template provided)
- NVS namespace strategy defined
- Safe usage: 11 KB actual / 20 KB available NVS
- Troubleshooting guide included

### ✅ Phase 3: Handler Interface
- [Device/pds/pds_storage/include/pds_config_store.h](Device/pds/pds_storage/include/pds_config_store.h) - Complete API
- Save/load functions for each config type
- CRC32 validation for integrity
- Statistics and diagnostics tools
- Factory reset capabilities

---

## Configuration Size Summary

| Component | Min | Max | Fits? |
|-----------|-----|-----|-------|
| PINMAP | 8 B | 4,104 B | ✅ Yes |
| LADDER | 16 B | 4,112 B | ✅ Yes |
| USRSET | 8 B | 2,312 B | ✅ Yes |
| **Total** | 32 B | 10,528 B | ✅ Comfortably (NVS = 20 KB) |

---

## Implementation Road Map

### Phase 4: Device Runtime Engine (IN PROGRESS)

**File**: `Device/pds/pds_storage/pds_config_store.c`

Tasks:
1. [ ] Implement `pds_config_store_init()` - Initialize NVS
2. [ ] Implement `pds_config_save_pinmap()` - Store + CRC
3. [ ] Implement `pds_config_load_pinmap()` - Load + validate
4. [ ] Implement `pds_config_save_ladder()` - Store + CRC
5. [ ] Implement `pds_config_load_ladder()` - Load + validate
6. [ ] Implement `pds_config_save_usrset()` - Store + CRC
7. [ ] Implement `pds_config_load_usrset()` - Load + validate
8. [ ] Implement debug helpers (stats, erase, format)
9. [ ] CRC32 computation function

**Estimated**: 200-300 lines of C code

---

### Phase 5: HTTPS Handler Integration (IN PROGRESS)

**File**: `Device/pds/pds_network/pds_https_server.c`

Tasks:
1. [ ] Detect PINMAP packets by size/version
2. [ ] Route to `pds_config_save_pinmap()`
3. [ ] Validate and return HTTP 200 or 400
4. [ ] Detect LADDER packets
5. [ ] Route to `pds_config_save_ladder()`
6. [ ] Detect USRSET packets
7. [ ] Route to `pds_config_save_usrset()`
8. [ ] Add error logging for failed uploads

---

### Phase 6: Device Initialization (IN PROGRESS)

**File**: `Device/main/main.c`

Tasks:
1. [ ] Call `nvs_flash_init()` early
2. [ ] Call `pds_config_store_init()` on startup
3. [ ] Load PINMAP: Check if available, log if missing
4. [ ] Load LADDER: Check if available, log if missing
5. [ ] Load USRSET: Check if available, log if missing
6. [ ] Initialize runtime engine with loaded configs

---

### Phase 7: Supporting Components (NOT STARTED)

#### Bytecode Executor
**Purpose**: Execute IL bytecode from Ladder at runtime

**Approach**: 
- Iterate bytecode instructions per main loop cycle
- Evaluate IF conditions against variable values
- Execute THEN actions

**File**: `Device/pds/pds_control/pds_bytecode_executor.c`

#### Variable Engine
**Purpose**: Map physical pins to variable names from PINMAP

**Approach**:
- Create hash table: var_name → pin_number, scale, offset
- On telemetry collection: apply scale/offset per variable
- On ladder evaluation: lookup variable by name

**File**: `Device/pds/pds_control/pds_variable_engine.c`

#### Settings Handler
**Purpose**: Apply user settings from USRSET to runtime

**Approach**:
- Load USRSET from NVS on startup
- Store settings in memory hash table
- When bytecode evaluates a variable, use USRSET value

**File**: `Device/pds/pds_control/pds_settings_handler.c`

---

### Phase 8: HMI Integration (NOT STARTED)

#### Pinleaf JSON → Binary Converter
**Purpose**: Convert Pinleaf Forge platform JSON to PINMAP binary

**Location**: `HMI-WEB/src/converters/pinleaf_to_pinmap.ts`

**Input**: Pinleaf JSON export
```json
{
  "platform": "esp32c3",
  "pins": [
    {"number": 3, "function": "ADC", "label": "Moisture", "units": "%"}
  ]
}
```

**Output**: `pds_telconf_pinmap_t` binary buffer

#### Ladder Compiler Integration
**Purpose**: Compile Ladder Logic Editor .st to IL bytecode

**Location**: `LadderLogicEditor/src/compiler/ladder_to_il.ts`

**Input**: .st file or ladder diagram
**Output**: `pds_telconf_ladder_t` binary buffer

#### HMI Upload UI
**Purpose**: Send configs to device via HTTPS POST

**Components**:
- Upload button (File → Select PINMAP/LADDER binary)
- Settings sliders → Generate USRSET packet
- Status indicator (uploading, success, error)

**Location**: `HMI-WEB/src/components/ConfigUploader.tsx`

---

## Files & Documentation

| File | Purpose | Status |
|------|---------|--------|
| [GENERIC_COREBINARY_ARCHITECTURE.md](GENERIC_COREBINARY_ARCHITECTURE.md) | System design | ✅ Complete |
| [DEVICE_STORAGE_ALLOCATION.md](DEVICE_STORAGE_ALLOCATION.md) | Storage strategy | ✅ Complete |
| [Device/pds/pds_telemetry_types.h](Device/pds/pds_network/include/pds_telemetry_types.h) | C structs | ✅ Implemented |
| [HMI-WEB/src/types/pds_runtime_config.ts](HMI-WEB/src/types/pds_runtime_config.ts) | TypeScript types | ✅ Implemented |
| [Device/pds/pds_storage/include/pds_config_store.h](Device/pds/pds_storage/include/pds_config_store.h) | NVS API | ✅ Defined |
| Device/pds/pds_storage/pds_config_store.c | NVS implementation | ⏳ To do |
| Device/main/partitions.csv | Partition table | Template ready |
| Device/pds/pds_control/pds_bytecode_executor.c | IL runtime | ⏳ To do |
| Device/pds/pds_control/pds_variable_engine.c | Variable mapping | ⏳ To do |
| Device/pds/pds_control/pds_settings_handler.c | Settings apply | ⏳ To do |
| HMI-WEB/src/converters/pinleaf_to_pinmap.ts | Pinleaf converter | ⏳ To do |
| HMI-WEB/src/converters/ladder_to_il.ts | Ladder compiler | ⏳ To do |
| HMI-WEB/src/components/ConfigUploader.tsx | Upload UI | ⏳ To do |

---

## Key Decisions Made

1. **Generic CoreBinary**: Same binary every setup ✅
2. **NVS Storage**: All configs in built-in NVS ✅
3. **Custom Partitions**: Explicit 20 KB NVS allocation ✅
4. **CRC32 Validation**: All configs checksummed ✅
5. **Separate Keys**: PINMAP, LADDER, USRSET are separate NVS entries ✅
6. **Three Packets**: REST API distinguishes by packet size/structure ✅

---

## Next Actions

**Immediate** (for next session):
1. Implement `pds_config_store.c` (NVS handlers)
2. Create `partitions.csv` with 20 KB NVS
3. Integrate NVS init into main.c
4. Test save/load with mock data

**Short term**:
1. Implement bytecode executor
2. Implement variable engine
3. Integrate with HTTPS POST /config
4. Test on actual device

**Medium term**:
1. Ladder compiler integration
2. Pinleaf converter
3. HMI upload UI
4. End-to-end testing

---

## Questions Answered

**Q: Will all three configs fit on the device?**  
A: Yes. Total: 11 KB actual / 20 KB NVS available. Safe.

**Q: What if the device reboots?**  
A: Configs are persistent in NVS. Device loads them on startup.

**Q: Can user adjust settings without re-uploading?**  
A: Yes! USRSET is separate and updated frequently.

**Q: Is this backward compatible?**  
A: Yes, old TELCONF packets still work. New ones are type-safe.

**Q: How does generic binary know its pins?**  
A: It learns from PINMAP upload. Without PINMAP, it waits for config.

---

## Related Documentation

- [PROTOCOL.md](PROTOCOL.md) - REST API spec (updated with new packet types)
- [README.md](README.md) - Project overview (updated with Generic CoreBinary model)
- [QUICK_START.md](QUICK_START.md) - Getting started guide
- [AI-INSTRUCT.md](AI-INSTRUCT.md) - Development standards
