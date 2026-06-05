# Device Project Documentation Index

**Project**: H2O-Tower Aeroponics Control System  
**Platform**: ESP32-C3  
**Updated**: December 16, 2025

---

## 📚 Document Guide

### 🟢 Start Here (Read These First)

| Document | Purpose | Read Time |
|----------|---------|-----------|
| [ORGANIZATION_SUMMARY.md](ORGANIZATION_SUMMARY.md) | **Executive summary** - What's organized and why | 5 min |
| [QUICK_REFERENCE.md](QUICK_REFERENCE.md) | **Developer cheat sheet** - Quick lookups and commands | 3 min |
| [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) | **Visual guide** - System flows and diagrams | 10 min |

### 🔵 Deep Dive (Detailed References)

| Document | Purpose | Read Time |
|----------|---------|-----------|
| [AI-DEVICE-OVERVIEW.md](AI-DEVICE-OVERVIEW.md) | **Complete architecture guide** - Full details on every component | 20 min |
| [MAIN_DIRECTORY_STATUS.md](MAIN_DIRECTORY_STATUS.md) | **Organization verification** - What's in main/ and why | 5 min |
| [CONSOLIDATION_GUIDE.md](CONSOLIDATION_GUIDE.md) | **Consolidation history** - How we organized the code | 10 min |

### 🟡 Related Documentation (Project-Level)

| Document | Purpose |
|----------|---------|
| [../AI-INSTRUCT.md](../AI-INSTRUCT.md) | Naming conventions, architecture, project structure |
| [../BUILD_AND_TEST.md](../BUILD_AND_TEST.md) | Build procedures and testing |
| [../PROTOCOL.md](../PROTOCOL.md) | Communication protocol specifications |
| [../HARDWARE.md](../HARDWARE.md) | Hardware specifications and pinouts |
| [../README.md](../README.md) | Project overview |

---

## 📋 Quick Navigation by Purpose

### I Want To...

#### Understand the Project
→ Start with [ORGANIZATION_SUMMARY.md](ORGANIZATION_SUMMARY.md)  
→ Then read [../AI-INSTRUCT.md](../AI-INSTRUCT.md) and [../.github/copilot-instructions.md](../.github/copilot-instructions.md)

#### Add a New Feature
→ Read [QUICK_REFERENCE.md](QUICK_REFERENCE.md) → "Where to Put New Code"  
→ Check [AI-DEVICE-OVERVIEW.md](AI-DEVICE-OVERVIEW.md) → "Development Workflow"

#### Find Where Something Is
→ Use [QUICK_REFERENCE.md](QUICK_REFERENCE.md) → "File Locations by Feature"  
→ Or check [AI-DEVICE-OVERVIEW.md](AI-DEVICE-OVERVIEW.md) → "Directory Structure"

#### Understand the Architecture
→ View [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md)  
→ Read [AI-DEVICE-OVERVIEW.md](AI-DEVICE-OVERVIEW.md) → "Architecture & Data Flow"

#### Build and Flash the Device
→ See [../BUILD_AND_TEST.md](../BUILD_AND_TEST.md)  
→ Or [QUICK_REFERENCE.md](QUICK_REFERENCE.md) → "Build Commands"

#### Understand the API
→ Check [QUICK_REFERENCE.md](QUICK_REFERENCE.md) → "API Quick Reference"  
→ Or [AI-DEVICE-OVERVIEW.md](AI-DEVICE-OVERVIEW.md) → Component sections

#### Check Communication Protocols
→ Read [../PROTOCOL.md](../PROTOCOL.md)  
→ Or [AI-DEVICE-OVERVIEW.md](AI-DEVICE-OVERVIEW.md) → "Communication Protocols"

---

## 🗂️ Directory Structure at a Glance

