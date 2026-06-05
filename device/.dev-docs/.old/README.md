# Device Configuration System Documentation

**Location**: `Device/docs/`  
**Status**: 🟢 **Complete & Ready for Integration**  
**Last Updated**: April 16, 2026

---

## � Platform-Centric Architecture Update

**Important**: As of April 16, 2026, the architecture has been reorganized to be **platform-centric** instead of device-centric:

- **Platform Configuration Directory**: `PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/`
  - Contains: `memorymap.csv`, `platform_spec.json`, default configs
  - Single source of truth for all platform-specific settings
  
- **Device Code**: Remains truly generic (CoreBinary)
  - No platform-specific partitions or configs embedded
  - Reads configuration from NVS at runtime
  - Works with any platform that provides memorymap.csv

**For Integration**: Copy `memorymap.csv` from platform directory to `Device/main/partitions.csv` before building. See [DEVICE_IMPLEMENTATION_GUIDE.md](DEVICE_IMPLEMENTATION_GUIDE.md) Step 1 for details.

---

## �📚 Documentation Index

### 🚀 **Getting Started** (Start here if you're new)

| Document | Purpose | Time | For Whom |
|----------|---------|------|----------|
| [OVERVIEW.md](OVERVIEW.md) | High-level summary of what's been built | 5 min | Everyone |
| [INDEX.md](INDEX.md) | Navigation guide by role (Dev, QA, HMI, etc.) | 5 min | Find your path |
| [DEVICE_IMPLEMENTATION_GUIDE.md](DEVICE_IMPLEMENTATION_GUIDE.md) | Step-by-step integration instructions | 15 min | Firmware devs |

### 🏗️ **Architecture & Design** (Understand the system)

| Document | Purpose | Time | Details |
|----------|---------|------|---------|
| [GENERIC_COREBINARY_ARCHITECTURE.md](GENERIC_COREBINARY_ARCHITECTURE.md) | Complete system design and packet specifications | 15 min | Three-packet model: PINMAP, LADDER, USRSET |
| [DEVICE_STORAGE_ALLOCATION.md](DEVICE_STORAGE_ALLOCATION.md) | Flash storage sizing and partition layout | 10 min | NVS design, custom partitions.csv, math verified |

### 🧪 **Testing & Validation** (Verify it works)

| Document | Purpose | Time | Contains |
|----------|---------|------|----------|
| [CONFIG_UPLOAD_TESTING.md](CONFIG_UPLOAD_TESTING.md) | Complete test procedures and curl examples | 20 min | Build, flash, error conditions, automation tests |
| [IMPLEMENTATION_STATUS_REPORT.md](IMPLEMENTATION_STATUS_REPORT.md) | Detailed status of implementation | 15 min | What's done, next steps, file inventory |

### 📋 **Phase Overview** (Project tracking)

| Document | Purpose |
|----------|---------|
| [STORAGE_IMPLEMENTATION_SUMMARY.md](STORAGE_IMPLEMENTATION_SUMMARY.md) | Summary of phases completed and roadmap |

---

## 🎯 Quick Start Paths

### **Path A: "I want to integrate RIGHT NOW"** ⚡
**Time**: 30 minutes

1. Read: [OVERVIEW.md](OVERVIEW.md) (3 min)
2. Read: [DEVICE_IMPLEMENTATION_GUIDE.md](DEVICE_IMPLEMENTATION_GUIDE.md) Steps 1-3 (12 min)
3. Copy files and modify main.c (15 min)
4. Build and test: Follow Part 2-3 of [CONFIG_UPLOAD_TESTING.md](CONFIG_UPLOAD_TESTING.md) (10 min)

**Result**: Device boots and can receive configs ✅

---

### **Path B: "Help me understand the design"** 🏗️
**Time**: 45 minutes

