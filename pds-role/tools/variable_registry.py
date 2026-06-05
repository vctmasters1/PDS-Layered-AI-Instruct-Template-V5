"""
variable_registry.py — Groups configurable variables by function for remote access.

Each PDS module exposes variables that can be:
- Compile-time constants (not remotely settable)
- Runtime-configurable via BLE or WiFi/HTTPS

This module manages the registry of variables, their types, defaults,
and remote-access flags. The output drives:
- NVS key registration
- BLE GATT characteristic generation
- HTTPS config endpoint structure
- Telemetry/config packet layout
"""

from typing import Optional


# Variable type definitions
VALID_TYPES = {
    "bool": {"c_type": "bool", "size": 1, "ble_format": "uint8"},
    "uint8": {"c_type": "uint8_t", "size": 1, "ble_format": "uint8"},
    "uint16": {"c_type": "uint16_t", "size": 2, "ble_format": "uint16"},
    "uint32": {"c_type": "uint32_t", "size": 4, "ble_format": "uint32"},
    "int8": {"c_type": "int8_t", "size": 1, "ble_format": "sint8"},
    "int16": {"c_type": "int16_t", "size": 2, "ble_format": "sint16"},
    "int32": {"c_type": "int32_t", "size": 4, "ble_format": "sint32"},
    "float": {"c_type": "float", "size": 4, "ble_format": "float32"},
}


def parse_string_type(type_str: str) -> Optional[dict]:
    """Parse string[N] type notation. Returns None if not a string type."""
    if type_str.startswith("string[") and type_str.endswith("]"):
        try:
            max_len = int(type_str[7:-1])
            return {"c_type": "char", "size": max_len, "ble_format": "utf8s", "max_len": max_len}
        except ValueError:
            return None
    return None


class Variable:
    """A single configurable variable within a module."""

    def __init__(self, name: str, var_type: str, default,
                 description: str = "", min_val=None, max_val=None):
        self.name = name
        self.var_type = var_type
        self.default = default
        self.description = description
        self.min_val = min_val
        self.max_val = max_val

    @property
    def remote(self) -> bool:
        """True if user-facing (no _ prefix); False if compile-time only (_ or __ prefix)."""
        return not self.name.startswith('_')

    @property
    def type_info(self) -> dict:
        """Get C type info for this variable."""
        string_info = parse_string_type(self.var_type)
        if string_info:
            return string_info
        return VALID_TYPES.get(self.var_type, {"c_type": "uint32_t", "size": 4, "ble_format": "uint32"})

    @property
    def nvs_key(self) -> str:
        """NVS storage key (max 15 chars for ESP-IDF)."""
        # Truncate to 15 chars for NVS compatibility
        return self.name[:15]

    def to_dict(self) -> dict:
        d = {
            "name": self.name,
            "type": self.var_type,
            "default": self.default,
        }
        if self.description:
            d["description"] = self.description
        if self.min_val is not None:
            d["min"] = self.min_val
        if self.max_val is not None:
            d["max"] = self.max_val
        return d


class VariableGroup:
    """A group of variables belonging to a single module/function."""

    def __init__(self, module: str, display_name: str = ""):
        self.module = module
        self.display_name = display_name or module
        self.variables: list[Variable] = []

    def add(self, name: str, var_type: str, default, **kwargs) -> Variable:
        # Drop legacy 'remote' kwarg if present — now derived from name prefix
        kwargs.pop('remote', None)
        v = Variable(name, var_type, default, **kwargs)
        self.variables.append(v)
        return v

    @property
    def remote_variables(self) -> list[Variable]:
        """Return only user-facing variables (no _ prefix)."""
        return [v for v in self.variables if not v.name.startswith('_')]

    @property
    def const_variables(self) -> list[Variable]:
        """Return compile-time-only variables (_ or __ prefix)."""
        return [v for v in self.variables if v.name.startswith('_')]

    def to_dict(self) -> list[dict]:
        return [v.to_dict() for v in self.variables]


class VariableRegistry:
    """Registry of all variable groups across enabled modules."""

    def __init__(self):
        self.groups: dict[str, VariableGroup] = {}

    def add_group(self, module: str, display_name: str = "") -> VariableGroup:
        group = VariableGroup(module, display_name)
        self.groups[module] = group
        return group

    def get_group(self, module: str) -> Optional[VariableGroup]:
        return self.groups.get(module)

    def remove_group(self, module: str):
        self.groups.pop(module, None)

    @property
    def all_remote_variables(self) -> list[tuple[str, Variable]]:
        """Return (module, variable) pairs for all remote-accessible variables."""
        result = []
        for module, group in self.groups.items():
            for v in group.remote_variables:
                result.append((module, v))
        return result

    @property
    def total_remote_size(self) -> int:
        """Total byte size of all remote variables (for BLE/packet sizing)."""
        total = 0
        for _, v in self.all_remote_variables:
            total += v.type_info["size"]
        return total

    def to_dict(self) -> dict:
        return {module: group.to_dict() for module, group in self.groups.items()}

    def from_dict(self, data: dict):
        """Load registry from dict (e.g., from saved role config)."""
        self.groups.clear()
        for module, var_list in data.items():
            group = self.add_group(module)
            for vdata in var_list:
                group.add(
                    name=vdata["name"],
                    var_type=vdata["type"],
                    default=vdata["default"],
                    description=vdata.get("description", ""),
                    min_val=vdata.get("min"),
                    max_val=vdata.get("max"),
                )


