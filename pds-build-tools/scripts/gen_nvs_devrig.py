"""
gen_nvs_devrig.py — Generate nvs_devrig.csv + nvs_devrig.bin for a provisioned device.

Reads device credentials from the HMI API admin endpoint and writes the NVS CSV/bin
to dist/defaults/<role>/ so headless_flash.py --nvs can flash it to the device.

Usage:
    python PDS-BuildTools/scripts/gen_nvs_devrig.py [--reset] [--wifi-ssid SSID] [--wifi-pass PASS]

    --reset       : Rotate the device token (generates a new one server-side)
    --wifi-ssid   : WiFi SSID (overrides .dev_creds.json)
    --wifi-pass   : WiFi password (overrides .dev_creds.json)

WiFi defaults: read from PDS-BuildTools/.dev_creds.json (gitignored).
  Format: { "wifi_ssid": "...", "wifi_pass": "..." }

Config read from:
    PDS-BuildTools/.flash_config.json   — role, board, hwrev
    PDS-BuildTools/.pds_pipeline_config.json — apiBase, bearerToken, deviceId

Output:
    PDS-BuildTools/dist/defaults/<role>/nvs_devrig.csv
    PDS-BuildTools/dist/defaults/<role>/nvs_devrig.bin
"""

import json
import os
import sys
import subprocess
import urllib.request
import urllib.error

WORKSPACE    = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TOOLS_DIR    = os.path.dirname(os.path.abspath(__file__))
BUILD_DIR    = os.path.join(WORKSPACE, "PDS-BuildTools")
DIST_DIR     = os.path.join(BUILD_DIR, "dist")
PYTHON       = os.path.join(WORKSPACE, ".venv", "Scripts", "python.exe")

NVS_SIZE_KB_DEFAULT = 24   # matches blob_packer.py default


def _parse_args():
    args = sys.argv[1:]
    reset      = "--reset"     in args
    wifi_ssid  = None
    wifi_pass  = None
    if "--wifi-ssid" in args:
        wifi_ssid = args[args.index("--wifi-ssid") + 1]
    if "--wifi-pass" in args:
        wifi_pass = args[args.index("--wifi-pass") + 1]
    return reset, wifi_ssid, wifi_pass


def _load_json(path):
    with open(path) as f:
        return json.load(f)


def main():
    reset, arg_ssid, arg_pass = _parse_args()

    # ── Config ──────────────────────────────────────────────────────────────
    flash_cfg = _load_json(os.path.join(BUILD_DIR, ".flash_config.json"))
    pipe_cfg  = _load_json(os.path.join(BUILD_DIR, ".pds_pipeline_config.json"))

    role      = flash_cfg["role"]
    board     = flash_cfg.get("board", "")
    hwrev     = flash_cfg.get("hwrev", "")
    api_base  = pipe_cfg["apiBase"]
    token     = pipe_cfg["bearerToken"]
    device_id = pipe_cfg["deviceId"]

    # ── WiFi creds ──────────────────────────────────────────────────────────
    dev_creds_path = os.path.join(BUILD_DIR, ".dev_creds.json")
    dev_creds = _load_json(dev_creds_path) if os.path.exists(dev_creds_path) else {}

    wifi_ssid = arg_ssid or dev_creds.get("wifi_ssid")
    wifi_pass = arg_pass or dev_creds.get("wifi_pass")

    if not wifi_ssid or not wifi_pass:
        print("ERROR: WiFi credentials required.")
        print("  Pass --wifi-ssid / --wifi-pass, or create PDS-BuildTools/.dev_creds.json:")
        print('  { "wifi_ssid": "MyNetwork", "wifi_pass": "secret" }')
        sys.exit(1)

    # ── Fetch device credentials from HMI API ───────────────────────────────
    url = f"{api_base}/devices/admin/devrig/{device_id}"
    if reset:
        url += "?reset=true"

    print(f"[devrig] Fetching credentials for device {device_id}...")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"ERROR: HTTP {e.code} from API: {body}")
        sys.exit(1)

    device_token = data["deviceToken"]
    if not device_token:
        print("ERROR: API returned no deviceToken. Device may not be claimed yet.")
        print("  Use --reset to generate a new token.")
        sys.exit(1)

    # ── Write nvs_devrig.csv ─────────────────────────────────────────────────
    out_dir = os.path.join(DIST_DIR, "defaults", role)
    os.makedirs(out_dir, exist_ok=True)

    csv_path = os.path.join(out_dir, "nvs_devrig.csv")
    bin_path = os.path.join(out_dir, "nvs_devrig.bin")

    # Read nvs_size_kb from the role JSON (same source as blob_packer.py)
    ws_root = os.path.dirname(os.path.dirname(BUILD_DIR))
    role_json = os.path.join(ws_root, "PDS-Role", "saved_roles", f"{role}.json")
    nvs_size_kb = NVS_SIZE_KB_DEFAULT
    if os.path.exists(role_json):
        rj = _load_json(role_json)
        for var in rj.get("variables", {}).get("pds_storage", []):
            if var.get("name") == "nvs_size_kb":
                nvs_size_kb = int(var.get("default", NVS_SIZE_KB_DEFAULT))
                break

    csv_rows = [
        "key,type,encoding,value",
        "pds_config,namespace,,",
        f"api_url,data,string,{api_base}",
        f"device_id,data,string,{device_id}",
        f"device_token,data,string,{device_token}",
        f"board,data,string,{board}",
        f"hwrev,data,string,{hwrev}",
        f"role,data,string,{role}",
        f"wifi_ssid,data,string,{wifi_ssid}",
        f"wifi_pass,data,string,{wifi_pass}",
    ]

    with open(csv_path, "w", newline="\n") as f:
        f.write("\n".join(csv_rows) + "\n")

    print(f"[devrig] Wrote {csv_path}")

    # ── Generate NVS binary ──────────────────────────────────────────────────
    nvs_size_hex = hex(nvs_size_kb * 1024)
    print(f"[devrig] Generating {bin_path} ({nvs_size_kb} KB)...")
    result = subprocess.run(
        [PYTHON, "-m", "esp_idf_nvs_partition_gen.nvs_partition_gen",
         "generate", csv_path, bin_path, nvs_size_hex],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print("ERROR: nvs_partition_gen failed:")
        print(result.stdout)
        print(result.stderr)
        sys.exit(1)

    print(f"[devrig] Done. Flash with:")
    print(f"  python PDS-BuildTools/scripts/headless_flash.py --nvs {bin_path}")


if __name__ == "__main__":
    main()
