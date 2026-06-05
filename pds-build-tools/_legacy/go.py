#!/usr/bin/env python3
"""
PDS-AutomationSuite Build System Entry Point

This is the main entry point for the build system. It guides you through:
1. Selecting a board (ESP32-C3, Silicon Labs)
2. Selecting a hardware revision
3. Selecting a device role (aeroponics, greenhouse, etc.)
4. Building the firmware

Usage:
    python go.py                    # Interactive mode (recommended)
    python go.py --help            # Show help
    python go.py --list-boards  # List available boards
    python go.py --last            # Use last selection
"""

import sys
import os
from pathlib import Path
import json
import subprocess
import argparse
from typing import Optional, Dict, Any

# Get script directory
SCRIPT_DIR = Path(__file__).parent
CONFIG_DIR = SCRIPT_DIR / "config"
SCRIPTS_DIR = SCRIPT_DIR / "scripts"
LAST_SELECTION_FILE = SCRIPT_DIR / ".last_selection.json"

# Device HAL path (auto-discovery source)
DEVICE_HAL_PATH = Path(__file__).parent.parent / "Device" / "pds" / "pds_hal" / "board"

# ANSI colors for terminal output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


def print_header(text: str) -> None:
    """Print a section header."""
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'='*60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{text:^60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'='*60}{Colors.END}\n")


def print_success(text: str) -> None:
    """Print success message."""
    print(f"{Colors.GREEN}[+] {text}{Colors.END}")


def print_info(text: str) -> None:
    """Print info message."""
    print(f"{Colors.BLUE}[*] {text}{Colors.END}")


def print_error(text: str) -> None:
    """Print error message."""
    print(f"{Colors.RED}[-] {text}{Colors.END}")


def print_warning(text: str) -> None:
    """Print warning message."""
    print(f"{Colors.YELLOW}[!] {text}{Colors.END}")


def discover_boards() -> Dict[str, Dict[str, Any]]:
    """Auto-discover boards from Device/pds/pds_hal/board/ directory."""
    boards = {}
    
    if not DEVICE_HAL_PATH.exists():
        print_warning(f"Device HAL path not found: {DEVICE_HAL_PATH}")
        return boards
    
    for board_dir in DEVICE_HAL_PATH.iterdir():
        if not board_dir.is_dir():
            continue
        
        board_name = board_dir.name
        
        # Determine build system based on board name
        if 'esp32' in board_name.lower():
            build_system = 'esp-idf'
        elif 'efr32' in board_name.lower():
            build_system = 'silabs'
        else:
            build_system = 'unknown'
        
        hwrevs = []
        
        # Discover hardware revisions
        for hwrev_dir in board_dir.iterdir():
            if not hwrev_dir.is_dir() or hwrev_dir.name == "common":
                continue
            
            hwrev_id = hwrev_dir.name.replace("hwrev_", "")
            roles = []
            
            # Discover roles
            for role_dir in hwrev_dir.iterdir():
                if role_dir.is_dir() and not role_dir.name.startswith("_"):
                    roles.append(role_dir.name)
            
            if roles:  # Only add hwrev if it has roles
                hwrevs.append({
                    "id": hwrev_id,
                    "name": f"{board_name.replace('_', ' ')} Rev {hwrev_id}",
                    "roles": sorted(roles)
                })
        
        if hwrevs:  # Only add board if it has hwrevs
            boards[board_name] = {
                "name": board_name.replace("_", " "),
                "description": f"board: {board_name}",
                "build_system": build_system,
                "hwrevs": sorted(hwrevs, key=lambda x: x["id"]),
                "board_dir": board_dir
            }
    
    return boards


def load_config(filename: str, key: str) -> Dict[str, Any]:
    """Load JSON configuration file and extract specific key."""
    config_file = CONFIG_DIR / filename
    if not config_file.exists():
        print_error(f"Configuration file not found: {config_file}")
        sys.exit(1)
    
    try:
        with open(config_file, 'r') as f:
            data = json.load(f)
            if key in data:
                return data[key]
            return data
    except json.JSONDecodeError as e:
        print_error(f"Invalid JSON in {filename}: {e}")
        sys.exit(1)


def load_boards() -> Dict[str, Any]:
    """Load boards configuration - auto-discovered from Device directory."""
    boards = discover_boards()
    
    if not boards:
        print_warning("No boards found via auto-discovery, falling back to config file...")
        return load_config("boards.json", "boards")
    
    print_info(f"Auto-discovered {len(boards)} board(s)")
    return boards


def load_roles() -> Dict[str, Any]:
    """Load roles configuration."""
    return load_config("roles.json", "roles")


def save_selection(board: str, hwrev: str, role: str) -> None:
    """Save the last selection for quick re-use."""
    selection = {
        "board": board,
        "hwrev": hwrev,
        "role": role
    }
    try:
        with open(LAST_SELECTION_FILE, 'w') as f:
            json.dump(selection, f, indent=2)
        print_info(f"Selection saved to {LAST_SELECTION_FILE}")
    except Exception as e:
        print_warning(f"Could not save selection: {e}")


