#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
H2O-DEV Cleanup Script
Removes build artifacts and redundant configuration now handled by dev containers
"""

import os
import sys
import shutil
from pathlib import Path

# ANSI color codes
class Colors:
    RESET = '\033[0m'
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'

def info(msg):
    print(f"{Colors.BLUE}[*] {msg}{Colors.RESET}")

def success(msg):
    print(f"{Colors.GREEN}[+] {msg}{Colors.RESET}")

def warning(msg):
    print(f"{Colors.YELLOW}[!] {msg}{Colors.RESET}")

def error(msg):
    print(f"{Colors.RED}[-] {msg}{Colors.RESET}")

def header(msg):
    print(f"\n{Colors.CYAN}{'='*70}{Colors.RESET}")
    print(f"{Colors.CYAN}{msg:^70}{Colors.RESET}")
    print(f"{Colors.CYAN}{'='*70}{Colors.RESET}\n")

def main():
    h2o_dev = Path("Device/H2O-DEV-12102025")
    
    if not h2o_dev.exists():
        error(f"Directory not found: {h2o_dev}")
        return 1
    
    header("H2O-DEV Cleanup")
    
    info("This script removes build artifacts from H2O-DEV directory")
    info("The following will be deleted:")
    print()
    
    items_to_remove = [
        ("build/", "Build artifacts directory"),
        ("sdkconfig", "ESP-IDF configuration"),
        ("sdkconfig.old", "ESP-IDF configuration backup"),
        ("dependencies.lock", "Dependency lock file"),
        ("managed_components/", "ESP-IDF managed components"),
    ]
    
    for item, description in items_to_remove:
        item_path = h2o_dev / item
        if item_path.exists():
            print(f"  • {item:30} ({description})")
        else:
            print(f"  • {item:30} (not present, skipping)")
    
    print()
    choice = input("Proceed with cleanup? (y/n): ").strip().lower()
    
    if choice != 'y':
        warning("Cleanup cancelled")
        return 0
    
    header("Removing Artifacts")
    
    removed_count = 0
    
    for item, description in items_to_remove:
        item_path = h2o_dev / item
        
        if not item_path.exists():
            info(f"Skipping {item} (not found)")
            continue
        
        try:
            if item_path.is_dir():
                info(f"Removing directory: {item}")
                shutil.rmtree(item_path)
            else:
                info(f"Removing file: {item}")
                item_path.unlink()
            
            success(f"Removed {item}")
            removed_count += 1
        except Exception as e:
            error(f"Failed to remove {item}: {e}")
    
    print()
    success(f"Cleanup complete! Removed {removed_count} items")
    
    # Verify remaining structure
    header("Verifying Structure")
    
    expected_files = [
        "CMakeLists.txt",
        "main/CMakeLists.txt",
        "main/main.c",
        "README.md",
    ]
    
    all_good = True
    for expected in expected_files:
        path = h2o_dev / expected
        if path.exists():
            success(f"Found: {expected}")
        else:
            error(f"Missing: {expected}")
            all_good = False
    
    if all_good:
        print()
        success("H2O-DEV structure is valid!")
        print()
        print("Next steps:")
        print("  1. Configure Dev Containers:")
        print("     cd Device/DEV-Container-ESPIDF")
        print("     docker build -t h2o-espidf .")
        print()
        print("  2. Use Build Selector:")
        print("     python PDS-ConfigAndBuildTools/scripts/build_selector.py")
        print()
        print("  3. Or use direct build script:")
        print("     python PDS-ConfigAndBuildTools/scripts/build_espidf.py --hwrev 001")
    else:
        print()
        warning("Some expected files are missing!")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
