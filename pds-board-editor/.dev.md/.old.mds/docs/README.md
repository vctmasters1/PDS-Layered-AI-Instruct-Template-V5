# Platform Editor & Hardware Configuration Documentation

**Location**: `PDS-HwPlatform/docs/`  
**Status**: 🟡 **Design Complete - Ready for Implementation**  
**Last Updated**: April 16, 2026

---

## 📚 Documentation Index

### 📋 **Core Documentation**

| Document | Purpose | Status |
|----------|---------|--------|
| [PINLEAF_PARTITION_GENERATION.md](PINLEAF_PARTITION_GENERATION.md) | Partition calculator integration for Pinleaf | 🟡 Design (ready for implementation) |

---

## 🎯 What This Is About

This directory contains documentation for **Pinleaf Forge** (Platform Editor v2) and extending it with **partition table generation** capabilities.

### Current Situation

Pinleaf currently:
- ✅ Allows defining CPU platforms (ESP32, ESP32-S3, etc.)
- ✅ Allows defining board pinouts and endpoints
- ✅ Exports hardware configuration as JSON
- ❌ Does NOT generate custom partition tables

### Proposed Enhancement

Extend Pinleaf to:
- ✅ Automatically calculate partition layouts based on platform and flash size
- ✅ Generate custom `partitions.csv` file
- ✅ Export in platform zip (alongside JSON)
- ✅ Support multiple ESP32 variants (C3, S3, C6, H2, etc.)

---

## 📖 Implementation Guide

### [PINLEAF_PARTITION_GENERATION.md](PINLEAF_PARTITION_GENERATION.md)

**What to read**: Complete design for partition calculator  
**Time**: 8 minutes  
**Contains**:
1. Problem statement (why needed)
2. Current vs. proposed workflow
3. Technical design (calculator algorithm)
4. Multi-platform examples
5. Integration points in Pinleaf
6. UI mockup
7. Export strategy

**Key Sections**:
- **Problem**: Manual partition math is error-prone
- **Solution**: Automatic calculation from platform specs
- **Calculator Formula**:
  ```
  Input: ESP32 variant, Flash size, Max pins, Max automation size
  Output: Custom partitions.csv with optimal allocation
  ```
- **Example Outputs**: 2MB, 4MB, 8MB, 16MB layouts

---

## 🔍 Cross-References

### Related Documentation
- **Device Storage Design**: `Device/docs/DEVICE_STORAGE_ALLOCATION.md`
- **Device Architecture**: `Device/docs/GENERIC_COREBINARY_ARCHITECTURE.md`
- **Partition Table Details**: `Device/main/partitions.csv` (example for 2MB ESP32-C3)

### Pinleaf Editor
- **URL**: `PDS-HwPlatform/platform-editor-v2.html`
- **Features**: Define platforms, boards, pins, endpoints
- **Export**: JSON platform specs

---

## 🚀 Implementation Roadmap

### Phase 1: Design (✅ COMPLETE)
- ✅ [PINLEAF_PARTITION_GENERATION.md](PINLEAF_PARTITION_GENERATION.md) - Full design specification

### Phase 2: Implementation (⏳ TODO)
- [ ] Add partition calculator JavaScript to Pinleaf
- [ ] Add UI for platform selection and flash size
- [ ] Implement partition math algorithm
- [ ] Validate outputs against platform specs
- [ ] Generate CSV format

### Phase 3: Integration (⏳ TODO)
- [ ] Include CSV in platform download
- [ ] Add help/documentation in Pinleaf UI
- [ ] Test with multiple platform configs
- [ ] Validate partition tables work on real hardware

### Phase 4: Polish (⏳ TODO)
- [ ] Add visual partition layout diagram
- [ ] Add advanced configuration options
- [ ] Documentation and user guide

---

## 🛠️ Technical Details

### Partition Calculator Algorithm

```
Input:
  platform: "esp32-c3" | "esp32-s3" | "esp32-c6" | "esp32-h2"
  flash_size: 2MB | 4MB | 8MB | 16MB
  max_pins: 32 (default)
  max_ladder_size: 4KB (default)
  max_settings: 64 (default)

Process:
  1. NVS allocation: 20 KB (standard)
  2. Bootloader: 4 KB (standard)
  3. Partition table: 512 B (standard)
  4. OTA data: 8 KB (standard)
  5. App0 (primary): (flash_size - reserved) / 2
  6. App1 (OTA backup): (flash_size - reserved) / 2
  7. FATFS (optional): Remainder

Output:
  partitions.csv (ESP-IDF format)
  validation_report (sizes, margins, warnings)
```

