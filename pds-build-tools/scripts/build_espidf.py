#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ESP-IDF Build Wrapper
Handles ESP32-C3 firmware compilation with proper environment setup
"""

import os
import sys
import subprocess
import json
import argparse
from pathlib import Path
from typing import Optional

# ANSI color codes
class Colors:
    RESET = '\033[0m'
    BOLD = '\033[1m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'

def cprint(msg: str, color: str = Colors.WHITE) -> None:
    print(f"{color}{msg}{Colors.RESET}")

def success(msg: str) -> None:
    cprint(f"[+] {msg}", Colors.GREEN)

def error(msg: str) -> None:
    cprint(f"[-] {msg}", Colors.RED)

def info(msg: str) -> None:
    cprint(f"[*] {msg}", Colors.BLUE)

def header(msg: str) -> None:
    print(f"\n{Colors.CYAN}{Colors.BOLD}{'='*70}{Colors.RESET}")
    print(f"{Colors.CYAN}{Colors.BOLD}{msg:^70}{Colors.RESET}")
    print(f"{Colors.CYAN}{Colors.BOLD}{'='*70}{Colors.RESET}\n")

def find_latest_idf_installation() -> Optional[Path]:
    """Find ESP-IDF installation inside a DEV-Container (Docker mount point)."""
    # DEV-Container mounts have IDF at /opt/esp/idf inside the container.
    # On the host, IDF is only accessible when running inside the container.
    # This function is a fallback for non-container direct builds only.
    potential_idf_paths = [
        Path("/opt/esp/idf"),   # WSL/Docker mount
        Path("C:/opt/esp/idf"), # Alternative Windows mount
    ]
    
    for idf_path in potential_idf_paths:
        if idf_path.exists() and (idf_path / "tools" / "idf.py").exists():
            info(f"Found IDF in DEV-Container: {idf_path}")
            return idf_path
    
    # Fallback to global installation
    idf_base = Path("C:/Users/vctma/DEV/ESP-IDF")
    if not idf_base.exists():
        return None
    
    versions = []
    for d in idf_base.iterdir():
        if d.is_dir() and d.name.startswith("v") and d.name[1].isdigit():
            if (d / "esp-idf").exists():
                versions.append(d)
    
    if versions:
        versions.sort(key=lambda x: tuple(map(int, x.name[1:].split('.'))), reverse=True)
        return versions[0] / "esp-idf"
    return None

def find_python_env(idf_path: Path) -> Optional[Path]:
    """Find Python environment for given IDF version"""
    env_base = Path("C:/Users/vctma/.espressif/python_env")
    if not env_base.exists():
        return None
    
    idf_version = idf_path.parent.name
    if idf_version.startswith("v"):
        version_num = idf_version[1:].rsplit('.', 1)[0]
    else:
        return None
    
    envs = []
    for d in env_base.iterdir():
        if d.is_dir() and f"idf{version_num}_py" in d.name:
            python_exe = d / "Scripts" / "python.exe"
            if python_exe.exists():
                envs.append(d)
    
    if envs:
        envs.sort(key=lambda x: x.name, reverse=True)
        return envs[0]
    return None

def setup_esp_idf_environment() -> dict:
    """Setup ESP-IDF environment variables"""
    env = os.environ.copy()
    
    # Find ESP-IDF
    idf_path = find_latest_idf_installation()
    if not idf_path:
        error("ESP-IDF not found. Please install from https://github.com/espressif/esp-idf or use DEV-Container")
        sys.exit(1)
    
    # Find Python environment
    python_env = find_python_env(idf_path)
    if not python_env:
        warning("Python environment not found - will attempt to use system Python")
        python_env = Path(sys.executable).parent.parent  # Use current Python environment as fallback
    
    info(f"Using ESP-IDF: {idf_path}")
    info(f"Using Python:  {python_env}")
    
    # Set environment variables
    env['IDF_PATH'] = str(idf_path)
    env['IDF_PYTHON_ENV_PATH'] = str(python_env)
    
    # Add Python environment to PATH so it's used first
    python_scripts = python_env / "Scripts"
    if python_scripts.exists():
        env['PATH'] = str(python_scripts) + ";" + env.get('PATH', '')
    python_scripts = python_env / "Scripts"
    env['PATH'] = str(python_scripts) + ";" + env.get('PATH', '')
    
    return env

def run_command(cmd: list, env: dict, verbose: bool = False) -> int:
    """Run a command in the ESP-IDF environment"""
    if verbose:
        info(f"Running: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, env=env, text=True, bufsize=1)
        return result.returncode
    except KeyboardInterrupt:
        print()
        warning("Build interrupted by user")
        return 130
    except Exception as e:
        error(f"Failed to run command: {e}")
        return 1

def main():
    parser = argparse.ArgumentParser(
        description="ESP-IDF Build Wrapper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python build_espidf.py                              # Build with defaults
  python build_espidf.py --hwrev 001 --role aeroponics
  python build_espidf.py --clean                      # Clean build
  python build_espidf.py --flash COM3                 # Build and flash
  python build_espidf.py --monitor COM3               # Monitor serial output
        """
    )
    
    parser.add_argument("--board", help="Board name (e.g., esp32c3_sm, esp32_node32s)")
    parser.add_argument("--hwrev", default="001", help="Hardware revision (default: 001)")
    parser.add_argument("--role", default="aeroponics", help="Device role (default: aeroponics)")
    parser.add_argument("--clean", action="store_true", help="Clean build (idf.py fullclean)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--check-env", action="store_true", help="Check environment only")
    parser.add_argument("--flash", help="Flash to device (specify COM port, e.g., COM3)")
    parser.add_argument("--monitor", help="Monitor serial output (specify COM port)")
    
    args = parser.parse_args()
    
    header("ESP-IDF Build System")
    
    # Setup environment
    env = setup_esp_idf_environment()
    
    if args.check_env:
        success("Environment validation successful")
        return 0
    
    # Get Python executable from ESP-IDF environment
    python_exe = env.get('IDF_PYTHON_ENV_PATH')
    if python_exe:
        python_exe = str(Path(python_exe) / "Scripts" / "python.exe")
    else:
        python_exe = "python"  # Fallback to PATH
    
    # Get project directory
    project_dir = Path(__file__).parent.parent.parent / "Device" / "main"
    if not project_dir.exists():
        error(f"Project directory not found: {project_dir}")
        sys.exit(1)
    
    info(f"Project: {project_dir}")
    info(f"Target: esp32c3")
    info(f"Role: {args.role}")
    
    # Change to project directory
    original_cwd = os.getcwd()
    os.chdir(project_dir)
    
    try:
        # Clean if requested
        if args.clean:
            header("Cleaning Project")
            info("Running: idf.py fullclean")
            cmd = [python_exe, str(Path(env['IDF_PATH']) / "tools" / "idf.py"), "fullclean"]
            if run_command(cmd, env, args.verbose) != 0:
                error("Clean failed")
                return 1
            
            # Set target again after clean
            header("Setting Target")
            info("Running: idf.py set-target esp32c3")
            cmd = [python_exe, str(Path(env['IDF_PATH']) / "tools" / "idf.py"), "set-target", "esp32c3"]
            if run_command(cmd, env, args.verbose) != 0:
                error("set-target failed")
                return 1
        
        # Build
        header("Building Project")
        info("Running: idf.py build")
        cmd = [python_exe, str(Path(env['IDF_PATH']) / "tools" / "idf.py"), "build"]
        if args.verbose:
            cmd.append("-v")
        
        returncode = run_command(cmd, env, args.verbose)
        
        if returncode != 0:
            error("Build failed")
            return 1
        
        success("Build completed successfully")
        
        # Flash if requested
        if args.flash:
            header("Flashing to Device")
            info(f"Port: {args.flash}")
            cmd = [str(Path(env['IDF_PATH']) / "tools" / "idf.py"), "-p", args.flash, "flash"]
            if run_command(cmd, env, args.verbose) != 0:
                error("Flash failed")
                return 1
            success("Flash completed successfully")
        
        # Monitor if requested
        if args.monitor:
            header("Monitoring Serial Output")
            info(f"Port: {args.monitor}")
            info("Press Ctrl+] to exit")
            cmd = [str(Path(env['IDF_PATH']) / "tools" / "idf.py"), "-p", args.monitor, "monitor"]
            return run_command(cmd, env, args.verbose)
        
        return 0
    
    finally:
        os.chdir(original_cwd)

if __name__ == "__main__":
    sys.exit(main())
