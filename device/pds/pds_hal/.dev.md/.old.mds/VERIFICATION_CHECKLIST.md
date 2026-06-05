# PDS HAL Reorganization - Verification Checklist

## Pre-Build Verification

- [ ] **pds_hal.h** exists in `include/` directory
- [ ] **pds_hal_config.h** exists in `include/` directory  
- [ ] **pds_hal_core.c** exists in `pds_hal/` directory
- [ ] **CMakeLists.txt** updated with platform detection
- [ ] All individual subsystem headers still exist:
  - [ ] `pds_adc.h`
  - [ ] `pds_pwm.h`
  - [ ] `pds_gpio.h`
  - [ ] `pds_spi.h`
  - [ ] `pds_motor_DRV8833.h`
  - [ ] `pds_pins.h`
- [ ] Platform implementations exist for ESP32-C3:
  - [ ] `platform/esp32c3_sm/common/pds_adc_esp32c3.c`
  - [ ] `platform/esp32c3_sm/common/pds_pwm_esp32c3.c`
  - [ ] `platform/esp32c3_sm/common/pds_gpio_esp32c3.c`
  - [ ] `platform/esp32c3_sm/common/pds_spi_esp32c3.c`
  - [ ] `platform/esp32c3_sm/common/pds_motor_DRV8833_esp32c3.c`

## Build Verification

### Clean Build
```bash
cd Device/H2O-DEV-12102025
python zBuildDev.py --clean
```

Expected output:
```
[OK] Firmware compiled successfully!
```

**Verification Steps:**
- [ ] Build completes without errors
- [ ] Build completes without warnings (or only expected warnings)
- [ ] Binary size similar to before (±10%)

### Build Artifact Check
```bash
ls -la Device/H2O-DEV-12102025/build/
```

Expected files present:
- [ ] `H2o-Tower.elf`
- [ ] `H2o-Tower.bin`
- [ ] `H2o-Tower.map`
- [ ] `bootloader/bootloader.bin`
- [ ] `partition_table/partition-table.bin`

## Runtime Verification

### Flash Device
```bash
cd Device/H2O-DEV-12102025
idf.py -p COM3 flash monitor
```

### Check Boot Logs

Expected output sequence:
```
rst:0x1 (POWERON_RESET),boot:0xcf (SPI_FAST_BOOT)
...
I (XXX) PDS_HAL: Initializing PDS HAL for ESP32C3 (hwrev: hwrev_001)
I (XXX) PDS_HAL: GPIO subsystem initialized
I (XXX) PDS_HAL: ADC subsystem initialized
I (XXX) PDS_HAL: PWM subsystem initialized
I (XXX) PDS_HAL: SPI subsystem initialized
I (XXX) PDS_HAL: Pin management subsystem initialized
I (XXX) PDS_HAL: Motor driver subsystem initialized
I (XXX) PDS_HAL: PDS HAL initialization complete
```

**Verification Checklist:**
- [ ] "Initializing PDS HAL for ESP32C3" appears
- [ ] All subsystem init messages appear
- [ ] "PDS HAL initialization complete" appears
- [ ] No errors or exceptions in boot logs
- [ ] Device boots successfully and enters main loop

## Functional Verification

### ADC Verification
```
I (XXX) H2O_MAIN: Telemetry: ADCs=1, PWMs=0, GPIOs=1
I (XXX) H2O_ADC: ADC reading: pin=3, value=2048
```

- [ ] ADC readings appear in telemetry
- [ ] ADC values are reasonable (0-4095 range for 12-bit)

### PWM Verification
```
Connect oscilloscope to GPIO 2 (PWM output)
```

- [ ] PWM frequency ~5 kHz
- [ ] PWM duty cycle varies with commands
- [ ] No PWM noise/glitches

### GPIO Verification
```
I (XXX) H2O_GPIO: GPIO pin 5 set to HIGH
I (XXX) H2O_GPIO: GPIO pin 5 set to LOW
```

- [ ] GPIO toggle messages appear
- [ ] LED or relay responds if connected to GPIO

### Motor Driver Verification
```
Connect motor or meter to GPIO 4-7
Send PWM command via Android app or serial console
```

- [ ] Motor driver responds to commands
- [ ] GPIO 4 and 5 (Motor A) show PWM output
- [ ] GPIO 6 and 7 (Motor B) show PWM output
- [ ] Motor speed changes with duty cycle adjustment

## Cross-Platform Verification (Optional)

### For ESP32 (No Motor Driver)
```bash
idf.py set-target esp32
idf.py build
```

Expected in logs:
```
I (XXX) PDS_HAL: Initializing PDS HAL for ESP32 (hwrev: ...)
I (XXX) PDS_HAL: GPIO subsystem initialized
I (XXX) PDS_HAL: ADC subsystem initialized
I (XXX) PDS_HAL: PWM subsystem initialized
I (XXX) PDS_HAL: SPI subsystem initialized
I (XXX) PDS_HAL: Pin management subsystem initialized
```