1. Read: [OVERVIEW.md](OVERVIEW.md) (5 min)
2. Read: [GENERIC_COREBINARY_ARCHITECTURE.md](GENERIC_COREBINARY_ARCHITECTURE.md) (15 min)
3. Read: [DEVICE_STORAGE_ALLOCATION.md](DEVICE_STORAGE_ALLOCATION.md) (10 min)
4. Read: [IMPLEMENTATION_STATUS_REPORT.md](IMPLEMENTATION_STATUS_REPORT.md) (15 min)
5. Then follow Path A above

---

### **Path C: "I'm the test/QA engineer"** 🧪
**Time**: 2-3 hours

1. Read: [CONFIG_UPLOAD_TESTING.md](CONFIG_UPLOAD_TESTING.md) (20 min)
   - Part 1: Integration checklist
   - Part 2: Build & Flash procedures
   - Part 3-5: Test procedures
   - Part 6: Troubleshooting
2. Set up test environment (30 min)
3. Run tests: Part 2 → 5 of [CONFIG_UPLOAD_TESTING.md](CONFIG_UPLOAD_TESTING.md) (1-2 hours)
4. Document results and create test case templates

---

### **Path D: "I need to implement the HMI side"** 📱
**Time**: 1 hour (planning) + 4-6 hours (implementation)

1. Read: [GENERIC_COREBINARY_ARCHITECTURE.md](GENERIC_COREBINARY_ARCHITECTURE.md) - Focus on packet structures (15 min)
2. Check: [HMI-WEB/src/types/pds_runtime_config.ts](../../../HMI-WEB/src/types/pds_runtime_config.ts) - TypeScript equivalents (5 min)
3. Read: [IMPLEMENTATION_STATUS_REPORT.md](IMPLEMENTATION_STATUS_REPORT.md) - Phase 4 (HMI) (5 min)
4. Start implementing:
   - PINMAP serializer (TypeScript) - 1-2 hours
   - LADDER compiler (TypeScript) - 1-2 hours
   - USRSET serializer (TypeScript) - 30 min
   - React upload UI - 1 hour

---

### **Path E: "I work on Pinleaf/Platform tools"** 🔧
**Time**: 1 hour (learning) + 3-4 hours (implementation)

1. Read: Pinleaf integration section of [DEVICE_STORAGE_ALLOCATION.md](DEVICE_STORAGE_ALLOCATION.md)
2. Read: [PDS-HwPlatform/docs/PINLEAF_PARTITION_GENERATION.md](../../../PDS-HwPlatform/docs/PINLEAF_PARTITION_GENERATION.md)
3. Key task: Add partition calculator to Pinleaf
   - Support ESP32-C3 (2 MB)
   - Support ESP32-S3 (4/8/16 MB)
   - Generate custom partitions.csv
   - Export in platform zip

---

## 📁 File Structure

```
Device/
├── docs/              (You are here)
│   ├── README.md      (This file - navigation)
│   ├── OVERVIEW.md    (What was built)
│   ├── INDEX.md       (Navigation by role)
│   ├── GENERIC_COREBINARY_ARCHITECTURE.md    (System design)
│   ├── DEVICE_STORAGE_ALLOCATION.md          (Storage strategy)
│   ├── DEVICE_IMPLEMENTATION_GUIDE.md        (Integration steps)
│   ├── CONFIG_UPLOAD_TESTING.md              (Testing procedures)
│   ├── IMPLEMENTATION_STATUS_REPORT.md       (Complete status)
│   └── STORAGE_IMPLEMENTATION_SUMMARY.md     (Phase summary)
│
├── main/              (Device firmware)
│   ├── main_integration_example.c            (Reference implementation)
│   ├── partitions.csv                        (Custom partition table)
│   └── CMakeLists.txt
│
├── pds/               (PDS hardware layer)
│   ├── pds_storage/
│   │   ├── pds_config_store.c                (NVS handler - IMPLEMENTATION)
│   │   └── include/pds_config_store.h
│   ├── pds_network/
│   │   ├── pds_https_config_handler.c        (HTTPS handler - IMPLEMENTATION)
│   │   └── include/pds_telemetry_types.h     (Packet definitions)
│   └── ...
│
└── AI-INSTRUCT.md     (Device-level instructions)
```

---

## 🔍 Cross-References

