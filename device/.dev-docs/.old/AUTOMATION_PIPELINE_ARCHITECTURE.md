# Device Ladder Logic & AutomationPipeline Architecture

**Date**: February 2, 2026  
**Purpose**: Design for uploading and executing ladder logic files on ESP32-C3 device  
**Related to**: AutomationPipeline, Device Firmware, PDS-ConfigTools

---

## 🎯 Overview

The device will execute automation logic through a **ladder logic file** that is:
1. **Created** in LadderLogicEditor (visual UI)
2. **Exported** to PDS format (JSON)
3. **Uploaded** to device via HTTPS API
4. **Stored** persistently in NVS (flash memory)
5. **Executed** at runtime by device firmware

This mimics a **real PLC workflow**: design automation rules → compile → upload → execute

---

## 📊 Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ Phase 1: Create Automation (LadderLogicEditor)                  │
├──────────────────────────────────────────────────────────────────┤
│ User writes IEC 61131-3 Structured Text (.st file)              │
│ Example: "IF water_level < 200 THEN pump_relay := TRUE;"        │
│ File: aeroponics-basic.st                                        │
└──────────────────────┬───────────────────────────────────────────┘
                       │ .st file (IEC 61131-3 code)
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ Phase 2: Visual Transformation & Export (LadderLogicEditor)     │
├──────────────────────────────────────────────────────────────────┤
│ LadderLogicEditor transforms .st code → Visual ladder diagrams   │
│ User validates logic visually                                    │
│ pds-export-plugin.js: Convert to PDS JSON format                 │
│ integration/pds-validator.js: Validate against schema            │
│ Output: PDS-ConfigTools/roles/<role>/control-pipelines.json      │
└──────────────────────┬───────────────────────────────────────────┘
                       │ Valid PDS JSON (compressed)
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ Phase 3: Configure Device Role (PDS-ConfigTools)                │
├──────────────────────────────────────────────────────────────────┤
│ Role contains:                                                   │
│  - Pin configuration (ADC, GPIO, PWM)                            │
│  - Automation pipeline (ladder logic)                            │
│  - Telemetry settings                                            │
│  - Metadata                                                      │
└──────────────────────┬───────────────────────────────────────────┘
                       │ Role configuration
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ Phase 4: Build Firmware (PDS-BuildTools)                        │
├──────────────────────────────────────────────────────────────────┤
│ Reads role configuration                                         │
│ Embeds automation pipeline as C struct/JSON                      │
│ Compiles to binary: Device/H2O-DEV-12102025/build/H2o-Tower.bin  │
│ Result: H2o-Tower.bin (firmware with embedded automation)        │
└──────────────────────┬───────────────────────────────────────────┘
                       │ Binary firmware
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ Phase 5a: Flash Device (Initial Setup)                          │
├──────────────────────────────────────────────────────────────────┤
│ Command: idf.py -p COM3 flash monitor                            │
│ Device boots with embedded automation pipeline                   │
│ Automation loads from firmware SPIFFS/partition                  │
└──────────────────────┬───────────────────────────────────────────┘
                       │ Device running
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ Phase 5b: Upload New Automation (Runtime Update - OTA)           │
├──────────────────────────────────────────────────────────────────┤
│ No need to rebuild firmware!                                     │
│ POST /automation/update with new ladder logic JSON               │
│ Device stores in NVS (persistent flash)                          │
│ Device reloads automation without reboot (or soft reboot)        │
│ Result: Updated automation active immediately                    │
└──────────────────────┬───────────────────────────────────────────┘
                       │ New automation active
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ Phase 6: Runtime Execution (Device Firmware)                    │
├──────────────────────────────────────────────────────────────────┤
│ Main loop:                                                       │
│  1. Read sensors (ADC, GPIO)                                     │
│  2. Evaluate ladder logic rungs                                  │
│  3. Execute actions (set GPIO, PWM, timers)                      │
│  4. Log events & telemetry                                       │
│  5. Report status via HTTPS REST API                             │
│                                                                  │
│ Scan cycle: 100ms (10x per second)                               │
│ Rungs evaluate in sequence (top to bottom)                       │
│ Actions executed immediately when condition true                │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Device-Side Architecture

### Storage: Where Automation Lives

**Option 1: NVS (Non-Volatile Storage) - RECOMMENDED**
```
NVS Partition (size: 64KB default)
├── h2o_automation/                    [namespace]
│   ├── automation_json (1KB max)      [compressed JSON]
│   ├── automation_version (4 bytes)   [schema version]
│   ├── automation_checksum (4 bytes)  [CRC32 for validation]
│   └── automation_enabled (1 byte)    [boolean flag]
│
└── h2o_prov/                          [existing provisioning]
    ├── ssid
    ├── password
    └── provisioned
```

