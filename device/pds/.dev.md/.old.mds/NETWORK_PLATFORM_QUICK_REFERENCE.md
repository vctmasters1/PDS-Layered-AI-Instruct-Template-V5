# Network Platform Architecture - Quick Reference

**Last Updated**: December 27, 2025

## One-Minute Summary

All network platform implementations (WiFi, BLE, HTTPS, mDNS) are now organized in the HAL architecture:

```
✅ pds_hal/platform/esp32_node32s/common/pds_network_platform_esp32.c
✅ pds_hal/platform/esp32c3_sm/common/pds_network_platform_esp32c3.c
```

**Why**: Consistent with all other platform drivers (GPIO, ADC, PWM, SPI)

---

## For Developers

### Finding Network Platform Code

**Looking for WiFi implementation?**
```
esp32:   pds_hal/platform/esp32_node32s/common/pds_network_platform_esp32.c
esp32c3: pds_hal/platform/esp32c3_sm/common/pds_network_platform_esp32c3.c
```

**Looking for generic network interface?**
```
pds_network/include/pds_network_platform.h
```

### Adding New Platform

1. Create directory: `pds_hal/platform/{newplatform}/common/`
2. Create file: `pds_network_platform_{newplatform}.c`
3. Implement 20 functions from `pds_network_platform.h`
4. Update `pds_network/CMakeLists.txt` to add new platform case
5. Update `pds_hal/CMakeLists.txt` to include new drivers

### Build Platform Selection

```bash
# Automatic - CMake selects based on IDF_TARGET
idf.py set-target esp32c3
python zBuildDev.py    # Uses ESP32-C3 implementation
```

**Build logs show**:
```
[pds_network] Using platform implementation:
    .../pds_hal/platform/esp32c3_sm/common/pds_network_platform_esp32c3.c
```

---

## File Organization Pattern

```
Generic Interface:     pds_network/include/pds_network_platform.h
                       ├─ platform-agnostic, 20 function declarations

Platform Implementation:
ESP32                  pds_hal/platform/esp32_node32s/common/pds_network_platform_esp32.c
ESP32-S3               pds_hal/platform/esp32_node32s/common/pds_network_platform_esp32.c (same)
ESP32-C3               pds_hal/platform/esp32c3_sm/common/pds_network_platform_esp32c3.c

High-Level Wrappers:   pds_network/
                       ├─ pds_wifi.c (calls platform layer)
                       ├─ pds_provisioning.c (calls platform layer)
                       ├─ pds_https_server.c (calls platform layer)
                       └─ CMakeLists.txt (includes platform implementation)
```

---

## The 20 Functions

### WiFi (6 functions)
- `pds_network_platform_wifi_init(event_cb)`
- `pds_network_platform_wifi_connect(ssid, password)`
- `pds_network_platform_wifi_is_connected()`
- `pds_network_platform_wifi_get_ip(buffer, len)`
- `pds_network_platform_wifi_disconnect()`
- `pds_network_platform_wifi_deinit()`

### BLE Provisioning (5 functions)
- `pds_network_platform_ble_is_available()`
- `pds_network_platform_ble_prov_init(event_cb)`
- `pds_network_platform_ble_prov_start()`
- `pds_network_platform_ble_prov_stop()`
- `pds_network_platform_ble_prov_deinit()`

### HTTPS Server (4 functions)
- `pds_network_platform_https_server_init(request_cb, port)`
- `pds_network_platform_https_send_response(status, content_type, data, len)`
- `pds_network_platform_https_server_stop()`
- `pds_network_platform_https_server_deinit()`

### mDNS (3 functions)
- `pds_network_platform_mdns_init(hostname, service_name, port)`
- `pds_network_platform_mdns_stop()`
- `pds_network_platform_mdns_deinit()`

### Configuration (3 functions)
- `pds_network_platform_get_wifi_config()`
- `pds_network_platform_get_ble_config()`
- `pds_network_platform_get_https_config()`

---

## Platform Capabilities Comparison

| Feature | ESP32/S3 | ESP32-C3 |
|---------|----------|----------|
| Cores | 2 (Xtensa) | 1 (RISC-V) |
| WiFi | Yes | Yes (6) |
| BLE | Yes (5.0) | Yes (5.2) |
| Stack Size | 8KB | 6KB |
| HTTP Sockets | 10 | 5 |
| HTTPS | Yes | Yes |
| mDNS | Yes | Yes |

