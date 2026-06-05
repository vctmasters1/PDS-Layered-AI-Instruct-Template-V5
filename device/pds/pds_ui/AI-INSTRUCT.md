# pds_ui/ — UI Parameters Subsystem (Layer 4)

**This file is the single authoritative source for the L4 / pds_ui subsystem.**

---

## Contents

| § | What's here |
|---|-------------|
| [Role of pds_ui](#role-of-pds_ui) | What pds_ui does and what it is not |
| [Layer Model (all four layers)](#layer-model-all-four-layers) | L1/L2/L3/L4 layer definitions |
| [L4 Binary Format](#l4-binary-format) | Binary encoding of ui_params blob |
| [SSD1306 OLED Device Data](#ssd1306-oled-device-data) | OLED display parameters and config |
| [Firmware Architecture](#firmware-architecture) | How pds_ui fits into firmware at runtime |
| [pds_ui Public API](#pds_ui-public-api) | Public function signatures |
| [CMake Wiring](#cmake-wiring) | How to wire pds_ui into a build |
| [Telemetry Key Format Reference](#telemetry-key-format-reference) | Telemetry key naming rules |
| [L4 NVS Key](#l4-nvs-key) | NVS key for the L4 blob |
| [Flash Partition](#flash-partition) | Which flash partition L4 uses |
| [blob_packer.py — L4 Packing](#blob_packerpy--l4-packing) | How the Python packer generates L4 binaries |
| [role-data.js — PERIPHERAL_TYPES entry](#role-datajs--peripheral_types-entry) | How role-data.js references the OLED peripheral |
| [VS Code Extension — OLED Panel](#vs-code-extension--oled-panel) | Extension panel for OLED preview |
| [Adding a New UI Device Type — Checklist](#adding-a-new-ui-device-type--checklist) | Step-by-step checklist |

## Role of pds_ui

`pds_ui` is a **display-output-only subsystem** that runs independently of the pipeline engine.
It loads the Layer 4 (L4) `ui_params` blob at boot, initialises each registered UI device, and
drives a render loop separate from the pipeline tick.

**It is NOT a pipeline component.** No block type IDs. No L3 settings. No `pds_block_registry`
entries. No `pds_fb_*` naming.

---

## Layer Model (all four layers)

| Layer | Blob name  | NVS key     | Contains |
|-------|-----------|-------------|----------|
| L1    | pipeline  | `pipeline`  | Block type IDs, pipeline topology |
| L2    | hw_vars   | `hw_vars`   | Per-block pin assignments |
| L3    | settings  | `settings`  | Per-block settings_t structs |
| **L4** | **ui_params** | **`ui_params`** | **Per-device UI layout parameters** |

L1–L3 are owned by `pds_pipeline/`. L4 is owned exclusively by `pds_ui/`.

---

## L4 Binary Format

### Header (8 bytes)

```c
typedef struct {
    uint32_t magic;       // 0x50445534  ('P','D','S','4')
    uint8_t  version;     // PDS_UI_L4_VERSION = 1
    uint8_t  dev_count;   // number of per-device records that follow
    uint16_t _pad;
} pds_ui_l4_hdr_t;        // 8 bytes
```

### Per-device record (8-byte record header + variable data)

```c
typedef struct {
    uint32_t periph_id_hash;  // FNV-1a hash of peripheral string ID (from role JSON)
    uint8_t  dev_type;        // pds_ui_dev_type_t
    uint8_t  _pad;
    uint16_t data_len;        // byte count of the device-specific data that follows
} pds_ui_dev_hdr_t;           // 8 bytes
// Immediately followed by data_len bytes of device-specific params.
```

```c
typedef enum {
    PDS_UI_DEV_OLED_SSD1306 = 0x01,  // I2C SSD1306 128×32 or 128×64
    // 0x02+ reserved for future devices (TFT, LED matrix, etc.)
} pds_ui_dev_type_t;
```

Firmware iterates records at boot, matches `periph_id_hash` to the peripheral it owns, and
dispatches to the correct `pds_ui_<device>_init()` function.

---

## SSD1306 OLED Device Data

### Hardware config (8 bytes)

```c
typedef struct {
    uint8_t  i2c_addr;    // 0x3C or 0x3D
    int8_t   pin_sda;     // GPIO number (from peripheral definition)
    int8_t   pin_scl;
    uint8_t  flip;        // 1 = rotate 180°
    uint16_t refresh_ms;  // render interval (minimum 50 ms)
    uint16_t cycle_ms;    // screen A↔B cycle interval; 0 = no cycling
} pds_ui_oled_hw_t;       // 8 bytes
```

### Element (48 bytes)

```c
typedef enum {
    PDS_UI_ELEM_NONE  = 0,  // slot unused
    PDS_UI_ELEM_LABEL = 1,  // static text string (prefix field only)
    PDS_UI_ELEM_VALUE = 2,  // telemetry value with optional prefix + format
    PDS_UI_ELEM_BAR   = 3,  // progress bar scaled to [range_min, range_max]
    PDS_UI_ELEM_HLINE = 4,  // horizontal rule (x=start, width=length, y=row)
} pds_ui_oled_elem_type_t;

typedef enum {
    PDS_UI_FONT_6x8   = 0,  // 6px wide, 8px tall  — 21 chars/row, 4 rows (128×32)
    PDS_UI_FONT_8x8   = 1,  // 8px wide, 8px tall  — 16 chars/row, 4 rows
    PDS_UI_FONT_8x16  = 2,  // 8px wide, 16px tall — 16 chars/row, 2 rows
    PDS_UI_FONT_16x16 = 3,  // 16px wide, 16px tall — 8 chars/row, 2 rows
} pds_ui_oled_font_t;

typedef enum {
    PDS_UI_FMT_F2   = 0,  // %.2f  — two decimal places
    PDS_UI_FMT_F1   = 1,  // %.1f
    PDS_UI_FMT_F0   = 2,  // %.0f  — integer displayed as float
    PDS_UI_FMT_INT  = 3,  // %d    — cast to int
    PDS_UI_FMT_BOOL = 4,  // "ON" / "OFF"
    PDS_UI_FMT_PCT  = 5,  // "%.0f%%" — percentage
} pds_ui_oled_fmt_t;

typedef struct {
    uint8_t  type;        //  1  pds_ui_oled_elem_type_t
    uint8_t  x;           //  1  pixel column (0–127)
    uint8_t  y;           //  1  pixel row    (0–31 for 128×32)
    uint8_t  font;        //  1  pds_ui_oled_font_t
    uint8_t  fmt;         //  1  pds_ui_oled_fmt_t  (VALUE/BAR)
    uint8_t  width;       //  1  BAR: pixel width (0 = full remaining width)
    uint8_t  _pad[2];     //  2
    float    range_min;   //  4  BAR: source value that maps to 0%
    float    range_max;   //  4  BAR: source value that maps to 100%
    char     prefix[8];   //  8  LABEL/VALUE: static text before value (null-terminated)
    char     tel_key[24]; // 24  telemetry sink key e.g. "periph:4:velocity_rpm"
} pds_ui_oled_elem_t;     // 48 bytes (naturally aligned)
```

### Full OLED device data layout

```
pds_ui_oled_hw_t  (8 bytes)
pds_ui_oled_elem_t  screen[2][PDS_UI_OLED_MAX_ELEMS]
```

With `PDS_UI_OLED_MAX_ELEMS = 8`: `8 + 2 × 8 × 48 = 776 bytes` per OLED device.

---

## Firmware Architecture

### One driver, N instances

`pds_ui_oled.c` is a **single C file** with a **single set of functions**.
Each OLED instance gets its own heap-allocated `_pds_ui_oled_ctx_t`.

```
pds_ui_oled.c  ──→  pds_ui_oled_init()  ──→  ctx_0 (oled_0)
                                         ──→  ctx_1 (oled_1)
```

Identical to the `pds_fb_*` pattern: one implementation, many context pointers.

### Context

```c
typedef struct {
    pds_ui_oled_hw_t      hw;
    pds_ui_oled_elem_t    screens[2][PDS_UI_OLED_MAX_ELEMS];
    const float          *tel_ptrs[2][PDS_UI_OLED_MAX_ELEMS]; // resolved at init
    uint8_t               framebuf[2][512];  // double buffer (512 bytes = 128×32 / 8)
    uint8_t               active_screen;     // 0 or 1 — currently displayed
    i2c_master_dev_handle_t i2c_dev;
    uint64_t              last_render_us;
    uint64_t              last_cycle_us;
    bool                  initialized;
} _pds_ui_oled_ctx_t;
```

### Double buffer / screen flip

- `framebuf[0]` maps to GDDRAM rows 0–31 (display start line `0x40|0`)
- `framebuf[1]` maps to GDDRAM rows 32–63 (display start line `0x40|32`)
- Render always draws into `framebuf[1 - active_screen]`
- On render complete: DMA/I2C write back buffer to GDDRAM; issue `0x40 | ((1-active_screen)*32)`; toggle `active_screen`

### Telemetry pointer resolution

In `pds_ui_oled_init()`, for each element:
```c
ctx->tel_ptrs[s][e] = pds_tel_sink_lookup(ctx->screens[s][e].tel_key);
// Returns NULL if key not yet registered — render shows "---"
```

`pds_tel_sink_lookup()` is a O(N) scan of the registered sink array using `strcmp`.
It is called **once at init** — the result pointer is stored in ctx and reused every render tick.

---

## pds_ui Public API

```c
// pds_ui.h

// Call once from pds_platform_main.c after pipeline init.
// Parses the L4 blob, inits all UI devices found in it.
esp_err_t pds_ui_init(const uint8_t *l4_blob, size_t l4_len,
                       const pds_ui_periph_map_t *periph_map, uint8_t periph_count);

// Call on every main loop iteration. Drives render timers for all devices.
void pds_ui_tick(void);
```

The `periph_map` is a flat array pairing `periph_id_hash` values with their resolved
I2C/GPIO hardware configs. This is generated at pack time from the role's `peripherals[]`
array and embedded as a compact lookup table.

---

## CMake Wiring

`pds_ui` is a standalone ESP-IDF component. Add it to `PRIV_REQUIRES` in
`Device/pds/pds_hal/platform/<target>/common/pds_platform_main.c`'s component CMakeLists.txt.

```cmake
# Device/pds/pds_ui/CMakeLists.txt
idf_component_register(
    SRCS "pds_ui.c" "pds_ui_oled.c"
    INCLUDE_DIRS "include"
    PRIV_REQUIRES driver pds_hal pds_network
)
```

Fonts are included as a header (`pds_ui_fonts.h`) — no separate component needed.

---

## Telemetry Key Format Reference

Keys registered by `pds_fb_*` blocks via `pds_tel_sink_register()`:

| Block type      | Key format                  | Example               |
|-----------------|-----------------------------|-----------------------|
| sensor_dht22_temp | `"periph:<pin>:temp_c"`   | `"periph:5:temp_c"`   |
| sensor_dht22_humid | `"periph:<pin>:humidity"` | `"periph:5:humidity"` |
| sensor_ph       | `"periph:<pin>:ph_value"`   | `"periph:3:ph_value"` |
| sensor_ec       | `"periph:<pin>:ec_value"`   | `"periph:3:ec_value"` |
| encoder_position | `"periph:<pin_a>:position"` | `"periph:4:position"` |
| encoder_velocity | `"periph:<pin_a>:velocity_rpm"` | `"periph:4:velocity_rpm"` |
| encoder_mapped   | `"periph:<pin_a>:mapped"`   | `"periph:5:mapped"`   |
| sensor_hx711    | `"periph:<pin_clk>:weight"` | `"periph:6:weight"`   |
| pwm_output      | `"pwm:<pin_pwm>:duty_pct"`  | `"pwm:10:duty_pct"`   |

`<pin>` is always the **primary data pin** (the first pin registered by that block).
This key is used verbatim in `pds_ui_oled_elem_t.tel_key`.

---

## L4 NVS Key

L4 is stored in the `pds_config` NVS namespace under the key `"ui_params"`:

```csv
pds_config,namespace,,
ui_params,file,binary,<role_id>_l4.bin
```

It is loaded at boot in `pds_platform_main.c` alongside L1/L2/L3:

```c
pds_device_nvs_read_blob("pds_config", "ui_params", &l4_buf, &l4_len);
pds_ui_init(l4_buf, l4_len, periph_map, periph_count);
```

---

## Flash Partition

`pds_l4` is a dedicated 64 KB flash partition (same size as L1/L2/L3), type `data`,
subtype `0x44`. It sits between `pds_l3` and `pds_log` in the partition table.

Generated by `PDS-Role/tools/blob_packer.py → pack_l4()` alongside L1/L2/L3.
Output file: `<role_id>_l4.bin` in `PDS-BuildTools/dist/defaults/<role_id>/`.

---

## blob_packer.py — L4 Packing

`blob_packer.py` packs L4 by iterating over `role_json["peripherals"]` and selecting
those of type `"oled_ssd1306"`. For each OLED peripheral:

1. Hash its string `id` with FNV-1a → `periph_id_hash`
2. Build `pds_ui_oled_hw_t` from peripheral `pins` + `config`
3. Build `pds_ui_oled_elem_t[2][8]` from the peripheral's `screens[0..1].elements[]`
   — resolve each element's `tel_source` field into the `tel_key` string verbatim
4. Append `pds_ui_dev_hdr_t + pds_ui_oled_hw_t + elements[]` to the L4 blob

See `blob_packer.py §pack_l4()` for implementation.

---

## role-data.js — PERIPHERAL_TYPES entry

OLED devices appear in `PERIPHERAL_TYPES` (not `PDS_FB_BLOCKS`):

```js
{
  id: 'oled_ssd1306',
  label: 'OLED SSD1306 128×32',
  category: 'display',
  pin_slots: [
    { name: 'pin_sda', cap: 'GPIO', label: 'SDA' },
    { name: 'pin_scl', cap: 'GPIO', label: 'SCL' },
  ],
  config: [
    { name: 'i2c_addr',    type: 'uint8',  default: 0x3C },
    { name: 'flip',        type: 'bool',   default: false },
    { name: 'refresh_ms',  type: 'uint16', default: 250 },
    { name: 'cycle_ms',    type: 'uint16', default: 0 },
  ],
  ui_params: true,  // signals to role editor: render OLED screen designer panel
}
```

No `signals` array — OLED is sink-only. No `PDS_FB_BLOCKS` entry.

---

## VS Code Extension — OLED Panel

The role editor renders a special panel for peripherals with `ui_params: true`.

The panel is implemented in `role-webview-script.js` `renderOledPanel()` and stored
in the peripheral's role JSON under `peripherals[i].ui_params`:

```json
{
  "id": "oled_0",
  "type": "oled_ssd1306",
  "pins": { "pin_sda": 6, "pin_scl": 7 },
  "config": { "i2c_addr": 60, "flip": false, "refresh_ms": 250, "cycle_ms": 5000 },
  "ui_params": {
    "screens": [
      {
        "elements": [
          { "type": "value", "x": 0, "y": 0, "font": "6x8",
            "prefix": "pH:", "tel_source": "periph:3:ph_value", "fmt": "f2" },
          { "type": "bar", "x": 0, "y": 24, "font": "6x8",
            "tel_source": "pwm:10:duty_pct", "width": 80,
            "range_min": 0.0, "range_max": 100.0, "fmt": "f0" }
        ]
      },
      { "elements": [] }
    ]
  }
}
```

---

## Adding a New UI Device Type — Checklist

1. Add `pds_ui_<device>.h` + `pds_ui_<device>.c` in `pds_ui/`
2. Add `PDS_UI_DEV_<DEVICE>` enum value in `pds_ui.h`
3. Add dispatch case in `pds_ui.c → _dispatch_init()`
4. Add packer in `blob_packer.py → pack_l4()` (device-specific struct builder)
5. Add peripheral type in `role-data.js` with `ui_params: true`
6. Add panel renderer in `role-webview-script.js`
7. Update this AI-INSTRUCT.md with the new device type's data layout
