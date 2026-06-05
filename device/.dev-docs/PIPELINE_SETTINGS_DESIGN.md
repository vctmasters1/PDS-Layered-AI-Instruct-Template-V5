# Pipeline Settings Design — Binary 3-Layer Architecture

**Date**: April 21, 2026
**Status**: Planned — pipeline engine not yet implemented

---

## Overview

Automation is described by three binary blobs. Each can be uploaded independently.
The device uses only the pipeline (Layer 1) to navigate Layers 2 and 3 — no names,
no tags, no JSON parser.

| Layer | NVS Key      | Contains                             | Upload frequency          |
|-------|-------------|--------------------------------------|---------------------------|
| 1     | `pipeline`  | Block type list + connection map     | When automation changes   |
| 2     | `hw_vars`   | Pin/hardware assignments per block   | When hardware changes     |
| 3     | `settings`  | Tunable parameter values per block   | Frequently (user adjusts) |

Layers 2 and 3 are **positionally indexed to Layer 1**. The device walks the Layer 1
block list in order, looks up `sizeof(pins_t)` and `sizeof(settings_t)` for each type
from the compiled-in block registry, and steps forward through Layers 2 and 3 accordingly.

> **Cross-layer version safety**: Layer 2 and Layer 3 each carry a `version` byte.
> When Layer 1 is re-uploaded (topology changes), Layers 2 and 3 **must** also be
> re-uploaded in the same transaction. Uploading Layer 3 alone is safe only when the
> pipeline topology (Layer 1) has not changed. The device should reject Layer 2/3 blobs
> whose version does not match the currently stored Layer 1 version.

---

## Layer 1 — Function Pipeline File

A flat `uint8_t[3000]` buffer stored in NVS under key `"pipeline"`.

### Buffer Layout

```
Byte 0:       format_version    (e.g. 0x01 — bumped only if encoding format changes)
Byte 1:       pipeline_version  (monotonic counter, incremented each time topology changes)
Byte 2..end:  packed pipeline streams, rest of buffer = 0xFF
```

### Sentinel / Type ID Map

| Byte   | Meaning                   |
|--------|---------------------------|
| `0x00` | START of a new pipeline   |
| `0x01` | `pds_fb_sensor_analog`    |
| `0x10` | `pds_fb_timer_countdown`  |
| `0x11` | `pds_fb_timer_countup`    |
| `0x12` | `pds_fb_timer_cycle`      |
| `0x20` | `pds_fb_pid_pwm`          |
| `0x30` | `pds_fb_gpio_input`       |
| `0x31` | `pds_fb_gpio_output`      |
| `0x40` | `pds_fb_limit_high`       |
| `0x41` | `pds_fb_limit_low`        |
| `0x50` | `pds_fb_ref`              |
| `0xFE` | END of current pipeline   |
| `0xFF` | Empty flash / end of data |

### Connection Model

Signal flow is **linear and sequential**: each block's primary output feeds the next
block's primary input automatically. The order of type IDs in the stream IS the
wiring diagram. No explicit connection descriptors are needed.

**Fan-out** is achieved with `fb_ref` (`0x50`). A ref block holds a 1-byte index into
the current pipeline's block array (stored in Layer 2 as its entire `pins_t`). During
init its output pointer is set to point at the referenced block's output — no copy, no
tick logic. The host tool inserts ref blocks automatically when it detects a block
driving more than one consumer.

```
Single consumer (no ref needed):
  0x00  0x01  0x40  0x31  0xFE
        sensor → limit → output

Two consumers (ref inserted by host tool):
  0x00  0x01  0x50  0x40  0x50  0x20  0xFE
        sensor  ref  limit  ref  pid
        [0]     [1]  [2]    [3]  [4]
  ref[1].source_idx = 0  →  limit[2] reads sensor output
  ref[3].source_idx = 0  →  pid[4]   reads sensor output
```

### Example

```
Byte:  0     1     2     3     4     5     6     7     8     9     10    11    12   ...
Value: 0x01  0x03  0x00  0x12  0x01  0x40  0x31  0xFE  0x00  0x01  0x20  0xFE  0xFF ...
       ^^^^  ^^^^  ^--- pipeline 0 start              ^--- pipeline 1 start
       fmt   pver  (0x03 = 3rd topology upload)

Pipeline 0: [fb_timer_cycle → fb_sensor_analog → fb_limit_high → fb_gpio_output]
Pipeline 1: [fb_sensor_analog → fb_pid_pwm]
```

### Walking the Buffer (Device Side)

```c
uint8_t *buf = pipeline_blob;
uint8_t format_version   = buf[0];
uint8_t pipeline_version = buf[1];
uint8_t *p = buf + 2;   // skip header

while (*p != 0xFF) {
    assert(*p == 0x00);  // expect pipeline START sentinel
    p++;

    uint8_t type_ids[PDS_MAX_BLOCKS_PER_PIPELINE];
    int n = 0;
    while (*p != 0xFE) {
        type_ids[n++] = *p++;
    }
    p++;  // consume 0xFE

    // type_ids[0..n-1] defines one complete pipeline
    pipeline_build(type_ids, n);
}
```

