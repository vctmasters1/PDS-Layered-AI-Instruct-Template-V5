# Device Storage Allocation for Runtime Configuration

**Date**: April 16, 2026  
**Device**: ESP32-C3 (2 MB Flash)  
**Purpose**: Allocate storage for PDS_TELCONF_PINMAP, LADDER, and USRSET

---

## Storage Requirements Summary

| Config | Min | Max | Storage Type |
|--------|-----|-----|--------------|
| **PINMAP** | 8 B | 4,104 B | NVS Namespace |
| **LADDER** | 16 B | 4,112 B | NVS Namespace |
| **USRSET** | 8 B | 2,312 B | NVS Namespace |
| **Total** | 32 B | 10,528 B | ~11 KB |

All three configurations fit comfortably in NVS Flash partition.

---

## ESP32-C3 Flash Partition Overview

### Current Configuration
- **Total Flash**: 2 MB (2,097,152 bytes)
- **Partition Table**: Custom `memorymap.csv` (from `PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/`)
- **Default Allocation**:
  ```
  Offset    Size        Name        Type
  --------  ----------  ----------  ----
  0x0000    0x1000      bootloader  Bootloader
  0x8000    0x200       pt          Partition table
  0x10000   ~1.8 MB     factory     App binary
  0x1D0000  remaining   (free)      Available
  ```

### Available Partition Schemes

**Option 1: Use Default Partitions (No Custom CSV)**
- ✅ No custom partition file needed
- ✅ Standard ESP-IDF defaults work
- ❌ No explicit NVS size control
- ⚠️ Risk: App grows → NVS gets squeezed

**Option 2: Create Custom Partitions.csv** ← RECOMMENDED
- ✅ Explicit control over all partitions
- ✅ Guarantee NVS size for configs
- ✅ Clear space allocation
- ✅ Easy to document and adjust

---

## Recommended Partition Layout (2 MB Flash)

The partition table is defined in the platform configuration and copied to Device/main for building.

**Source**: `PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/memorymap.csv`

```csv
# ESP32-C3 2MB Partition Table
# Name,   Type,   SubType,  Offset,  Size,      Flags
nvs,      data,   nvs,      0x9000,  0x5000,    ,     # NVS: 20 KB (WiFi + PDS configs)
otadata,  data,   ota,      0xe000,  0x2000,    ,     # OTA: 8 KB
app0,     app,    ota_0,    0x10000, 0x1a0000,  ,     # App: 1664 KB (ample for firmware)
app1,     app,    ota_1,    0x1b0000, 0x1a0000, ,     # OTA app: 1664 KB (reserved for updates)
ffat,     data,   fat,      0x360000, 0xa0000,  ,     # FATFS: 640 KB (future use)
```

### How to Enable Custom Partitions (Phase 3)

**Step 1: Copy Platform Partition Table**
```bash
# From project root
cp PDS-HwPlatform/platforms/esp32c3/hwrev_001/aeroponics_core/memorymap.csv Device/main/partitions.csv
```

**Step 2: Enable Custom Partition in sdkconfig**
```
idf.py menuconfig
→ Partition Table → Custom partition CSV file
→ Set: "partitions.csv"
→ Save & exit
```

Or edit `Device/main/sdkconfig`:
```
CONFIG_PARTITION_TABLE_TYPE_CUSTOM=y
CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="partitions.csv"
```

**Step 3: Rebuild**
```bash
idf.py clean
idf.py build
idf.py -p COM3 flash
```

**Note**: Partition table is maintained in the platform directory (`PDS-HwPlatform/platforms/`). Future builds will read platform directory directly without needing to copy the file.
```

---

## NVS Storage Strategy

### NVS Namespace Design

The device uses **NVS (Non-Volatile Storage)** for all three configurations:

```c
// NVS Key-Value pairs for runtime config
nvs_handle_t handle;
nvs_open("pds_config", NVS_READWRITE, &handle);

// Store PINMAP
nvs_set_blob(handle, "pinmap", pinmap_buffer, pinmap_size);

// Store LADDER
nvs_set_blob(handle, "ladder", ladder_buffer, ladder_size);

// Store USRSET
nvs_set_blob(handle, "usrset", usrset_buffer, usrset_size);

// Store checksums for validation
nvs_set_u32(handle, "pinmap_crc", crc32_pinmap);
nvs_set_u32(handle, "ladder_crc", crc32_ladder);
nvs_set_u32(handle, "usrset_crc", crc32_usrset);

