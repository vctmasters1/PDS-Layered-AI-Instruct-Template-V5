# PDS-AutomationSuite: Generic CoreBinary Architecture

**Date**: April 16, 2026  
**Status**: 🟢 **ARCHITECTURE DEFINED - IMPLEMENTATION IN PROGRESS**

---

## Overview

This document defines the **runtime configuration model** that enables a **generic, reusable CoreBinary** (ESP32-C3 device firmware) that learns its hardware configuration at runtime instead of baking hardware-specific pins into compiled firmware.

### The Problem We're Solving

**Old Model (Compile-Per-Setup)**
```
Edit pins in code → Recompile → Flash device → Ready
(Lengthy, error-prone, different binary per setup)
```

**New Model (Runtime-Configured)**
```
Pinleaf Forge → PinMap upload → Done
Ladder Editor → Ladder upload → Done
HMI settings → UserSet upload → Done
(Same binary works on any hardware)
```

---

## Three-Packet Runtime Configuration Model

The device's runtime behavior is defined by three configuration packets uploaded via HTTPS POST:

### **1. PDS_TELCONF_PINMAP** - Hardware Definition
**Purpose**: Maps physical pins to variable names and applies unit conversions  
**Frequency**: Uploaded once per hardware setup change  
**Size**: ~4,100 bytes (32 pins max)  
**Source**: Pinleaf Forge JSON → converted to binary  

```c
struct {
    pin_number          : GPIO pin (0-31)
    function            : ADC, PWM, GPIO_IN, GPIO_OUT, I2C, UART, LED
    scale_factor        : Multiply raw value by this
    offset              : Add this (for user units)
    var_name            : Variable name in ladder logic ("moisture", "pump_state")
    label               : Display name for HMI ("Water Level", "Drain Pump")
    units               : Unit display ("cm", "%RH", "mV")
} × 32 pins max
```

**Example Pin Entries**:
```
Pin 3:  function=ADC,       var_name="moisture",  label="Tank Level",    scale=100, offset=0,  units="cm"
Pin 5:  function=PWM,       var_name="fan_speed", label="Cooling Fan",   scale=1,   offset=0,  units="%"
Pin 21: function=GPIO_OUT,  var_name="pump",      label="Water Pump",    scale=1,   offset=0,  units="on/off"
```

**Who Creates It**: Pinleaf Forge (converts JSON to binary packet)

---

### **2. PDS_TELCONF_LADDER** - Automation Logic
**Purpose**: Bytecode or state machine executed by device runtime engine  
**Frequency**: Uploaded whenever automation logic changes  
**Size**: Up to 4,096 bytes bytecode  
**Source**: Ladder Logic Editor → compiled to IL/bytecode  

```c
struct {
    bytecode_type       : IL=1, StateMachine=2, Interpreted=3
    payload_size        : Length of bytecode
    checksum            : CRC32 for validation
    bytecode[4096]      : Compiled ladder logic
}
```

**Example Logic** (pseudocode):
```
IF moisture < 600 THEN pump = ON
IF moisture > 800 THEN pump = OFF
IF fan_speed > 500 AND temp > 25 THEN cooling = ON
```

**Who Creates It**: Ladder Logic Editor (compiles .st to bytecode)

---

### **3. PDS_TELCONF_USRSET** - User Settings
**Purpose**: Tunable parameters referenced by ladder logic  
**Frequency**: Frequently (user adjusts settings via HMI)  
**Size**: ~2,300 bytes (64 settings max)  
**Source**: HMI sends user-tuned values  

```c
struct {
    var_name            : Variable name (must match PINMAP)
    float_value         : Current setting value
} × 64 settings max
```

**Example Settings**:
```
threshold_moisture_low      = 600
threshold_moisture_high     = 800
threshold_temp_max          = 28.5
fan_speed_target            = 75
timer_cycle_minutes         = 120
mode_auto_enabled           = 1
```

**Who Creates It**: HMI controllers (web, Android) set via UI

---

## Device Runtime Flow

