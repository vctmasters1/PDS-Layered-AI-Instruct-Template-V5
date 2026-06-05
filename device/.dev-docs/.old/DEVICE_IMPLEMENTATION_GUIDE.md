# Device Configuration Upload Integration Guide

**Date**: April 16, 2026  
**Status**: 🟢 **IMPLEMENTATION READY**  
**Files Created**: 
- `pds_config_store.c` - NVS storage handlers
- `pds_https_config_handler.c` - HTTPS POST handler
- `memorymap.csv` - Partition table (in PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/)

---

## Quick Start: 3 Steps to Enable Configuration Upload

### Step 1: Copy Partition Table & Enable Custom Partitions

Copy partition table from platform directory to Device/main:

```bash
cp PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/memorymap.csv Device/main/partitions.csv
```

Edit `Device/main/CMakeLists.txt`:

```cmake
idf_component_register(
    SRCS
        main.c
    INCLUDE_DIRS
        .
    REQUIRES
        esp_wifi
        nvs_flash
        esp_http_server
        mbedtls
        esp_partition
        pds_network     # Your networking component
        pds_storage     # NVS storage handlers
)
```

Edit `Device/main/sdkconfig` (or via `idf.py menuconfig`):

```
CONFIG_PARTITION_TABLE_TYPE_CUSTOM=y
CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="partitions.csv"
```

**Note**: Platform-specific partition tables are defined in `PDS-HwPlatform/platforms/` and copied to Device/main for building. Future builds will use platform directories directly.

### Step 2: Initialize NVS in main.c

Add to your main initialization (before WiFi setup):

```c
#include "nvs_flash.h"
#include "pds_config_store.h"
#include "pds_telemetry_types.h"

void app_main(void) {
    // Initialize NVS
    ESP_LOGI(TAG, "Initializing NVS flash...");
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "NVS flash needs formatting");
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);
    
    // Initialize PDS config storage
    ESP_ERROR_CHECK(pds_config_store_init());
    
    // Load runtime configurations
    pds_telconf_pinmap_t pinmap;
    pds_telconf_ladder_t ladder;
    pds_telconf_usrset_t usrset;
    
    uint8_t loaded = pds_config_load_all(&pinmap, &ladder, &usrset);
    
    if (loaded & 0x01) {
        ESP_LOGI(TAG, "✓ Loaded PINMAP: %d pins", pinmap.num_pins);
    } else {
        ESP_LOGW(TAG, "✗ PINMAP not found (waiting for HMI upload)");
    }
    
    if (loaded & 0x02) {
        ESP_LOGI(TAG, "✓ Loaded LADDER: %lu bytes", ladder.payload_size);
    } else {
        ESP_LOGW(TAG, "✗ LADDER not found (no automation)");
    }
    
    if (loaded & 0x04) {
        ESP_LOGI(TAG, "✓ Loaded USRSET: %d settings", usrset.num_settings);
    } else {
        ESP_LOGW(TAG, "✗ USRSET not found (using defaults)");
    }
    
    // ... continue with WiFi setup, HTTPS server, etc.
}
```

### Step 3: Register HTTPS POST /config Handler

In your HTTPS server setup (e.g., `pds_network.c`):

```c
#include "pds_https_config_handler.h"

void pds_https_server_init(void) {
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.stack_size = 8192;
    config.port = 8443;  // HTTPS port
    
    // ... TLS setup ...
    
    httpd_handle_t server;
    ESP_ERROR_CHECK(httpd_ssl_start(&server, &config));
    
    // Register existing endpoints
    httpd_uri_t status_uri = {
        .uri = "/status",
        .method = HTTP_GET,
        .handler = pds_https_status_handler,
    };
    httpd_register_uri_handler(server, &status_uri);
    
    // Register NEW config upload handler
    httpd_uri_t config_uri = {
        .uri = "/config",
        .method = HTTP_POST,
        .handler = pds_https_config_post_handler,  // Our new handler
    };
    httpd_register_uri_handler(server, &config_uri);
    
    ESP_LOGI(TAG, "HTTPS server started on port 8443");
    ESP_LOGI(TAG, "POST /config ready for configuration uploads");
}
```

