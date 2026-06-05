"""
headless_flash.py — Mirrors deploy-panel.js runFlash() exactly.
Reads .flash_config.json, runs ButtonPusher sequence, then esptool.

Usage:
    python PDS-BuildTools/scripts/headless_flash.py [--defaults]

    --defaults : flash NVS defaults only (nvs_defaults.bin)
"""

import json
import subprocess
import sys
import time
import os

WORKSPACE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG_PATH = os.path.join(WORKSPACE, "PDS-BuildTools", ".flash_config.json")
DIST_DIR    = os.path.join(WORKSPACE, "PDS-BuildTools", "dist")
PYTHON      = os.path.join(WORKSPACE, ".venv", "Scripts", "python.exe")

FLASH_DEFAULTS = "--defaults" in sys.argv
FLASH_L1L2L3   = "--l1l2l3"  in sys.argv

# --nvs <path>  flash a specific bin at 0x9000
NVS_BIN = None
if "--nvs" in sys.argv:
    idx = sys.argv.index("--nvs")
    if idx + 1 < len(sys.argv):
        NVS_BIN = sys.argv[idx + 1]

# ── Load config ────────────────────────────────────────────────────────────────
with open(CONFIG_PATH) as f:
    cfg = json.load(f)

port            = cfg["port"]
chip            = cfg.get("chip", "esp32")
bootloader_offset = cfg.get("bootloaderOffset", "0x1000")
flash_freq      = cfg.get("flashFreq", "40m")
use_bp          = cfg.get("useButtonPusher", False)
bp_port         = cfg.get("bpPort", "COM5")
ch_boot         = cfg.get("chBoot", 4)
ch_en           = cfg.get("chEn",   3)

# ButtonPusher timing — tuned for this rig's servo travel speed.
# Override any of these in .flash_config.json to avoid editing this script.
# Symptom for too-short values: "No serial data received" on every attempt.
BP_BOOT_SETTLE_S  = cfg.get("bpBootSettleS",  1.5)  # servo travel + button contact
BP_EN_HOLD_S      = cfg.get("bpEnHoldS",      0.8)  # hold EN low; chip registers reset
BP_BOOTLOADER_S   = cfg.get("bpBootloaderS",  3.0)  # wait for ROM bootloader ready
MAX_FLASH_ATTEMPTS = cfg.get("flashRetries",  5)    # retries before giving up

# ── ButtonPusher sequence ──────────────────────────────────────────────────────
if use_bp:
    print(f"[BP] Starting ButtonPusher server on {bp_port}...")
    bp_proc = subprocess.Popen(
        [PYTHON, "-m", "buttonpusher.server", "--port", bp_port],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    def bp_send(action, channel=None, **kwargs):
        cmd = {"action": action}
        if channel is not None:
            cmd["channel"] = channel
        cmd.update(kwargs)
        line = json.dumps(cmd) + "\n"
        bp_proc.stdin.write(line)
        bp_proc.stdin.flush()
        resp = bp_proc.stdout.readline()
        print(f"[BP] {line.strip()} -> {resp.strip()}")
        return resp

    # Wait for server ready (it prints a ready line on stdout)
    ready_line = bp_proc.stdout.readline()
    print(f"[BP] ready: {ready_line.strip()}")

    before_flag = "no-reset"
    after_flag  = "no-reset"
else:
    before_flag = "default-reset"
    after_flag  = "hard-reset"

# ── Build esptool command ──────────────────────────────────────────────────────
if NVS_BIN:
    # Flash a specific NVS binary at 0x9000 — always hard-reset after
    if not os.path.exists(NVS_BIN):
        print(f"ERROR: NVS binary not found: {NVS_BIN}")
        sys.exit(1)
    flash_args = ["0x9000", NVS_BIN]
    after_flag = "hard-reset"   # always reboot after NVS flash
    print(f"[FLASH] NVS binary: {NVS_BIN}")
elif FLASH_L1L2L3:
    # Flash L1/L2/L3 pipeline default bins
    role = cfg.get("role", "AERO-001")
    defaults_dir = os.path.join(DIST_DIR, "defaults", role)
    partitions_csv = os.path.join(WORKSPACE, "Device", "main", "partitions.csv")
    l1_addr, l2_addr, l3_addr, l4_addr = 0x2D2000, 0x2E2000, 0x2F2000, 0x300000
    if os.path.exists(partitions_csv):
        with open(partitions_csv) as f:
            for line in f:
                line = line.strip()
                if line.startswith("#") or not line:
                    continue
                parts = [p.strip() for p in line.split(",")]
                if len(parts) >= 4:
                    name, offset = parts[0], parts[3]
                    try:
                        addr = int(offset, 16) if offset.startswith("0x") else int(offset)
                        if name == "pds_l1": l1_addr = addr
                        elif name == "pds_l2": l2_addr = addr
                        elif name == "pds_l3": l3_addr = addr
                        elif name == "pds_l4": l4_addr = addr
                    except ValueError:
                        pass
    l1_bin = os.path.join(defaults_dir, f"{role}_l1.bin")
    l2_bin = os.path.join(defaults_dir, f"{role}_l2.bin")
    l3_bin = os.path.join(defaults_dir, f"{role}_l3.bin")
    l4_bin = os.path.join(defaults_dir, f"{role}_l4.bin")
    for b in [l1_bin, l2_bin, l3_bin]:
        if not os.path.exists(b):
            print(f"ERROR: Missing binary: {b}")
            sys.exit(1)

    # Prepend 4-byte LE length header so firmware can read the exact blob size
    # from the raw partition at boot (when NVS is empty).
    import struct, tempfile, atexit
    _tmp_files = []
    def _make_framed(src_path):
        data = open(src_path, "rb").read()
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".bin")
        tmp.write(struct.pack("<I", len(data)))
        tmp.write(data)
        tmp.close()
        _tmp_files.append(tmp.name)
        return tmp.name
    atexit.register(lambda: [os.unlink(f) for f in _tmp_files if os.path.exists(f)])

    flash_args = [
        hex(l1_addr), _make_framed(l1_bin),
        hex(l2_addr), _make_framed(l2_bin),
        hex(l3_addr), _make_framed(l3_bin),
    ]
    # L4 is optional — only present for roles with UI peripherals (e.g. OLED)
    if os.path.exists(l4_bin):
        flash_args += [hex(l4_addr), _make_framed(l4_bin)]
        print(f"[FLASH] L1/L2/L3/L4 for role {role} (with 4-byte length prefix)")
    else:
        print(f"[FLASH] L1/L2/L3 for role {role} (no L4 — no UI peripherals)")
    after_flag = "hard-reset"