---

## Layer 2 — Hardware Vars (Pin Assignments)

One `pins_t` struct per block, packed in the same order as Layer 1's type ID sequence.
Blocks with no hardware (e.g. `fb_timer_cycle`, `fb_limit_analog`) contribute 0 bytes.

### Buffer Layout

```
Byte 0:       format_version    (e.g. 0x01)
Byte 1:       pipeline_version  (must match Layer 1 pipeline_version or device refuses to run)
Byte 2..end:  [block_0.pins_t] [block_1.pins_t] ... (only blocks where pins_size > 0)
```

### Navigation

Walk the Layer 1 sentinel stream to collect `type_ids[]`, then step forward.
The pointer advances continuously across all pipelines — it is NOT reset per pipeline:

```c
// ptr starts at hw_vars_blob + 2 and advances across all pipeline_build() calls
for (int i = 0; i < n; i++) {
    const pds_block_type_entry_t *e = registry_lookup(type_ids[i]);
    if (e->pins_size > 0) {
        apply_pins(block_handles[i], ptr);
        ptr += e->pins_size;
    }
}
```

### `pins_t` struct per block type

> **Bootstrap note**: Until the `pins_t`/`settings_t` split refactor is complete, all
> pin fields remain in the combined `settings_t` and `pins_size = 0` for all blocks
> except `fb_ref`. Layer 2 carries only its 2-byte header in this state.

| Block type            | pins_t fields (post-split)                    | pins_size |
|-----------------------|-----------------------------------------------|-----------|
| `fb_sensor_analog`    | `adc_channel` (u8), `pin_power` (i8)         | 2         |
| `fb_gpio_output`      | `pin_output` (u8)                            | 1         |
| `fb_gpio_input`       | `pin_input` (u8)                             | 1         |
| `fb_pid_pwm`          | `pin_pwm` (u8)                               | 1         |
| `fb_timer_cycle`      | —                                             | 0         |
| `fb_timer_countdown`  | —                                             | 0         |
| `fb_timer_countup`    | —                                             | 0         |
| `fb_limit_high/low`   | —                                             | 0         |
| `fb_ref`              | `source_block_idx` (u8)                      | 1         |

---

## Layer 3 — User Settings

One `settings_t` struct per block, packed in the same order as Layer 1's type ID sequence.
Contains only tunable fields — no pin numbers.
Also holds global device-level settings at the front of the buffer.

### Buffer Layout

```
Byte 0:       format_version    (e.g. 0x01)
Byte 1:       pipeline_version  (must match Layer 1 pipeline_version or device refuses to run)
Byte 2..5:    update_rate_ms    (uint32_t, little-endian) — pipeline tick rate in ms
Byte 6:       ble_enabled       (uint8_t, 0 or 1)
Byte 7:       wifi_enabled      (uint8_t, 0 or 1)
Byte 8:       reserved
Byte 9..end:  [block_0.settings_t] [block_1.settings_t] ...
```

### Navigation

Walk the Layer 1 sentinel stream to collect `type_ids[]`, then step forward:

```c
uint8_t *ptr = settings_blob + 9;  // skip global header
for (int i = 0; i < n; i++) {
    const pds_block_type_entry_t *e = registry_lookup(type_ids[i]);
    e->set_settings(block_handles[i], ptr);
    ptr += e->settings_size;
}
```

### Example offset calculation

```
Pipeline:     [fb_sensor_analog,  fb_limit_high,  fb_pid_pwm,  fb_timer_cycle]
settings_size: [S0=24,            S1=8,           S2=36,       S3=20         ]

To reach block[2] (fb_pid_pwm):
    offset = 9 (global header) + S0 + S1 = 9 + 24 + 8 = 41
    ptr = settings_blob + 41
```

**Layer 3 can be uploaded without touching Layers 1 or 2.**
The device re-walks the cached Layer 1 from NVS to recompute all offsets on load.

---

## Block Type Registry (Compiled into Firmware)

The registry is the bridge between the on-wire type ID and the actual C functions/sizes.
It is a compile-time constant table — never sent over the wire.

```c
typedef struct {
    pds_block_type_t   type_id;
    uint16_t           pins_size;       // sizeof(pins_t), 0 if no pins
    uint16_t           settings_size;   // sizeof(settings_t)
    esp_err_t        (*init)(const void *pins, const void *settings,
                             pds_comp_handle_t *out);
    pds_comp_status_t(*run)(pds_comp_handle_t handle);
    void             (*set_settings)(pds_comp_handle_t handle, const void *settings);
    void             (*connect)(pds_comp_handle_t dst, uint8_t to_port,
                                const void *src_ptr);
    const void*      (*output_ptr)(pds_comp_handle_t handle, uint8_t from_port);
} pds_block_type_entry_t;

// Declared in pds_block_registry.c (generated or hand-written once)
extern const pds_block_type_entry_t pds_block_registry[];
extern const uint8_t                pds_block_registry_count;
```