**Advantages**:
- ✅ Persistent (survives reboot)
- ✅ Fast read/write
- ✅ Native ESP-IDF support
- ✅ Wear leveling (hardware FTL)
- ✅ Used for provisioning already

**Option 2: SPIFFS (SPI Flash File System)**
```
SPIFFS Partition
├── /automation/
│   ├── pipeline.json      [main automation file]
│   ├── pipeline.json.bak  [backup]
│   └── metadata.json      [version, timestamp]
```

**Advantages**:
- ✅ Can store larger files (hundreds KB)
- ✅ File-like API
- ✅ Good for multiple automation versions

### Memory: Runtime Execution

**RAM Layout During Execution**:
```
ESP32-C3 RAM (400KB total)
├── System (WiFi, BLE, etc.)         [~100KB]
├── AutomationRuntime                [~50KB]
│   ├── rungs[] (parsed from JSON)    [~30KB for 100 rungs]
│   ├── sensor_values[] (cached ADC)  [~10KB]
│   ├── timers[] (active timers)      [~5KB]
│   └── state_machine[]               [~5KB]
├── Telemetry buffer                 [~10KB]
└── Available for app logic           [~240KB]
```

**Advantages**:
- ✅ Fast evaluation (no JSON parsing each cycle)
- ✅ Efficient memory usage
- ✅ Real-time execution capability

---

## 📡 REST API for Automation Management

### Current State: GET /status
Returns telemetry (sensor data, PWM states, GPIO states)

### NEW: Automation Management Endpoints

#### 1. **GET /automation** - Retrieve Current Automation
```http
GET /automation HTTP/1.1
Host: h2o-tower.local:8443

Response: 200 OK
Content-Type: application/octet-stream
Body: [compressed automation JSON]
```

**Response Structure**:
```c
typedef struct {
    uint32_t version;           // Automation format version
    uint32_t timestamp_unix;    // When uploaded
    uint16_t checksum;          // CRC16 for validation
    uint8_t num_rungs;          // Number of automation rules
    uint8_t enabled;            // Is automation running?
    uint16_t size_bytes;        // Uncompressed size
    // [JSON data follows]
} pds_automation_header_t;
```

#### 2. **POST /automation/upload** - Upload New Automation
```http
POST /automation/upload HTTP/1.1
Host: h2o-tower.local:8443
Content-Type: application/octet-stream
Content-Length: 2048

[automation JSON binary data]
```

**Request Validation**:
```c
enum pds_automation_status {
    PDS_AUTOMATION_OK,              // Stored successfully
    PDS_AUTOMATION_INVALID_JSON,    // JSON parse error
    PDS_AUTOMATION_INVALID_SCHEMA,  // Missing required fields
    PDS_AUTOMATION_TOO_LARGE,       // Exceeds NVS space
    PDS_AUTOMATION_STORAGE_ERROR,   // NVS write failed
    PDS_AUTOMATION_CHECKSUM_MISMATCH, // CRC verification failed
};
```

**Response**:
```json
{
    "status": "OK",
    "message": "Automation uploaded successfully",
    "rungs_loaded": 5,
    "size_bytes": 2048,
    "checksum": "0xA1B2C3D4",
    "loaded_at": 1707000000,
    "activation": "immediate" or "on_next_boot"
}
```

#### 3. **POST /automation/reload** - Reload from Storage
```http
POST /automation/reload HTTP/1.1
Host: h2o-tower.local:8443
Content-Type: application/json

{}
```

**Purpose**: If firmware detects corruption, this forces reload from NVS

**Response**:
```json
{
    "status": "reloaded",
    "rungs_loaded": 5,
    "timestamp": 1707000000
}
```

#### 4. **POST /automation/reset** - Clear Automation
```http
POST /automation/reset HTTP/1.1
Host: h2o-tower.local:8443
Content-Type: application/json

{}
```

**Purpose**: Clear stored automation (requires password or admin token)

#### 5. **POST /automation/validate** - Pre-validate Without Storing
```http
POST /automation/validate HTTP/1.1
Host: h2o-tower.local:8443
Content-Type: application/octet-stream

[automation JSON binary data]
```

**Response**:
```json
{
    "valid": true,
    "schema_version": "1.0",
    "rungs": 5,
    "pins_required": {
        "ADC": [3, 7, 11],
        "GPIO_OUT": [5, 6, 10, 12, 13, 14, 16],
        "GPIO_IN": [4],
        "PWM": [2, 8, 9, 15]
    },
    "conflicts": [],
    "warnings": []
}
```