```
Device Boot
    ↓
Load PinMap from NVS     ← Defines: pins, variables, scale factors
    ↓
Load Ladder from NVS     ← Defines: automation logic
    ↓
Initialize Runtime Engine
    ├─ Map pins per PinMap definitions
    ├─ Prepare bytecode executor
    └─ Start telemetry collection
    ↓
Main Loop:
    ├─ Read all ADC/GPIO per PinMap
    ├─ Apply scale/offset per PinMap
    ├─ Execute Ladder bytecode
    │  ├─ Evaluate conditions (IF clauses)
    │  ├─ Execute actions (THEN clauses)
    │  └─ Update output pins
    ├─ Send Telemetry via GET /status
    ├─ Receive UserSet updates via POST /config
    └─ Repeat
```

---

## Complete Data Flow

```
Pinleaf Forge (HTML5 Web App)
    ├─ Create hardware definition
    ├─ Export JSON: pin configs
    └─ → Convert to PDS_TELCONF_PINMAP (binary)
           ↓
    
Ladder Logic Editor (React Flow)
    ├─ Create automation .st file
    ├─ Define IF/THEN pipelines
    └─ → Compile to PDS_TELCONF_LADDER (bytecode)
           ↓
    
HMI Web/Android Controller
    ├─ Display device status (GET /status)
    ├─ Upload: PinMap binary → POST /config
    ├─ Upload: Ladder binary → POST /config
    ├─ User adjusts settings (thresholds, timers)
    └─ Upload: UserSet values → POST /config
           ↓
    
Device (Generic CoreBinary)
    ├─ Receive & validate checksums
    ├─ Store in NVS (persistent)
    ├─ Load on startup
    ├─ Execute runtime engine
    └─ Produce Telemetry (sensor readings)
           ↓
    
HMI polls GET /status
    ├─ Receive sensor readings
    ├─ Display in UI
    └─ Loop
```

---

## Structure Specifications

### PDS_TELCONF_PINMAP
```c
Header: 8 bytes
├─ version (uint16)      = 0x0001
├─ num_pins (uint8)      = 1-32
├─ reserved (uint8)      
└─ checksum (uint32)     = CRC32

Entries: 128 bytes each × num_pins
├─ pin_number (uint8)
├─ function (uint8)      = 0-9 (enum)
├─ flags (uint16)
├─ init_value (uint16)
├─ reserved (uint16)
├─ scale_factor (float)
├─ offset (float)
├─ var_name (char[32])
├─ label (char[32])
└─ units (char[16])

Total Size: 8 + (128 × num_pins)
Maximum: 8 + (128 × 32) = 4,104 bytes
```

### PDS_TELCONF_LADDER
```c
Header: 16 bytes
├─ version (uint16)          = 0x0001
├─ bytecode_type (uint16)    = 1-3 (IL, StateMachine, Interpreted)
├─ payload_size (uint32)     = bytes of bytecode
├─ checksum (uint32)         = CRC32
└─ reserved (uint32)

Bytecode: up to 4,096 bytes
└─ format depends on bytecode_type

Total Size: 16 + payload_size
Maximum: 16 + 4,096 = 4,112 bytes
```

### PDS_TELCONF_USRSET
```c
Header: 8 bytes
├─ version (uint16)      = 0x0001
├─ num_settings (uint16) = 1-64
└─ checksum (uint32)     = CRC32

Entries: 36 bytes each × num_settings
├─ var_name (char[32])       (must match PinMap var_name)
└─ float_value (float)

Total Size: 8 + (36 × num_settings)
Maximum: 8 + (36 × 64) = 2,312 bytes
```

---

## Upload Workflow (HMI Perspective)

### Initial Setup
```
1. User opens Pinleaf Forge
   ├─ Create/load board definition
   ├─ Define pins (ADC, PWM, GPIO)
   ├─ Assign variable names
   ├─ Set scale factors
   └─ Export JSON

2. HMI converts JSON → binary PinMap
   └─ POST https://device:8443/config
       ├─ Header: POST /config
       ├─ Body: PDS_TELCONF_PINMAP (binary)
       └─ Response: 200 OK, device stores in NVS

3. User opens Ladder Logic Editor
   ├─ Create automation .st file
   ├─ Reference variable names from PinMap
   ├─ Define conditions and actions
   ├─ Save & compile to bytecode
   └─ Export IL bytecode

4. HMI uploads Ladder bytecode
   └─ POST https://device:8443/config
       ├─ Header: POST /config
       ├─ Body: PDS_TELCONF_LADDER (binary)
       └─ Response: 200 OK, device stores in NVS

5. Device reboots (or loads on demand)
   ├─ Loads PinMap from NVS
   ├─ Loads Ladder from NVS
   ├─ Initializes runtime engine
   └─ Ready to execute
```

