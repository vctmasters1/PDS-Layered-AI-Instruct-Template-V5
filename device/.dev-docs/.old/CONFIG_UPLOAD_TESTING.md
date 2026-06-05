# Configuration Upload Testing & Verification Guide

**Status**: 🟢 **READY TO TEST**  
**Target Date**: First integration point  
**Objective**: Verify device can receive, store, and load runtime configurations

---

## Part 1: Integration Checklist

### Step 1.1: Copy Partition Table from Platform

```bash
# From project root
cp PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/memorymap.csv Device/main/partitions.csv
```

**Expected**: `Device/main/partitions.csv` exists and matches the platform version.

### Step 1.2: Update CMakeLists.txt

Edit `Device/main/CMakeLists.txt` to include required components:

```cmake
idf_component_register(
    SRCS
        main.c
        # Add our new files if they're in this component:
    INCLUDE_DIRS
        .
    REQUIRES
        esp_wifi
        nvs_flash
        esp_http_server
        mbedtls
        esp_partition
        esp_crc32          # For pds_config_store.c CRC calculations
        pds_network        # Your network component
        pds_storage        # Config storage component
)
```

**Expected**: CMakeLists.txt builds without errors.

### Step 1.3: Configure Partitions

Edit `Device/main/sdkconfig` (or use `idf.py menuconfig`):

```
CONFIG_PARTITION_TABLE_TYPE_CUSTOM=y
CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="partitions.csv"
```

**Expected**: After menuconfig, check generated sdkconfig contains these lines.

### Step 1.4: Update main.c

Copy the initialization functions from `main_integration_example.c`:

```c
// Add to your Device/main/main.c:
#include "pds_config_store.h"
#include "pds_https_config_handler.h"
#include "pds_telemetry_types.h"

// Global runtime config storage
static pds_telconf_pinmap_t g_runtime_pinmap;
static pds_telconf_ladder_t g_runtime_ladder;
static pds_telconf_usrset_t g_runtime_usrset;
static uint8_t g_config_loaded = 0;

void app_main(void) {
    // ... existing code ...
    
    // Add NVS init before WiFi:
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(pds_config_store_init());
    
    // Load configs:
    g_config_loaded = pds_config_load_all(&g_runtime_pinmap, 
                                          &g_runtime_ladder, 
                                          &g_runtime_usrset);
    
    // Log status:
    if (g_config_loaded & 0x01) ESP_LOGI(TAG, "✓ PINMAP loaded");
    if (g_config_loaded & 0x02) ESP_LOGI(TAG, "✓ LADDER loaded");
    if (g_config_loaded & 0x04) ESP_LOGI(TAG, "✓ USRSET loaded");
    
    // ... continue with WiFi, HTTPS server ...
}
```

**Expected**: main.c compiles without errors.

### Step 1.5: Register HTTPS Handler

Find your HTTPS server initialization code (e.g., in `pds_https_server.c`):

```c
void pds_https_server_init(void) {
    // ... existing server setup ...
    
    httpd_handle_t server = NULL;
    // ... SSL config and httpd_ssl_start() ...
    
    // Register config upload handler:
    httpd_uri_t config_uri = {
        .uri = "/config",
        .method = HTTP_POST,
        .handler = pds_https_config_post_handler,
    };
    httpd_register_uri_handler(server, &config_uri);
    
    ESP_LOGI(TAG, "✓ POST /config registered");
}
```

**Expected**: Server starts without errors and logs handler registration.

---

## Part 2: Build & Flash

### Step 2.1: Clean Build

```bash
cd Device/main
idf.py fullclean
idf.py build
```

**Expected Output**:
```
...
[ 95%] Linking CXX executable main.elf
[100%] Generating main.bin
[100%] Built target main

Build complete! Created main.bin
```

### Step 2.2: Check Partition Table

```bash
idf.py partition-table
```

**Expected Output**:
```
# ESP32 Partition Table
# Name        Type  SubType  Offset   Size      Flags
nvs          data  nvs      0x9000   0x5000
otadata      data  ota      0xe000   0x2000
phy_init     data  phy      0x10000  0x1000
factory      app   factory  0x11000  ...
```

