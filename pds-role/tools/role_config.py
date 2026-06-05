"""
role_config.py — Role configuration model and serialization.

Manages the complete state of a role configuration:
- Platform/hwrev/role identity
- Enabled modules and headers
- Pin assignments
- Variable registry

Handles save/load to JSON files in saved_roles/.
"""

import json
from pathlib import Path
from typing import Optional

from tools.module_scanner import scan_modules, scan_boards, find_workspace_root
from tools.pin_assigner import PinAssigner, get_pin_requirements_for_headers
from tools.variable_registry import VariableRegistry, build_default_registry


class RoleConfig:
    """Complete role configuration state."""

    def __init__(self):
        self.role_id: str = ""
        self.display_name: str = ""
        self.description: str = ""
        self.board: str = ""
        self.hwrev: str = ""
        self.modules: dict[str, dict] = {}
        self.pin_assigner: Optional[PinAssigner] = None
        self.variable_registry: VariableRegistry = VariableRegistry()

    @property
    def enabled_modules(self) -> list[str]:
        """List of enabled module names."""
        return [name for name, cfg in self.modules.items() if cfg.get("enabled", False)]

    @property
    def is_valid(self) -> bool:
        """Check if config has minimum required fields."""
        return bool(self.role_id and self.board and self.hwrev)

    def set_board(self, board: str):
        """Set board and initialize pin assigner."""
        self.board = board
        self.pin_assigner = PinAssigner(board)

    def enable_module(self, module_name: str, headers: Optional[list[str]] = None, locked: bool = False):
        """Enable a module with optional header selection."""
        self.modules[module_name] = {
            "enabled": True,
            "locked": locked,
        }
        if headers:
            self.modules[module_name]["headers"] = headers

    def disable_module(self, module_name: str):
        """Disable a module (does not remove from dict)."""
        if module_name in self.modules:
            if self.modules[module_name].get("locked", False):
                return  # Cannot disable locked modules
            self.modules[module_name]["enabled"] = False

    def auto_assign_pins(self):
        """Auto-assign pins based on currently selected headers."""
        if not self.pin_assigner:
            return

        all_headers = []
        for module_cfg in self.modules.values():
            if module_cfg.get("enabled") and "headers" in module_cfg:
                all_headers.extend(module_cfg["headers"])

        reqs = get_pin_requirements_for_headers(all_headers)
        self.pin_assigner.auto_assign(reqs)

    def build_variable_registry(self):
        """Build default variable registry from enabled modules."""
        self.variable_registry = build_default_registry(self.enabled_modules)

    def to_dict(self) -> dict:
        """Serialize entire config to dict."""
        d = {
            "role_id": self.role_id,
            "display_name": self.display_name,
            "description": self.description,
            "platform": self.board,   # legacy key — kept for backward compat with old saved roles
            "hwrev": self.hwrev,
            "modules": self.modules,
        }
        if self.pin_assigner:
            d["pin_assignments"] = self.pin_assigner.to_dict()
        d["variables"] = self.variable_registry.to_dict()
        return d

    def from_dict(self, data: dict):
        """Load config from dict."""
        self.role_id = data.get("role_id", "")
        self.display_name = data.get("display_name", "")
        self.description = data.get("description", "")
        # support 'platform' (legacy save key) and 'target' (IDF target / older JSONs)
        self.board = data.get("platform", "") or data.get("target", "")
        self.hwrev = data.get("hwrev", "")
        self.modules = data.get("modules", {})

        if self.board:
            self.pin_assigner = PinAssigner(self.board)
            if "pin_assignments" in data:
                self.pin_assigner.from_dict(data["pin_assignments"])

        if "variables" in data:
            self.variable_registry.from_dict(data["variables"])

    def save(self, output_dir: Optional[Path] = None) -> Path:
        """Save config to JSON file in saved_roles/."""
        if not self.role_id:
            raise ValueError("Cannot save: role_id is empty")

        if output_dir is None:
            output_dir = Path(__file__).parent / "saved_roles"

        output_dir.mkdir(parents=True, exist_ok=True)
        filepath = output_dir / f"{self.role_id}.json"
        filepath.write_text(json.dumps(self.to_dict(), indent=2), encoding="utf-8")
        return filepath

    @classmethod
    def load(cls, filepath: Path) -> "RoleConfig":
        """Load config from a JSON file."""
        data = json.loads(filepath.read_text(encoding="utf-8"))
        config = cls()
        config.from_dict(data)
        return config

    @classmethod
    def list_saved(cls, saved_dir: Optional[Path] = None) -> list[Path]:
        """List all saved role config files."""
        if saved_dir is None:
            saved_dir = Path(__file__).parent / "saved_roles"

        if not saved_dir.exists():
            return []

        return sorted(saved_dir.glob("*.json"))


if __name__ == "__main__":
    # Demo: create a sample role config
    config = RoleConfig()
    config.role_id = "h2o_001"
    config.display_name = "aeroponics_core"
    config.description = "Basic aeroponics tower controller"
    config.set_board("esp32c3_sm")
    config.hwrev = "hwrev_001"

    # Enable modules
    config.enable_module("pds_core", locked=True)
    config.enable_module("pds_hal", headers=["pds_hal.h", "pds_pins.h", "pds_adc.h", "pds_pwm.h", "pds_gpio.h"], locked=True)
    config.enable_module("pds_validation", locked=True)
    config.enable_module("pds_control", headers=["pds_pipeline.h", "pds_timer.h"])
    config.enable_module("pds_network", headers=["pds_wifi.h", "pds_https_server.h", "pds_ble_provisioning.h", "pds_mdns.h"])
    config.enable_module("pds_storage", headers=["pds_nvs.h", "pds_config_store.h"])
    config.enable_module("pds_telemetry", headers=["pds_telemetry.h", "pds_telemetry_types.h"])

    # Auto-assign pins
    config.auto_assign_pins()

    # Build variable registry
    config.build_variable_registry()

    # Print and save
    print(json.dumps(config.to_dict(), indent=2))
    saved_path = config.save()
    print(f"\nSaved to: {saved_path}")
