#!/usr/bin/env python3
"""
Build wrapper that uses VS Code devcontainer to execute builds.
This ensures the correct ESP-IDF environment is used.
"""

import subprocess
import sys
from pathlib import Path


def _read_idf_target(workspace_root: Path, board: str) -> str:
    """
    Read IDF_TARGET from .board_config in the board directory.
    Falls back to deriving the target from the board name if the file is absent.
    """
    config_file = (
        workspace_root / "Device" / "pds" / "pds_hal" / "board" / board / ".board_config"
    )
    if config_file.exists():
        for line in config_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("IDF_TARGET="):
                return line.split("=", 1)[1].strip()

    # Fallback heuristic — keep this in sync with the three known board dirs
    if board.startswith("esp32c3"):
        return "esp32c3"
    if board.startswith("esp32s3"):
        return "esp32s3"
    return "esp32"


def run_build_in_devcontainer(board: str, hwrev: str, role: str, clean: bool = False) -> int:
    """
    Run build inside the ESP-IDF devcontainer using devcontainer CLI.

    CMake is told which role to compile via:
        idf.py -DPDS_HWREV=<hwrev> -DPDS_ROLE=<role> build

    The IDF_TARGET env var is set from .board_config so idf.py reconfigures
    for the correct SoC without needing a writable sdkconfig.
    """
    workspace_root = Path(__file__).parent.parent.parent
    idf_target = _read_idf_target(workspace_root, board)

    # Inside the container Device/ is mounted at /src/
    # The entrypoint copies /src to /build then runs idf.py from /build/main
    build_parts = []
    # Wipe stale build artefacts (sdkconfig, CMakeCache.txt) that may have been
    # generated for a different IDF_TARGET. /build is a fresh copy per run.
    build_parts.append("rm -rf build/ sdkconfig sdkconfig.old")
    if clean:
        build_parts.append("idf.py fullclean")
    # -D flags are global idf.py options — must appear BEFORE the subcommand
    build_parts.append(
        f"IDF_TARGET={idf_target} idf.py -DPDS_HWREV={hwrev} -DPDS_ROLE={role} build"
    )
    build_cmd = "cd /build/main && " + " && ".join(build_parts)

    print(f"[*] Building {board} / {hwrev} / {role} in devcontainer...")
    print(f"[*] IDF_TARGET: {idf_target}")
    print(f"[*] CMake vars: -DPDS_HWREV={hwrev} -DPDS_ROLE={role}")
    print("")

    # Container name is DEV-Container-{board} — pure concatenation, no config key
    container_dir = workspace_root / "Device" / f"DEV-Container-{board}"
    if not container_dir.exists():
        print(f"[-] Container directory not found: {container_dir}")
        print(f"[*] Expected: Device/DEV-Container-{board}")
        return 1
    cmd = [
        "devcontainer", "exec",
        "--workspace-folder", str(container_dir),
        "sh", "-c", build_cmd,
    ]

    try:
        result = subprocess.run(cmd)
        return result.returncode
    except FileNotFoundError:
        print("[-] devcontainer CLI not found. Please install:")
        print("[*]   npm install -g @devcontainers/cli")
        print("")
        print("[*] Alternatively, open VS Code and use the devcontainer extension:")
        print("[*]   Code > Dev Containers > Reopen in Container")
        return 1


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description="Build firmware inside ESP-IDF devcontainer")
    p.add_argument("--board", required=True, help="board dir name, e.g. esp32_node32s")
    p.add_argument("--hwrev", required=True, help="Hardware revision dir name, e.g. hwrev_001")
    p.add_argument("--role", required=True, help="Role dir name, e.g. h2o-106")
    p.add_argument("--clean", action="store_true", help="Run idf.py fullclean first")
    args = p.parse_args()
    sys.exit(run_build_in_devcontainer(args.board, args.hwrev, args.role, args.clean))

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: build_in_devcontainer.py <board> <hwrev> <role>")
        sys.exit(1)
    
    board = sys.argv[1]
    hwrev = sys.argv[2]
    role = sys.argv[3]
    
    exit_code = run_build_in_devcontainer(board, hwrev, role)
    sys.exit(exit_code)