def load_last_selection() -> Optional[Dict[str, str]]:
    """Load the last selection if it exists."""
    if not LAST_SELECTION_FILE.exists():
        return None
    
    try:
        with open(LAST_SELECTION_FILE, 'r') as f:
            return json.load(f)
    except:
        return None


def select_board_interactive(boards: Dict[str, Any]) -> str:
    """Interactively select a board."""
    print_info("Available boards:")
    board_list = list(boards.keys())
    
    for i, board in enumerate(board_list, 1):
        info = boards[board]
        print(f"  {i}. {board:20} - {info.get('description', 'No description')}")
    
    while True:
        try:
            choice = input(f"\n{Colors.BOLD}Select board (1-{len(board_list)}): {Colors.END}")
            index = int(choice) - 1
            if 0 <= index < len(board_list):
                selected = board_list[index]
                print_success(f"Selected board: {selected}")
                return selected
            else:
                print_error(f"Invalid choice. Please select 1-{len(board_list)}")
        except ValueError:
            print_error("Invalid input. Please enter a number.")


def select_hwrev_interactive(board_info: Dict[str, Any]) -> str:
    """Interactively select a hardware revision."""
    hwrevs = board_info.get("hwrevs", [])
    
    if not hwrevs:
        print_error("No hardware revisions available for this board")
        sys.exit(1)
    
    print_info("Available hardware revisions:")
    
    # Handle hwrevs as either list of strings or list of objects
    hwrev_list = []
    for i, hwrev in enumerate(hwrevs, 1):
        if isinstance(hwrev, dict):
            hwrev_id = hwrev.get("id", f"hwrev_{i}")
            hwrev_name = hwrev.get("name", hwrev_id)
            hwrev_desc = hwrev.get("description", "")
            hwrev_list.append(hwrev_id)
            desc_str = f" - {hwrev_desc}" if hwrev_desc else ""
            print(f"  {i}. {hwrev_id:10} ({hwrev_name}){desc_str}")
        else:
            # Simple string
            hwrev_list.append(hwrev)
            print(f"  {i}. {hwrev}")
    
    while True:
        try:
            choice = input(f"\n{Colors.BOLD}Select hardware revision (1-{len(hwrev_list)}): {Colors.END}")
            index = int(choice) - 1
            if 0 <= index < len(hwrev_list):
                selected = hwrev_list[index]
                print_success(f"Selected hardware revision: {selected}")
                return selected
            else:
                print_error(f"Invalid choice. Please select 1-{len(hwrev_list)}")
        except ValueError:
            print_error("Invalid input. Please enter a number.")


def select_role_interactive(board_info: Dict[str, Any], roles: Dict[str, Any]) -> str:
    """Interactively select a device role."""
    available_roles = board_info.get('available_roles', board_info.get('roles', []))
    
    if not available_roles:
        print_warning("No roles defined for this board. Using 'generic'")
        return "generic"
    
    print_info("Available device roles:")
    for i, role in enumerate(available_roles, 1):
        if role in roles:
            desc = roles[role].get("description", "No description")
            print(f"  {i}. {role:20} - {desc}")
        else:
            print(f"  {i}. {role:20} - (no description)")
    
    while True:
        try:
            choice = input(f"\n{Colors.BOLD}Select role (1-{len(available_roles)}): {Colors.END}")
            index = int(choice) - 1
            if 0 <= index < len(available_roles):
                selected = available_roles[index]
                print_success(f"Selected role: {selected}")
                return selected
            else:
                print_error(f"Invalid choice. Please select 1-{len(available_roles)}")
        except ValueError:
            print_error("Invalid input. Please enter a number.")


def show_selection_summary(board: str, hwrev: str, role: str, 
                          boards: Dict[str, Any]) -> None:
    """Display a summary of the selection."""
    print_header("BUILD CONFIGURATION SUMMARY")
    
    board_info = boards.get(board, {})
    
    print(f"{Colors.BOLD}board:{Colors.END}            {board}")
    print(f"{Colors.BOLD}Description:{Colors.END}        {board_info.get('description', 'N/A')}")
    print(f"{Colors.BOLD}Build System:{Colors.END}       {board_info.get('build_system', 'N/A')}")
    print()
    print(f"{Colors.BOLD}Hardware Revision:{Colors.END}   {hwrev}")
    print()
    print(f"{Colors.BOLD}Device Role:{Colors.END}         {role}")
    print()