Or for our custom table:
```
# Name              Type  SubType  Offset   Size
bootloader         app   factory  0x0000   0x1000    4K
partition-table    data  pt       0x8000   0x200     512B
nvs                data  nvs      0x9000   0x5000    20K
otadata            data  ota      0xe000   0x2000    8K
app0               app   ota_0    0x10000  0x1b0000  1.7M
app1               app   ota_1    0x1c0000 0x1b0000  1.7M
fatfs              data  fat      0x370000 0xa8000   660K
```

### Step 2.3: Flash Device

```bash
idf.py -p COM3 flash monitor
```

**Expected Serial Output** (substitute COM3 with your port):
```
...
[    15] I (567) APP_MAIN: Initializing NVS Flash
[    15] I (678) NVS: NVS flash initialized on /spiffs
[    15] I (789) APP_MAIN: ✓ NVS flash initialized
[    15] I (890) APP_MAIN: Initializing PDS Config Store
[    15] I (945) PDS_CONFIG_STORE: NVS storage initialized
[    15] I (1001) APP_MAIN: ✓ Config store initialized
[    15] I (1100) APP_MAIN: Loading Runtime Configurations
[    15] W (1200) PDS_CONFIG_STORE: PINMAP not in NVS
[    15] W (1300) PDS_CONFIG_STORE: LADDER not in NVS
[    15] W (1400) PDS_CONFIG_STORE: USRSET not in NVS
[    15] W (1450) APP_MAIN: ✗ PINMAP not in NVS (waiting for HMI upload)
[    15] W (1550) APP_MAIN: ✗ LADDER not in NVS (automation disabled)
[    15] W (1650) APP_MAIN: ✗ USRSET not in NVS (using defaults)
[    15] I (1700) APP_MAIN: NVS Statistics:
[    15] I (1750) APP_MAIN:   Used entries:  0
[    15] I (1850) APP_MAIN:   Free entries:  199
[    15] I (1900) APP_MAIN:   Total entries: 200
[    15] I (2000) APP_MAIN: Initializing WiFi
[    15] I (2100) APP_MAIN: ✓ WiFi initialized
[    15] I (2200) APP_MAIN: Initializing HTTPS Server
[    15] I (2300) APP_HTTPS: HTTPS server started on port 8443
[    15] I (2400) APP_HTTPS:   Registered GET /status
[    15] I (2500) APP_HTTPS:   Registered POST /config
[    15] I (2600) APP_MAIN: System Ready
[    15] I (2700) APP_MAIN: Waiting for HMI configuration upload...
```

**Success Indicators**:
- ✅ NVS initialized
- ✅ Config store initialized
- ✅ HTTPS server running on port 8443
- ✅ Handlers registered
- ✅ Ready for config upload

---

## Part 3: Test Configuration Upload

### Test 3.1: Generate Test PINMAP Binary

Create a minimal test packet (e.g., in Python):

```python
import struct

# Create a minimal PINMAP: 1 pin
pinmap = bytearray()

# Header
pinmap.extend(struct.pack('<II', 1, 0))  # num_pins, reserved

# Pin entry (128 bytes)
pin_entry = bytearray(128)
# pin_number, gpio, mode, scale, offset, min_val, max_val, name...
pin_entry[0:1] = struct.pack('B', 1)  # GPIO 1
pin_entry[1:2] = struct.pack('B', 1)  # Mode: OUTPUT
pin_entry[2:6] = struct.pack('<f', 1.0)  # Scale
pin_entry[6:10] = struct.pack('<f', 0.0)  # Offset
pin_entry[10:14] = struct.pack('<f', 0.0)  # Min
pin_entry[14:18] = struct.pack('<f', 100.0)  # Max
pin_entry[18:50] = b'TestPin'.ljust(32, b'\x00')  # Name (32 bytes)

pinmap.extend(pin_entry)

# Write to file
with open('test_pinmap.bin', 'wb') as f:
    f.write(pinmap)

print(f"Created test_pinmap.bin: {len(pinmap)} bytes")
```

**Expected Output**:
```
Created test_pinmap.bin: 136 bytes
```

### Test 3.2: Upload PINMAP via curl

```bash
curl -X POST \
  -H "Content-Type: application/octet-stream" \
  --data-binary @test_pinmap.bin \
  https://h2o-tower.local:8443/config \
  -k  # -k = skip SSL cert verification (self-signed cert)
```