---

## 🔄 Device-Side Implementation

### Boot Sequence

```c
void app_main(void) {
    // 1. Initialize NVS
    nvs_flash_init();
    
    // 2. Load pins from config (hardware definition)
    pds_device_pins_init();
    
    // 3. LOAD AUTOMATION from NVS
    pds_automation_t *automation = pds_automation_load_from_nvs();
    if (automation == NULL) {
        // First boot or cleared: use default/empty automation
        ESP_LOGW(TAG, "No automation found, using defaults");
        automation = pds_automation_create_default();
    } else {
        ESP_LOGI(TAG, "Automation loaded: %d rungs", automation->num_rungs);
    }
    
    // 4. Validate automation against pins
    if (!pds_automation_validate(automation, pds_global_pin_def_table)) {
        ESP_LOGE(TAG, "Automation validation failed!");
        // Fall back to safe state
        automation = pds_automation_create_default();
    }
    
    // 5. Initialize runtime execution engine
    pds_automation_runtime_t *runtime = pds_automation_runtime_create(automation);
    
    // 6. Start main loop
    while (true) {
        // 6a. Read sensors
        pds_telemetry_collect();
        
        // 6b. EXECUTE AUTOMATION
        pds_automation_execute(runtime);  // <-- RUN LADDER LOGIC
        
        // 6c. Broadcast telemetry
        pds_network_send_telemetry();
        
        vTaskDelay(pdMS_TO_TICKS(100)); // 100ms scan cycle
    }
}
```

### Runtime Execution Loop

```c
void pds_automation_execute(pds_automation_runtime_t *runtime) {
    pds_automation_t *automation = runtime->automation;
    
    // Scan through rungs sequentially (top to bottom)
    for (int i = 0; i < automation->num_rungs; i++) {
        pds_rung_t *rung = &automation->rungs[i];
        
        if (!rung->enabled) {
            continue;  // Skip disabled rungs
        }
        
        // Evaluate condition
        bool condition_met = pds_automation_evaluate_condition(rung->condition);
        
        // Check timers (for cycle timers, time-of-day, etc.)
        if (!pds_automation_check_timers(rung)) {
            condition_met = false;
        }
        
        // Execute action if condition is true
        if (condition_met) {
            pds_automation_execute_action(rung->action);
            
            // Log execution
            ESP_LOGI(TAG, "Rung %d executed: %s", i, rung->name);
            runtime->rung_exec_count[i]++;
        }
    }
}
```

### Condition Evaluation

```c
bool pds_automation_evaluate_condition(pds_condition_t *condition) {
    switch (condition->type) {
        case PDS_COND_ADC_THRESHOLD:
            // Compare ADC reading against threshold
            uint16_t adc_value = pds_telemetry_get_adc(condition->pin);
            if (condition->operator == PDS_OP_LESS_THAN) {
                return adc_value < condition->threshold;
            } else if (condition->operator == PDS_OP_GREATER_THAN) {
                return adc_value > condition->threshold;
            }
            // ... other operators
            break;
            
        case PDS_COND_GPIO_STATE:
            // Check GPIO input state
            uint8_t gpio_state = pds_telemetry_get_gpio(condition->pin);
            return gpio_state == condition->expected_state;
            
        case PDS_COND_AND:
            // All sub-conditions must be true
            for (int i = 0; i < condition->num_operands; i++) {
                if (!pds_automation_evaluate_condition(&condition->operands[i])) {
                    return false;
                }
            }
            return true;
            
        case PDS_COND_OR:
            // At least one sub-condition must be true
            for (int i = 0; i < condition->num_operands; i++) {
                if (pds_automation_evaluate_condition(&condition->operands[i])) {
                    return true;
                }
            }
            return false;
            
        case PDS_COND_TIMER_CYCLE:
            // Check repeating timer (e.g., 2min on, 1min off)
            return pds_automation_check_cycle_timer(condition);
            
        case PDS_COND_TIMER_TIME_OF_DAY:
            // Check if current time matches (e.g., 6:00 AM daily)
            return pds_automation_check_time_of_day(condition);
            
        default:
            return false;
    }
}
```

### Action Execution

