"""
module_scanner.py — Discovers PDS modules, headers, and capabilities from Device/pds/.

Scans the filesystem to find:
- Available PDS modules (pds_core, pds_hal, pds_control, etc.)
- Public headers per module (from include/ directories)
- Dependencies (parsed from CMakeLists.txt REQUIRES)
- Board-specific capabilities (from pds_hal/board/)
"""

import os
import re
from pathlib import Path
from typing import Optional


def find_workspace_root(start_path: Optional[str] = None) -> Path:
    """Find the workspace root containing Device/pds/."""
    if start_path:
        p = Path(start_path)
    else:
        p = Path(__file__).resolve().parent.parent

    # Walk up until we find Device/pds/
    for candidate in [p, *p.parents]:
        if (candidate / "Device" / "pds").is_dir():
            return candidate

    raise FileNotFoundError("Cannot find workspace root with Device/pds/")


def scan_modules(workspace_root: Optional[Path] = None) -> list[dict]:
    """
    Scan Device/pds/ and return a list of module descriptors.

    Each descriptor:
    {
        "name": "pds_control",
        "path": "/abs/path/to/Device/pds/pds_control",
        "headers": ["pds_pipeline.h", "pds_timer.h"],
        "dependencies": ["pds_core", "pds_hal"],
        "has_cmakelists": True,
        "locked": False
    }
    """
    if workspace_root is None:
        workspace_root = find_workspace_root()

    pds_dir = workspace_root / "Device" / "pds"
    if not pds_dir.is_dir():
        raise FileNotFoundError(f"PDS directory not found: {pds_dir}")

    modules = []
    # All infrastructure modules are always compiled — only pds_storage was historically
    # shown as optional in the UI, but the generated template always calls pds_usrset_*.
    # pds_control and pds_telemetry no longer exist; telemetry is in pds_network,
    # automation is in pds_pipeline.
    locked_modules = {"pds_core", "pds_hal", "pds_validation",
                      "pds_network", "pds_storage", "pds_pipeline", "pds_odbii"}

    for entry in sorted(pds_dir.iterdir()):
        if not entry.is_dir():
            continue
        if not entry.name.startswith("pds_"):
            continue

        module = {
            "name": entry.name,
            "path": str(entry),
            "headers": _scan_headers(entry),
            "dependencies": _parse_dependencies(entry),
            "has_cmakelists": (entry / "CMakeLists.txt").exists(),
            "locked": entry.name in locked_modules,
        }
        modules.append(module)

    return modules


def scan_boards(workspace_root: Optional[Path] = None) -> list[dict]:
    """
    Scan Device/pds/pds_hal/board/ and return board descriptors.

    Each descriptor:
    {
        "name": "esp32c3_sm",
        "path": "/abs/path/...",
        "hwrevs": [
            {
                "id": "hwrev_001",
                "roles": ["h2o_001", "sv_001"]
            }
        ]
    }
    """
    if workspace_root is None:
        workspace_root = find_workspace_root()

    board_dir = workspace_root / "Device" / "pds" / "pds_hal" / "board"
    if not board_dir.is_dir():
        return []

    boards = []
    for bdir in sorted(board_dir.iterdir()):
        if not bdir.is_dir() or bdir.name.startswith("."):
            continue

        hwrevs = []
        for hdir in sorted(bdir.iterdir()):
            if not hdir.is_dir() or not hdir.name.startswith("hwrev_"):
                continue

            roles = []
            for rdir in sorted(hdir.iterdir()):
                if rdir.is_dir() and not rdir.name.startswith("."):
                    roles.append(rdir.name)

            hwrevs.append({"id": hdir.name, "roles": roles})

        boards.append({
            "name": bdir.name,
            "path": str(bdir),
            "hwrevs": hwrevs,
        })

    return boards


def scan_hal_headers(workspace_root: Optional[Path] = None) -> list[dict]:
    """
    Scan pds_hal/abstract/ for platform-agnostic HAL headers.

    Returns list of:
    {
        "header": "pds_adc.h",
        "path": "/abs/path/...",
        "pin_requirements": ["adc"]  # what kind of pins this needs
    }
    """
    if workspace_root is None:
        workspace_root = find_workspace_root()

    abstract_dir = workspace_root / "Device" / "pds" / "pds_hal" / "abstract"
    if not abstract_dir.is_dir():
        return []

    # Map headers to their pin requirements
    pin_req_map = {
        "pds_adc.h": ["adc"],
        "pds_pwm.h": ["pwm"],
        "pds_gpio.h": ["gpio"],
        "pds_spi.h": ["spi_mosi", "spi_miso", "spi_clk", "spi_cs"],
        "pds_motor_DRV8833.h": ["pwm", "pwm"],  # needs 2 PWM pins
        "pds_pins.h": [],
        "pds_hal.h": [],
        "pds_hal_config.h": [],
    }

    headers = []
    for f in sorted(abstract_dir.iterdir()):
        if f.is_file() and f.suffix == ".h":
            headers.append({
                "header": f.name,
                "path": str(f),
                "pin_requirements": pin_req_map.get(f.name, []),
            })

    return headers


def _scan_headers(module_dir: Path) -> list[str]:
    """Find all .h files in module's include/ directory."""
    include_dir = module_dir / "include"
    if not include_dir.is_dir():
        # Also check abstract/ for pds_hal
        abstract_dir = module_dir / "abstract"
        if abstract_dir.is_dir():
            return [f.name for f in sorted(abstract_dir.iterdir()) if f.suffix == ".h"]
        return []

    return [f.name for f in sorted(include_dir.iterdir()) if f.suffix == ".h"]


def _parse_dependencies(module_dir: Path) -> list[str]:
    """Parse REQUIRES from CMakeLists.txt to find PDS dependencies."""
    cmake_file = module_dir / "CMakeLists.txt"
    if not cmake_file.exists():
        return []

    content = cmake_file.read_text(encoding="utf-8")

    # Match REQUIRES or PRIV_REQUIRES lines
    deps = []
    for match in re.finditer(r'(?:REQUIRES|PRIV_REQUIRES)\s+([^)]+)', content):
        tokens = match.group(1).split()
        for token in tokens:
            token = token.strip()
            if token.startswith("pds_"):
                deps.append(token)

    return sorted(set(deps))


if __name__ == "__main__":
    import json

    root = find_workspace_root()
    print(f"Workspace root: {root}\n")

    print("=== PDS Modules ===")
    modules = scan_modules(root)
    print(json.dumps(modules, indent=2))

    print("\n=== Boards ===")
    boards = scan_boards(root)
    print(json.dumps(boards, indent=2))

    print("\n=== HAL Headers ===")
    headers = scan_hal_headers(root)
    print(json.dumps(headers, indent=2))