### Port IDs

Each block type defines its input/output port IDs as a small enum.
Port IDs are stable per type and used by the block registry's `connect()` and
`output_ptr()` function pointers. Port 0 is always the primary input/output.

```c
// fb_sensor_analog output ports
typedef enum { FB_SENSOR_ANALOG_OUT_VALUE = 0 } fb_sensor_analog_out_t;

// fb_limit_analog input ports
typedef enum { FB_LIMIT_ANALOG_IN_PV = 0 } fb_limit_analog_in_t;

// fb_pid_pwm input ports
typedef enum { FB_PID_PWM_IN_PV = 0, FB_PID_PWM_IN_ENABLE = 1 } fb_pid_pwm_in_t;
```

---

## `pins_t` / `settings_t` Split

**Current state**: The existing `pds_fb_*` headers mix pin fields and tunable fields
into a single `_settings_t`. For example, `pds_fb_sensor_analog_settings_t` contains
both `adc_channel` (hardware) and `scale_min/max` (tunable).

**Target state**: Each block type has two separate structs:
- `_pins_t` — hardware-only fields, consumed by Layer 2
- `_settings_t` — tunable-only fields, consumed by Layer 3

**Pending refactor**: Split existing `pds_fb_*` settings structs. Until this is done,
the pipeline engine can bootstrap by putting all fields in Layer 3 and leaving Layer 2
as a pass-through.

---

## Upload Independence

| Change wanted                          | Upload Layers |
|----------------------------------------|---------------|
| Tune PID gains, thresholds, timings    | 3 only        |
| Change GPIO/ADC pin assignments        | 2 only        |
| Rewire connections between blocks      | 1 + 2         |
| Add/remove blocks                      | 1 + 2 + 3     |

---

## NVS Storage

```
Namespace: "pds_config"
  Key: "pipeline"     → Layer 1 binary blob
  Key: "pipeline_crc" → uint32_t
  Key: "hw_vars"      → Layer 2 binary blob
  Key: "hw_vars_crc"  → uint32_t
  Key: "settings"     → Layer 3 binary blob
  Key: "settings_crc" → uint32_t
```

---

## HTTP Endpoints

| Method | Endpoint    | Body          | Action                                    |
|--------|-------------|---------------|-------------------------------------------|
| POST   | /pipeline   | Layer 1 bin   | Store + reinit pipeline engine            |
| POST   | /hw_vars    | Layer 2 bin   | Store + reinit hardware (HAL reconfigure) |
| POST   | /settings   | Layer 3 bin   | Apply live (no restart) + persist to NVS  |
| GET    | /pipeline   | —             | Return active Layer 1 blob                |
| GET    | /settings   | —             | Return active Layer 3 blob                |

---

## Boot Sequence

```
pds_platform_init()
  │
  ├─ Load Layer 1 from NVS (pipeline)
  │    Parse block list + connection map
  │    Validate CRC, check type IDs against registry
  │
  ├─ Load Layer 2 from NVS (hw_vars)
  │    Walk block list → call init(pins_ptr, NULL) per block
  │    Each init configures HAL (GPIO, ADC, PWM)
  │
  ├─ Load Layer 3 from NVS (settings)
  │    Walk block list → call set_settings(settings_ptr) per block
  │
  ├─ Wire connections
  │    For each connection: call connect(to_block, to_port, from_block->output_ptr(from_port))
  │
  └─ Register telemetry provider

pds_platform_loop()
  └─ Walk block list in Layer 1 order → call run() on each block
       (topological order guaranteed because connections are downstream)
```

---

## What Needs to Be Built

| Component                              | Status                                  |
|----------------------------------------|-----------------------------------------|
| `fb_*` block implementations           | ✅ Done                                  |
| `pds_comp_switch_cycle.c`              | ✅ Done                                  |
| `pds_comp_dosing_pump.c`               | ✅ Done                                  |
| `pds_comp_sensor_ph.c`                 | ⚠️ TODO stub                            |
| `pds_comp_sensor_ec.c`                 | ⚠️ TODO stub                            |
| `_pins_t` / `_settings_t` split        | ⚠️ Pending refactor of existing fb_* headers |
| `pds_block_registry.c` + port ID enums | ❌ Not started                           |
| `pds_pipeline_engine.c` (load L1/L2/L3, wire, run) | ❌ Not started            |
| `POST /pipeline`, `POST /hw_vars`, `POST /settings` endpoints | ❌ Not started |
| `fb_dosing_pump` (decomposed pump block) | ❌ Not started                         |
| `fb_temp_compensate` (EC temp comp block) | ❌ Not started                        |