```c
void pds_automation_execute_action(pds_action_t *action) {
    switch (action->type) {
        case PDS_ACTION_GPIO_SET:
            // Set GPIO pin high or low
            pds_device_gpio_set(action->pin, action->value);
            break;
            
        case PDS_ACTION_PWM_SET:
            // Set PWM duty cycle
            pds_device_pwm_set(action->pin, 
                               action->duty_cycle_percent, 
                               action->frequency_hz);
            break;
            
        case PDS_ACTION_SEQUENCE:
            // Execute multiple actions in order
            for (int i = 0; i < action->num_sub_actions; i++) {
                pds_automation_execute_action(&action->sub_actions[i]);
                vTaskDelay(pdMS_TO_TICKS(10)); // Small delay between actions
            }
            break;
            
        case PDS_ACTION_TIMER_PULSE:
            // Turn on for duration, then off
            pds_device_gpio_set(action->pin, 1);
            vTaskDelay(pdMS_TO_TICKS(action->duration_ms));
            pds_device_gpio_set(action->pin, 0);
            break;
            
        case PDS_ACTION_LOG_EVENT:
            // Log event with severity level
            ESP_LOG_LEVEL(action->severity, TAG, action->message);
            break;
    }
}
```

### Storage Functions

```c
// Save automation to NVS
esp_err_t pds_automation_save_to_nvs(pds_automation_t *automation) {
    nvs_handle_t handle;
    esp_err_t err = nvs_open("h2o_automation", NVS_READWRITE, &handle);
    if (err != ESP_OK) return err;
    
    // Serialize automation to JSON
    char *json_str = pds_automation_to_json_string(automation);
    
    // Compress JSON
    uint8_t *compressed = pds_compress_deflate(json_str);
    size_t compressed_size = strlen((char*)compressed);
    
    // Calculate checksum
    uint32_t checksum = crc32_calculate(compressed, compressed_size);
    
    // Store in NVS
    nvs_set_blob(handle, "automation_json", compressed, compressed_size);
    nvs_set_u32(handle, "automation_checksum", checksum);
    nvs_set_u32(handle, "automation_version", PDS_AUTOMATION_VERSION);
    nvs_commit(handle);
    nvs_close(handle);
    
    free(json_str);
    free(compressed);
    return ESP_OK;
}

// Load automation from NVS
pds_automation_t* pds_automation_load_from_nvs(void) {
    nvs_handle_t handle;
    esp_err_t err = nvs_open("h2o_automation", NVS_READONLY, &handle);
    if (err != ESP_OK) return NULL;
    
    // Get size
    size_t required_size = 0;
    nvs_get_blob(handle, "automation_json", NULL, &required_size);
    if (required_size == 0) {
        nvs_close(handle);
        return NULL;
    }
    
    // Read compressed data
    uint8_t *compressed = malloc(required_size);
    nvs_get_blob(handle, "automation_json", compressed, &required_size);
    
    // Verify checksum
    uint32_t stored_checksum = 0;
    nvs_get_u32(handle, "automation_checksum", &stored_checksum);
    uint32_t calculated_checksum = crc32_calculate(compressed, required_size);
    
    if (stored_checksum != calculated_checksum) {
        ESP_LOGE(TAG, "Automation checksum mismatch!");
        nvs_close(handle);
        free(compressed);
        return NULL;
    }
    
    // Decompress
    char *json_str = (char*)pds_decompress_inflate(compressed);
    
    // Parse from JSON
    pds_automation_t *automation = pds_automation_from_json_string(json_str);
    
    nvs_close(handle);
    free(compressed);
    free(json_str);
    return automation;
}
```

---

## 🔐 Security Considerations

### Checksum Validation
- All automation files include CRC32 checksum
- Device validates on load from NVS
- Corrupted files trigger fallback to safe state

### Access Control
- Upload requires HTTPS (TLS encryption)
- Optional: API key or certificate pinning
- Device admin password for sensitive operations

### Watchdog Timeout
- If automation loop takes > 5 seconds, device reboots
- Prevents infinite loops or stuck conditions

### Safe Mode
- If automation validation fails, device uses default/empty automation
- Manual override via GPIO or REST API

---

## 📝 Workflow Example: User Updates Automation at Runtime

### Scenario: Change Mist Cycle from 3min to 5min

**Step 1: Edit in LadderLogicEditor**
```
User opens aeroponics-basic.json
Changes rung_003 cycle_seconds: 180 → 300 (5 minutes)
Exports new automation_updated.json
```

**Step 2: Export to PDS**
```bash
node tools/ladder_to_pds_config.js automation_updated.json
# Output: PDS-ConfigTools/roles/aeroponics/control-pipelines/updated.json
```

**Step 3: Upload to Device (NEW FLOW)**
```bash
curl -X POST --https-insecure \
  -H "Content-Type: application/octet-stream" \
  --data-binary @automation_updated.json \
  https://h2o-tower.local:8443/automation/upload
```