---

## Build Configuration Files

### pds_hal/CMakeLists.txt
- Defines `PLATFORM_DIR` mapping (IDF_TARGET → directory name)
- Exports `PDS_HAL_PLATFORM_DIR` for child components
- Includes platform drivers from `platform/{platform}/common/`

### pds_network/CMakeLists.txt
- Auto-detects platform from IDF_TARGET
- References platform implementation from `../pds_hal/platform/`
- Includes with other network modules

---

## Key Differences: ESP32 vs ESP32-C3

| Aspect | ESP32 | ESP32-C3 |
|--------|-------|----------|
| **Stack Size** | 8KB (dual-core) | 6KB (single-core) |
| **Max Sockets** | 10 concurrent | 5 concurrent |
| **Architecture** | Xtensa dual-core | RISC-V single-core |
| **Task Priority** | `tskIDLE_PRIORITY + 4` | Same (single core) |
| **BLE Version** | 5.0 | 5.2 |
| **Power** | ~160mA active | ~40mA active |
| **API** | Identical (drop-in compatible) | Identical (drop-in compatible) |

---

## Where Things Live

### Network Platform Code
```
pds_hal/platform/esp32c3_sm/common/pds_network_platform_esp32c3.c
                  ^^^^^^^^^ ^^^^^^
                  Platform  Type (ESP32-C3 board)
```

### Other Platform Drivers  
```
pds_hal/platform/esp32c3_sm/common/pds_gpio_esp32c3.c
pds_hal/platform/esp32c3_sm/common/pds_adc_esp32c3.c
pds_hal/platform/esp32c3_sm/common/pds_pwm_esp32c3.c
```

### High-Level APIs
```
pds_network/pds_wifi.c              (high-level WiFi)
pds_network/pds_provisioning.c      (high-level BLE)
pds_network/pds_https_server.c      (high-level HTTPS)
```

---

## Documentation Files

| File | Location | Content |
|------|----------|---------|
| **PLATFORM_FILE_ORGANIZATION.md** | `pds_hal/` | Complete architecture (1000+ lines) |
| **NETWORK_FILES_REORGANIZATION.md** | `pds_hal/` | Reorganization details (800+ lines) |
| **NETWORK_PLATFORM_REORGANIZATION_COMPLETE.md** | `pds/` | Summary with verification (1200+ lines) |
| **NETWORK_PLATFORM_QUICK_REFERENCE.md** | `pds/` | This file (quick reference) |

---

## Common Tasks

### Task: Build for ESP32-C3
```bash
cd Device/H2O-DEV-12102025
idf.py set-target esp32c3
python ../../zBuildDev.py
```
**Result**: Uses `pds_network_platform_esp32c3.c`

### Task: Build for ESP32
```bash
cd Device/H2O-DEV-12102025
idf.py set-target esp32
python ../../zBuildDev.py
```
**Result**: Uses `pds_network_platform_esp32.c`

### Task: Find WiFi Implementation
Search: `pds_hal/platform/*/common/pds_network_platform_*.c`  
Then: Open `pds_network_platform_wifi_init()` function

### Task: Understand Build Flow
1. Read: `pds_hal/CMakeLists.txt` (sets PLATFORM_DIR)
2. Read: `pds_network/CMakeLists.txt` (references HAL platform)
3. Look: `pds_hal/PLATFORM_FILE_ORGANIZATION.md` (architecture diagram)

---

## Verification

✅ Both platform files exist in correct location  
✅ Build system references correct paths  
✅ All 20 functions implemented in both versions  
✅ API identical across platforms  
✅ Documentation complete  

---

**See Also**: 
- Full architecture: [PLATFORM_FILE_ORGANIZATION.md](pds_hal/PLATFORM_FILE_ORGANIZATION.md)
- Reorganization details: [NETWORK_FILES_REORGANIZATION.md](pds_hal/NETWORK_FILES_REORGANIZATION.md)
- Complete summary: [NETWORK_PLATFORM_REORGANIZATION_COMPLETE.md](NETWORK_PLATFORM_REORGANIZATION_COMPLETE.md)

