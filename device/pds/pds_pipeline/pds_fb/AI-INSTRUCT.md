# pds_pipeline/pds_fb/ — Function Block Architecture

**This file is the single authoritative source for function block design.**  
Parent files (`pds/AI-INSTRUCT.md`, `Device/AI-INSTRUCT.md`) reference this file and
do not repeat its content. Peripheral driver conventions are in
`pds_hal/peripherals/AI-INSTRUCT.md` and also reference this file.

---

## Contents

| § | What's here |
|---|-------------|
| [Core Principle: One Implementation, Many Instances](#core-principle-one-implementation-many-instances) | The single-implementation / heap-context pattern |
| [Context Structure (inside .c only — never exposed)](#context-structure-inside-c-only--never-exposed) | How block state is stored |
| [`enabled` → Safe-State Contract (CRITICAL)](#enabled--safe-state-contract-critical) | What enabled/disabled means for each block type |
| [Public Header Contract (`pds_fb_<name>.h`)](#public-header-contract-pds_fb_nameh) | What goes in the public header |
| [Non-Blocking State Machine (`_run()`)](#non-blocking-state-machine-_run) | How the run function is structured |
| [HAL Separation Rule](#hal-separation-rule) | No direct hardware access from function blocks |
| [Telemetry Sink Registration](#telemetry-sink-registration) | How blocks publish telemetry |
| [Peripheral-Sourced Block Pattern (DHT22 / ph_001 / ec_001 / encoder)](#peripheral-sourced-block-pattern-dht22--ph_001--ec_001--encoder) | Peripheral-driven block pattern |
| [pds_periph_mutex — Shared Resource Mutual Exclusion](#pds_periph_mutex--shared-resource-mutual-exclusion) | Mutex usage for shared peripherals |
| [Block Registry Wiring](#block-registry-wiring) | How blocks register with the pipeline engine |
| [CMake Wiring](#cmake-wiring) | CMakeLists.txt requirements for blocks |
| [Adding a New Block — Checklist](#adding-a-new-block--checklist) | Step-by-step checklist |

## Core Principle: One Implementation, Many Instances

Every `pds_fb_*` block follows a **single-implementation / heap-context** pattern:

```
pds_fb_<name>.c     ← ONE file. ONE set of functions.
pds_fb_<name>.h     ← Public API: settings_t, state_t, init/run/...
```

There is **no function per instance**. Multiple instances of the same block type
(e.g. two DHT22 blocks in different pipelines) each get their own `_ctx_t` allocation
but call the exact same functions with their own handle.

---

## Context Structure (inside .c only — never exposed)

Every block allocates one `_ctx_t` on the heap at init and never frees it:

```c
typedef struct {
    pds_fb_<name>_settings_t  settings;   /* copy of L3 blob — persisted */
    pds_fb_<name>_state_t     state;      /* runtime readings/status */
    <phase_enum_t>            phase;      /* state machine phase */
    bool                      hw_ok;      /* ADC/GPIO configured without error */
    /* Optional runtime pointers — NOT part of settings_t: */
    const float              *some_src;   /* e.g. temp source for EC comp */
} <name>_ctx_t;
```

Key rules:
- `settings` is a **value copy** (not a pointer). `set_settings()` replaces it wholesale.
- `state` is **runtime only** — never packed into blobs, never sent to the caller.
- Any live pointer (e.g. `temp_src` in sensor_ec) is stored in `_ctx_t`, **not** in
  `settings_t`. It must survive `set_settings()` clobbers. Assign it only via a
  dedicated `connect_*()` function.
- `phase` drives the non-blocking state machine (see below).

---

## `enabled` → Safe-State Contract (CRITICAL)

**Every output block that controls hardware MUST drive its hardware to a safe/zero state when `!settings.enabled` in `_run()`.** This is triggered on the next engine tick after `apply_settings` pushes new L3 settings (e.g. from HMI pipeline disable).

Pattern (mirrors `switch_output`):
```c
if (!ctx->settings.enabled) {
    pds_fb_<name>_safe_state(handle);  /* zero hardware immediately */
    return PDS_COMP_IDLE;
}
```

Rules:
- **Output blocks** (`pwm_output`, `pid_pwm`, `switch_output`, stepper velocity/position): must zero hardware outputs when disabled. All currently do this.
- **Intermediate blocks** (`pid` naked): must zero their output value (`output_pct = 0.0f`) when disabled so any still-enabled downstream block sees 0.0f and can respond correctly.
- **Source/sensor blocks** (`sensor_ph`, `sensor_ec`, `dht22`, etc.): return `PDS_COMP_IDLE` early — do NOT zero the sensor reading, as the downstream may still want the last valid value for display purposes. The output block is responsible for stopping hardware.
- The engine does NOT have a generic `enabled` query — each block enforces its own contract.

---

## Public Header Contract (`pds_fb_<name>.h`)

```c
/* ── Settings (packed into L3 blob by blob_packer.py) ── */
typedef struct {
    /* hardware pins */
    /* timing / tuning params */
    bool enabled;
    /* …no runtime pointers, no heap refs */
} pds_fb_<name>_settings_t;

/* ── Runtime state (never packed) ── */
typedef struct {
    float    <primary_value>;
    int32_t  raw_<something>;   /* raw hardware reading where applicable */
    bool     sample_valid;
    uint32_t read_count;
    uint32_t error_count;
    uint32_t last_sample_tick;
} pds_fb_<name>_state_t;

/* ── API ── */
esp_err_t         pds_fb_<name>_init(const pds_fb_<name>_settings_t*, pds_comp_handle_t*);
pds_comp_status_t pds_fb_<name>_run(pds_comp_handle_t);
const pds_fb_<name>_state_t* pds_fb_<name>_get_state(pds_comp_handle_t);
esp_err_t         pds_fb_<name>_get_settings(pds_comp_handle_t, pds_fb_<name>_settings_t*);
esp_err_t         pds_fb_<name>_set_settings(pds_comp_handle_t, const pds_fb_<name>_settings_t*);
/* Optional: connect ports for cross-block data chaining */
void              pds_fb_<name>_connect_<port>(pds_comp_handle_t, const float *src);
```

`pds_comp_handle_t` is `void*`. The block owns the lifetime of the ctx it points to.

---

## Non-Blocking State Machine (`_run()`)

Every `_run()` returns **immediately**. No `vTaskDelay`, no blocking ADC reads,
no `while` spin-loops. The pipeline engine calls `_run()` on every tick.

### Standard phases for hardware-read blocks:

```
IDLE  ──[interval elapsed + mutex acquired]──►  SETTLING
  ◄──[mutex released on error]──────────────────────────
SETTLING  ──[wait time elapsed]──►  SAMPLING
SAMPLING  ──[read + release mutex]──►  IDLE
```

- In `IDLE`: check interval. If not time yet, return `PDS_COMP_ACTIVE` (holding last value).
  Try-acquire the resource mutex. If blocked, return `PDS_COMP_IDLE` (retry next tick).
- In `SETTLING`: check elapsed ms via `pds_pwr_group_on_tick()`. If not settled, return
  `PDS_COMP_ACTIVE`. No blocking.
- In `SAMPLING`: read hardware (via HAL driver), release pwr_group + mutex, reset phase.

---

## HAL Separation Rule

**The fb block does NOT call ESP-IDF hardware APIs directly.**

| Responsibility | Owner |
|----------------|-------|
| ADC channel configuration | `pds_hal/peripherals/<name>/` HAL driver |
| Raw ADC reads + mV conversion | HAL driver (`<name>_read_raw()`, `<name>_raw_to_mv()`) |
| Power GPIO management | `pds_fb_pwr_group` |
| Resource mutex | `pds_periph_mutex` |
| Calibration / scaling | fb block (`_calibrate()` private function) |
| Telemetry registration | fb block (`pds_tel_sink_register()` in `_init()`) |

The fb block `#include`s only the HAL driver header — **not** `pds_adc_registry.h`,
**not** `pds_adc.h`, **not** `driver/gpio.h` directly.

---

## Telemetry Sink Registration

**Every `pds_fb_*` block that produces observable output MUST call `pds_tel_sink_register()` in its `_init()`.**  
No role-specific code, no provider callback, no accessor needed — just register a `pds_tel_slot_t` pointing to live state fields.

Reference: `pds_pipeline/pds_fb/include/pds_tel_sink.h`  
Full architecture: `.dev-docs/TELEMETRY-REFERENCE-ARCHITECTURE.md`

### Choosing the Right Slot Kind

| `pds_tel_kind_t` | Block types | Snapshot array | sensorRefMap key |
|-----------------|-------------|----------------|-----------------|
| `PDS_TEL_ADC`   | `sensor_analog` | `adcReadings` | `"adc:<adc_channel>"` |
| `PDS_TEL_PWM`   | `pwm_output` | `pwmOutputs` | *(outputRefMap, not sensorRefMap)* |
| `PDS_TEL_GPIO`  | `switch_output`, `gpio_input` | `gpioStates` | `"gpio:<pin>"` |
| `PDS_TEL_TIMER` | `timer_cycle`, `timer_countdown`, `timer_countup` | `timerStates` | *(timerRefMap)* |
| `PDS_TEL_PERIPH`| `sensor_dht22_temp/humid`, `sensor_ph`, `sensor_ec`, `encoder_position/velocity`, any peripheral-sourced float | `peripheralReadings` | `"periph:<pin>:<field>"` |

**Sensor blocks** (blocks whose primary purpose is reading a physical quantity):
- Direct ADC→calibrated float (no separate driver peripheral): use **`PDS_TEL_ADC`**
- Peripheral-sourced sensor (uses a HAL driver, has a `peripheral_id` in role JSON): use **`PDS_TEL_PERIPH`**

### Slot Population — Required Fields Per Kind

```c
/* PDS_TEL_ADC — e.g. sensor_analog */
pds_tel_slot_t slot = {
    .kind          = PDS_TEL_ADC,
    .pin           = settings->adc_channel,     /* ADC GPIO pin — the telemetry key */
    /* label auto-generated as "ADC<pin>" by pds_telemetry_collect() */
    .adc.value     = &ctx->state.calibrated_value,
    .adc.raw       = &ctx->state.raw_adc,
    .adc.adc_channel = settings->adc_channel,
};

/* PDS_TEL_PERIPH — e.g. sensor_ph, sensor_ec, sensor_dht22_temp */
pds_tel_slot_t slot = {
    .kind          = PDS_TEL_PERIPH,
    .pin           = settings->pin_adc,          /* physical data/ADC pin */
    .periph.value  = &ctx->state.<primary_float>, /* e.g. &ctx->state.ph */
    .periph.pin    = settings->pin_adc,
    /* field: short channel name used as sensorRefMap key suffix */
    /* e.g. "ph", "ec", "temp", "humid" — max 7 chars + null */
};
snprintf(slot.periph.field, sizeof(slot.periph.field), "ph");   /* or "ec", "temp", etc. */
```

The slot `pin` field is what the server displays and what `sensorRefMap` uses for lookup.
For `PDS_TEL_PERIPH`, the lookup key is `"periph:<pin>:<field>"` — both pin AND field must be set.

### post_pipeline.ps1 — MUST Be Updated for Every New Sensor Block

When adding a new sensor block type, `post_pipeline.ps1` **must** include a branch in the
`sensorRefMap` builder loop for that `blockType`. Without it, the sensor's pipeline
assignment is unknown and the dashboard renders it in the "Other" panel.

**For `PDS_TEL_PERIPH`-kind blocks**, the sensorRefMap entry uses key `"periph:<pin_adc>:<field>"`:

```powershell
# In post_pipeline.ps1 sensorRefMap builder:
elseif ($blk.blockType -eq 'sensor_ph' -or $blk.blockType -eq 'sensor_ec') {
    $field    = if ($blk.blockType -eq 'sensor_ph') { 'ph' } else { 'ec' }
    $periph   = $roleConfig.peripherals | Where-Object { $_.id -eq $blk.settings.peripheral_id }
    $pin_adc  = $periph.pins.pin_adc
    $refKey   = "periph:${pin_adc}:${field}"
    $sensorRefMap[$refKey] = @{
        sensorRef    = "$($pipeline.id):${blockIdx}:0"
        alias        = $blk.alias
        kind         = 'periph'
        pin          = $pin_adc
        field        = $field
        pipelineId   = $pipeline.id
        pipelineName = $pipeline.name
        blockIndex   = $blockIdx
    }
}
```

**For `PDS_TEL_ADC`-kind blocks**, key is `"adc:<adc_channel>"` (see existing `sensor_analog` handler in `post_pipeline.ps1`).

### Sensor Consumer Pipelines (internal sensor pipelines)

Some sensor blocks live in their own "internal" sensor pipelines (e.g. `ph_sns_01`) and are
consumed by a higher-level pipeline via `sensor_value` / `sensor_ref`. The second-pass logic
in `post_pipeline.ps1` reassigns the consumer pipeline's name to the sensorRefMap entry so
the telemetry reading appears under the correct pipeline on the dashboard.  
**This reassignment only fires if the initial sensorRefMap entry was created** — the first-pass
builder branch must exist for the block type.

Example (sensor_ph):
```c
#include "ph_001.h"   /* HAL: ph_001_configure(), ph_001_read_raw(), ph_001_raw_to_mv() */
/* NOT: pds_adc_registry.h, pds_adc.h, driver/gpio.h */
```

---

## Peripheral-Sourced Block Pattern (DHT22 / ph_001 / ec_001 / encoder)

Some blocks are tied to a specific peripheral type. The role JSON stores only
`{ "peripheral_id": "periph_xyz", "enabled": true }` — all hardware config lives
in the peripheral definition. `blob_packer.py` merges peripheral pins + config into
the block's L3 settings at pack time. The firmware never sees a `peripheral_id`.

Add the resolver in `PDS-Role/tools/blob_packer.py`:
1. Add `type_id` entry to `TYPE_ID` dict
2. Add `BlockDef` to `BLOCK_DEFS` with correct `l3_fmt` (struct format) and fields
3. Add `_resolve_<type>_peripheral_ref()` function (same pattern as `_resolve_dht22_*`)
4. Call it inside the `pack_role()` block loop alongside the other resolvers

---

## pds_periph_mutex — Shared Resource Mutual Exclusion

Used when two blocks share a physical circuit (e.g. PH and EC share the `adc_probe` circuit):

```c
/* In IDLE phase — before acquiring power: */
if (!pds_periph_mutex_try_acquire(PDS_PERIPH_MUTEX_ADC_PROBE, ctx)) {
    return PDS_COMP_IDLE;   /* retry next tick */
}
pds_pwr_group_acquire(pin_power);
/* In SAMPLING phase — after reading: */
pds_pwr_group_release(pin_power);
pds_periph_mutex_release(PDS_PERIPH_MUTEX_ADC_PROBE, ctx);
```

Groups are defined in `pds_periph_mutex.h`. Add a new group there when a new shared
resource is introduced.

---

## Block Registry Wiring

Every block type must be registered in `pds_block_registry.c`:

1. Add enum value to `pds_block_type_t` in `pds_block_registry.h`
2. Add `#ifdef PDS_PERIPH_HAS_<TYPE>` include guard around the `#include`
3. Add static wrapper functions: `s_<name>_init`, `s_<name>_run`, `s_<name>_set_settings`,
   `s_<name>_connect`, `s_<name>_output`
4. Add a registry table entry: `{ PDS_BLOCK_<NAME>, 0, sizeof(pds_fb_<name>_settings_t), ... }`

For peripheral-conditional blocks, wrap the include + wrappers + table entry in
`#ifdef PDS_PERIPH_HAS_<TYPE>` / `#endif`.

---

## CMake Wiring

In `pds_fb/CMakeLists.txt`:
- Add `elseif(_TYPE STREQUAL "<type_key>")` block: append to `PDS_PERIPH_SRCS`,
  `PDS_PERIPH_DEFS`, and `PDS_PERIPH_REQUIRES`
- Add the HAL component name to the unconditional `PRIV_REQUIRES` list

In `pds_hal/peripherals/<name>/CMakeLists.txt`:
```cmake
idf_component_register(SRCS "<name>.c" INCLUDE_DIRS "include" REQUIRES pds_hal)
```

In the role's `pds_periph_drivers.cmake`:
```cmake
set(PDS_PERIPH_TYPES "dht22" "<new_type>")
```

---

## Adding a New Block — Checklist

1. `pds_hal/peripherals/<name>/include/<name>.h` + `<name>.c` + `CMakeLists.txt`
2. `pds_fb/include/pds_fb_<name>.h` — `settings_t`, `state_t`, public API
3. `pds_fb/pds_fb_<name>.c` — `_ctx_t`, init/run/set_settings/get_state, telemetry
   - **If this block is a sensor**: call `pds_tel_sink_register()` in `_init()` — see "Telemetry Sink Registration" above for which kind to use and what fields to set
4. `pds_block_registry.h` — enum value
5. `pds_block_registry.c` — include guard + wrappers + table entry
6. `pds_fb/CMakeLists.txt` — type→source mapping + PRIV_REQUIRES
7. `blob_packer.py` — TYPE_ID + BlockDef + resolver function + call site in pack_role()
8. `pds_periph_drivers.cmake` for affected role(s)
9. `PDS-vscode-extension/role-data.js` — PERIPHERAL_TYPES + PDS_FB_BLOCKS entries
10. **If this block is a sensor**: add a branch to `post_pipeline.ps1` sensorRefMap builder — see "Telemetry Sink Registration" above for the key format
11. Update `pds_hal/peripherals/AI-INSTRUCT.md` driver table
12. Update this file if the new block introduces a new pattern

> **Display / UI output devices** (OLED, TFT, LED matrix) are NOT pipeline blocks.
> They use the **Layer 4 `ui_params` blob** and live in `pds_ui/`.
> See `pds_ui/AI-INSTRUCT.md` for the architecture and adding-a-new-device checklist.