---

## Build & Test

### Build
```bash
cd Device/main
idf.py clean
idf.py build
```

### Flash
```bash
idf.py -p COM3 flash monitor
```

### Expected Serial Output
```
I (123) NVS: NVS flash initialized
I (234) PDS_CONFIG_STORE: NVS storage initialized
W (345) PDS_CONFIG_STORE: PINMAP not found in NVS
W (456) PDS_CONFIG_STORE: LADDER not found in NVS
W (567) PDS_CONFIG_STORE: USRSET not found in NVS
I (678) PDS_NETWORK: HTTPS server started on port 8443
I (789) PDS_NETWORK: POST /config ready for configuration uploads
```

---

## Test Configuration Upload

### Using curl (command line)

```bash
# Create a test PINMAP binary
# (In real usage, HMI will generate this)

# Simulate PINMAP upload (minimal test)
curl -X POST -H "Content-Type: application/octet-stream" \
  --data-binary @pinmap.bin \
  https://h2o-tower.local:8443/config \
  -k  # Skip SSL verification (self-signed cert)
```

### Expected Response
If PINMAP upload succeeds:
```json
{"status":"ok","type":"pinmap","pins":1}
```

Serial output:
```
I (1234) PDS_CONFIG_HANDLER: Processing PINMAP upload: 136 bytes
I (1345) PDS_CONFIG_STORE: PINMAP saved to NVS: 1 pins, CRC=0x12345678
I (1456) PDS_CONFIG_HANDLER: PINMAP accepted: 1 pins
```

---

## Debug Commands

### Check NVS Storage Stats

Add to your code:

```c
pds_config_stats_t stats;
pds_config_get_stats(&stats);
ESP_LOGI(TAG, "NVS: %d used, %d free, %d total entries",
    stats.used_entries, stats.free_entries, stats.total_entries);
```

Expected output:
```
I (1234) APP: NVS: 5 used, 95 free, 100 total entries
```

### Verify Loaded Configs

```c
// Check what's loaded
if (pds_config_has_pinmap()) {
    ESP_LOGI(TAG, "✓ PINMAP is stored");
}
if (pds_config_has_ladder()) {
    ESP_LOGI(TAG, "✓ LADDER is stored");
}
if (pds_config_has_usrset()) {
    ESP_LOGI(TAG, "✓ USRSET is stored");
}
```

### Factory Reset

To erase all configs:

```c
ESP_LOGW(TAG, "Factory reset: erasing all runtime configs");
pds_config_erase_all();
```

---

## Architecture Summary

```
┌─────────────────────────────────────────┐
│ HMI (Android/Web)                       │
│ ├─ Generates PINMAP binary             │
│ ├─ Generates LADDER bytecode           │
│ └─ POST /config (binary packet)        │
└────────────────┬────────────────────────┘
                 │ HTTPS
                 ▼
┌─────────────────────────────────────────┐
│ Device (ESP32-C3)                       │
│ ├─ pds_https_config_handler.c          │
│ │  └─ Detects packet type              │
│ │     ├─ PINMAP (136-4104 B)          │
│ │     ├─ LADDER (16-4112 B)           │
│ │     └─ USRSET (44-2312 B)           │
│ │        └─ Routes to handler          │
│ │           └─ pds_config_save_*()     │
│ └─ pds_config_store.c                  │
│    ├─ CRC32 computation                │
│    ├─ NVS save/load                    │
│    └─ Validation                       │
│       └─ Stores in NVS (20 KB)         │
└─────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ Flash Memory (ESP32-C3 2 MB)            │
│ ├─ Bootloader: 4 KB                    │
│ ├─ Partition Table: 512 B              │
│ ├─ NVS: 20 KB                          │
│ │  ├─ WiFi credentials                │
│ │  ├─ PINMAP (4.1 KB)                 │
│ │  ├─ LADDER (4.1 KB)                 │
│ │  ├─ USRSET (2.3 KB)                 │
│ │  └─ CRCs (24 B)                     │
│ ├─ OTA Data: 8 KB                     │
│ ├─ App0: 1.7 MB                       │
│ ├─ App1: 1.7 MB (OTA)                │
│ └─ FATFS: 660 KB                      │
└─────────────────────────────────────────┘
```

