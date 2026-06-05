#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
flash_with_bp.py  —  Stop the VS Code ButtonPusher server, execute the
BOOT+EN button sequence, then flash via esptool.

Defaults match the h2o-Tower dev rig:
  SM-ButtonPusher  → COM5      (servo4=BOOT, servo3=EN)
  Target ESP32     → COM10     (NodeMCU-32S, esp32 chip)

Usage
-----
  # Build was already done — just flash:
  python flash_with_bp.py

  # Override any default:
  python flash_with_bp.py --bp-port COM5 --flash-port COM10 --boot-ch 4 --en-ch 3

  # Build first, then flash:
  python flash_with_bp.py --build --board esp32_node32s --hwrev hwrev_001 --role AERO-001

  # Flash NVS defaults only (no full firmware):
  python flash_with_bp.py --nvs-only --role AERO-001

Bootloader sequence
-------------------
  1.  Push BOOT (hold)
  2.  Push EN   (reset pulse)
  3.  Release EN
  4.  Release BOOT
  5.  Wait 2 s — device is now in download mode
  6.  esptool writes flash
  7.  esptool --after hard_reset reboots device into normal mode
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

# ─── Paths ────────────────────────────────────────────────────────────────────

WORKSPACE   = Path(__file__).parent.parent.parent          # k:\PDS_AutomationSuite\
DIST_DIR    = Path(__file__).parent.parent / "dist"        # PDS-BuildTools/dist/
VENV_PY     = WORKSPACE / ".venv" / "Scripts" / "python.exe"
PYTHON      = str(VENV_PY) if VENV_PY.exists() else sys.executable

# ─── ANSI helpers ─────────────────────────────────────────────────────────────

def _p(color: str, tag: str, msg: str) -> None:
    print(f"{color}[{tag}]{chr(0x1b)}[0m {msg}", flush=True)

ok   = lambda m: _p("\033[92m", "+", m)
err  = lambda m: _p("\033[91m", "-", m)
warn = lambda m: _p("\033[93m", "!", m)
info = lambda m: _p("\033[94m", "*", m)
step = lambda m: _p("\033[96m", ">", m)


# ─── Kill VS Code buttonpusher server ─────────────────────────────────────────

def kill_bp_server() -> int:
    """Kill any python process whose command line contains 'buttonpusher.server'.
    Returns the number of processes killed."""
    info("Stopping VS Code ButtonPusher server (releases COM5)...")

    ps_cmd = (
        "Get-WmiObject Win32_Process "
        "| Where-Object { $_.CommandLine -like '*buttonpusher.server*' } "
        "| ForEach-Object { "
        "    Write-Host \"  Killing PID $($_.ProcessId): $($_.CommandLine)\"; "
        "    Stop-Process -Id $_.ProcessId -Force "
        "}"
    )
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps_cmd],
        capture_output=True, text=True
    )
    if result.stdout.strip():
        print(result.stdout.strip())
    killed = result.stdout.count("Killing PID")
    if killed == 0:
        warn("No buttonpusher.server process found — COM5 may already be free")
    else:
        ok(f"Killed {killed} process(es)")
    time.sleep(1.5)   # give Windows time to release the COM port
    return killed


# ─── ButtonPusher sequence ─────────────────────────────────────────────────────

def do_boot_sequence(bp_port: str, boot_ch: int, en_ch: int) -> None:
    """Open COM5 directly and execute the BOOT+EN download-mode sequence."""

    # Import from the installed package in the venv.
    # If this script is run with the venv Python, the import works directly.
    try:
        from buttonpusher.device import ButtonPusherDevice, DeviceError
        from buttonpusher.config import ChannelConfig
    except ImportError:
        err("Cannot import buttonpusher — is the venv active?")
        err(f"  Run with: {PYTHON} {__file__}")
        sys.exit(1)

    cfg = ChannelConfig()
    boot_push    = cfg.servo_push_angle(boot_ch)
    boot_release = cfg.servo_release_angle(boot_ch)
    en_push      = cfg.servo_push_angle(en_ch)
    en_release   = cfg.servo_release_angle(en_ch)

    step(f"Opening ButtonPusher on {bp_port}...")
    step(f"  BOOT ch{boot_ch}: push={boot_push}° release={boot_release}°")
    step(f"  EN   ch{en_ch}: push={en_push}°  release={en_release}°")

    try:
        dev = ButtonPusherDevice(bp_port)
        dev.open()
    except Exception as exc:
        err(f"Cannot open ButtonPusher on {bp_port}: {exc}")
        sys.exit(1)

    try:
        step("1/4 Push BOOT...")
        dev.send_command(f"SERVO {boot_ch} {boot_push}")
        time.sleep(0.5)

        step("2/4 Push EN (reset pulse)...")
        dev.send_command(f"SERVO {en_ch} {en_push}")
        time.sleep(0.5)

        step("3/4 Release EN...")
        dev.send_command(f"SERVO {en_ch} {en_release}")
        time.sleep(0.5)

        step("4/4 Release BOOT...")
        dev.send_command(f"SERVO {boot_ch} {boot_release}")

        ok("Button sequence complete — device is in download mode")
        step("Waiting 1 s for bootloader to settle...")
        time.sleep(1.0)

    except Exception as exc:
        # Best-effort release — never leave servos pressed
        try:
            dev.send_command(f"SERVO {boot_ch} {boot_release}")
            dev.send_command(f"SERVO {en_ch} {en_release}")
        except Exception:
            pass
        err(f"ButtonPusher sequence failed: {exc}")
        dev.close()
        sys.exit(1)

    dev.close()