**Expected HTTP Response**:
```json
{"status":"ok","type":"pinmap","pins":1}
```

**Expected Serial Output**:
```
[    15] I (5234) PDS_CONFIG_HANDLER: Processing config upload: 136 bytes
[    15] I (5345) PDS_CONFIG_HANDLER: Detected packet type: PINMAP (136 bytes)
[    15] I (5456) PDS_CONFIG_HANDLER: Validating PINMAP: 1 pins
[    15] I (5567) PDS_CONFIG_STORE: Saving PINMAP: 1 pins
[    15] I (5678) PDS_CONFIG_STORE: Computed CRC32: 0x12345678
[    15] I (5789) PDS_CONFIG_HANDLER: ✓ PINMAP saved successfully
```

### Test 3.3: Check Status Endpoint

```bash
curl https://h2o-tower.local:8443/status -k
```

**Expected Response**:
```json
{
  "status": "ok",
  "config_loaded": 1,
  "pinmap": true,
  "ladder": false,
  "usrset": false
}
```

### Test 3.4: Reboot and Verify Persistence

```bash
# In monitor window, press Ctrl+T then Ctrl+R to trigger reboot
# Or press the hardware reset button
```

**Expected Serial Output** (after reboot):
```
[    15] I (123) APP_MAIN: Initializing NVS Flash
[    15] I (234) APP_MAIN: ✓ NVS flash initialized
[    15] I (345) APP_MAIN: Initializing PDS Config Store
[    15] I (456) APP_MAIN: ✓ Config store initialized
[    15] I (567) APP_MAIN: Loading Runtime Configurations
[    15] I (678) APP_MAIN: ✓ PINMAP loaded: 1 pins, 128 bytes
[    15] I (789) APP_MAIN: ✗ LADDER not in NVS
[    15] I (890) APP_MAIN: ✗ USRSET not in NVS
[    15] I (901) APP_MAIN: NVS Statistics:
[    15] I (945) APP_MAIN:   Used entries:  3
[    15] I (1001) APP_MAIN:   Free entries:  196
```

**Success**: PINMAP persisted across reboot! ✅

---

## Part 4: Test Error Conditions

### Test 4.1: Invalid Packet (Too Small)

```bash
# Send 50 bytes (too small for any config type)
dd if=/dev/zero bs=1 count=50 | curl -X POST \
  -H "Content-Type: application/octet-stream" \
  --data-binary @- \
  https://h2o-tower.local:8443/config \
  -k
```

**Expected HTTP Response**:
```json
{"status":"error","message":"Packet too small"}
```

**Expected Serial Log**:
```
E (5234) PDS_CONFIG_HANDLER: Packet rejected: invalid size (50 bytes)
```

### Test 4.2: Oversized Packet

```bash
# Send 8000 bytes (exceeds all config types)
dd if=/dev/zero bs=1 count=8000 | curl -X POST \
  -H "Content-Type: application/octet-stream" \
  --data-binary @- \
  https://h2o-tower.local:8443/config \
  -k
```

**Expected HTTP Response**:
```json
{"status":"error","message":"Packet too large"}
```

### Test 4.3: Corrupted Data (Bad CRC during Load)

Manually corrupt the saved PINMAP in NVS:

```c
// Add to main.c for testing:
void test_corrupt_nvs(void) {
    nvs_handle_t handle;
    nvs_open(PDS_CONFIG_NAMESPACE, NVS_READWRITE, &handle);
    
    // Change stored CRC to invalid value
    nvs_set_u32(handle, PDS_CONFIG_KEY_PINMAP_CRC, 0xDEADBEEF);
    nvs_commit(handle);
    nvs_close(handle);
    
    ESP_LOGW(TAG, "NVS corrupted for testing");
}
```

Then reboot:

**Expected Serial Output**:
```
E (1234) PDS_CONFIG_STORE: PINMAP CRC mismatch! Expected 0xDEADBEEF, got 0x12345678
W (1345) APP_MAIN: ✗ PINMAP CRC failed (data corrupted?)
```

---

## Part 5: Automated Test Script

Create `test_config_upload.sh`:

```bash
#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

DEVICE_IP="h2o-tower.local"
DEVICE_PORT="8443"
BASE_URL="https://${DEVICE_IP}:${DEVICE_PORT}"

echo -e "${YELLOW}=== PDS Config Upload Test Suite ===${NC}"

# Test 1: Check server is up
echo -e "\n${YELLOW}Test 1: Server connectivity${NC}"
if curl -s -k "${BASE_URL}/status" > /dev/null; then
    echo -e "${GREEN}✓ Server is up${NC}"
else
    echo -e "${RED}✗ Server is down${NC}"
    exit 1
fi

# Test 2: Check initial status (no configs)
echo -e "\n${YELLOW}Test 2: Initial status${NC}"
INITIAL=$(curl -s -k "${BASE_URL}/status")
echo "Response: ${INITIAL}"

# Test 3: Upload PINMAP
echo -e "\n${YELLOW}Test 3: Upload PINMAP${NC}"
if [ -f "test_pinmap.bin" ]; then
    RESPONSE=$(curl -s -X POST -k \
        -H "Content-Type: application/octet-stream" \
        --data-binary @test_pinmap.bin \
        "${BASE_URL}/config")
    echo "Response: ${RESPONSE}"
    
    if echo ${RESPONSE} | grep -q "pinmap"; then
        echo -e "${GREEN}✓ PINMAP upload successful${NC}"
    else
        echo -e "${RED}✗ PINMAP upload failed${NC}"
    fi
else
    echo -e "${YELLOW}⚠ File test_pinmap.bin not found, skipping${NC}"
fi

# Test 4: Check status after upload
echo -e "\n${YELLOW}Test 4: Status after config${NC}"
AFTER=$(curl -s -k "${BASE_URL}/status")
echo "Response: ${AFTER}"

echo -e "\n${YELLOW}=== Test Suite Complete ===${NC}"
```

Run it:

```bash
chmod +x test_config_upload.sh
./test_config_upload.sh
```

---

## Part 6: Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Connection refused" | HTTPS server not running | Check serial log for HTTPS init error |
| "SSL certificate problem" | Self-signed cert | Use curl `-k` flag |
| "Packet too small" | PINMAP binary < 136 bytes | Ensure packet includes header + pin entries |
| "Invalid packet type" | Size doesn't match any config | Check packet struct size calculations |
| "CRC mismatch on load" | Data corrupted or struct changed | Verify struct definitions match |
| "NVS is full" | Too much stored in NVS | Reduce number of pins or delete other keys |
| "PINMAP not loaded on reboot" | Saved with wrong CRC | Clear NVS and re-upload |

---

## Part 7: Validation Checklist

After completing all tests above, verify:

- [ ] **Build**: `idf.py build` succeeds without warnings
- [ ] **Flash**: Device flashes successfully
- [ ] **Boot**: Serial shows "System Ready"
- [ ] **Connectivity**: Can reach `/status` endpoint
- [ ] **Upload**: PINMAP upload returns success
- [ ] **Persistence**: Config loads after reboot
- [ ] **Error Handling**: Invalid packets rejected gracefully
- [ ] **Logging**: All operations logged to serial
- [ ] **Performance**: Config operations complete in < 500ms
- [ ] **Storage**: NVS stats show reasonable usage

---

## Next Steps (After Validation)

1. **HMI Integration**
   - TypeScript code to generate PINMAP binary from Pinleaf JSON
   - React component for config upload UI
   - Error handling and retry logic

2. **Device Runtime Engines**
   - Bytecode executor for LADDER automation
   - Variable engine for PINMAP I/O mappings
   - Settings engine for USRSET thresholds

3. **End-to-End Testing**
   - Create PINMAP in Pinleaf → export to JSON
   - HMI converts JSON → binary → uploads to device
   - Device loads and verifies
   - Runtime executes automation logic

---

## Quick Reference

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/status` | GET | Check config load state | JSON with booleans |
| `/config` | POST | Upload PINMAP/LADDER/USRSET | JSON success/error |

| Serial Debug Command | Effect |
|----------------------|--------|
| Ctrl+T, Ctrl+R | Reboot device |
| Ctrl+] Q | Exit monitor |
| Grep "PDS_CONFIG" | Filter config logs |
| Grep "HTTPS" | Filter server logs |