```
Device/H2O-DEV-12102025/
│
├── 📁 main/                          ← Application-specific code
│   ├── main.c                        ← Firmware entry point
│   ├── H2O_device_pins.h/c          ← Pin configuration
│   ├── H2O_device_pipeline.h/c      ← Action pipeline
│   ├── H2O_device_telemetry.h/c     ← Sensor collection
│   ├── H2O_device_timer.h/c         ← Timer management
│   ├── H2O_device_nvs.h/c           ← Config persistence
│   ├── H2O_device_validation.h/c    ← Input validation
│   ├── H2O_device_types.h           ← Type definitions
│   ├── CMakeLists.txt
│   └── idf_component.yml
│
├── 📁 pds/                           ← Reusable components (Proprietary Data System)
│   ├── h2o_core/                    ← Types, constants
│   ├── h2o_network/                 ← WiFi, HTTP, BLE, mDNS
│   ├── h2o_storage/                 ← NVS persistence
│   ├── h2o_telemetry/               ← Sensor data collection
│   ├── h2o_control/                 ← Pipeline framework
│   ├── h2o_hal/                     ← GPIO, ADC, PWM drivers
│   └── h2o_validation/              ← Input validation
│
├── 📁 build/                         ← Build artifacts (generated)
├── 📁 managed_components/            ← ESP-IDF dependencies (generated)
│
├── CMakeLists.txt                   ← Top-level build config
├── build.ps1                        ← Build helper script
│
├── 📄 ORGANIZATION_SUMMARY.md       ← THIS SUMMARY (Start here!)
├── 📄 QUICK_REFERENCE.md            ← Developer cheat sheet
├── 📄 ARCHITECTURE_DIAGRAMS.md      ← Visual diagrams
├── 📄 AI-DEVICE-OVERVIEW.md         ← Complete architecture
├── 📄 MAIN_DIRECTORY_STATUS.md      ← Verification
└── 📄 CONSOLIDATION_GUIDE.md        ← Consolidation history
```

---

## 🎯 Common Tasks

### Task: Add a New Sensor Input
1. Define new ADC pin in [main/H2O_device_types.h](main/H2O_device_types.h)
2. Add to pin table in [main/H2O_device_pins.c](main/H2O_device_pins.c)
3. Update telemetry collection in [main/H2O_device_telemetry.c](main/H2O_device_telemetry.c)
4. Update HTTP /status endpoint to include new data
5. Build and test: `idf.py build && idf.py flash monitor`

### Task: Add a New Automation Rule
1. Define rule structure in [main/H2O_device_types.h](main/H2O_device_types.h)
2. Implement rule evaluation in [pds/h2o_control/h2o_pipeline.c](pds/h2o_control/h2o_pipeline.c)
3. Add rule to action pipeline
4. Save rule to NVS in [main/H2O_device_nvs.c](main/H2O_device_nvs.c)
5. Build and test

### Task: Add a New HTTP Endpoint
1. Create handler function in [pds/h2o_network/h2o_http_server.c](pds/h2o_network/h2o_http_server.c)
2. Register in `H2o_http_server_init()`
3. Update Android app to call new endpoint
4. Build device and test

### Task: Change WiFi Provisioning
1. Modify BLE characteristics in [pds/h2o_network/h2o_ble_provisioning.c](pds/h2o_network/h2o_ble_provisioning.c)
2. Update Android app BLE client
3. Update NVS save logic if needed
4. Build and test

---

## 📊 Component Responsibilities

| Component | Location | Purpose |
|-----------|----------|---------|
| **Pins** | `main/H2O_device_pins.*` | Pin configuration table & initialization |
| **Pipeline** | `main/H2O_device_pipeline.*` | Execute action pipeline (ADC → condition → output) |
| **Telemetry** | `main/H2O_device_telemetry.*` | Collect sensor readings & device state |
| **Timer** | `main/H2O_device_timer.*` | Manage time-of-day and cycle timers |
| **NVS** | `main/H2O_device_nvs.*` | Save/load config to NVS |
| **Validation** | `main/H2O_device_validation.*` | Validate commands and configuration |
| **WiFi** | `pds/h2o_network/h2o_wifi.*` | WiFi connection management |
| **HTTP Server** | `pds/h2o_network/h2o_http_server.*` | REST API on port 80 |
| **BLE Provisioning** | `pds/h2o_network/h2o_ble_provisioning.*` | First-time WiFi setup via BLE |
| **mDNS** | `pds/h2o_network/h2o_mdns.*` | Device discovery (h2o-tower.local) |
| **Storage** | `pds/h2o_storage/*` | Generic NVS/Flash persistence |
| **HAL** | `pds/h2o_hal/*` | GPIO, ADC, PWM drivers |
| **Control** | `pds/h2o_control/*` | Pipeline framework & timers |
| **Telemetry Framework** | `pds/h2o_telemetry/*` | Generic sensor data collection |
| **Validation Utils** | `pds/h2o_validation/*` | Input validation & sanitization |
| **Core** | `pds/h2o_core/*` | Shared types, constants, enums |

---

## 🔑 Key Conventions

### Naming Rules

| Context | Pattern | Example |
|---------|---------|---------|
| Main files | `H2O_device_{feature}` | `H2O_device_pins.c` |
| Main functions | `H2O_device_{module}_{func}()` | `H2O_device_pins_init()` |
| PDS files | `h2o_{component}_{feature}` | `h2o_network_wifi.c` |
| PDS functions | `H2o_{component}_{func}()` | `H2o_http_server_init()` |
| Private functions | `_{name}` | `_handle_request()` |