# ─── Partition CSV helper ──────────────────────────────────────────────────────

def read_partition_offsets() -> dict:
    """Parse partitions.csv from dist/ and return {name: offset_int}."""
    csv_candidates = [
        DIST_DIR / "partitions.csv",
        WORKSPACE / "Device" / "main" / "partitions.csv",
    ]
    for csv_path in csv_candidates:
        if not csv_path.exists():
            continue
        offsets = {}
        for line in csv_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 4 and parts[3].startswith("0x"):
                offsets[parts[0]] = int(parts[3], 16)
        return offsets
    return {}


# ─── Flash firmware ────────────────────────────────────────────────────────────

def flash_firmware(flash_port: str, chip: str = "esp32", before: str = "no-reset") -> int:
    """Run esptool to write all four firmware binaries."""
    bins = {
        "bootloader.bin":       DIST_DIR / "bootloader.bin",
        "partition-table.bin":  DIST_DIR / "partition-table.bin",
        "pds-device.bin":       DIST_DIR / "pds-device.bin",
        "ota_data_initial.bin": DIST_DIR / "ota_data_initial.bin",
    }
    missing = [n for n, p in bins.items() if not p.exists()]
    if missing:
        err(f"Missing binaries in dist/: {', '.join(missing)}")
        err("Build the firmware first:  python build_selector.py --board esp32_node32s --hwrev hwrev_001 --role AERO-001")
        return 1

    # Print sizes for confidence
    for name, path in bins.items():
        info(f"  {name:30s} {path.stat().st_size:>10,} bytes")

    # Derive flash addresses from partition CSV, fall back to known esp32 defaults
    parts = read_partition_offsets()
    addr_bootloader = "0x0" if chip not in ("esp32", "esp32s2") else "0x1000"
    addr_app        = f"0x{parts.get('ota_0',  0x10000):x}"
    addr_otadata    = f"0x{parts.get('otadata', 0x2d0000):x}"

    cmd = [
        PYTHON, "-m", "esptool",
        "--chip", chip,
        "--port", flash_port,
        "-b", "460800",
        "--before", before,        # no-reset (bp) or default_reset (auto)
        "--after", "hard-reset",   # esptool will do the final reset into normal mode
        "write-flash",
        "--flash-mode", "dio",
        "--flash-size", "4MB",
        "--flash-freq", "40m",
        addr_bootloader, str(bins["bootloader.bin"]),
        "0x8000",                 str(bins["partition-table.bin"]),
        addr_app,                 str(bins["pds-device.bin"]),
        addr_otadata,             str(bins["ota_data_initial.bin"]),
    ]

    step(f"Flashing to {flash_port} (chip={chip})...")
    print("  " + " ".join(cmd[2:]))   # print without python path for readability
    result = subprocess.run(cmd)
    return result.returncode


# ─── Flash NVS defaults only ────────────────────────────────────────────────

