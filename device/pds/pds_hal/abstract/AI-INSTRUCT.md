# pds_hal/abstract — Public Interface Headers

## Purpose

This directory is the `include/` equivalent for the `pds_hal` component. All headers that
are public API for `pds_hal` live here. ESP-IDF CMakeLists uses `INCLUDE_DIRS "abstract"`
to export them to dependent components.

**Platform-agnostic interface definitions** — function prototypes, types, enums, constants.
Board implementations live in `pds_hal/board/{board}/common/`.

## Single Include Pattern

```c
#include "pds_hal.h"  // Includes all subsystems
```

## Files in This Directory

**HAL interface headers:**
- `pds_hal.h` — Main entry point (single-include)
- `pds_hal_config.h` — Subsystem availability flags (`PDS_HAL_HAS_*`)
- `pds_adc.h` — ADC interface
- `pds_gpio.h` — GPIO interface
- `pds_pwm.h` — PWM interface
- `pds_spi.h` — SPI interface
- `pds_motor_DRV8833.h` — Motor driver interface

**Peripheral registry headers** (public API for the `registries/` sources):
- `pds_adc_registry.h` — ADC registry (backend fn-ptr + cached reads)
- `pds_gpio_registry.h` — GPIO registry (pre-sweep input caching + output tracking)
- `pds_pwm_registry.h` — PWM registry (duty tracking)

Registry `.c` sources live in `../registries/`. Headers live here because they ARE
the public `pds_hal` API, same as the other abstract headers.

> `pds_pins.h` has been archived to `pds_hal/.old/pds_pins.h`. Do not restore — pin
> assignments are Layer 2 hw_vars blobs loaded at runtime.