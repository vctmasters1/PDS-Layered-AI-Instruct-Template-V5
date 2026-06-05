"""
role_builder.py — CLI entry point for the Role Builder tool.

Scans Device/pds/ for modules, headers, and board capabilities,
then generates role files based on user selections.

Usage:
    python role_builder.py                          # Interactive mode
    python role_builder.py --list-modules           # Show available modules
    python role_builder.py --list-boards            # Show available boards
    python role_builder.py --config saved.json       # Generate from saved config
    python role_builder.py --dry-run --config saved  # Preview without writing
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from tools.module_scanner import find_workspace_root, scan_modules, scan_boards, scan_hal_headers
from tools.pin_assigner import PinAssigner, get_pin_requirements_for_headers
from tools.variable_registry import build_default_registry
from tools.role_config import RoleConfig


def cmd_list_modules(workspace_root: Path):
    """Print all discovered PDS modules and their headers."""
    modules = scan_modules(workspace_root)
    print(f"Found {len(modules)} PDS modules in {workspace_root / 'Device' / 'pds'}:\n")

    for m in modules:
        lock = " [LOCKED]" if m["locked"] else ""
        print(f"  {m['name']}{lock}")
        if m["headers"]:
            for h in m["headers"]:
                print(f"    - {h}")
        if m["dependencies"]:
            print(f"    deps: {', '.join(m['dependencies'])}")
        print()


def cmd_list_boards(workspace_root: Path):
    """Print all discovered boards, hwrevs, and roles."""
    boards = scan_boards(workspace_root)
    print(f"Found {len(boards)} boards:\n")

    for b in boards:
        print(f"  {b['name']}")
        for hwrev in b["hwrevs"]:
            roles_str = ", ".join(hwrev["roles"]) if hwrev["roles"] else "(none)"
            print(f"    {hwrev['id']}: {roles_str}")
        print()


def _infer_function_type(pin_id: str, label: str = "") -> str:
    """
    Derive a PDS_PIN_FUNC_* suffix from the structured pin_id key.

    pin_id semantics (set by the role config / component definitions):
      *_adc            → ADC
      *_power / *_enable / *_output / *_relay  → GPIO_OUT
      *_in / *_data / *_fault / *_nfault       → GPIO_IN
      *_dose_* / *_pwm*                        → PWM
      *_tx                                     → UART_TX
      *_rx                                     → UART_RX
      *_sda / *_scl                            → I2C
      *_mosi/*_miso/*_clk/*_cs                 → SPI
      *_led / *_rgb / *_ws2812                 → LED_ADDRESSABLE

    Falls back to label-based heuristic only when pin_id gives no signal.
    """
    k = pin_id.lower()

    # Ordered from most-specific to least-specific
    if k.endswith("_adc") or "_adc_" in k:          return "ADC"
    if k.endswith("_tx"):                             return "UART_TX"
    if k.endswith("_rx"):                             return "UART_RX"
    if k.endswith("_sda") or k.endswith("_scl"):     return "I2C"
    for spi in ("_mosi", "_miso", "_sclk", "_nss", "_cs"):
        if k.endswith(spi):                           return "SPI"
    for led in ("_led", "_rgb", "_ws2812", "_neopixel"):
        if k.endswith(led) or led in k:               return "LED_ADDRESSABLE"
    for pwm in ("_pwm", "_dose_", "_speed", "_duty"):
        if pwm in k:                                  return "PWM"
    for gpio_out in ("_power", "_enable", "_en", "_output", "_relay", "_dir"):
        if k.endswith(gpio_out):                      return "GPIO_OUT"
    for gpio_in in ("_data", "_in", "_fault", "_nfault", "_btn", "_switch", "_level"):
        if k.endswith(gpio_in):                       return "GPIO_IN"

    # Label-based fallback (less reliable — kept for edge cases)
    l = label.upper()
    if "ADC" in l:   return "ADC"
    if "PWM" in l:   return "PWM"
    if "SPI" in l:   return "SPI"
    if "I2C" in l:   return "I2C"
    if "UART" in l:  return "UART_TX"
    if "LED" in l:   return "LED_ADDRESSABLE"
    if "INPUT" in l or "SWITCH" in l or "SENSOR" in l: return "GPIO_IN"
    return "GPIO_OUT"


def _collect_selected_headers(modules: dict) -> list:
    """Collect all enabled header names from the modules dict."""
    headers = []
    for mod_cfg in modules.values():
        if mod_cfg.get("enabled"):
            for h in mod_cfg.get("headers", []):
                headers.append(h)
    return headers


# Short prefix map for component type → NVS-friendly variable prefix (≤4 chars)
_COMPONENT_PREFIX = {
    "sensor_ph":             "ph",
    "sensor_ec":             "ec",
    "sensor_psi":            "psi",
    "dosing_pump":           "dp",
    "motor":                 "mtr",
    "pid_servo":             "pid",
    "servo_differential":    "sdiff",
    "switch_cycle":          "swc",
    "switch_limit":          "swl",
    "switch_countdown":      "swcd",
    "switch_countup":        "swcu",
    "switch_servo":          "sws",
    "comp_switch_cycle":     "swc",
}


def _collect_usrset_defaults(raw: dict) -> list:
    """
    Collect user-settable variable defaults from a role config dict.

    Sources (in order, deduplicating by name):
    1. raw["variables"]  — module-level vars flagged remote=true
    2. raw["components"] — component instance settings (prefixed by type+index)

    Returns list of dicts: {name, value, description}
    """
    seen: set = set()
    entries: list = []

    def _add(name: str, value, description: str = ""):
        name = name[:31]  # NVS key limit
        if name in seen:
            return
        seen.add(name)
        # Convert bool/int to float for wire format consistency
        if isinstance(value, bool):
            value = 1.0 if value else 0.0
        else:
            try:
                value = float(value)
            except (TypeError, ValueError):
                return  # Skip non-numeric (strings handled by BLE provisioning)
        entries.append({"name": name, "value": value, "description": description})

    # 1. Module-level variables
    for module_name, var_list in raw.get("variables", {}).items():
        for var in var_list:
            if var.get("name", "").startswith("_"):
                continue
            _add(var["name"], var.get("default", 0), var.get("description", ""))

    # 2. Component instance settings
    for comp_type, instances in raw.get("components", {}).items():
        prefix = _COMPONENT_PREFIX.get(comp_type, comp_type[:4])
        for idx, inst in enumerate(instances):
            inst_prefix = f"{prefix}{idx}" if len(instances) > 1 else prefix
            for key, val in inst.get("settings", {}).items():
                full_name = f"{inst_prefix}_{key}"
                _add(full_name, val, f"{comp_type}[{idx}].{key}")

    return entries


def _normalize_pin_assignments(raw: dict) -> dict:
    """Add function/function_type fields to raw pin assignments from the webview."""
    normalized = {}
    for pin_id, a in raw.items():
        label = a.get("label") or pin_id
        normalized[pin_id] = {
            "gpio":          a.get("gpio", -1),
            "function":      label,
            "function_type": _infer_function_type(pin_id, label),
        }
    return normalized


# ── Peripheral type registry ──────────────────────────────────────────────────
#
# Maps the "type" string from role JSON peripherals[] to the cmake type key
# used in pds_fb/CMakeLists.txt and pds_hal/CMakeLists.txt.
#
# This map is the SINGLE SOURCE OF TRUTH for which peripheral types are known
# to the build system. Adding a new peripheral requires:
#
#   1. Add its driver to Device/pds/pds_hal/peripherals/<name>/  (skip for pure-GPIO types)
#   2. Add "<name>": "<cmake_key>" to this map
#   3. Update pds_fb/CMakeLists.txt foreach block (Category A — has fb block)
#      OR guard init in pds_process_action.c with #ifdef PDS_PERIPH_HAS_<NAME>
#         and handle it in pds_hal/CMakeLists.txt (Category B — role-level init)
#   4. Regenerate affected roles: python PDS-Role/go.py --config <ROLE>
#
# Category A (fb-block peripherals — have pds_fb_<name>.c):
#   dht22, hx711, stepper_*, pid_pwm, encoder_quadrature, encoder_mapped,
#   sensor_analog, sensor_ph, sensor_ec, pid, pwm_output, gpio_input,
#   switch_output, gpio_value, led_addr
#
# Category B (role-level init peripherals — called from pds_process_action.c):
#   ads1115
#
# Encoder types (encoder_quadrature, encoder_mapped) are pure GPIO blocks —
# no HAL driver directory needed; pds_fb/CMakeLists.txt pulls the right .c files.
#
# See Device/pds/pds_hal/AI-INSTRUCT.md "Peripheral Auto-Include System" for the
# complete data flow diagram and step-by-step guide.
_PERIPH_TYPE_MAP = {
    "dht22":              "dht22",
    "hx711":              "hx711",
    "ads1115":            "ads1115",
    "stepper_a4988":      "stepper_a4988",
    "stepper_drv8825":    "stepper_drv8825",
    "stepper_tb6600":     "stepper_tb6600",
    "stepper_tmc2209":    "stepper_tmc2209",
    "stepper_tmc2208":    "stepper_tmc2208",
    "pid_pwm":            "pid_pwm",
    "encoder_quadrature": "encoder_quadrature",
    "encoder_mapped":     "encoder_mapped",
    "encoder":            "encoder_quadrature",   # bare "encoder" type → quadrature
    # Hardware peripheral types whose cmake keys were previously missing:
    "pwm_device":         "pwm_output",   # role JSON "pwm_device" → cmake "pwm_output"
    "pwm_output":         "pwm_output",
    "sensor_ph":          "sensor_ph",
    "sensor_ec":          "sensor_ec",
    "sensor_analog":      "sensor_analog",
    "gpio_input":         "gpio_input",
    "gpio_output":        "switch_output",
    "switch_output":      "switch_output",
    "gpio_value":         "gpio_value",
    "led_addr":           "led_addr",
    "pid":                "pid",
}

# Maps pipeline blockType strings → cmake driver key.
# Used to auto-include drivers for blocks used in pipelines but not declared
# as explicit peripherals (e.g. pid, sensor_analog, gpio_output).
_BLOCK_TYPE_TO_CMAKE_KEY: dict = {
    "sensor_analog":            "sensor_analog",
    "sensor_ph":                "sensor_ph",
    "sensor_ec":                "sensor_ec",
    "sensor_dht22_temp":        "dht22",
    "sensor_dht22_humid":       "dht22",
    "sensor_hx711":             "hx711",
    "pid":                      "pid",
    "pid_pwm":                  "pid_pwm",
    "pwm_output":               "pwm_output",
    "gpio_input":               "gpio_input",
    "gpio_output":              "switch_output",
    "switch_output":            "switch_output",
    "gpio_value":               "gpio_value",
    "led_addr":                 "led_addr",
    "stepper_a4988_velocity":   "stepper_a4988",
    "stepper_drv8825_velocity": "stepper_drv8825",
    "stepper_tb6600_velocity":  "stepper_tb6600",
    "stepper_tmc2209_velocity": "stepper_tmc2209",
    "stepper_tmc2208_velocity": "stepper_tmc2208",
    "stepper_a4988_position":   "stepper_a4988",
    "stepper_drv8825_position": "stepper_drv8825",
    "stepper_tb6600_position":  "stepper_tb6600",
    "stepper_tmc2209_position": "stepper_tmc2209",
    "stepper_tmc2208_position": "stepper_tmc2208",
    "encoder_position":         "encoder_quadrature",
    "encoder_velocity":         "encoder_quadrature",
    "encoder_mapped":           "encoder_mapped",
}


def _generate_periph_cmake(role_id: str, peripherals: list, timestamp: str,
                           pipelines: list | None = None) -> str:
    """
    Generate pds_periph_drivers.cmake for a role's peripheral list.

    The file sets PDS_PERIPH_TYPES to the de-duplicated list of cmake type keys
    for all peripherals declared in this role.  pds_fb/CMakeLists.txt reads this
    file and maps each key to the corresponding .c source file + compile definition.
    """
    seen = set()
    types = []
    unknown = []
    for p in peripherals:
        ptype = (p.get("type") or "").lower().strip()
        cmake_key = _PERIPH_TYPE_MAP.get(ptype)
        if cmake_key is None:
            unknown.append(ptype)
            continue
        if cmake_key not in seen:
            seen.add(cmake_key)
            types.append(cmake_key)

    # Also scan pipeline block types to auto-include drivers for blocks that are
    # used in pipelines but not declared as explicit peripherals (e.g. pid, sensor_analog).
    if pipelines:
        for pl in (pipelines or []):
            all_blocks = list(pl.get("blocks", []))
            for blk in list(pl.get("blocks", [])):
                all_blocks.extend(blk.get("fan_outputs", []))
            for blk in all_blocks:
                bt = (blk.get("blockType") or "").lower().strip()
                cmake_key = _BLOCK_TYPE_TO_CMAKE_KEY.get(bt)
                if cmake_key and cmake_key not in seen:
                    seen.add(cmake_key)
                    types.append(cmake_key)

    lines = [
        f"# Auto-generated by PDS Role Builder — {timestamp}",
        f"# Peripheral drivers for role: {role_id}",
        f"# DO NOT EDIT — regenerate via: python PDS-Role/go.py --config {role_id}",
        "",
    ]

    if unknown:
        for u in unknown:
            lines.append(f"# WARNING: unknown peripheral type '{u}' — no driver registered")
        lines.append("")

    if types:
        cmake_list = ";".join(types)
        lines.append(f'set(PDS_PERIPH_TYPES "{cmake_list}")')
    else:
        lines.append("set(PDS_PERIPH_TYPES \"\")")
        lines.append("# No peripheral drivers required for this role")

    lines.append("")
    return "\n".join(lines)


def cmd_generate(workspace_root: Path, config_path: Path, dry_run: bool = False,
                 pack_blobs: bool = True):
    """Generate role files from a saved config using Jinja2 templates."""
    raw = json.loads(config_path.read_text(encoding="utf-8"))

    # Read identity fields — try 'platform' (legacy save key), then 'target' (IDF target alias)
    role_id   = raw.get("role_id", "")
    display_name = raw.get("display_name", "") or role_id
    board     = raw.get("platform", "") or raw.get("target", "")
    hwrev     = raw.get("hwrev", "")

    if not (role_id and board and hwrev):
        print("ERROR: Invalid config — missing role_id, board/target, or hwrev", file=sys.stderr)
        sys.exit(1)

    # Map IDF_TARGET names to pds_hal board subdirectory names.
    # Old role JSONs used the subdir name directly (e.g. "esp32_node32s"),
    # newer JSONs may use the bare IDF target (e.g. "esp32").
    _IDF_TARGET_TO_SUBDIR = {
        "esp32":    "esp32_node32s",
        "esp32c3":  "esp32c3_sm",
        "esp32s3":  "esp32s3",
    }
    board_subdir = _IDF_TARGET_TO_SUBDIR.get(board, board)

    timestamp        = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    selected_headers = _collect_selected_headers(raw.get("modules", {}))
    pin_assignments  = _normalize_pin_assignments(raw.get("pin_assignments", {}))
    usrset_defaults  = _collect_usrset_defaults(raw)
    peripherals      = raw.get("peripherals", [])

    hal_dir = (workspace_root / "Device" / "pds" / "pds_hal" / "board" /
               board_subdir / hwrev / role_id)

    ctx = {
        "role_id":          role_id,
        "display_name":      display_name,
        "platform":         board,   # keep for template backward compat
        "target":           board,   # alias — templates may use either
        "hwrev":            hwrev,
        "timestamp":        timestamp,
        "selected_headers": selected_headers,
        "pin_assignments":  pin_assignments,
        "modules":          raw.get("modules", {}),
        "components":       raw.get("components", {}),
        "usrset_defaults":  usrset_defaults,
        "peripherals":      peripherals,
    }

    templates_dir = Path(__file__).parent.parent / "templates"
    env = Environment(
        loader=FileSystemLoader(str(templates_dir)),
        undefined=StrictUndefined,
        keep_trailing_newline=True,
    )
    # c_ident: convert an arbitrary string into a valid C identifier.
    # Replaces any character that is not alphanumeric or underscore with '_'.
    # Example: "h2o-106" → "h2o_106", "AERO-001" → "AERO_001"
    import re as _re
    env.filters['c_ident'] = lambda s: _re.sub(r'[^A-Za-z0-9_]', '_', str(s))

    files_to_write = {
        "pds_process_action.c": env.get_template("pds_process_action.c.j2").render(ctx),
        "usrset_defaults.h":    env.get_template("usrset_defaults.h.j2").render(ctx),
        "pds_periph_drivers.cmake": _generate_periph_cmake(role_id, peripherals, timestamp, raw.get("pipelines", [])),
    }

    print(f"Role:     {role_id} ({display_name})")
    print(f"Target:   {board} / {hwrev}")
    print(f"Headers:  {', '.join(selected_headers) if selected_headers else '(none)'}")
    print(f"Pins:     {len(pin_assignments)} assigned")
    print(f"Usrset:   {len(usrset_defaults)} defaults")
    print()
    print(f"Output:   {hal_dir}")
    print()
    for fname in files_to_write:
        print(f"  {'[DRY RUN] would write' if dry_run else 'Writing'}: {hal_dir / fname}")

    if dry_run:
        for fname, content in files_to_write.items():
            print(f"\n--- {fname} ---")
            print(content[:800] + ("..." if len(content) > 800 else ""))
        print("\n[DRY RUN] No files written.")
        return

    hal_dir.mkdir(parents=True, exist_ok=True)
    for fname, content in files_to_write.items():
        (hal_dir / fname).write_text(content, encoding="utf-8")

    print(f"\nDone. Role '{role_id}' generated.")

    if pack_blobs:
        print()
        try:
            from tools.blob_packer import pack_role
            pack_role(config_path)
        except Exception as e:
            print(f"[warn] Blob packing skipped: {e}", file=sys.stderr)



def main():
    parser = argparse.ArgumentParser(description="PDS Role Builder")
    parser.add_argument("--list-modules", action="store_true", help="List available PDS modules")
    parser.add_argument("--list-boards", action="store_true", help="List available boards")
    parser.add_argument("--config", type=str, help="Path to a saved role config JSON")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing files")
    parser.add_argument("--no-blobs", action="store_true",
                        help="Skip blob packing step after generate")

    args = parser.parse_args()
    workspace_root = find_workspace_root()

    if args.list_modules:
        cmd_list_modules(workspace_root)
    elif args.list_boards:
        cmd_list_boards(workspace_root)
    elif args.config:
        config_path = Path(args.config)
        if not config_path.exists():
            # Try saved_roles/ directory (one level up from tools/)
            saved = Path(__file__).parent.parent / "saved_roles" / f"{args.config}.json"
            if saved.exists():
                config_path = saved
            else:
                print(f"ERROR: Config file not found: {args.config}", file=sys.stderr)
                sys.exit(1)
        cmd_generate(workspace_root, config_path, args.dry_run,
                     pack_blobs=not args.no_blobs)
    else:
        # Interactive mode — show summary
        print("PDS Role Builder")
        print("=" * 40)
        cmd_list_boards(workspace_root)
        cmd_list_modules(workspace_root)
        print("Use --config <file> to generate, or launch the GUI from the PDS Toolbox sidebar.")


if __name__ == "__main__":
    main()
