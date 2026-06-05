"""
pin_assigner.py — Auto-assigns GPIO pins based on feature requirements and board capabilities.

Given a board (e.g., esp32c3_sm) and selected features, this module:
1. Loads board pin capabilities (which GPIOs support ADC, PWM, etc.)
2. Auto-assigns pins to features, avoiding conflicts
3. Allows manual override while detecting collisions
"""

from pathlib import Path
from typing import Optional


# Board pin capability maps
# Each board defines which GPIO numbers support which functions
BOARD_PIN_CAPS = {
    "esp32c3_sm": {
        "total_gpio": 22,  # GPIO 0-21
        "adc": [0, 1, 2, 3, 4],  # ADC1 channels
        "pwm": list(range(0, 22)),  # All GPIOs support LEDC PWM
        "gpio": list(range(0, 22)),
        "spi": {"mosi": 7, "miso": 2, "clk": 6, "cs": 10},  # Default SPI pins
        "i2c": {"sda": 8, "scl": 9},
        "uart": {"tx": 21, "rx": 20},
        "reserved": [12, 13, 14, 15],  # SPI flash pins — do not use
        "boot_sensitive": [2, 8, 9],  # Affect boot if pulled
    },
    "esp32_node32s": {
        "total_gpio": 34,
        "adc": [32, 33, 34, 35, 36, 39, 25, 26, 27, 14, 12, 13, 4, 0, 2, 15],
        "pwm": [2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33],
        "gpio": list(range(0, 40)),
        "spi": {"mosi": 23, "miso": 19, "clk": 18, "cs": 5},
        "i2c": {"sda": 21, "scl": 22},
        "uart": {"tx": 1, "rx": 3},
        "reserved": [6, 7, 8, 9, 10, 11],  # Internal flash
        "boot_sensitive": [0, 2, 12, 15],
    },
    "esp32s3": {
        "total_gpio": 45,
        "adc": list(range(1, 11)),  # ADC1: GPIO1-10
        "pwm": list(range(0, 45)),
        "gpio": list(range(0, 45)),
        "spi": {"mosi": 11, "miso": 13, "clk": 12, "cs": 10},
        "i2c": {"sda": 8, "scl": 9},
        "uart": {"tx": 43, "rx": 44},
        "reserved": [26, 27, 28, 29, 30, 31, 32],  # PSRAM/Flash
        "boot_sensitive": [0, 3, 45, 46],
    },
    "efr32mg24": {
        "total_gpio": 32,
        "adc": [0, 1, 2, 3, 4, 5, 6, 7],  # IADC inputs
        "pwm": list(range(0, 32)),  # TIMER CC outputs
        "gpio": list(range(0, 32)),
        "spi": {"mosi": 8, "miso": 9, "clk": 10, "cs": 11},
        "i2c": {"sda": 12, "scl": 13},
        "uart": {"tx": 5, "rx": 6},
        "reserved": [],
        "boot_sensitive": [],
    },
}


class PinAssignment:
    """Represents a single pin assignment."""

    def __init__(self, pin_id: str, gpio: int, function: str, module: str):
        self.pin_id = pin_id
        self.gpio = gpio
        self.function = function
        self.module = module

    def to_dict(self) -> dict:
        return {
            "gpio": self.gpio,
            "function": self.function,
            "module": self.module,
        }