def run_build_selector(board: str, hwrev: str, role: str,
                       clean: bool = False, flash: Optional[str] = None,
                       monitor: Optional[str] = None) -> None:
    """Run the build_selector.py script with the selected parameters."""
    selector_script = SCRIPTS_DIR / "build_selector.py"
    
    if not selector_script.exists():
        print_error(f"Build selector script not found: {selector_script}")
        sys.exit(1)
    
    print_info(f"Launching build selector with your selections...")
    
    cmd = [
        sys.executable,
        str(selector_script),
        "--board", board,
        "--hwrev", hwrev,
        "--role", role
    ]
    if clean:
        cmd.append("--clean")
    if flash:
        cmd.extend(["--flash", flash])
    if monitor:
        cmd.extend(["--monitor", monitor])
    
    try:
        # Run with proper output handling: text mode, line buffering, inherit streams
        result = subprocess.run(
            cmd,
            cwd=str(SCRIPTS_DIR),
            text=True,
            bufsize=1
        )
        sys.exit(result.returncode)
    except KeyboardInterrupt:
        print_warning("\nBuild cancelled by user")
        sys.exit(130)
    except Exception as e:
        print_error(f"Failed to run build selector: {e}")
        sys.exit(1)


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="PDS-AutomationSuite Build System",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python go.py                    # Interactive mode (recommended)
  python go.py --last            # Use last selection
  python go.py --list-boards  # Show available boards
        """
    )
    
    parser.add_argument("--board", "-p", help="board to build for (esp32c3, silabs, etc.)")
    parser.add_argument("--hwrev", "-r", help="Hardware revision (001, 002, etc.)")
    parser.add_argument("--role", "-o", help="Device role (aeroponics, greenhouse, etc.)")
    parser.add_argument("--last", action="store_true", help="Use last selection")
    parser.add_argument("--list-boards", action="store_true", help="List available boards")
    parser.add_argument("--clean", action="store_true", help="Clean build (fullclean + set-target)")
    parser.add_argument("--flash", metavar="PORT", help="Flash to device after build (e.g. COM3)")
    parser.add_argument("--monitor", metavar="PORT", help="Monitor serial output (e.g. COM3)")
    parser.add_argument("--yes", "-y", action="store_true", help="Skip confirmation prompt")
    
    args = parser.parse_args()
    
    # Load configurations
    boards = load_boards()
    roles = load_roles()
    
    # Handle --list-boards
    if args.list_boards:
        print_header("AVAILABLE boards")
        for board, info in boards.items():
            print(f"{Colors.BOLD}{board}{Colors.END}")
            print(f"  Description: {info.get('description', 'N/A')}")
            
            # Handle hwrevs as list of dicts
            hwrevs = info.get('hwrevs', [])
            hwrev_ids = []
            all_roles = set()
            
            for hwrev_info in hwrevs:
                if isinstance(hwrev_info, dict):
                    hwrev_id = hwrev_info.get('id', 'unknown')
                    hwrev_ids.append(hwrev_id)
                    roles_in_hwrev = hwrev_info.get('roles', [])
                    all_roles.update(roles_in_hwrev)
                else:
                    hwrev_ids.append(hwrev_info)
            
            print(f"  Hardware Revisions: {', '.join(hwrev_ids)}")
            print(f"  Roles: {', '.join(sorted(all_roles)) if all_roles else 'N/A'}")
            print()
        return
    
    # Get selections
    if args.board and args.hwrev and args.role:
        # Command-line parameters provided
        board = args.board
        hwrev = args.hwrev
        role = args.role
        
        if board not in boards:
            print_error(f"Unknown board: {board}")
            sys.exit(1)
        
    elif args.last:
        # Use last selection
        last = load_last_selection()
        if not last:
            print_error("No last selection found. Please run interactive mode first.")
            sys.exit(1)
        
        board = last.get("board")
        hwrev = last.get("hwrev")
        role = last.get("role")
        
        print_success(f"Using last selection:")
        print(f"  board: {board}")
        print(f"  Hardware Revision: {hwrev}")
        print(f"  Role: {role}")
        
    else:
        # Interactive mode
        print_header("PDS-AUTOMATIONSUITE BUILD SYSTEM")
        print(f"{Colors.BOLD}Welcome to the interactive build system!{Colors.END}")
        print("This will guide you through building firmware for your selected board.\n")
        
        # Select board
        board = select_board_interactive(boards)
        board_info = boards[board]
        
        # Select hardware revision
        hwrev = select_hwrev_interactive(board_info)
        
        # Select role
        role = select_role_interactive(board_info, roles)
        
        # Save selection
        save_selection(board, hwrev, role)
    
    # Show summary
    show_selection_summary(board, hwrev, role, boards)
    
    # Ask for confirmation (skip with --yes)
    if not args.yes:
        print(f"{Colors.BOLD}Proceed with build? (y/n): {Colors.END}", end='', flush=True)
        confirm = input().lower().strip()
        if confirm != 'y':
            print_warning("Build cancelled")
            sys.exit(0)
    
    # Run build
    print_info(f"Starting build for {board} hwrev {hwrev} role {role}...")
    run_build_selector(board, hwrev, role,
                       clean=args.clean, flash=args.flash, monitor=args.monitor)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Build system interrupted by user{Colors.END}")
        sys.exit(130)
    except Exception as e:
        print_error(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