nvs_commit(handle);
nvs_close(handle);
```

### NVS Partition Size Analysis

- **NVS Partition Size**: 20 KB (0x5000 bytes)
- **NVS Overhead**: ~2 KB (header, wear leveling)
- **Available for Data**: ~18 KB
- **Requirements**: 11 KB + checksums
- **Headroom**: 7 KB (safe margin)

### Safe Limits

```
NVS (20 KB total)
├─ Overhead (2 KB)
├─ PINMAP (4.1 KB)      ← Max 32 pins × 128 bytes
├─ LADDER (4.1 KB)      ← Max 4 KB bytecode
├─ USRSET (2.3 KB)      ← Max 64 settings × 36 bytes
├─ Checksums (12 B)
└─ Reserved (7 KB)      ← Wear leveling + margin
```

---

## Device Code Implementation

### 1. NVS Handler Functions

Create `Device/pds/pds_storage/pds_config_store.h`:

```c
#ifndef PDS_CONFIG_STORE_H
#define PDS_CONFIG_STORE_H

#include <nvs_flash.h>
#include "pds_telemetry_types.h"
#include "esp_err.h"

/**
 * Initialize NVS for runtime config storage
 */
esp_err_t pds_config_store_init(void);

/**
 * Save PINMAP configuration to NVS
 */
esp_err_t pds_config_save_pinmap(const pds_telconf_pinmap_t *pinmap);

/**
 * Load PINMAP from NVS
 */
esp_err_t pds_config_load_pinmap(pds_telconf_pinmap_t *pinmap);

/**
 * Save LADDER bytecode to NVS
 */
esp_err_t pds_config_save_ladder(const pds_telconf_ladder_t *ladder);

/**
 * Load LADDER from NVS
 */
esp_err_t pds_config_load_ladder(pds_telconf_ladder_t *ladder);

/**
 * Save user settings to NVS
 */
esp_err_t pds_config_save_usrset(const pds_telconf_usrset_t *usrset);

/**
 * Load user settings from NVS
 */
esp_err_t pds_config_load_usrset(pds_telconf_usrset_t *usrset);

/**
 * Erase all runtime configs (factory reset)
 */
esp_err_t pds_config_erase_all(void);

/**
 * Get NVS stats (used/free space)
 */
typedef struct {
    size_t used_entries;
    size_t free_entries;
    size_t total_entries;
    size_t namespace_count;
} pds_config_stats_t;

esp_err_t pds_config_get_stats(pds_config_stats_t *stats);

#endif
```

### 2. Main Initialization

In `Device/main/main.c`:

```c
// Initialize NVS early
esp_err_t ret = nvs_flash_init();
if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_LOGW(TAG, "NVS flash needs erase, formatting...");
    ESP_ERROR_CHECK(nvs_flash_erase());
    ret = nvs_flash_init();
}
ESP_ERROR_CHECK(ret);

// Initialize config storage
ESP_ERROR_CHECK(pds_config_store_init());

// Load runtime configurations from NVS
pds_telconf_pinmap_t pinmap;
pds_telconf_ladder_t ladder;
pds_telconf_usrset_t usrset;

ret = pds_config_load_pinmap(&pinmap);
if (ret == ESP_ERR_NVS_NOT_FOUND) {
    ESP_LOGW(TAG, "PINMAP not found in NVS, waiting for HMI upload...");
} else {
    ESP_LOGI(TAG, "Loaded PINMAP with %d pins", pinmap.num_pins);
}

ret = pds_config_load_ladder(&ladder);
if (ret == ESP_ERR_NVS_NOT_FOUND) {
    ESP_LOGW(TAG, "LADDER not found in NVS, no automation active");
}