class PinAssigner:
    """Manages pin assignments for a role, handling auto-assign and conflict detection."""

    def __init__(self, board: str):
        if board not in BOARD_PIN_CAPS:
            raise ValueError(f"Unknown board: {board}. Available: {list(BOARD_PIN_CAPS.keys())}")

        self.board = board
        self.caps = BOARD_PIN_CAPS[board]
        self.assignments: dict[str, PinAssignment] = {}

    @property
    def used_gpios(self) -> set[int]:
        """Return set of currently assigned GPIO numbers."""
        return {a.gpio for a in self.assignments.values()}

    @property
    def available_gpios(self) -> list[int]:
        """Return GPIO numbers not yet assigned and not reserved."""
        reserved = set(self.caps.get("reserved", []))
        used = self.used_gpios
        all_gpio = set(self.caps["gpio"])
        return sorted(all_gpio - reserved - used)

    def available_for_function(self, function: str) -> list[int]:
        """Return available GPIOs capable of a given function (adc, pwm, gpio, etc.)."""
        if function in self.caps:
            capable = set(self.caps[function])
            if isinstance(capable, dict):
                # SPI/I2C/UART — return specific default pins
                return [v for v in capable.values() if v not in self.used_gpios]
            reserved = set(self.caps.get("reserved", []))
            return sorted(capable - reserved - self.used_gpios)
        return self.available_gpios

    def auto_assign(self, features: list[dict]) -> list[PinAssignment]:
        """
        Auto-assign pins for a list of feature requirements.

        Each feature:
        {
            "pin_id": "adc_0",
            "function_type": "adc",
            "label": "pH sensor",
            "module": "pds_hal"
        }

        Returns list of new assignments made.
        """
        new_assignments = []

        for feat in features:
            pin_id = feat["pin_id"]
            func_type = feat["function_type"]
            label = feat.get("label", func_type)
            module = feat.get("module", "pds_hal")

            # Skip if already assigned
            if pin_id in self.assignments:
                continue

            # Find best available pin for this function
            available = self.available_for_function(func_type)
            if not available:
                raise ValueError(
                    f"No available {func_type}-capable pins for '{pin_id}'. "
                    f"Board {self.board} has exhausted {func_type} pins."
                )

            # Pick first available
            gpio = available[0]
            assignment = PinAssignment(pin_id, gpio, label, module)
            self.assignments[pin_id] = assignment
            new_assignments.append(assignment)

        return new_assignments

    def manual_assign(self, pin_id: str, gpio: int, function: str, module: str) -> Optional[str]:
        """
        Manually assign a GPIO to a pin_id.
        Returns conflict pin_id if GPIO already used, None on success.
        """
        # Check for conflicts
        for existing_id, existing in self.assignments.items():
            if existing.gpio == gpio and existing_id != pin_id:
                return existing_id  # Conflict!

        # Check reserved
        if gpio in self.caps.get("reserved", []):
            return f"__reserved_gpio_{gpio}"

        self.assignments[pin_id] = PinAssignment(pin_id, gpio, function, module)
        return None

    def remove(self, pin_id: str):
        """Remove a pin assignment."""
        self.assignments.pop(pin_id, None)

    def clear(self):
        """Remove all assignments."""
        self.assignments.clear()

    def get_conflicts(self) -> list[tuple[str, str, int]]:
        """Return list of (pin_id_a, pin_id_b, gpio) conflicts."""
        gpio_to_pins: dict[int, list[str]] = {}
        for pin_id, assignment in self.assignments.items():
            gpio_to_pins.setdefault(assignment.gpio, []).append(pin_id)

        conflicts = []
        for gpio, pin_ids in gpio_to_pins.items():
            if len(pin_ids) > 1:
                for i in range(len(pin_ids)):
                    for j in range(i + 1, len(pin_ids)):
                        conflicts.append((pin_ids[i], pin_ids[j], gpio))
        return conflicts

    def to_dict(self) -> dict:
        """Serialize all assignments to dict."""
        return {pin_id: a.to_dict() for pin_id, a in self.assignments.items()}

    def from_dict(self, data: dict):
        """Load assignments from dict."""
        self.assignments.clear()
        for pin_id, info in data.items():
            self.assignments[pin_id] = PinAssignment(
                pin_id, info["gpio"], info["function"], info["module"]
            )

    def summary(self) -> str:
        """Human-readable summary of current assignments."""
        lines = [f"Pin Assignments for {self.board}:"]
        lines.append(f"  Used: {len(self.assignments)}/{self.caps['total_gpio']} GPIOs")
        lines.append(f"  Available: {len(self.available_gpios)}")
        lines.append("")
        for pin_id, a in sorted(self.assignments.items()):
            lines.append(f"  GPIO{a.gpio:2d} → {pin_id} ({a.function}) [{a.module}]")
        return "\n".join(lines)


# Feature-to-pin-requirement mappings
# Maps header names to their pin requirements
HEADER_PIN_REQUIREMENTS = {
    "pds_adc.h": [
        {"pin_id": "adc_0", "function_type": "adc", "label": "ADC Channel 0", "module": "pds_hal"},
    ],
    "pds_pwm.h": [
        {"pin_id": "pwm_0", "function_type": "pwm", "label": "PWM Channel 0", "module": "pds_hal"},
    ],
    "pds_gpio.h": [
        {"pin_id": "gpio_out_0", "function_type": "gpio", "label": "GPIO Output 0", "module": "pds_hal"},
    ],
    "pds_spi.h": [
        {"pin_id": "spi_mosi", "function_type": "gpio", "label": "SPI MOSI", "module": "pds_hal"},
        {"pin_id": "spi_miso", "function_type": "gpio", "label": "SPI MISO", "module": "pds_hal"},
        {"pin_id": "spi_clk", "function_type": "gpio", "label": "SPI CLK", "module": "pds_hal"},
        {"pin_id": "spi_cs", "function_type": "gpio", "label": "SPI CS", "module": "pds_hal"},
    ],
    "pds_motor_DRV8833.h": [
        {"pin_id": "motor_in1", "function_type": "pwm", "label": "DRV8833 IN1", "module": "pds_hal"},
        {"pin_id": "motor_in2", "function_type": "pwm", "label": "DRV8833 IN2", "module": "pds_hal"},
    ],
}


def get_pin_requirements_for_headers(headers: list[str]) -> list[dict]:
    """Given a list of selected headers, return all pin requirements."""
    reqs = []
    for header in headers:
        if header in HEADER_PIN_REQUIREMENTS:
            reqs.extend(HEADER_PIN_REQUIREMENTS[header])
    return reqs


if __name__ == "__main__":
    import json

    assigner = PinAssigner("esp32c3_sm")

    # Simulate selecting ADC + PWM + Motor headers
    reqs = get_pin_requirements_for_headers(["pds_adc.h", "pds_pwm.h", "pds_motor_DRV8833.h"])
    assigner.auto_assign(reqs)

    print(assigner.summary())
    print("\nJSON:")
    print(json.dumps(assigner.to_dict(), indent=2))