**Note**: Motor driver init NOT included (correct behavior)

- [ ] Build succeeds for ESP32
- [ ] Motor driver subsystem NOT in logs
- [ ] All other subsystems initialized

## Regression Testing

### Old Code Compatibility
If you have existing code that includes individual headers:

```c
#include "pds_adc.h"
#include "pds_pwm.h"

PDS_ADC_init();
PDS_PWM_init();
```

- [ ] Old code still compiles without changes
- [ ] Old code still functions correctly
- [ ] No link errors

### New Code Pattern
```c
#include "pds_hal.h"

pds_hal_init();
```

- [ ] New code compiles without errors
- [ ] New code initializes successfully
- [ ] Subsystems fully functional

## Documentation Verification

- [ ] **HAL_CONSOLIDATION.md** is comprehensive and clear
- [ ] **HAL_QUICK_REFERENCE.md** covers common use cases
- [ ] **HAL_USAGE_EXAMPLES.c** examples are compilable
- [ ] **HAL_REORGANIZATION_SUMMARY.md** describes changes clearly
- [ ] Code comments in `pds_hal.h` are complete
- [ ] Code comments in `pds_hal_core.c` are complete

## Performance Verification

### Boot Time
```bash
# Measure time from reset to "initialization complete"
# Should be similar to before (no significant increase)
```

- [ ] Boot time < 5 seconds
- [ ] No additional startup delay from HAL reorganization

### Memory Usage
```bash
# Check heap usage after HAL init
idf.py monitor
# Press Ctrl+T then H for heap info
```

- [ ] Heap usage < 10 MB
- [ ] No memory leaks over 1 hour operation
- [ ] Consistent heap size across restarts

### Functionality Under Load

**Test Scenario**: Continuous ADC reading + PWM + motor control for 1 hour

```bash
# Monitor for:
# - Consistent ADC readings
# - Stable PWM output (no glitches)
# - Motor speed changes working
# - No watchdog resets
# - No memory leaks
```

- [ ] ADC readings stable (no wild fluctuations)
- [ ] PWM stable (no frequency drift)
- [ ] Motor control responsive
- [ ] No watchdog resets
- [ ] Heap doesn't grow unbounded

## Capability Query Verification

### Compile-Time Checks
```c
#if PDS_HAL_HAS_MOTOR_DRV8833
    // Should be true for ESP32-C3
#endif
```

- [ ] Motor driver available on ESP32-C3
- [ ] Motor driver NOT available on ESP32

### Runtime Checks
```c
if (pds_hal_is_available("MOTOR_DRV8833")) { ... }
if (pds_hal_is_available("ADC")) { ... }
```

- [ ] `pds_hal_is_available()` returns correct values
- [ ] `pds_hal_get_platform()` returns platform name
- [ ] `pds_hal_get_hwrev()` returns hardware revision

## Android App Verification

If using from Android app (via telemetry):

- [ ] App receives telemetry successfully
- [ ] ADC values displayed correctly
- [ ] PWM commands received by device
- [ ] Motor control commands work
- [ ] No communication errors

## Error Handling Verification

### Intentional Failures

**Test 1: Init without GPIO**
```c
#undef PDS_HAL_HAS_GPIO
```

- [ ] Build succeeds without GPIO
- [ ] HAL init skips GPIO initialization
- [ ] App continues with ADC/PWM only

**Test 2: Invalid ADC Channel**
```c
int32_t val = PDS_ADC_read_raw(99);  // Invalid channel
```

- [ ] Returns negative value (error)
- [ ] No crash or exception
- [ ] Error logged appropriately

**Test 3: Uninitialized Motor**
```c
// Don't call pds_motor_drv8833_init()
pds_motor_set_speed_percent(...);
```

- [ ] Returns `ESP_ERR_INVALID_STATE`
- [ ] No crash or exception
- [ ] Motor doesn't move

## Final Checklist

- [ ] All pre-build verification passed
- [ ] Build completes without errors
- [ ] Device boots and initializes HAL successfully
- [ ] All subsystems functional
- [ ] Backward compatible with old code
- [ ] New code pattern works
- [ ] Documentation complete and accurate
- [ ] Performance acceptable
- [ ] Error handling works correctly
- [ ] Ready for merge and deployment

## Sign-Off

**Build Date**: ____________________

**Verified By**: ____________________

**Platform**: ____________________  (ESP32-C3, ESP32, etc.)

**Build Status**: ☐ Passed  ☐ Failed  ☐ Partial

**Notes**: 
```
_________________________________________________________________

_________________________________________________________________

_________________________________________________________________
```

---

**Checklist Version**: 1.0  
**Last Updated**: December 20, 2025