**Response**:
```json
{
    "status": "OK",
    "message": "Automation uploaded successfully",
    "rungs_loaded": 4,
    "size_bytes": 2048,
    "activation": "immediate"
}
```

**Step 4: Device Executes New Automation**
```
Device receives POST /automation/upload
Validates JSON against schema
Compresses and stores to NVS
Reloads automation in runtime
Next scan cycle: 5-minute mist pattern active
```

**Step 5: NO NEED to rebuild firmware!**
- Device continues running
- New automation takes effect immediately
- Old automation stays safe in NVS backup
- Can revert if needed: `POST /automation/reset`

---

## 🎯 Comparison: Before vs After

### BEFORE (Current PDS Approach)
```
Change Automation Rule
    ↓
Edit ladder logic file
    ↓
Re-export to PDS JSON
    ↓
Rebuild firmware (slow!)
    ↓
Flash device (requires USB/serial)
    ↓
Device reboots
    ↓
Automation active
```
⏱️ **Time: 2-5 minutes**

### AFTER (New OTA Approach)
```
Change Automation Rule
    ↓
Edit ladder logic file
    ↓
Export to PDS JSON
    ↓
POST to device via HTTPS
    ↓
Device stores in NVS
    ↓
Automation active immediately
```
⏱️ **Time: 5-10 seconds**

---

## 📊 Data Structures

### AutomationPipeline Version in PDS

**Current PDS Structure**:
```c
// In PDS-ConfigTools/roles/<role>/config.json
{
  "role_name": "aeroponics",
  "automation_pipeline": {
    "version": "1.0",
    "rungs": [...]
  }
}
```

**New Structure (Device-Friendly)**:
```c
// In device firmware
typedef struct {
    uint32_t version;                      // Schema version
    uint32_t num_rungs;                    // Number of automation rules
    pds_rung_t *rungs;                     // Array of rungs
    pds_pin_def_t *pin_table;             // Pin definitions
    uint32_t scan_cycle_ms;                // 100ms typical
    uint32_t watchdog_timeout_ms;          // 5000ms typical
    bool logging_enabled;                  // For debugging
} pds_automation_pipeline_t;

// Each rung contains
typedef struct {
    uint32_t id;                           // Unique ID
    char name[64];                         // Rung name
    pds_condition_t condition;             // When to execute
    pds_action_t action;                   // What to do
    bool enabled;                          // Is it active?
    bool retentive;                        // Stay active until cleared?
    uint32_t scan_rate_ms;                 // Override scan rate
} pds_rung_t;
```

---

## 🔧 Integration Points

### LadderLogicEditor → PDS-ConfigTools
```
aeroponics-basic.json (LLE format)
    ↓ pds-export-plugin.js
PDS control-pipelines.json (PDS format)
```

### PDS-ConfigTools → Device
```
roles/aeroponics/control-pipelines.json
    ↓ REST API POST /automation/upload
Device NVS storage
    ↓ Runtime execution
Telemetry feedback via GET /status
```

---

## ✅ Checklist: What Needs Implementation

### LadderLogicEditor Side
- [ ] Export automation to JSON format
- [ ] Validate against schema (pds-validator.js)
- [ ] Implement pds-export-plugin.js
- [ ] Create conversion tool (ladder_to_pds_config.js)

### Device Side
- [ ] HTTP POST /automation/upload endpoint
- [ ] HTTP GET /automation endpoint
- [ ] Automation load/save to NVS
- [ ] Automation validation at boot
- [ ] Runtime execution loop integration
- [ ] Condition evaluation engine
- [ ] Action execution engine
- [ ] Timer management (cycle, time-of-day)
- [ ] Error handling & safe mode

### PDS-BuildTools Side
- [ ] Embed automation pipeline in firmware
- [ ] Generate default/fallback automation
- [ ] Document automation compilation process

### Documentation
- [ ] User guide: Creating automation in LLE
- [ ] Device API docs: /automation endpoints
- [ ] Developer guide: Adding new conditions/actions
- [ ] Troubleshooting: Automation not executing

---

## 📚 Related Files

- **LadderLogicEditor examples**: `examples/aeroponics-*.json`
- **Device firmware**: `Device/H2O-DEV-12102025/main/H2O_device_automation.c`
- **REST API**: `PROTOCOL.md` (update with new endpoints)
- **PDS docs**: `PDS-ConfigTools/docs/automation.md`

---

**Authority**: Device/H2O-DEV-12102025/AI-INSTRUCT.md (automation subsystem)  
**Status**: Architecture Designed, Implementation Ready  
**Date**: February 2, 2026
