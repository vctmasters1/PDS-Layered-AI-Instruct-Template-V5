# Function Lock Quick Reference

## What is Function Lock?

Safety mechanism preventing accidental runtime pin function changes on hardware-critical pins.

**Example**: PWM pin for motor driver cannot be changed to ADC (would break hardware).

---

## Quick Facts

| Aspect | Detail |
|--------|--------|
| **Type Field** | `uint8_t function_locked` in `pds_pin_def_t` |
| **Values** | 0=Unlocked (changeable), 1=Locked (protected) |
| **Scope** | Per-pin, set at init, cannot be changed |
| **Error** | `ESP_ERR_INVALID_STATE` when violated |
| **Log Level** | ERROR with "SECURITY:" prefix |

---

## Locked Pins (h2o_001 Role)

| GPIO | Function | Purpose |
|------|----------|---------|
| 4 | PWM | Mist Pump (motor driver) |
| 5 | PWM | Nutrient Pump A (motor driver) |
| 6 | PWM | Nutrient Pump B (motor driver) |
| 7 | GPIO_OUT | UV Light control |
| 10 | GPIO_OUT | Drain Valve control |

---

## Unlocked Pins (h2o_001 Role)

| GPIO | Function | Purpose |
|------|----------|---------|
| 0-3 | ADC | Sensor inputs (pH, EC, Water, Temp) |
| 11 | GPIO_IN | Float switch |
| 12 | LED_ADDR | Grow lights |

---

## Common Operations

### Check if Pin is Locked

```c
if (pds_global_pin_def_table[pin_index].function_locked) {
    ESP_LOGI(TAG, "Pin is locked (function cannot change)");
}
```

### Update Locked PWM Pin (Allowed)

```c
// Changing duty cycle on locked PWM is OK (function stays PWM)
pds_pin_def_t cfg = pds_global_pin_def_table[4];
cfg.init_value = 750;  // 75% duty
pds_device_pins_update(4, &cfg);  // ✅ Succeeds
```

### Update Locked PWM Pin Function (Not Allowed)

```c
// Changing PWM to ADC on locked pin will fail
pds_pin_def_t cfg = pds_global_pin_def_table[4];
cfg.function = PDS_PIN_FUNC_ADC;  // Attempt to change
pds_device_pins_update(4, &cfg);  // ❌ Returns ESP_ERR_INVALID_STATE
```

### Update Unlocked ADC Pin (Allowed)

```c
// Unlocked pins can change parameters
pds_pin_def_t cfg = pds_global_pin_def_table[0];
cfg.params.adc.attenuation = PDS_ADC_ATTEN_DB_6;
pds_device_pins_update(0, &cfg);  // ✅ Succeeds
```

---

## Error Handling

```c
esp_err_t ret = pds_device_pins_update(4, &new_config);

if (ret == ESP_ERR_INVALID_ARG) {
    ESP_LOGE(TAG, "Invalid argument (out of range index)");
} 
else if (ret == ESP_ERR_INVALID_STATE) {
    ESP_LOGE(TAG, "Pin is locked - cannot change function");
    // Log will contain security warning with pin details
} 
else if (ret == ESP_OK) {
    ESP_LOGI(TAG, "Pin update successful");
}
```

---

## Design Rules

✅ **Allowed**:
- Change parameters on locked pins (duty cycle, frequency, etc.)
- Change any field on unlocked pins
- Query `function_locked` value at runtime
- Call `pds_device_pins_update()` repeatedly

❌ **Not Allowed**:
- Change function type on locked pins
- Modify `function_locked` field after init
- Bypass lock via direct struct manipulation (security issue)

---

## Why This Matters

**Hardware Protection**:
- Motor drivers connected to specific PWM pins
- Changing PWM to ADC would disable motor control
- Could cause pump failure, water overflow, etc.

**Security**:
- Prevents malicious config changes
- Protects against buffer overflow attacks
- Enforces hardware safety at type level

**Reliability**:
- Ensures critical functions cannot be accidentally misconfigured
- Prevents runtime initialization order problems
- Simplifies debugging (fewer config-related bugs)

---

## Testing Lock

### Compile-Time Check
```c
/* Verify lock is in struct at compile time */
_Static_assert(offsetof(pds_pin_def_t, function_locked) > 0,
               "function_locked field missing from pds_pin_def_t");
```

### Runtime Check
```c
/* Log all pin lock status at boot */
for (int i = 0; i < pds_global_pin_count; i++) {
    ESP_LOGI(TAG, "Pin %d (%s): locked=%d, func=%d",
        pds_global_pin_def_table[i].pin_number,
        pds_global_pin_def_table[i].label,
        pds_global_pin_def_table[i].function_locked,
        pds_global_pin_def_table[i].function);
}
```

---

## Related Documentation

- [FUNCTION_LOCK_IMPLEMENTATION.md](FUNCTION_LOCK_IMPLEMENTATION.md) - Full technical details
- [pds_types.h](../pds_core/include/pds_types.h) - Type definition
- [pds_pins.c](./platform/esp32c3_sm/hwrev_001/h2o_001/pds_pins.c) - Pin table
- [PROTOCOL.md](../../../PROTOCOL.md) - Configuration protocol

---

**Last Updated**: December 20, 2025  
**Version**: 1.0 (Initial)

