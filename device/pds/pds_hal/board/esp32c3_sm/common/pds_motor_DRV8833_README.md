# PDS Motor DRV8833 HAL Implementation

## Overview

The DRV8833 is a **dual H-bridge motor driver** IC that can independently control 2 DC motors or pumps. Each motor channel supports:
- **Forward/Reverse** direction control
- **Speed control** via PWM (0-100%)
- **Coasting** (freewheel) and **Braking** (hard stop) modes

**Use case in H2o-Tower**: Control misting pump and nutrient pumps with direction and speed regulation.

## File Structure

```
pds_hal/
├── include/
│   └── pds_motor_DRV8833.h                    # Platform-agnostic interface
│
└── platform/esp32c3_sm/common/
    └── pds_motor_DRV8833_esp32c3.c            # ESP32-C3 implementation
```

## Architecture

### Pin Configuration (H2o-Tower hwrev_001)

| Channel | IN1 Pin | IN2 Pin | Function | Notes |
|---------|---------|---------|----------|-------|
| A | GPIO 4 | GPIO 5 | Mist Pump | Primary misting system |
| B | GPIO 6 | GPIO 7 | Nutrient Pump A | Nutrient delivery |

**Configurable via CMakeLists.txt**:
```cmake
# Override for different hardware revision
target_compile_options(pds_hal PRIVATE
    -DPDS_MOTOR_A_IN1_PIN=4
    -DPDS_MOTOR_A_IN2_PIN=5
    -DPDS_MOTOR_B_IN1_PIN=6
    -DPDS_MOTOR_B_IN2_PIN=7
)
```

### Control Logic

Each motor channel uses **2 PWM signals** to control an H-bridge:

| Mode | IN1 | IN2 | Behavior |
|------|-----|-----|----------|
| COAST | 0% | 0% | Freewheel (no braking) |
| FORWARD | Speed | 0% | Motor spins forward |
| REVERSE | 0% | Speed | Motor spins reverse |
| BRAKE | 100% | 100% | Hard stop (short across motor) |

### Implementation Details

**LEDC (LED PWM) Configuration**:
- Timer: `LEDC_TIMER_0` (shared between both motors)
- Mode: `LEDC_HIGH_SPEED_MODE`
- Channels: 4 total (2 per motor)
  - Motor A: Channels 0 (IN1), 1 (IN2)
  - Motor B: Channels 2 (IN1), 3 (IN2)

**PWM Resolution**: Default 10 bits (0-1023 speed range)
- Configurable via `pds_motor_config_t.pwm_resolution_bits`
- Typical values: 8-16 bits

**PWM Frequency**: Default 5000 Hz
- Configurable via `pds_motor_config_t.pwm_frequency`
- Audible range is ~20Hz-20kHz; above 20kHz is silent

## Usage Examples

### Basic Initialization

```c
#include "pds_motor_DRV8833.h"

// Configure motor driver
pds_motor_config_t motor_config = {
    .pwm_frequency = 5000,              // 5 kHz
    .pwm_resolution_bits = 10,          // 0-1023 speed range
    .enable_current_limiting = false,   // TODO: future feature
};

pds_motor_drv8833_init(&motor_config);
```

### Control Motor Speed & Direction

```c
// Start mist pump forward at 75% speed
pds_motor_set_speed_percent(PDS_MOTOR_CHANNEL_A, 75);
pds_motor_set_mode(PDS_MOTOR_CHANNEL_A, PDS_MOTOR_MODE_FORWARD);

// Or in one call
pds_motor_control(PDS_MOTOR_CHANNEL_A, PDS_MOTOR_MODE_FORWARD, 768);  // 75% of 1023
```

### Stop Motors

```c
// Coast (freewheel) all motors
pds_motor_stop_all(PDS_MOTOR_MODE_COAST);

// Or hard stop (brake)
pds_motor_stop_all(PDS_MOTOR_MODE_BRAKE);
```

### Query Status

```c
pds_motor_mode_t current_mode;
uint32_t current_speed;

pds_motor_get_mode(PDS_MOTOR_CHANNEL_A, &current_mode);
pds_motor_get_speed(PDS_MOTOR_CHANNEL_A, &current_speed);

uint32_t max_speed = pds_motor_get_max_speed();  // Returns 1023 for 10-bit
```

### Integration with Automation Pipeline

**In pds_process_action.c** (h2o_001 role):

```c
// Water level too low: activate mist pump
if (water_level < THRESHOLD_LOW) {
    pds_motor_set_speed_percent(PDS_MOTOR_CHANNEL_A, 80);
    pds_motor_set_mode(PDS_MOTOR_CHANNEL_A, PDS_MOTOR_MODE_FORWARD);
}

// Water level too high: disable pump
if (water_level > THRESHOLD_HIGH) {
    pds_motor_stop_all(PDS_MOTOR_MODE_COAST);
}

// Reverse pump for drain cycle
if (drain_needed) {
    pds_motor_control(PDS_MOTOR_CHANNEL_A, PDS_MOTOR_MODE_REVERSE, 512);  // 50%
}
```

## Error Handling

All functions return `esp_err_t`:

| Error | Meaning | Example Cause |
|-------|---------|---------------|
| `ESP_OK` | Success | Normal operation |
| `ESP_ERR_INVALID_ARG` | Invalid parameter | Channel >= 2, speed > max, invalid mode |
| `ESP_ERR_INVALID_STATE` | Wrong state | Motor not initialized, function called before init |
| `ESP_ERR_*` | LEDC/GPIO error | Hardware initialization failure |