ret = pds_config_load_usrset(&usrset);
if (ret == ESP_ERR_NVS_NOT_FOUND) {
    ESP_LOGW(TAG, "USRSET not found, using defaults");
}
```

### 3. HTTPS POST /config Handler

The existing `/config` handler needs to detect packet type and route appropriately:

```c
// In pds_https_server.c
static esp_err_t config_post_handler(httpd_req_t *req) {
    uint8_t buffer[4112];  // Max size needed
    int ret = httpd_req_recv(req, (char*)buffer, sizeof(buffer));
    
    if (ret <= 0) {
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }
    
    // Detect packet type by size and structure
    if (ret >= sizeof(pds_telconf_pinmap_t) && 
        *(uint16_t*)buffer == 0x0001) {  // version field
        
        pds_telconf_pinmap_t *pinmap = (pds_telconf_pinmap_t*)buffer;
        if (pinmap->pins[0].pin_number <= 31) {  // Valid pin number field
            // This is a PINMAP packet
            esp_err_t err = pds_config_save_pinmap(pinmap);
            if (err == ESP_OK) {
                httpd_resp_sendstr(req, "PINMAP saved");
            } else {
                httpd_resp_send_500(req);
            }
            return err;
        }
    }
    
    // ... similar logic for LADDER and USRSET
    
    httpd_resp_send_400(req);
    return ESP_FAIL;
}
```

---

## Storage Statistics for ESP32-C3 (2 MB)

```
Total Flash:        2,097,152 bytes (2.0 MB)

Bootloader:              4,096 bytes (0.2%)  0x0000-0x0FFF
Partition Table:           512 bytes (0.0%)  0x8000-0x81FF
──────────────────────────────────────────────────────────
Allocated:              4,608 bytes

NVS (for WiFi + configs): 20,480 bytes (1.0%)  0x9000-0xDFFF
OTA Data:                 8,192 bytes (0.4%)  0xE000-0xFFFF
App Firmware:        1,703,936 bytes (81.2%)  0x10000-0x1AFFFF
App OTA binary:     1,703,936 bytes (81.2%)  0x1B0000-0x2AFFFF (optional)
FATFS:                  655,360 bytes (31.3%)  0x360000-0x3FFFFF (reserved)
──────────────────────────────────────────────────────────
Total Used:         2,097,152 bytes (100%)

Available for Runtime Config in NVS:
  Total NVS:          20,480 bytes
  Overhead:            2,048 bytes (10%)
  Available:          18,432 bytes
  
  Used by TELCONF:
    PINMAP max:        4,104 bytes
    LADDER max:        4,112 bytes
    USRSET max:        2,312 bytes
    Checksums:           24 bytes
    ────────────────────────────
    Subtotal:         10,552 bytes (57%)
    
  Reserved:            7,880 bytes (43%)
```

---

## Troubleshooting Storage Issues

### Issue: "NVS is full"
**Solution**: 
1. Check what's stored: Use `nvs_shell` utility
2. Erase NVS: `idf.py erase-otadata` or `esptool.py erase_region 0x9000 0x5000`
3. Factory reset: Add to code `nvs_flash_erase_partition("nvs")`

### Issue: "Not enough space for X"
**Solution**:
1. Create custom partitions.csv with larger NVS (up to 64 KB)
2. Or reduce app binary size (strip symbols, optimize code)
3. Or move data to external PSRAM (if available)

### Issue: Checksums don't match
**Solution**:
1. Validate CRC32 after upload
2. Reject with HTTP 400 if invalid
3. Don't commit to NVS if checksum mismatch

### Issue: Configs persist after erase
**Solution**:
1. Use `nvs_flash_erase()` before `nvs_flash_init()`
2. Or individual erase with key-based delete

---

## Files to Create/Modify

| File | Status | Purpose |
|------|--------|---------|
| [Device/main/partitions.csv](Device/main/partitions.csv) | CREATE | Custom partition table |
| Device/pds/pds_storage/pds_config_store.h | CREATE | NVS handler interface |
| Device/pds/pds_storage/pds_config_store.c | CREATE | NVS handler implementation |
| Device/main/main.c | MODIFY | Initialize NVS + load configs |
| Device/pds/pds_network/pds_https_server.c | MODIFY | Route POST /config to correct handler |

---

## Validation Checklist

- [ ] Partitions.csv created with NVS size ≥ 20 KB
- [ ] Custom partition enabled in sdkconfig
- [ ] NVS handlers implemented (save/load/erase)
- [ ] Main.c initializes NVS before WiFi
- [ ] HTTPS handler saves PINMAP, LADDER, USRSET to separate NVS keys
- [ ] CRC32 checksums validated before commit
- [ ] NVS stats function for debugging
- [ ] Documentation complete

---

## Next Steps

1. **Create partitions.csv** — Define explicit partition layout
2. **Implement NVS handlers** — Save/load configs from flash
3. **Integrate with HTTPS** — Route new packet types to handlers
4. **Test on device** — Verify configs persist across reboot
5. **Add HMI support** — Web/Android upload configs via HTTPS