---

## File Locations

| Component | File | Status |
|-----------|------|--------|
| NVS Handler API | `Device/pds/pds_storage/include/pds_config_store.h` | ✅ Header created |
| NVS Handler Impl | `Device/pds/pds_storage/pds_config_store.c` | ✅ **IMPLEMENTED** |
| HTTPS Handler | `Device/pds/pds_network/pds_https_config_handler.c` | ✅ **IMPLEMENTED** |
| Partition Table | `Device/main/partitions.csv` | ✅ **CREATED** |
| Main Integration | `Device/main/main.c` | ⏳ Modify (see Step 2 above) |
| HTTPS Server | `Device/pds/pds_network/pds_https_server.c` | ⏳ Modify (see Step 3 above) |

---

## Checklist for Integration

- [ ] Copy `pds_config_store.c` to `Device/pds/pds_storage/`
- [ ] Copy `pds_https_config_handler.c` to `Device/pds/pds_network/`
- [ ] Copy `partitions.csv` to `Device/main/`
- [ ] Add NVS init to main.c (Step 2 above)
- [ ] Register HTTPS handler (Step 3 above)
- [ ] Update CMakeLists.txt to enable custom partitions
- [ ] Update sdkconfig to use custom partition table
- [ ] Build: `idf.py build`
- [ ] Flash: `idf.py flash monitor`
- [ ] Verify serial output shows NVS initialized
- [ ] Test config upload with curl or HMI

---

## Next Steps

1. **HMI Config Generators** (not on device)
   - TypeScript: Convert Pinleaf JSON → PINMAP binary
   - TypeScript: Convert Ladder .st → LADDER bytecode
   - React: Config upload UI components

2. **Device Runtime Engines** (on device, future)
   - Bytecode executor for LADDER
   - Variable engine for PINMAP mappings
   - Settings engine for USRSET application

3. **Testing**
   - Unit tests for NVS handlers
   - Integration tests (device + HMI)
   - End-to-end control flow (sensor → logic → actuator)

---

## Troubleshooting

### Issue: "NVS not found"
**Cause**: First boot, NVS partition is empty  
**Solution**: This is normal. HMI uploads config, then it persists.

### Issue: "Config upload fails with 400"
**Cause**: Packet format not recognized  
**Solution**: Check packet size matches formula:
- PINMAP: 8 + (num_pins × 128)
- LADDER: 16 + payload
- USRSET: 8 + (num_settings × 36)

### Issue: "CRC mismatch"
**Cause**: Data corrupted during upload  
**Solution**: Retry upload. If persistent, erase NVS.

### Issue: "NVS is full"
**Cause**: Something else using NVS  
**Solution**: Reduce other NVS usage or increase NVS partition (max 64 KB).

---

## References

- [DEVICE_STORAGE_ALLOCATION.md](../DEVICE_STORAGE_ALLOCATION.md) — Storage strategy
- [GENERIC_COREBINARY_ARCHITECTURE.md](../GENERIC_COREBINARY_ARCHITECTURE.md) — System design
- [PINLEAF_PARTITION_GENERATION.md](../PINLEAF_PARTITION_GENERATION.md) — Partition calculator
- [pds_telemetry_types.h](pds_network/include/pds_telemetry_types.h) — Struct definitions
