#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
deploy_firmware.py — Upload firmware and/or config blobs after a build.

Two distinct deployment targets:

  1. WEB-FwServer  (--ota)
     Uploads pds-device.bin to the WEB-FwServer REST API.
     The server stores it; devices already on WiFi pull it down via OTA.
     board, hwrev, role, and version are read from .flash_config.json.
     Version is auto-incremented (patch digit) unless --fw-version is given.

  2. Physical device  (--push-config)
     Sends L1/L2/L3 binary blobs (pipeline, hw_vars, settings) directly
     to a running device's HTTPS endpoint (POST /config on port 8443).
     Requires: --device-ip or --device-hostname

The two modes can be combined in a single invocation.

Usage examples:
  # OTA only — reads board/hwrev/role/version from .flash_config.json
  python deploy_firmware.py --ota \\
      --fw-server-url http://localhost:3002 --fw-token <admin-jwt>

  # OTA with explicit version override
  python deploy_firmware.py --ota --fw-version 0.2.001 \\
      --fw-server-url http://localhost:3002 --fw-token <admin-jwt>

  # Push L1/L2/L3 config to a live device on the local network
  python deploy_firmware.py --push-config --device-ip 192.168.1.55

  # Full deploy: OTA upload + push config
  python deploy_firmware.py --ota --push-config \\
      --fw-server-url http://localhost:3002 --fw-token <admin-jwt> \\
      --device-ip 192.168.1.55
