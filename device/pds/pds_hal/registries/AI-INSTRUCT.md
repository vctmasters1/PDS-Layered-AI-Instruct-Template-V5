# pds_hal/registries — Peripheral Registry Hub

## Contents

| § | What's here |
|---|-------------|
| [Purpose](#purpose) | Why the registry layer exists |
| [Files](#files) | Registry source files listing |
| [How a Block Uses the Registry](#how-a-block-uses-the-registry) | Read/write pattern for function blocks |
| [Pre-sweep Call Sequence (pds_platform_main.c)](#pre-sweep-call-sequence-pds_platform_mainc) | Init and pre-sweep call order |
| [Dependency Rule](#dependency-rule) | Component dependency declarations |
| [Pin Assignments](#pin-assignments) | Where pin assignments live |
| [Adding a New Registry](#adding-a-new-registry) | Steps to add a new peripheral registry |
| [Archived / Deprecated](#archived--deprecated) | Retired registry entries |

## Purpose

Central store for all peripheral values (ADC readings, GPIO states, PWM duty cycles) across the device. Each registry is a thin indirection layer that:

1. **Registers** a peripheral with a backend `read_fn` / `write_fn` / `set_duty_fn` — the function that actually talks to the hardware. The backend may be `PDS_ADC_read` for a built-in ESP32 ADC channel, `ads1115_read` for an I2C ADC, `PDS_GPIO_write` for a native GPIO, or an I2C expander function — the caller decides at registration time.

2. **Pre-sweeps** once per pipeline tick (called from `pds_platform_loop` before `pds_pipeline_engine_tick`). All ADC channels and GPIO inputs are read and cached. Every block in the same tick sees the same snapshot; slow peripherals (e.g., ADS1115 over I2C) are read once, not once per block.

3. **Provides cached reads** during tick evaluation: `pds_adc_reg_get_cached_mv()`, `pds_gpio_reg_get_cached()`, `pds_pwm_reg_get_duty()`. Telemetry can call `pds_*_reg_get_all()` for a full snapshot with no extra hardware access.

## Files

Public headers live in `../abstract/` (the `pds_hal` include dir). Sources live here.

| Header (in `abstract/`) | Source (here) | Purpose |
|--------------------------|---------------|---------|
| `pds_adc_registry.h` | `pds_adc_registry.c` | ADC channels (any backend) |
| `pds_gpio_registry.h` | `pds_gpio_registry.c` | GPIO pins (input pre-sweep + output tracking) |
| `pds_pwm_registry.h` | `pds_pwm_registry.c` | PWM outputs (any backend) |

## How a Block Uses the Registry

### Registration (at `_init` / `_apply_settings`):
```c
// ADC — configures hardware, stores PDS_ADC_read + PDS_ADC_raw_to_mv as backends
pds_adc_reg_register(channel, PDS_ADC_ATTEN_DB_11, PDS_ADC_WIDTH_BIT_12,
                     PDS_ADC_read, PDS_ADC_raw_to_mv, "ADC32");

// GPIO input — configures hardware, stores PDS_GPIO_read as backend
pds_gpio_reg_register(pin, PDS_GPIO_MODE_INPUT, PDS_GPIO_PULL_UP,
                      active_low, PDS_GPIO_read, NULL, "GPIO5");

// PWM — configures LEDC channel, stores PDS_PWM_set_duty_percent as backend
pds_pwm_reg_register(pin, freq_hz, resolution_bits,
                     PDS_PWM_set_duty_percent, PDS_PWM_get_duty_percent, "PWM26");
```

### Reading (during block `_run`):
```c
// ADC — use the pre-sampled value (no hardware call during the tick):
int32_t raw = pds_adc_reg_get_cached_raw(channel);
float   mv  = (float)pds_adc_reg_raw_to_mv(channel, raw);

// Or: explicit averaged read (power-gated blocks that manage their own timing):
pds_adc_reg_read(channel, oversample_count, &raw, NULL);

// GPIO input — use pre-sampled value:
bool level = pds_gpio_reg_get_cached(pin);

// GPIO output:
pds_gpio_reg_write(pin, level);

// PWM:
pds_pwm_reg_set_duty(pin, duty_pct);
```

## Pre-sweep Call Sequence (pds_platform_main.c)

```
pds_platform_loop()
    pds_adc_reg_refresh_all()        ← reads every registered ADC once
    pds_gpio_reg_refresh_inputs()    ← reads every registered INPUT GPIO once
    pds_pipeline_engine_tick()       ← all blocks evaluate against the cached snapshot
```

## Dependency Rule

```
pds_fb_*   →  pds_registries headers  →  pds_hal abstract headers  →  pds_hal platform impl
```

`registries/` is compiled as part of `pds_hal` (same CMake component, `INCLUDE_DIRS "registries"`). No circular dependency.

## Pin Assignments

Registries do **not** own pin tables. Pin assignments are **Layer 2 (hw_vars blobs)** loaded at runtime from NVS. Each `pds_fb_*` block reads its pin from the L2 blob at init and passes it to the registry. There is no compile-time pin map.

## Adding a New Registry

1. Add `pds_{peripheral}_registry.h` to `pds_hal/abstract/` (public API lives there)
2. Add `pds_{peripheral}_registry.c` here in `registries/`
3. Add the `.c` to `HAL_SRCS` in `pds_hal/CMakeLists.txt`
4. Wire any pre-sweep call into `pds_platform_main.c` `pds_platform_loop()`
5. Update `abstract/AI-INSTRUCT.md` file list and the table above

## Archived / Deprecated

- `pds_hal/.old/pds_pins.h` — Declared `pds_global_pin_def_table[]`. **REMOVED**. Pin assignments are L2 blobs.