### Supported Platforms

| Variant | Flash | NVS | App0 | App1 | Notes |
|---------|-------|-----|------|------|-------|
| ESP32-C3 | 2 MB | 20 KB | 1.7 MB | 1.7 MB | Default, recommended |
| ESP32-S3 | 4 MB | 20 KB | 1.9 MB | 1.9 MB | Higher performance |
| ESP32-S3 | 8 MB | 20 KB | 3.9 MB | 3.9 MB | More space |
| ESP32-S3 | 16 MB | 20 KB | 7.9 MB | 7.9 MB | Maximum |
| ESP32-C6 | 4 MB | 20 KB | 1.9 MB | 1.9 MB | Future |
| ESP32-H2 | 4 MB | 20 KB | 1.9 MB | 1.9 MB | Low power |

---

## 📊 Example: ESP32-C3 2MB

The device configuration system was tested with ESP32-C3 2MB. See [Device/main/partitions.csv](../../Device/main/partitions.csv) for the actual table.

**Calculation**:
- Total: 2,097,152 bytes (2 MB)
- Bootloader: 4 KB @ 0x0000
- Partition Table: 512 B @ 0x8000
- NVS: 20 KB @ 0x9000 (stores PINMAP, LADDER, USRSET)
- OTA Data: 8 KB @ 0xE000
- App0: 1.7 MB @ 0x10000
- App1: 1.7 MB @ 0x1B0000
- FATFS: 660 KB (reserved)

**Validation**: ✅ NVS holds all three configs (11 KB used / 20 KB available)

---

## 🎯 Key Decision Points

### Why Build This into Pinleaf?

1. **Single Source of Truth**: Pin definitions + partition layout in one tool
2. **Error Prevention**: Automatic calculation vs. manual math
3. **Multi-Platform Support**: One click to generate CSV for any variant
4. **Maintenance**: When adding new pins, partition layout stays valid

### Why Not Use Online Tool?

- Offline support (file:/// URLs work)
- Integrated with platform definition
- No external dependency
- Works standalone

---

## 💡 Integration Points in Pinleaf

### Current Pinleaf Structure
```
platform-editor-v2.html
├── Platform definition (CPU specs)
├── Board definition (pinouts)
└── Export → JSON
```

### Enhanced Pinleaf Structure
```
platform-editor-v2.html
├── Platform definition (CPU specs)
├── Board definition (pinouts)
├── + Partition configuration (NEW)
│  ├─ Flash size selector
│  ├─ Partition calculator
│  └─ Preview diagram
└─ Export → ZIP
   ├─ platform.json (existing)
   └─ partitions.csv (NEW)
```

---

## 🧪 Testing Partition Calculator

### Manual Test Case 1: ESP32-C3 2MB
```
Input: platform=esp32-c3, flash=2MB, max_pins=32
Expected output: Valid partitions.csv
Validation: idf.py partition-table → check layout
Expected fits: NVS 20KB holds device config (11KB used)
```

### Manual Test Case 2: ESP32-S3 8MB
```
Input: platform=esp32-s3, flash=8MB, max_pins=64
Expected output: Valid partitions.csv
Validation: Larger app partitions, same NVS
Expected fits: idf.py build on real hardware
```

### Error Case 1: Impossible Configuration
```
Input: platform=esp32-c3, max_pins=512 (impossible)
Expected output: Error message
Expected behavior: Guide user to larger platform
```

---

## 📞 Questions?

- **Partition math**: See [DEVICE_STORAGE_ALLOCATION.md](../docs/../Device/docs/DEVICE_STORAGE_ALLOCATION.md)
- **Device configuration**: See [Device/docs/](../Device/docs/)
- **Pinleaf usage**: See [PDS-HwPlatform/README.md](../README.md)

---

## 🔗 Related Resources

- [ESP-IDF Partitions](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-guides/partition-tables.html)
- [ESP32 Flash Sizes](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/hw-reference/)
- [Pinleaf Usage](../README.md)

---

**Status**: Design complete, ready for implementation! 🚀
