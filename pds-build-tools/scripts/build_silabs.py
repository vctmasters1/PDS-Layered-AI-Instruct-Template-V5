#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Silicon Labs Build Wrapper
Handles Silicon Labs Gecko SDK compilation
"""

import os
import sys
import subprocess
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

def setup_silabs_environment() -> dict:
    """Setup Silicon Labs environment variables"""
    env = os.environ.copy()
    
    # Set Silicon Labs SDK path (if installed)
    silabs_sdk_path = Path("C:/SiliconLabs/SimplicityStudio/v5")
    if silabs_sdk_path.exists():
        env['SILABS_SDK_PATH'] = str(silabs_sdk_path)
        info(f"Using Silicon Labs SDK: {silabs_sdk_path}")
    else:
        warning("Silicon Labs SDK not found at default location")
    
    return env

def run_command(cmd: list, env: dict, verbose: bool = False) -> int:
    """Run a command in the Silicon Labs environment"""
    if verbose:
        info(f"Running: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, env=env)
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
        description="Silicon Labs Build Wrapper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python build_silabs.py                              # Build with defaults
  python build_silabs.py --hwrev 001 --role generic
  python build_silabs.py --clean                      # Clean build
        """
    )
    
    parser.add_argument("--hwrev", default="001", help="Hardware revision (default: 001)")
    parser.add_argument("--role", default="generic", help="Device role (default: generic)")
    parser.add_argument("--clean", action="store_true", help="Clean build")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    
    args = parser.parse_args()
    
    header("Silicon Labs Build System")
    
    # Setup environment
    env = setup_silabs_environment()
    
    # Get project directory
    project_dir = Path(__file__).parent.parent.parent / "Device" / "silabs"
    if not project_dir.exists():
        warning(f"Project directory not found: {project_dir}")
        info("Silicon Labs support is currently a placeholder")
        info("Please set up Silicon Labs project structure in Device/silabs/")
        return 0
    
    info(f"Project: {project_dir}")
    info(f"Role: {args.role}")
    
    # Change to project directory
    original_cwd = os.getcwd()
    os.chdir(project_dir)
    
    try:
        # Check for build system (cmake or make)
        if (project_dir / "CMakeLists.txt").exists():
            header("Building with CMake")
            
            build_dir = project_dir / "build"
            build_dir.mkdir(exist_ok=True)
            
            if args.clean and build_dir.exists():
                import shutil
                info("Cleaning build directory")
                shutil.rmtree(build_dir)
                build_dir.mkdir()
            
            # Configure
            info("Configuring CMake...")
            cmd = ["cmake", "-B", "build", "-DCMAKE_TOOLCHAIN_FILE=arm-toolchain.cmake"]
            if run_command(cmd, env, args.verbose) != 0:
                error("CMake configuration failed")
                return 1
            
            # Build
            info("Building...")
            cmd = ["cmake", "--build", "build"]
            if run_command(cmd, env, args.verbose) != 0:
                error("Build failed")
                return 1
            
            success("Build completed successfully")
        
        elif (project_dir / "Makefile").exists():
            header("Building with Make")
            
            if args.clean:
                info("Cleaning build artifacts")
                run_command(["make", "clean"], env, args.verbose)
            
            # Build
            info("Building...")
            cmd = ["make", "-j4"]
            if run_command(cmd, env, args.verbose) != 0:
                error("Build failed")
                return 1
            
            success("Build completed successfully")
        
        else:
            error("No build system found (CMakeLists.txt or Makefile)")
            return 1
        
        return 0
    
    finally:
        os.chdir(original_cwd)

if __name__ == "__main__":
    sys.exit(main())