elif FLASH_DEFAULTS:
    # NVS defaults only
    role = cfg.get("role", "AERO-001")
    nvs_bin = os.path.join(DIST_DIR, "defaults", role, "nvs_defaults.bin")
    if not os.path.exists(nvs_bin):
        print(f"ERROR: NVS defaults not found: {nvs_bin}")
        sys.exit(1)
    flash_args = ["0x9000", nvs_bin]
    print(f"[FLASH] NVS defaults: {nvs_bin}")
else:
    # Full firmware — read partition offsets from partition table CSV
    partitions_csv = os.path.join(WORKSPACE, "Device", "main", "partitions.csv")
    ota0_addr   = 0x10000
    otadata_addr = 0x2d0000
    if os.path.exists(partitions_csv):
        with open(partitions_csv) as f:
            for line in f:
                line = line.strip()
                if line.startswith("#") or not line:
                    continue
                parts = [p.strip() for p in line.split(",")]
                if len(parts) >= 4:
                    name, ptype, subtype, offset = parts[0], parts[1], parts[2], parts[3]
                    try:
                        addr = int(offset, 16) if offset.startswith("0x") else int(offset)
                        if subtype == "ota_0":
                            ota0_addr = addr
                        elif subtype == "ota":
                            otadata_addr = addr
                    except ValueError:
                        pass

    boot_bin  = os.path.join(DIST_DIR, "bootloader.bin")
    part_bin  = os.path.join(DIST_DIR, "partition-table.bin")
    app_bin   = os.path.join(DIST_DIR, "pds-device.bin")
    ota_bin   = os.path.join(DIST_DIR, "ota_data_initial.bin")

    for b in [boot_bin, part_bin, app_bin, ota_bin]:
        if not os.path.exists(b):
            print(f"ERROR: Missing binary: {b}")
            sys.exit(1)

    flash_args = [
        bootloader_offset, boot_bin,
        "0x8000",          part_bin,
        hex(ota0_addr),    app_bin,
        hex(otadata_addr), ota_bin,
    ]

# NVS and L1/L2/L3 flashes use --no-stub (avoids stub upload failure on small partitions)
no_stub = NVS_BIN or FLASH_L1L2L3 or FLASH_DEFAULTS

baud = "115200" if no_stub else "460800"

cmd = [
    PYTHON, "-m", "esptool",
    "--chip", chip,
    "--port", port,
    "-b", baud,
    "--before", before_flag,
    "--after",  after_flag,
] + (["--no-stub"] if no_stub else []) + [
    "write-flash",
    "--flash-mode", "dio",
    "--flash-size", "4MB",
    "--flash-freq", flash_freq,
] + flash_args

# ── Flash with retry loop ──────────────────────────────────────────────────────
# ButtonPusher mode retries the full BOOT/EN sequence each attempt.
# Without ButtonPusher, esptool controls reset itself — single attempt only.
max_attempts = MAX_FLASH_ATTEMPTS if use_bp else 1
result_code = 1

for attempt in range(1, max_attempts + 1):
    if use_bp:
        label = f"Attempt {attempt}/{max_attempts}" + (" — re-entering bootloader" if attempt > 1 else "")
        print(f"\n[FLASH] {label}")

        print(f"[BP] Pushing BOOT (ch{ch_boot})...")
        bp_send("push", ch_boot)
        time.sleep(BP_BOOT_SETTLE_S)

        print(f"[BP] Pushing EN (ch{ch_en})...")
        bp_send("push", ch_en)
        time.sleep(BP_EN_HOLD_S)

        print(f"[BP] Releasing EN (ch{ch_en})...")
        bp_send("release", ch_en)
        time.sleep(BP_BOOTLOADER_S)

    print(f"\n[FLASH] {' '.join(cmd)}\n")
    result = subprocess.run(cmd)
    result_code = result.returncode

    # Release BOOT after each esptool run (chip stays in download mode while held)
    if use_bp:
        print(f"[BP] Releasing BOOT (ch{ch_boot})...")
        bp_send("release", ch_boot)

    if result_code == 0:
        break

    if attempt < max_attempts:
        print(f"[FLASH] Attempt {attempt} failed — retrying in 2s...")
        time.sleep(2.0)

# ── Cleanup ButtonPusher ───────────────────────────────────────────────────────
if use_bp:
    status = "SUCCESS" if result_code == 0 else f"FAILED after {max_attempts} attempts"
    print(f"[FLASH] {status}")
    try:
        bp_send("quit")
    except Exception:
        pass
    bp_proc.terminate()

sys.exit(result_code)