# Default variable templates per module
# When a module is enabled, these are the suggested variables
MODULE_DEFAULT_VARIABLES = {
    "pds_control": [
        {"name": "pipeline_interval_ms", "type": "uint32", "default": 1000,
         "description": "Pipeline evaluation interval"},
        {"name": "max_active_pipelines", "type": "uint8", "default": 8,
         "description": "Maximum concurrent pipelines"},
        {"name": "timer_resolution_ms", "type": "uint32", "default": 100,
         "description": "Timer tick resolution"},
    ],
    "pds_network": [
        {"name": "wifi_ssid", "type": "string[32]", "default": "",
         "description": "WiFi network name"},
        {"name": "wifi_password", "type": "string[64]", "default": "",
         "description": "WiFi password"},
        {"name": "telemetry_interval_ms", "type": "uint32", "default": 5000,
         "description": "Telemetry publish interval"},
        {"name": "ble_device_name", "type": "string[16]", "default": "",
         "description": "BLE advertised name"},
        {"name": "mdns_hostname", "type": "string[32]", "default": "pds-device",
         "description": "mDNS hostname"},
    ],
    "pds_storage": [
        {"name": "_nvs_namespace", "type": "string[16]", "default": "pds",
         "description": "NVS partition namespace"},
        {"name": "_config_version", "type": "uint16", "default": 1,
         "description": "Config format version"},
        {"name": "_storage_type", "type": "string[8]", "default": "fat",
         "description": "Storage filesystem type (fat or spiffs)"},
        {"name": "_storage_pct", "type": "uint8", "default": 25,
         "description": "Percentage of flash for storage (5-60)", "min": 5, "max": 60},
        {"name": "_ota_enabled", "type": "bool", "default": True,
         "description": "Enable OTA dual-app partitions"},
        {"name": "_storage_enabled", "type": "bool", "default": True,
         "description": "Include storage partition"},
        {"name": "_nvs_size_kb", "type": "uint16", "default": 20,
         "description": "NVS partition size in KB"},
    ],
    "pds_telemetry": [
        {"name": "telemetry_enabled", "type": "bool", "default": True,
         "description": "Enable telemetry collection"},
        {"name": "sample_rate_ms", "type": "uint32", "default": 1000,
         "description": "Sensor sample interval"},
        {"name": "__packet_format_ver", "type": "uint8", "default": 1,
         "description": "Binary packet format version"},
    ],
    "pds_odbii": [
        {"name": "obd_poll_rate_ms", "type": "uint32", "default": 500,
         "description": "OBD-II polling interval"},
        {"name": "obd_pids_enabled", "type": "uint32", "default": 0xFFFF,
         "description": "Bitmask of enabled OBD PIDs"},
    ],
}


def build_default_registry(enabled_modules: list[str]) -> VariableRegistry:
    """Create a registry with default variables for the given enabled modules."""
    registry = VariableRegistry()

    for module in enabled_modules:
        if module in MODULE_DEFAULT_VARIABLES:
            group = registry.add_group(module)
            for vdata in MODULE_DEFAULT_VARIABLES[module]:
                group.add(
                    name=vdata['name'],
                    var_type=vdata['type'],
                    default=vdata['default'],
                    description=vdata.get('description', ''),
                    min_val=vdata.get('min'),
                    max_val=vdata.get('max'),
                )

    return registry


if __name__ == "__main__":
    import json

    # Example: build registry for a typical role
    enabled = ["pds_control", "pds_network", "pds_storage", "pds_telemetry"]
    registry = build_default_registry(enabled)

    print("=== Variable Registry ===")
    print(f"Total remote variables: {len(registry.all_remote_variables)}")
    print(f"Total remote payload size: {registry.total_remote_size} bytes")
    print()

    for module, group in registry.groups.items():
        print(f"[{module}] ({len(group.remote_variables)} remote, {len(group.const_variables)} const)")
        for v in group.variables:
            flag = "REMOTE" if not v.name.startswith('_') else "CONST"
            print(f"  {v.name:30s} {v.var_type:12s} = {v.default!r:10s} [{flag}]")
        print()

    print("\nJSON:")
    print(json.dumps(registry.to_dict(), indent=2))