### File Organization

- **Every component** → CMakeLists.txt + include/ directory
- **Public API** → In include/*.h
- **Implementation** → In *.c files
- **No duplicate code** → Between main/ and pds/

---

## 🚀 Getting Started Checklist

- [ ] Read [ORGANIZATION_SUMMARY.md](ORGANIZATION_SUMMARY.md) (5 min)
- [ ] Skim [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) (10 min)
- [ ] Review [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for your task (5 min)
- [ ] Read relevant component section in [AI-DEVICE-OVERVIEW.md](AI-DEVICE-OVERVIEW.md) (varies)
- [ ] Build the project: `idf.py build` (2-5 min)
- [ ] Flash to device: `idf.py -p COM5 flash monitor` (1 min)
- [ ] Start development! 🎉

---

## 📞 Troubleshooting

### Build Fails
→ Check [../BUILD_AND_TEST.md](../BUILD_AND_TEST.md) → Troubleshooting section

### Can't Find a File
→ Use [QUICK_REFERENCE.md](QUICK_REFERENCE.md) → "File Locations by Feature"

### Unclear Where to Put Code
→ Check [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) → "File Organization Decision Tree"

### Don't Understand Architecture
→ Read [AI-DEVICE-OVERVIEW.md](AI-DEVICE-OVERVIEW.md) → "Architecture & Data Flow"

### Need API Reference
→ Check [QUICK_REFERENCE.md](QUICK_REFERENCE.md) → "API Quick Reference"

---

## 📈 Documentation Structure

```
┌─────────────────────────────────────────────┐
│ YOU WANT TO UNDERSTAND THE DEVICE FIRMWARE  │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
    ┌───▼────────┐         ┌────▼────────┐
    │ VISUAL?    │         │ DETAILED?   │
    └───┬────────┘         └────┬────────┘
        │                       │
    ┌───▼──────────────────┐    │
    │ ARCHITECTURE_        │    │
    │ DIAGRAMS.md          │    └─→ AI-DEVICE-OVERVIEW.md
    │ • Boot flow          │         • All component details
    │ • Event loops        │         • All APIs
    │ • Data flows         │         • All interactions
    │ • Decision trees     │
    └─────────────────────┘
              △
              │
        ┌─────┴─────────┐
        │ START HERE!   │
        └─────┬─────────┘
              │
        ┌─────▼───────────────────────┐
        │ ORGANIZATION_SUMMARY.md      │
        │ • What's organized           │
        │ • Why it's organized this way│
        │ • Executive summary          │
        └──────────────────────────────┘
              △
              │
        ┌─────┴─────────┐
        │ NEED QUICK?   │
        └─────┬─────────┘
              │
        ┌─────▼──────────────────────┐
        │ QUICK_REFERENCE.md          │
        │ • Cheat sheet               │
        │ • Quick lookups             │
        │ • Common commands           │
        └─────────────────────────────┘
```

---

## ✅ Verification Checklist

The device project is properly organized if:

- ✅ `main/` contains only `H2O_device_*` files
- ✅ `pds/` contains only `h2o_*` components
- ✅ No network code in `main/` (all in `pds/h2o_network/`)
- ✅ No HAL drivers in `main/` (all in `pds/h2o_hal/`)
- ✅ No duplicate files between `main/` and `pds/`
- ✅ All CMakeLists.txt files are present and correct
- ✅ Project builds successfully
- ✅ Device boots and starts HTTP server on port 80
- ✅ mDNS advertises h2o-tower.local
- ✅ Android app can connect and poll data

**Status: ✅ ALL VERIFIED**

---

## 📞 Support

For questions about:
- **Organization**: See [AI-DEVICE-OVERVIEW.md](AI-DEVICE-OVERVIEW.md) section 2
- **Naming conventions**: See [QUICK_REFERENCE.md](QUICK_REFERENCE.md) → "Naming Conventions"
- **Where to put code**: See [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) → "File Organization Decision Tree"
- **API details**: See [QUICK_REFERENCE.md](QUICK_REFERENCE.md) → "API Quick Reference"
- **Building**: See [../BUILD_AND_TEST.md](../BUILD_AND_TEST.md)

---

**Last Updated**: December 16, 2025  
**Status**: ✅ Complete and Ready for Development  

**Next Step**: Read [ORGANIZATION_SUMMARY.md](ORGANIZATION_SUMMARY.md) (5 minutes)

