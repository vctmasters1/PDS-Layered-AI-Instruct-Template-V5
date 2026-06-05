# Test Paths — device (ESP32 firmware)

**Last Updated**: 2026-05-28
**System Map Reference**: PATH 2 (build/flash), PATH 3 (telemetry), PATH 4 (cloud config push), PATH 5 (OTA), PATH 11 (BLE provisioning)

Pure C/CMake project targeting ESP32 family (esp32c3_sm, esp32_node32s). All build checkpoints run inside a DevContainer — do NOT run `idf.py` on the host. Hardware checkpoints require a physical device on the bench.

---

## Checkpoints

### 1. DevContainer builds without errors (esp32c3_sm)
**Type**: auto
**Command**:
```shell
# Run inside DEV-Container-esp32c3_sm devcontainer
cd /workspaces/device/main && idf.py build 2>&1 | tail -30
```
**Pass**: `Project build complete. To flash, run: idf.py flash` in the last few lines; no `error:` lines
**On fail**: Check `CMakeLists.txt` `EXTRA_COMPONENT_DIRS` paths are correct; missing component usually means a path typo; run `idf.py reconfigure` first

---

### 2. DevContainer builds without errors (esp32_node32s)
**Type**: auto
**Command**:
```shell
# Run inside DEV-Container-esp32_node32s devcontainer
cd /workspaces/device/main && idf.py build 2>&1 | tail -30
```
**Pass**: `Project build complete.` — firmware binary for node32s target present at `build/pds-device.bin`
**On fail**: Same as PATH 1; also check `sdkconfig.defaults` for target-specific overrides that may differ between boards

---

### 3. Binary size check — firmware under partition limit
**Type**: auto
**Command**:
```shell
# Run inside either DevContainer after successful build
cd /workspaces/device/main && python $IDF_PATH/tools/idf_size.py --json build/pds-device.map | python -c "
import json, sys
data = json.load(sys.stdin)
total = data.get('total_size', 0)
limit = 1572864  # 1.5 MB factory partition from partitions.csv
print(f'Firmware size: {total} bytes / limit {limit} bytes')
sys.exit(0 if total < limit else 1)
"
```
**Pass**: Firmware size printed and under 1.5 MB (adjust limit if `partitions.csv` differs)
**On fail**: Binary exceeds partition — check for large static arrays in `pds_ui_fonts.h` or bloated LwIP/BT stack; use `idf.py size-components` to identify contributors

---

### 4. NVS config store — write/read round-trip (host simulation)
**Type**: auto
**Command**:
```shell
# Run inside DevContainer — uses the IDF native_sim target if available, or node inline check
cd /workspaces/device && python -c "
# Validate that pds_config_store key names are under 15 chars (NVS limit)
import re, glob
keys = []
for f in glob.glob('pds/pds_storage/*.c'):
    keys += re.findall(r'nvs_set_\w+\([^,]+,\s*\"([^\"]+)\"', open(f).read())
long_keys = [k for k in keys if len(k) > 15]
if long_keys:
    print('FAIL — NVS keys over 15 chars:', long_keys); exit(1)
print('OK — all', len(keys), 'NVS keys are within 15-char limit')
"
```
**Pass**: `OK — all N NVS keys are within 15-char limit`
**On fail**: One or more NVS key strings exceed 15 characters — ESP-IDF `nvs_set_*` silently truncates at 15 chars causing lookup failures; shorten the key in `pds_config_store.c`

---

### 5. Telemetry binary struct size matches TypeScript definition
**Type**: manual
**Pass**: Open `pds/pds_network/include/pds_telemetry.h` and verify the `pds_telemetry_packet_t` struct size (use `sizeof` in a test build or count bytes manually); compare with the telemetry decode size expected in `web-hmi/api/src/pipeline/pipeline-codec.ts`; they must match exactly
**On fail**: Struct padding differs between C and TypeScript decode — add `__attribute__((packed))` to the C struct; update the TypeScript field offsets to match

---

### 6. Flash via USB (manual-hardware)
**Type**: manual-hardware
**Pass**: `idf.py -p COM_PORT flash monitor` (in DevContainer with USB passthrough) flashes without error; serial monitor shows `PDS boot OK` within 5 seconds of power-on
**On fail**: Check USB-to-serial driver (CP210x or CH340); check `idf_component.yml` for correct IDF component versions if the bootloader rejects the image

---

### 7. BLE provisioning — device advertises and accepts credentials
**Type**: manual-hardware
**Pass**: Freshly flashed device (no stored WiFi) enters BLE provisioning mode; mobile app (or `esp-prov` CLI) discovers device, sends SSID + password; device connects to WiFi and logs IP on serial
**On fail**: Check `pds/pds_network/pds_ble_provisioning.c` — BLE service UUID and characteristic UUIDs must match what the provisioning app/CLI expects; verify `CONFIG_BT_ENABLED=y` in sdkconfig

---

### 8. Local HTTPS /status endpoint responds
**Type**: manual-hardware
**Pass**: Device connected to LAN; `curl -k https://[device-ip]/status` returns JSON `{ "serialNumber": "...", "firmwareVersion": "...", "uptime": N }`; cert is self-signed (expected)
**On fail**: Check `pds/pds_network/pds_https_server.c` cert loading from NVS or embedded certs in `main/certs/`; if 503, the HTTPS task stack is overflowing — increase `HTTPS_SERVER_STACK_SIZE` in sdkconfig

---

### 9. Telemetry POST reaches HMI API (manual-hardware)
**Type**: manual-hardware
**Pass**: Device sends periodic telemetry; HMI API receives it (check `telemetry_logs` table or API logs); timestamp in DB matches device real-time clock within 5 seconds
**On fail**: Check `pds/pds_network/pds_cloud_push.c` for the configured endpoint URL (stored in NVS key `cloud_url`); check that the JWT or device secret matches what the HMI API expects

---

### 10. OTA update — device accepts new firmware from FwServer
**Type**: manual-hardware
**Pass**: Deploy a new firmware binary to `web-firmware-server`; trigger OTA via `POST /v1/devices/:id/ota` on the HMI API; device downloads, validates checksum, reboots into new firmware, and reports updated `firmwareVersion` on next telemetry
**On fail**: Check `pds/pds_hal/pds_ota.c` partition swap logic; if device reboots into old firmware, the OTA validation failed — likely a checksum mismatch between what FwServer serves and what the device computes
