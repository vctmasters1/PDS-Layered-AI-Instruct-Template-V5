"""capture_boot_log.py - Capture boot log from a PDS device.

Default mode: runs headless_flash.py --l1l2l3 then opens the serial port
the instant esptool releases it (after hard-reset) to capture the boot log.

--no-flash mode: skips the flash step and just opens the serial port
immediately, waiting for the device to boot. Use this for boards whose
CH340 RTS/DTR wiring puts them into download mode instead of normal boot
(e.g. esp32c3_sm). With --no-flash, physically reset the board
(EN button or power cycle) right after running this script.

Usage:
    python PDS-BuildTools/scripts/capture_boot_log.py [--duration 20] [--no-flash]
"""
import json, os, sys, time, threading, subprocess

WORKSPACE   = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONFIG_PATH = os.path.join(WORKSPACE, "PDS-BuildTools", ".flash_config.json")
PYTHON      = os.path.join(WORKSPACE, ".venv", "Scripts", "python.exe")
FLASH_SCRIPT = os.path.join(WORKSPACE, "PDS-BuildTools", "scripts", "headless_flash.py")
OUT_FILE    = os.path.join(WORKSPACE, "boot_log_capture.txt")

DURATION = 20
NO_FLASH = "--no-flash" in sys.argv
for i, arg in enumerate(sys.argv):
    if arg == "--duration" and i + 1 < len(sys.argv):
        DURATION = int(sys.argv[i + 1])

with open(CONFIG_PATH) as f:
    cfg = json.load(f)
port = cfg["port"]

# ── Step 1: run --l1l2l3 flash which ends with a hard-reset ─────────────────
if NO_FLASH:
    print(f"[CAP] --no-flash: skipping flash step")
    print(f"[CAP] >>> Physically reset the board NOW (EN button or power cycle) <<<")
else:
    print(f"[CAP] Running headless_flash.py --l1l2l3 ...")
    result = subprocess.run(
        [PYTHON, FLASH_SCRIPT, "--l1l2l3"],
        cwd=WORKSPACE,
    )
    if result.returncode != 0:
        print(f"[CAP] Flash failed (exit {result.returncode}), aborting capture")
        sys.exit(1)

# ── Step 2: open port immediately after reset ─────────────────────────────────
import serial
print(f"[CAP] Flash done — opening {port} immediately to catch boot ...")

# Retry opening the port up to 3s in case OS hasn't fully released it yet
ser = None
deadline = time.monotonic() + 3.0
while time.monotonic() < deadline:
    try:
        ser = serial.Serial(port, 115200, timeout=0.05)
        break
    except serial.SerialException as e:
        time.sleep(0.05)

if ser is None:
    print(f"[CAP] Could not open {port} within 3s after flash")
    sys.exit(1)

ser.reset_input_buffer()
print(f"[CAP] {port} open — capturing {DURATION}s ...")

lines = []
stop_event = threading.Event()

def reader():
    buf = b""
    while not stop_event.is_set():
        chunk = ser.read(256)
        if chunk:
            buf += chunk
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                decoded = line.decode("utf-8", errors="replace").rstrip("\r")
                lines.append(decoded)
                print(decoded)
        time.sleep(0.005)

t = threading.Thread(target=reader, daemon=True)
t.start()
time.sleep(DURATION)
stop_event.set()
t.join(timeout=2)
ser.close()

with open(OUT_FILE, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"\n[CAP] Saved {len(lines)} lines → {OUT_FILE}")