**Example error handling**:

```c
esp_err_t ret = pds_motor_set_speed_percent(PDS_MOTOR_CHANNEL_A, 150);  // Invalid: > 100%
if (ret != ESP_OK) {
    ESP_LOGE(TAG, "Failed to set speed: %s", esp_err_to_name(ret));
    // Handle error
}
```

## State Management

The implementation maintains state for each motor:

```c
typedef struct {
    uint32_t pin_in1, pin_in2;          // GPIO pins
    ledc_channel_t ledc_channel_in1, in2; // PWM channels
    pds_motor_mode_t current_mode;      // Current direction/mode
    uint32_t current_speed;             // Current PWM duty (0-max)
    bool initialized;                   // Initialization flag
} pds_motor_state_t;
```

Stored globally for fast access and to prevent redundant hardware reconfigurations.

## Logging

Debug logging via ESP-IDF log module (TAG = "PDS_MOTOR_DRV8833"):

```c
// Initialization
I (1234) PDS_MOTOR_DRV8833: Initializing DRV8833: freq=5000 Hz, resolution=10 bits, max_speed=1023
I (1234) PDS_MOTOR_DRV8833: Motor 0 initialized: IN1=GPIO4, IN2=GPIO5

// Control operations
D (5678) PDS_MOTOR_DRV8833: Motor 0: mode=1, speed=768, IN1_duty=768, IN2_duty=0

// Stop operation
I (9999) PDS_MOTOR_DRV8833: All motors stopped: mode=0
```

Configure log level:
```bash
idf.py menuconfig
# Component config → Log output → Default log verbosity → Debug
```

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Max PWM frequency | 80 MHz (ESP32-C3) |
| Typical frequency | 5 kHz (hardware) |
| PWM resolution | 10 bits = 1024 steps |
| Duty cycle granularity | ~0.1% at 10 bits |
| Speed change latency | < 1 ms |
| Current draw per channel | 0-2 A (DRV8833 rated) |

## Current Limiting

DRV8833 has **built-in current limiting** (typical 2A per channel):
- Protects from motor stall/jam
- Passive thermal limiting
- Optional: Add shunt resistor monitoring (TODO: future feature)

## Hardware Considerations

1. **Decoupling Capacitors**: Add 100µF near DRV8833 power pins
2. **Flyback Diodes**: Built into DRV8833 (no external diodes needed)
3. **Motor Lead Length**: Keep short to minimize EMI
4. **GPIO Pin Assignments**: Verify no conflicts with other subsystems

## Future Enhancements

- [ ] **Current Sensing**: Monitor actual motor current via ADC
- [ ] **Fault Detection**: Read nFAULT pin for overtemp/short circuit
- [ ] **Acceleration Ramping**: Smooth speed transitions (prevent sudden direction changes)
- [ ] **Encoders**: Closed-loop speed feedback
- [ ] **CAN Bus Support**: For distributed motor control

## Testing

### Unit Test Example

```c
void test_motor_control(void) {
    // Initialize
    pds_motor_config_t config = {
        .pwm_frequency = 5000,
        .pwm_resolution_bits = 10,
        .enable_current_limiting = false,
    };
    assert(pds_motor_drv8833_init(&config) == ESP_OK);

    // Test forward
    assert(pds_motor_set_speed_percent(PDS_MOTOR_CHANNEL_A, 75) == ESP_OK);
    assert(pds_motor_set_mode(PDS_MOTOR_CHANNEL_A, PDS_MOTOR_MODE_FORWARD) == ESP_OK);
    
    // Verify state
    uint32_t speed;
    pds_motor_mode_t mode;
    assert(pds_motor_get_speed(PDS_MOTOR_CHANNEL_A, &speed) == ESP_OK);
    assert(pds_motor_get_mode(PDS_MOTOR_CHANNEL_A, &mode) == ESP_OK);
    assert(speed == 768);  // 75% of 1023
    assert(mode == PDS_MOTOR_MODE_FORWARD);

    // Stop all
    assert(pds_motor_stop_all(PDS_MOTOR_MODE_COAST) == ESP_OK);

    // Cleanup
    assert(pds_motor_drv8833_deinit() == ESP_OK);
}
```

### Integration Test

Connect oscilloscope to motor pins and verify:
- PWM frequency matches configured value (5 kHz)
- Duty cycle matches speed setting (75% → 750µs at 10kHz)
- Mode transitions switch IN1/IN2 correctly

## Related Files

- **Header**: `pds_hal/abstract/pds_motor_DRV8833.h`
- **Implementation**: `pds_hal/platform/esp32c3_sm/common/pds_motor_DRV8833_esp32c3.c`
- **Usage**: `pds_hal/platform/esp32c3_sm/hwrev_001/h2o_001/pds_process_action.c`
- **Configuration**: `pds_hal/platform/esp32c3_sm/CMakeLists.txt`

## References

- **DRV8833 Datasheet**: https://www.ti.com/product/DRV8833
- **ESP32-C3 LEDC**: https://docs.espressif.com/projects/esp-idf/en/latest/esp32c3/api-reference/peripherals/ledc.html
- **ESP-IDF GPIO**: https://docs.espressif.com/projects/esp-idf/en/latest/esp32c3/api-reference/peripherals/gpio.html
