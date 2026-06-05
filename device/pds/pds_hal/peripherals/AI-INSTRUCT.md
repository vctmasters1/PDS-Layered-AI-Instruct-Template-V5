# pds_hal/peripherals/ — Peripheral Component Drivers

Each subdirectory is a self-contained ESP-IDF CMake component. The project root's
`EXTRA_COMPONENT_DIRS` includes `../pds/pds_hal/peripherals` so the IDF build
discovers all subdirectories automatically.

## Contents

| § | What's here |
|---|-------------|
| [Convention](#convention) | File and component naming rules |
| [Drivers](#drivers) | Existing peripheral drivers listing |
| [ADS1115 Channel Encoding](#ads1115-channel-encoding) | ADC channel assignment encoding |
| [Analog Probe Peripheral Naming](#analog-probe-peripheral-naming) | Naming rules for analog probe peripherals |
| [Adding a New Peripheral](#adding-a-new-peripheral) | Step-by-step checklist |

## Convention

```
peripherals/
└── <name>/
    ├── include/<name>.h   ← Public API — plain C structs, no ESP-IDF types in parameters
    ├── <name>.c           ← Implementation
    └── CMakeLists.txt     ← idf_component_register(... INCLUDE_DIRS "include")
```

- **No app logic here.** Drivers expose primitive operations (init, read, write).
- **No registry calls here.** Registry wiring (e.g. `pds_adc_reg_register_ext`) is done
  by the caller — either an fb block or `pds_process_action.c` at role init.
- **No pipeline types here.** Do not `#include` anything from `pds_pipeline/`.
- **HAL separation rule** (how fb blocks call HAL drivers) is documented in
  `pds_pipeline/pds_fb/AI-INSTRUCT.md` § "HAL Separation Rule". Do not duplicate here.

## Drivers

| Directory | Description | Protocol | Registered via |
|-----------|-------------|----------|----------------|
| `led_strip/` | Espressif addressable LED community component | RMT | n/a (direct) |
| `dht22/` | DHT22 / AM2302 temperature & humidity sensor | Single-wire bit-bang | n/a (direct in fb block) |
| `hx711/` | HX711 24-bit load-cell / weight ADC | Two-wire CLK/DOUT bit-bang | n/a (direct in fb block) |
| `encoder/` | Quadrature encoder — polling Gray-code decoder | GPIO (pin_a, pin_b, opt. pin_index) | n/a (direct in fb block via `PDS_GPIO_read()`) |
| `ads1115/` | ADS1115 16-bit 4-channel I2C ADC | I2C (legacy API) | `pds_adc_reg_register_ext()` in `pds_process_action.c` |
| `ph_001/` | Analog pH electrode (rev 001) — built-in ESP32 ADC | Analog | `PDS_ADC_configure()` via `ph_001_configure()` in fb block |
| `ec_001/` | Analog EC/PPM electrode (rev 001) — built-in ESP32 ADC | Analog | `PDS_ADC_configure()` via `ec_001_configure()` in fb block |

## ADS1115 Channel Encoding

```c
ADS1115_CHANNEL(dev_idx, ain)  →  100 + dev_idx*4 + ain
```

Channel numbers 100+ are reserved for external ADC devices. This avoids collision
with ESP32 GPIO numbers (max ~40) used as ADC channel identifiers for built-in ADC.

`pds_adc_reg_register_ext()` must be used (not `pds_adc_reg_register`) for these
channels — the `_ext` variant skips the `PDS_ADC_configure()` call.

## Analog Probe Peripheral Naming

Analog probe peripherals are versioned by hardware board revision:

```
ph_001/   ← pH electrode probe, circuit rev 001
ph_002/   ← pH electrode probe, circuit rev 002  (future)
ec_001/   ← EC/PPM electrode probe, circuit rev 001
```

The HAL driver (`ph_001_configure`, `ph_001_read_raw`, `ph_001_raw_to_mv`) handles
only ADC configuration and raw reads. Power management and calibration stay in the
fb block (`pds_fb_sensor_ph.c`). This separation allows a future `ph_002` driver to
swap in a different ADC front-end without touching the fb block logic.

## Adding a New Peripheral

1. Create `peripherals/<name>/include/<name>.h` — public API only
2. Create `peripherals/<name>/<name>.c` — implementation
3. Create `peripherals/<name>/CMakeLists.txt`:
   ```cmake
   idf_component_register(SRCS "<name>.c" INCLUDE_DIRS "include" REQUIRES ...)
   ```
4. If the fb block calls the driver directly, add `<name>` to `pds_fb/CMakeLists.txt` REQUIRES **and** PRIV_REQUIRES.
5. If registration is role-level, add `<name>` to `Device/main/CMakeLists.txt` REQUIRES.
6. Update this file and `pds_hal/AI-INSTRUCT.md`.

### Analog probe HAL pattern (ph_001 / ec_001)

- The HAL driver exposes `<name>_configure()`, `<name>_read_raw()`, `<name>_raw_to_mv()`
- `<name>_configure()` calls `PDS_ADC_configure()` directly — do **not** call `pds_adc_reg_register()` in the HAL
- The fb block includes the HAL header, calls `_configure()` at init, `_read_raw()` in SAMPLING, and `_raw_to_mv()` in `_calibrate()`
- Board revision is encoded in the directory name (e.g. `ph_001`, `ph_002`) so a new circuit can add a new driver without modifying the existing one