"""

import os
import sys
import json
import argparse
import hashlib
import ssl
import urllib.request
import urllib.error
from pathlib import Path

# ── ANSI colours ──────────────────────────────────────────────────────────────

class C:
    RESET  = '\033[0m'
    GREEN  = '\033[92m'
    YELLOW = '\033[93m'
    RED    = '\033[91m'
    CYAN   = '\033[96m'
    BOLD   = '\033[1m'

def ok(msg):    print(f"{C.GREEN}[+]{C.RESET} {msg}")
def warn(msg):  print(f"{C.YELLOW}[!]{C.RESET} {msg}")
def err(msg):   print(f"{C.RED}[-]{C.RESET} {msg}")
def info(msg):  print(f"{C.CYAN}[*]{C.RESET} {msg}")

# ── Flash config ─────────────────────────────────────────────────────────────

FLASH_CONFIG_PATH = Path(__file__).parent.parent / ".flash_config.json"
DIST_DIR = Path(__file__).parent.parent / "dist"
SAVED_ROLES_DIR = Path(__file__).parent.parent.parent / "PDS-Role" / "saved_roles"

def load_flash_config() -> dict:
    if not FLASH_CONFIG_PATH.exists():
        return {}
    with open(FLASH_CONFIG_PATH, "r") as f:
        return json.load(f)

def save_flash_config(cfg: dict) -> None:
    with open(FLASH_CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=2)
        f.write("\n")

def load_role_json(role: str) -> dict:
    """Load the saved role JSON for a given role ID (e.g. 'AERO-005')."""
    path = SAVED_ROLES_DIR / f"{role}.json"
    if not path.exists():
        return {}
    with open(path, "r") as f:
        return json.load(f)

def role_to_device_type(role: str) -> str:
    """
    Resolve deviceType slug for a role. Reads 'device_type' from the saved role JSON.
    This is the authoritative source — add 'device_type' to the role file in the Role Editor.
    Raises ValueError if the field is missing (field required since PDS-0001 fix, 2026-05).
    """
    role_data = load_role_json(role)
    device_type = role_data.get("device_type")
    if not device_type:
        raise ValueError(
            f"Role '{role}' has no 'device_type' field in PDS-Role/saved_roles/{role}.json. "
            "Open the role in the Role Editor and set the Device Type field."
        )
    return device_type

def parse_version(v: str) -> tuple[int, int, int]:
    """Parse 'major.minor.patch' → (major, minor, patch). Patch may be 3-digit zero-padded."""
    parts = v.split(".")
    if len(parts) != 3:
        raise ValueError(f"Version must be major.minor.patch, got: {v!r}")
    return int(parts[0]), int(parts[1]), int(parts[2])

def format_version(major: int, minor: int, patch: int) -> str:
    """Format as 'major.minor.NNN' with zero-padded 3-digit patch."""
    return f"{major}.{minor}.{patch:03d}"

def next_version(fw_server_url: str, board: str, hwrev: str,
                device_type: str, base_version: str, token: str) -> str:
    """
    Query FwServer for existing versions on this target, find the highest
    patch that matches the same major.minor, and return major.minor.(patch+1).
    Falls back to base_version if the server is unreachable or returns no data.
    Raises ValueError if the next patch would exceed 999.
    """
    major, minor, base_patch = parse_version(base_version)
    url = f"{fw_server_url.rstrip('/')}/v1/firmware/{board}/{hwrev}/{device_type}"
    try:
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, context=_build_ssl_ctx(), timeout=5) as resp:
            versions = json.loads(resp.read())
    except Exception:
        info("Could not reach FwServer to check existing versions — using base version from flash_config.")
        return base_version

    # Start at base_patch so the first-ever upload still bumps past base_version.
    max_patch = base_patch
    for entry in versions:
        try:
            vmaj, vmin, vpatch = parse_version(entry.get("version", ""))
            if vmaj == major and vmin == minor:
                max_patch = max(max_patch, vpatch)
        except (ValueError, TypeError):
            continue

    new_patch = max_patch + 1
    if new_patch > 999:
        raise ValueError(f"Patch version overflow: {major}.{minor}.{new_patch} exceeds .999 limit.")
    return format_version(major, minor, new_patch)

# ── Helpers ───────────────────────────────────────────────────────────────────

def sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _build_ssl_ctx() -> ssl.SSLContext:
    """
    Returns an SSL context.
    For local dev the device uses a self-signed cert — we skip verification.
    For production / WEB-FwServer calls (over plain HTTP in dev) this is not used.
    """
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def http_post_json(url: str, payload: dict, token: str) -> dict:
    """POST JSON to url with Bearer token; returns parsed response."""
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    try:
        with urllib.request.urlopen(req, context=_build_ssl_ctx()) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body}") from None


def http_post_multipart(url: str, fields: dict, file_field: str,
                        file_path: Path, token: str) -> dict:
    """
    Multipart form POST.  Used to upload the firmware binary to WEB-FwServer.
    Pure stdlib — no requests library needed.
    """
    boundary = "----PdsBoundary7x9k3m"
    crlf = b"\r\n"

    body_parts: list[bytes] = []
    for key, val in fields.items():
        if val is None:
            continue
        body_parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{val}".encode()
        )
        body_parts.append(crlf)

    # File part
    filename = file_path.name
    file_bytes = file_path.read_bytes()
    body_parts.append(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"{file_field}\"; "
        f"filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n".encode()
    )
    body_parts.append(file_bytes)
    body_parts.append(crlf)
    body_parts.append(f"--{boundary}--\r\n".encode())

    body = b"".join(body_parts)
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Authorization": f"Bearer {token}",
        },
    )
    try:
        with urllib.request.urlopen(req, context=_build_ssl_ctx()) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body_txt}") from None


def http_post_binary(url: str, binary_path: Path, ssl_ctx: ssl.SSLContext) -> int:
    """POST a raw binary blob to a device endpoint. Returns HTTP status code."""
    data = binary_path.read_bytes()
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/octet-stream"},
    )
    try:
        with urllib.request.urlopen(req, context=ssl_ctx) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code

# ── OTA upload ─────────────────────────────────────────────────────────────────

def deploy_ota(args) -> bool:
    """Upload pds-device.bin to WEB-FwServer."""

    fw_bin = DIST_DIR / "pds-device.bin"
    if not fw_bin.exists():
        err(f"Firmware binary not found: {fw_bin}")
        err("Run a build first (build_selector.py or the VS Code Build panel).")
        return False

    # Resolve target identity from flash_config
    cfg = load_flash_config()
    board       = args.board       or cfg.get("board")
    hwrev       = args.hwrev       or cfg.get("hwrev")
    role        = args.role_ota    or cfg.get("role")
    device_type = args.device_type or (role_to_device_type(role) if role else None)

    if not board or not hwrev or not device_type:
        err("board, hwrev, and role/device-type are required for OTA upload.")
        err("Set them in PDS-BuildTools/.flash_config.json or pass --board/--hwrev/--device-type.")
        return False

    # Version comes from flash_config — bumped at build time by build_selector.py.
    # Full format is {hw_code}.{major}.{minor}.{patch} (e.g. "N01.0.1.012").
    if args.fw_version:
        version = args.fw_version
        info(f"Version:      {version}  (CLI override)")
    else:
        hw_code = cfg.get("hwrev_codes", {}).get(f"{board}+{hwrev}", "")
        ver_short = cfg.get("versions", {}).get(hw_code) if hw_code else None
        if ver_short:
            version = f"{hw_code}.{ver_short}"
        else:
            version = cfg.get("version", "0.1.001")  # legacy fallback
            warning(f"hw_code not found for {board}+{hwrev} — falling back to version '{version}'")
        info(f"Version:      {version}  (from .flash_config.json)")

    info(f"Target:       {board}/{hwrev}/{device_type}")
    info(f"Firmware:     {fw_bin}  ({fw_bin.stat().st_size / 1024:.1f} KB)")
    digest = sha256_of_file(fw_bin)
    info(f"SHA-256:      {digest}")

    url = f"{args.fw_server_url.rstrip('/')}/v1/firmware"
    info(f"Uploading to: {url}")

    fields = {
        "board":              board,
        "hwrev":              hwrev,
        "deviceType":         device_type,
        "version":            version,
        "minPreviousVersion": args.min_prev_version,
        "changelog":          args.changelog,
    }

    try:
        result = http_post_multipart(
            url, fields, "file", fw_bin, args.fw_token
        )
    except RuntimeError as e:
        err(f"OTA upload failed: {e}")
        return False

    ok(f"OTA firmware uploaded successfully.")
    ok(f"  Target:       {result.get('board', board)}/{result.get('hwrev', hwrev)}/{result.get('deviceType', device_type)}")
    ok(f"  Version:      {result.get('version', version)}")
    ok(f"  Server ID:    {result.get('id', '?')}")

    return True

# ── Config blob push (L1/L2/L3) ───────────────────────────────────────────────

# NVS key → blob filename suffix mapping.
# These must match the NVS keys written in nvs_defaults.csv / blob_packer.py.
BLOB_MAP = [
    ("pipeline", "l1", "L1 — Automation pipeline (LADDER)"),
    ("hw_vars",  "l2", "L2 — Hardware variables  (PINMAP)"),
    ("settings", "l3", "L3 — User settings        (USRSET)"),
]

def deploy_config(args) -> bool:
    """Push L1/L2/L3 blobs directly to a device's HTTPS /config endpoint."""

    # Role comes from CLI or flash_config
    cfg = load_flash_config()
    role = args.role or cfg.get("role")
    if not role:
        err("--role is required for --push-config (or set 'role' in .flash_config.json).")
        return False

    role_dir = DIST_DIR / "defaults" / role
    if not role_dir.exists():
        err(f"Role defaults directory not found: {role_dir}")
        err("Generate the role blobs first (Role Editor → Generate).")
        return False

    host = args.device_hostname or args.device_ip
    if not host:
        err("--device-ip or --device-hostname is required for --push-config.")
        return False

    port = args.device_port or 8443
    base_url = f"https://{host}:{port}"
    config_url = f"{base_url}/config"
    ssl_ctx = _build_ssl_ctx()  # self-signed cert on device

    info(f"Pushing config blobs to {config_url}")
    all_ok = True

    for nvs_key, suffix, label in BLOB_MAP:
        blob_path = role_dir / f"{role}_{suffix}.bin"
        if not blob_path.exists():
            warn(f"  Blob not found, skipping: {blob_path.name}")
            all_ok = False
            continue

        info(f"  Sending {label}  ({blob_path.stat().st_size} bytes) …")
        status = http_post_binary(config_url, blob_path, ssl_ctx)
        if status in (200, 201, 204):
            ok(f"  ✓ {label}")
        else:
            err(f"  ✗ {label}  (HTTP {status})")
            all_ok = False

    return all_ok

# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Deploy firmware (OTA) and/or config blobs to a device.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    # Mode flags
    parser.add_argument("--ota",         action="store_true",
                        help="Upload pds-device.bin to WEB-FwServer (OTA distribution)")
    parser.add_argument("--push-config", action="store_true",
                        help="Push L1/L2/L3 config blobs directly to a running device")

    # OTA options
    ota = parser.add_argument_group("OTA upload options (--ota)")
    ota.add_argument("--fw-server-url",   default=os.environ.get("FW_SERVER_URL", "http://localhost:3002"),
                     help="WEB-FwServer base URL  (default: $FW_SERVER_URL or http://localhost:3002)")
    ota.add_argument("--fw-token",        default=os.environ.get("FW_ADMIN_TOKEN"),
                     help="Admin JWT for WEB-FwServer  (default: $FW_ADMIN_TOKEN)")
    ota.add_argument("--board",           default=None,
                     help="Board slug, e.g. esp32_node32s  (default: read from .flash_config.json)")
    ota.add_argument("--hwrev",           default=None,
                     help="Hardware revision, e.g. hwrev_001  (default: read from .flash_config.json)")
    ota.add_argument("--device-type",     default=None,
                     help="Device type slug override  (default: derived from role in .flash_config.json)")
    ota.add_argument("--role-ota",        dest="role_ota", default=None,
                     help="Role ID for device-type mapping, e.g. AERO-005  (default: read from .flash_config.json)")
    ota.add_argument("--fw-version",      default=None,
                     help="Explicit version string, e.g. 0.2.001  (default: auto-increment patch from FwServer)")
    ota.add_argument("--min-prev-version", dest="min_prev_version",
                     help="Minimum firmware version required before this upgrade (optional)")
    ota.add_argument("--changelog",
                     help="Release notes / changelog string (optional)")

    # Config push options
    cfg_grp = parser.add_argument_group("Config push options (--push-config)")
    cfg_grp.add_argument("--role",            default=None,
                         help="Role ID, e.g. AERO-002  (default: read from .flash_config.json)")
    cfg_grp.add_argument("--device-ip",       help="Device IP address on local network")
    cfg_grp.add_argument("--device-hostname", help="Device mDNS hostname, e.g. h2o-tower.local")
    cfg_grp.add_argument("--device-port",     type=int, default=8443,
                         help="Device HTTPS port  (default: 8443)")

    args = parser.parse_args()

    if not args.ota and not args.push_config:
        parser.error("Specify at least one of --ota or --push-config.")

    if args.ota and not args.fw_token:
        parser.error("--fw-token (or $FW_ADMIN_TOKEN) is required when using --ota.")

    print(f"\n{C.CYAN}{C.BOLD}{'='*60}{C.RESET}")
    print(f"{C.CYAN}{C.BOLD}  PDS Firmware Deploy{C.RESET}")
    print(f"{C.CYAN}{C.BOLD}{'='*60}{C.RESET}\n")

    success = True

    if args.ota:
        print(f"{C.BOLD}[OTA Upload]{C.RESET}")
        if not deploy_ota(args):
            success = False
        print()

    if args.push_config:
        print(f"{C.BOLD}[Config Push — L1/L2/L3]{C.RESET}")
        if not deploy_config(args):
            success = False
        print()

    if success:
        ok("All deploy steps completed.")
    else:
        err("One or more deploy steps failed.")

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