def flash_nvs_defaults(role: str, flash_port: str, chip: str = "esp32", before: str = "no-reset") -> int:
    """Flash only the nvs_defaults.bin for a role."""
    nvs_bin = DIST_DIR / "defaults" / role / "nvs_defaults.bin"
    if not nvs_bin.exists():
        err(f"nvs_defaults.bin not found: {nvs_bin}")
        return 1

    info(f"  {nvs_bin.name:30s} {nvs_bin.stat().st_size:>10,} bytes")

    parts = read_partition_offsets()
    nvs_offset = f"0x{parts.get('nvs', 0x9000):x}"

    cmd = [
        PYTHON, "-m", "esptool",
        "--chip", chip,
        "--port", flash_port,
        "-b", "460800",
        "--before", before,
        "--after", "hard-reset",
        "--no-stub",
        "write-flash",
        "--flash-mode", "dio",
        "--flash-size", "4MB",
        "--flash-freq", "40m",
        nvs_offset, str(nvs_bin),
    ]

    step(f"Flashing NVS defaults ({role}) to {flash_port} @ {nvs_offset}...")
    result = subprocess.run(cmd)
    return result.returncode


# ─── Build helper ─────────────────────────────────────────────────────────────

def run_build(board: str, hwrev: str, role: str) -> int:
    build_script = Path(__file__).parent / "build_selector.py"
    cmd = [PYTHON, str(build_script),
           "--board", board, "--hwrev", hwrev, "--role", role]
    step(f"Building: {' '.join(cmd[2:])}")
    result = subprocess.run(cmd)
    return result.returncode


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Stop VS Code BP server → BOOT+EN sequence → esptool flash",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Flash firmware already in dist/:
  python flash_with_bp.py

  # Build then flash:
  python flash_with_bp.py --build --board esp32_node32s --hwrev hwrev_001 --role AERO-001

  # Flash NVS defaults only (no firmware wipe):
  python flash_with_bp.py --nvs-only --role AERO-001

  # Custom ports:
  python flash_with_bp.py --bp-port COM5 --flash-port COM10
        """,
    )
    parser.add_argument("--bp-port",    default="COM5",   help="SM-ButtonPusher serial port (default: COM5)")
    parser.add_argument("--flash-port", default="COM10",  help="Target device serial port (default: COM10)")
    parser.add_argument("--boot-ch",    type=int, default=4, help="ButtonPusher channel wired to BOOT (default: 4)")
    parser.add_argument("--en-ch",      type=int, default=3, help="ButtonPusher channel wired to EN/RST (default: 3)")
    parser.add_argument("--chip",       default="esp32",  help="ESP chip type for esptool (default: esp32)")
    parser.add_argument("--build",      action="store_true", help="Build firmware before flashing")
    parser.add_argument("--board",   default="esp32_node32s")
    parser.add_argument("--hwrev",      default="hwrev_001")
    parser.add_argument("--role",       default="AERO-001")
    parser.add_argument("--nvs-only",   action="store_true", help="Flash only NVS defaults, not full firmware")
    parser.add_argument("--no-kill",      action="store_true", help="Skip killing the VS Code BP server (COM5 must be free already)")
    parser.add_argument("--auto-reset",   action="store_true", help="Skip ButtonPusher; use esptool default_reset (DTR/RTS) — works on NodeMCU-32S with CP2102")
    args = parser.parse_args()

    print()
    print("\033[96m\033[1m" + "=" * 60 + "\033[0m")
    print("\033[96m\033[1m" + "  PDS Flash with ButtonPusher".center(60) + "\033[0m")
    print("\033[96m\033[1m" + "=" * 60 + "\033[0m")
    print()

    # 1. Build if requested
    if args.build:
        rc = run_build(args.board, args.hwrev, args.role)
        if rc != 0:
            err("Build failed — aborting flash")
            return rc
        ok("Build complete")
        print()

    # 2. Kill VS Code BP server so we can own COM5 (not needed for auto-reset)
    if not args.no_kill and not args.auto_reset:
        kill_bp_server()
        print()

    # 3. Do BOOT+EN sequence (skip if using board's auto-reset circuit)
    before_mode = "no-reset"
    if args.auto_reset:
        warn("--auto-reset: skipping ButtonPusher, using esptool default_reset (DTR/RTS)")
        before_mode = "default_reset"
        print()
    else:
        do_boot_sequence(args.bp_port, args.boot_ch, args.en_ch)
        print()

    # 4. Flash
    if args.nvs_only:
        rc = flash_nvs_defaults(args.role, args.flash_port, args.chip, before=before_mode)
    else:
        rc = flash_firmware(args.flash_port, args.chip, before=before_mode)

    print()
    if rc == 0:
        ok("Flash successful — device is rebooting into normal mode")
    else:
        err(f"esptool exited with code {rc}")
        warn("Tip: if esptool says 'Failed to connect', the device may not have entered")
        warn("     download mode. Check servo calibration with: buttonpusher --port COM5 servo 4 <angle>")

    return rc


if __name__ == "__main__":
    sys.exit(main())
