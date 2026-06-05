# PDS HAL Quick Reference

## Single Include
```c
#include "pds_hal.h"  // ⭐ Only include this
```

All platform-appropriate subsystems are included automatically.

---

## Initialization
```c
esp_err_t ret = pds_hal_init();
if (ret != ESP_OK) {
    ESP_LOGE(TAG, "HAL init failed: %s", esp_err_to_name(ret));
}
```

---

## Capability Queries

### Runtime Checks
```c
// Check if subsystem is available
if (pds_hal_is_available("MOTOR_DRV8833")) { ... }
if (pds_hal_is_available("ADC")) { ... }
if (pds_hal_is_available("SPI")) { ... }

// Get platform info
const char* platform = pds_hal_get_platform();   // "ESP32C3", "ESP32", etc.
const char* hwrev = pds_hal_get_hwrev();         // "hwrev_001", etc.
```

### Compile-Time Checks
```c
#if PDS_HAL_HAS_MOTOR_DRV8833
    pds_motor_drv8833_init(&config);
#endif

#if PDS_HAL_HAS_ADC
    int32_t val = PDS_ADC_read_raw(channel);
#endif
```

---

## Available Subsystems

| Subsystem | Header | Function Prefix | Example |
|-----------|--------|-----------------|---------|
| ADC | (included) | `PDS_ADC_*` | `PDS_ADC_read_raw()` |
| PWM | (included) | `PDS_PWM_*` | `PDS_PWM_set_duty()` |
| GPIO | (included) | `PDS_GPIO_*` | `PDS_GPIO_write()` |
| SPI | (included) | `pds_spi_*` | `pds_spi_device_transfer()` |
| Motor DRV8833 | (included if available) | `pds_motor_*` | `pds_motor_set_speed_percent()` |
| Pins | (included) | `pds_device_pins_*` | `pds_device_pins_init()` |

---

## Common Tasks

### Read ADC
```c
#if PDS_HAL_HAS_ADC
PDS_ADC_configure(channel, PDS_ADC_ATTEN_11DB, PDS_ADC_WIDTH_12BIT);
int32_t raw = PDS_ADC_read_raw(channel);
#endif
```

### Set PWM
```c
#if PDS_HAL_HAS_PWM
PDS_PWM_setup_channel(pin, 5000, 10);  // 5kHz, 10-bit
PDS_PWM_set_duty_percent(pin, 75);     // 75%
#endif
```

### Digital I/O
```c
#if PDS_HAL_HAS_GPIO
PDS_GPIO_configure(pin, PDS_GPIO_MODE_OUTPUT, PDS_GPIO_PULL_NONE);
PDS_GPIO_write(pin, 1);  // High
#endif
```

### Motor Control (H2o-Tower)
```c
#if PDS_HAL_HAS_MOTOR_DRV8833
pds_motor_config_t cfg = {
    .pwm_frequency = 5000,
    .pwm_resolution_bits = 10,
    .enable_current_limiting = false,
};
pds_motor_drv8833_init(&cfg);
pds_motor_set_speed_percent(PDS_MOTOR_CHANNEL_A, 80);  // 80%
pds_motor_set_mode(PDS_MOTOR_CHANNEL_A, PDS_MOTOR_MODE_FORWARD);
#endif
```

---

## Platform Capabilities

### ESP32-C3 (H2o-Tower Primary)
✅ ADC, PWM, GPIO, SPI, Motor DRV8833, Pins

### ESP32 (Standard)
✅ ADC, PWM, GPIO, SPI, Pins  
❌ Motor DRV8833

### ESP32-S3
✅ ADC, PWM, GPIO, SPI, Pins  
❌ Motor DRV8833

### EFR32MG24
✅ ADC, PWM, GPIO, SPI, Pins  
❌ Motor DRV8833

---

## Graceful Degradation Example

```c
void control_pump(uint32_t speed_percent) {
    if (pds_hal_is_available("MOTOR_DRV8833")) {
        // Advanced: Use motor driver
        pds_motor_set_speed_percent(PDS_MOTOR_CHANNEL_A, speed_percent);
    } 
    else if (pds_hal_is_available("PWM")) {
        // Fallback: Use PWM directly
        PDS_PWM_set_duty_percent(5, speed_percent);
    }
    else if (pds_hal_is_available("GPIO")) {
        // Last resort: GPIO on/off relay
        PDS_GPIO_write(5, speed_percent > 50 ? 1 : 0);
    }
    else {
        ESP_LOGE(TAG, "No pump control available!");
    }
}
```

---

## Error Handling

```c
esp_err_t ret = pds_motor_set_speed_percent(channel, speed);

switch (ret) {
    case ESP_OK:
        ESP_LOGI(TAG, "Speed set successfully");
        break;
    case ESP_ERR_INVALID_ARG:
        ESP_LOGE(TAG, "Invalid argument (speed > 100?)");
        break;
    case ESP_ERR_INVALID_STATE:
        ESP_LOGE(TAG, "Motor not initialized");
        break;
    default:
        ESP_LOGE(TAG, "Error: %s", esp_err_to_name(ret));
}
```

---

## Files to Know

| File | Purpose |
|------|---------|
| `pds_hal.h` | Main include (use this!) |
| `pds_hal_config.h` | Configuration (auto-generated) |
| `pds_hal_core.c` | Init & capability functions |
| `include/pds_*.h` | Individual subsystem headers |
| `CMakeLists.txt` | Platform detection |
| `HAL_CONSOLIDATION.md` | Full documentation |
| `HAL_USAGE_EXAMPLES.c` | Code examples |

---

## Build Configuration

Set in CMakeLists.txt for your platform:
```cmake
target_compile_definitions(${COMPONENT_LIB} PRIVATE
    -DPDS_HAL_HAS_MOTOR_DRV8833=1
    -DTARGET_PLATFORM=\"ESP32C3\"
    -DTARGET_HWREV=\"hwrev_001\"
    -DTARGET_ROLE=\"h2o_001\"
)
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Linker error: "undefined reference to pds_motor_drv8833_init" | Motor driver not enabled in CMakeLists.txt |
| Subsystem functions not found | Check `pds_hal_is_available()` or enable with `-DPDS_HAL_HAS_XXX=1` |
| HAL init fails | Check logs for which subsystem failed |
| Code compiles but motor doesn't work | Check `pds_hal_get_platform()` - may not be ESP32-C3 |

---

## Migration Checklist

- [ ] Replace `#include "pds_adc.h"` etc. with `#include "pds_hal.h"`
- [ ] Replace individual init calls with `pds_hal_init()`
- [ ] Add `#if PDS_HAL_HAS_*` guards around platform-specific code
- [ ] Test on target platform
- [ ] Verify logs show "HAL initialization complete"
- [ ] Update documentation for your project

---

**Latest Update**: December 20, 2025  
**Status**: Ready for deployment