### Core Implementation Files
- **NVS Storage**: `Device/pds/pds_storage/pds_config_store.c` (600+ lines)
- **HTTPS Handler**: `Device/pds/pds_network/pds_https_config_handler.c` (300+ lines)
- **Partition Table**: `Device/main/partitions.csv` (Custom 2MB layout)
- **Reference Code**: `Device/main/main_integration_example.c` (Integration patterns)

### Related Documentation
- **Device Instructions**: `Device/AI-INSTRUCT.md`
- **Platform Editor**: `PDS-HwPlatform/docs/PINLEAF_PARTITION_GENERATION.md`
- **HMI Types**: `HMI-WEB/src/types/pds_runtime_config.ts` (TypeScript structs)
- **Protocol**: `PROTOCOL.md` (HTTPS REST + BLE APIs)

---

## 📊 What's Included

### ✅ Production Code
- ✅ **pds_config_store.c** - 600+ lines, complete NVS handler
- ✅ **pds_https_config_handler.c** - 300+ lines, complete HTTPS routing
- ✅ **partitions.csv** - Custom partition table for 2MB ESP32-C3
- ✅ **main_integration_example.c** - Full reference implementation

### ✅ Documentation
- ✅ **Architecture docs** - Complete system design (3-packet model)
- ✅ **Integration guide** - Step-by-step instructions (3 steps)
- ✅ **Testing procedures** - Full test suite with curl examples
- ✅ **Status report** - What's done, what's next
- ✅ **Navigation guides** - Role-based paths

### ✅ Verification
- ✅ **Storage math verified** - 11 KB used / 20 KB available
- ✅ **Partition layout verified** - Fits ESP32-C3 2MB constraint
- ✅ **Error handling complete** - All fault cases covered
- ✅ **CRC32 validation** - Data integrity guaranteed

---

## 🚀 Integration Timeline

| Step | Time | Status |
|------|------|--------|
| Read overview & guide | 20 min | ✅ Ready |
| Copy code files | 5 min | ✅ Ready |
| Modify main.c | 10 min | ✅ Ready |
| Build firmware | 5 min | ✅ Ready |
| Test upload | 5 min | ✅ Ready |
| **Total** | **45 min** | ✅ **Ready** |

---

## ✅ Success Criteria

After following the integration guide, you should have:

- ✅ Device boots successfully (serial log: "System Ready")
- ✅ HTTPS server running on port 8443
- ✅ Can upload PINMAP via curl and get JSON response
- ✅ Config persists after device reboot
- ✅ Error handling works (invalid packets rejected)
- ✅ Logging output is detailed and helpful

---

## 📞 Need Help?

- **Integration questions**: See [DEVICE_IMPLEMENTATION_GUIDE.md](DEVICE_IMPLEMENTATION_GUIDE.md)
- **Testing issues**: See [CONFIG_UPLOAD_TESTING.md](CONFIG_UPLOAD_TESTING.md) Part 6 (Troubleshooting)
- **Design questions**: See [GENERIC_COREBINARY_ARCHITECTURE.md](GENERIC_COREBINARY_ARCHITECTURE.md)
- **Storage questions**: See [DEVICE_STORAGE_ALLOCATION.md](DEVICE_STORAGE_ALLOCATION.md)

---

## 🎓 Learning Resources

**For Device Firmware**:
- ESP-IDF Documentation: https://docs.espressif.com/projects/esp-idf/
- NVS Flash: https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/storage/nvs_flash.html

**For HMI Development**:
- TypeScript Handbook: https://www.typescriptlang.org/docs/
- React Documentation: https://react.dev/

**For Platform Tools**:
- See PDS-HwPlatform/README.md and docs/

---

## 📝 Changelog

| Date | Change |
|------|--------|
| 2026-04-16 | ✅ All device configuration components implemented and documented |
| 2026-04-16 | ✅ Moved documentation to Device/docs/ for proper organization |
| 2026-04-16 | ✅ Created this navigation README |

---

**Ready to get started?** Pick a path above and dive in! 🚀