### User Tuning (Frequent Updates)
```
1. User adjusts threshold in HMI UI
   └─ threshold_moisture = 650 (drag slider)

2. HMI packages as PDS_TELCONF_USRSET
   └─ POST https://device:8443/config
       ├─ Header: POST /config
       ├─ Body: PDS_TELCONF_USRSET (binary)
       └─ Response: 200 OK, device updates in NVS

3. Device applies new threshold immediately
   ├─ Loads settings from NVS
   ├─ IF moisture < 650 THEN pump = ON
   └─ Behavior changes in real-time
```

---

## Generic CoreBinary Benefits

| Aspect | Compile-Per-Setup | Generic (This Model) |
|--------|-------------------|----------------------|
| **Binary** | Different per setup | Single binary for all |
| **Hardware Change** | Recompile + flash | Upload new PinMap |
| **Logic Change** | Recompile + flash | Upload new Ladder |
| **Settings Change** | Recompile + flash | Upload UserSet (instant) |
| **Setup Time** | 10-15 minutes | 30 seconds |
| **Maintenance** | Multiple binaries to manage | One binary everywhere |
| **Field Updates** | Requires USB + tools | Over WiFi via HMI |

---

## Implementation Roadmap

### Phase 1: Struct Definition ✅ DONE
- [x] Define C structs (pds_telemetry_types.h)
- [x] Define TypeScript types (pds_runtime_config.ts)
- [x] Document specifications

### Phase 2: Device Runtime Engine (IN PROGRESS)
- [ ] NVS storage handlers (load/save configs)
- [ ] BytecodeExecutor (runs IL bytecode from Ladder)
- [ ] VariableEngine (maps pins to variables)
- [ ] Settings loader (applies UserSet values)

### Phase 3: HMI Integration (IN PROGRESS)
- [ ] Pinleaf JSON → PinMap binary converter
- [ ] Ladder bytecode → LadderConfig binary converter
- [ ] Config upload handlers in web/Android HMI
- [ ] Settings UI (sliders, toggles for UserSet)

### Phase 4: Testing
- [ ] Unit tests (config validation)
- [ ] Integration tests (full workflow)
- [ ] End-to-end (device + HMI)

---

## File Locations

| Component | Location | Status |
|-----------|----------|--------|
| C Structs | [Device/pds/pds_network/include/pds_telemetry_types.h](../Device/pds/pds_network/include/pds_telemetry_types.h#L250) | ✅ Defined |
| TypeScript Types | [HMI-WEB/src/types/pds_runtime_config.ts](../HMI-WEB/src/types/pds_runtime_config.ts) | ✅ Created |
| Device Runtime Engine | Device/pds/pds_runtime/ | ⏳ To be created |
| Pinleaf JSON Converter | HMI-WEB/src/converters/ | ⏳ To be created |
| LadderLogicEditor Compiler | LadderLogicEditor/src/compiler/ | ⏳ To be integrated |

---

## Related Documentation

- [PROTOCOL.md](PROTOCOL.md) — HTTPS REST API specification
- [Device/AI-INSTRUCT.md](Device/AI-INSTRUCT.md) — Device firmware guidelines
- [HMI-WEB/AI-INSTRUCT.md](HMI-WEB/AI-INSTRUCT.md) — Web controller guidelines
- [PDS-HwPlatform/README.md](PDS-HwPlatform/README.md) — Pinleaf Forge documentation
- [LadderLogicEditor/README.md](LadderLogicEditor/README.md) — Ladder logic editor

---

## Questions & Design Decisions

**Q: Why fixed 128 bytes per pin entry?**  
A: Allows efficient array allocation and predictable NVS sizing. Unused fields are reserved for future expansion.

**Q: Why compile ladder logic instead of interpret .st directly?**  
A: Bytecode is faster at runtime and smaller to store (NVS-limited). Device is not a development environment.

**Q: What if settings reference undefined variables?**  
A: Device validates settings against PinMap at upload time, rejects with error.

**Q: Can we revert to old PinMap?**  
A: No, but old configs are in NVS history. Could implement version rollback if needed.

**Q: How is checksum validated?**  
A: CRC32 computed by HMI at upload, device recomputes and compares in NVS before using.
