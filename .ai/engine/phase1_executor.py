#!/usr/bin/env python3
"""
Phase 1: Artifact Preservation Executor

Copies source modules to target project using robocopy (Windows) or rsync (POSIX),
properly handling symlinks to prevent duplication loops.

Usage:
  python phase1_executor.py <source_path> <target_path> [--dry-run]

Examples:
  python phase1_executor.py K:\PDS-Master-001 k:\PDS-Master-006\PDS-Layered-AI-Instruct-Template-V5
  python phase1_executor.py /mnt/pds-master /home/project/pds-layered --dry-run
"""

import os
import sys
import json
import shutil
import platform
import subprocess
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime


class Phase1Executor:
    """Handles artifact preservation for imports."""

    def __init__(self, source_path: str, target_path: str, dry_run: bool = False):
        self.source = Path(source_path).resolve()
        self.target = Path(target_path).resolve()
        self.dry_run = dry_run
        self.platform = platform.system()
        self.copied_modules = []
        self.failed_modules = []
        self.skipped_modules = []
        self.total_size = 0

        if not self.source.exists():
            raise FileNotFoundError(f"Source path not found: {self.source}")

        if not self.target.exists():
            self.target.mkdir(parents=True, exist_ok=True)

    def discover_modules(self) -> List[str]:
        """Discover top-level modules in source project."""
        modules = []
        try:
            for item in self.source.iterdir():
                if item.is_dir() and not item.name.startswith('.'):
                    # Check if it looks like a module (has .ai/instruct.md or is a known pattern)
                    instruct_file = item / '.ai' / 'instruct.md'
                    if instruct_file.exists() or item.name in [
                        'db-central', 'device', 'pds-board-editor', 'pds-build-tools',
                        'pds-pipeline', 'pds-role', 'pds-vscode-extension', 'phone-apps',
                        'sm-buttonpusher', 'web-firmware-server', 'web-gateway',
                        'web-hmi', 'web-marketplace', 'web-property-portal', 'web-resume'
                    ]:
                        modules.append(item.name)
        except Exception as e:
            print(f"⚠ Error discovering modules: {e}")

        return sorted(modules)

    def copy_module_windows(self, module_name: str) -> bool:
        """Copy a module using robocopy (Windows)."""
        src = self.source / module_name
        dst = self.target / module_name

        # robocopy command with symlink exclusion
        cmd = [
            'robocopy',
            str(src),
            str(dst),
            '/S',           # Subdirectories (excluding empty)
            '/E',           # Include empty subdirectories
            '/COPY:DAT',    # Copy data, attributes, timestamps
            '/XJ',          # eXclude Junction points (symlinks) ← KEY FIX
            '/NP',          # No progress percentage
            '/NDL',         # No directory list
            '/NFL',         # No file list
        ]

        try:
            if self.dry_run:
                print(f"  [DRY-RUN] Would run: {' '.join(cmd)}")
                return True

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            # robocopy exit code 0-3 are success codes
            if result.returncode in [0, 1, 2, 3]:
                print(f"  ✓ Copied {module_name}")
                self.copied_modules.append(module_name)
                return True
            else:
                print(f"  ✗ Failed to copy {module_name}: exit code {result.returncode}")
                self.failed_modules.append((module_name, f"robocopy exit {result.returncode}"))
                return False
        except subprocess.TimeoutExpired:
            print(f"  ✗ Timeout copying {module_name}")
            self.failed_modules.append((module_name, "Timeout (>300s)"))
            return False
        except Exception as e:
            print(f"  ✗ Error copying {module_name}: {e}")
            self.failed_modules.append((module_name, str(e)))
            return False

    def copy_module_posix(self, module_name: str) -> bool:
        """Copy a module using rsync (POSIX: macOS, Linux)."""
        src = str(self.source / module_name) + "/"
        dst = str(self.target / module_name)

        # rsync command with symlink exclusion
        cmd = [
            'rsync',
            '-av',          # Archive mode (preserves permissions, times, etc.)
            '--delete',     # Delete extraneous files
            '--no-links',   # Don't copy symlinks as symlinks (skip them)
            src,
            dst,
        ]

        try:
            if self.dry_run:
                print(f"  [DRY-RUN] Would run: {' '.join(cmd)}")
                return True

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if result.returncode == 0:
                print(f"  ✓ Copied {module_name}")
                self.copied_modules.append(module_name)
                return True
            else:
                print(f"  ✗ Failed to copy {module_name}: {result.stderr[:100]}")
                self.failed_modules.append((module_name, result.stderr[:100]))
                return False
        except subprocess.TimeoutExpired:
            print(f"  ✗ Timeout copying {module_name}")
            self.failed_modules.append((module_name, "Timeout (>300s)"))
            return False
        except Exception as e:
            print(f"  ✗ Error copying {module_name}: {e}")
            self.failed_modules.append((module_name, str(e)))
            return False

    def execute(self) -> Dict[str, Any]:
        """Execute artifact preservation (copy all modules)."""
        print(f"\n{'='*60}")
        print(f"Phase 1: Artifact Preservation")
        print(f"{'='*60}")
        print(f"Source: {self.source}")
        print(f"Target: {self.target}")
        print(f"Platform: {self.platform}")
        if self.dry_run:
            print(f"Mode: DRY-RUN (no changes will be made)")
        print()

        modules = self.discover_modules()
        if not modules:
            print("⚠ No modules found in source project")
            return {"status": "warning", "modules_discovered": 0}

        print(f"Discovered {len(modules)} module(s):")
        for mod in modules:
            print(f"  - {mod}")
        print()

        print(f"Starting copy process...")
        for i, module in enumerate(modules, 1):
            print(f"[{i}/{len(modules)}] Copying {module}...")
            if self.platform == "Windows":
                self.copy_module_windows(module)
            else:
                self.copy_module_posix(module)

        print()
        print(f"{'='*60}")
        print(f"Phase 1 Results")
        print(f"{'='*60}")
        print(f"✓ Copied: {len(self.copied_modules)}")
        print(f"✗ Failed: {len(self.failed_modules)}")

        if self.failed_modules:
            print("\nFailed modules:")
            for module, error in self.failed_modules:
                print(f"  - {module}: {error}")

        result = {
            "status": "success" if len(self.failed_modules) == 0 else "partial",
            "platform": self.platform,
            "dry_run": self.dry_run,
            "modules_discovered": len(modules),
            "modules_copied": len(self.copied_modules),
            "modules_failed": len(self.failed_modules),
            "copied": self.copied_modules,
            "failed": [{"module": m, "error": e} for m, e in self.failed_modules],
            "timestamp": datetime.now().isoformat(),
        }

        # Save result to log
        log_path = Path(".ai/logs") / f"phase1-execution-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(log_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2)
        print(f"\nAudit log: {log_path}")

        return result


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    source = sys.argv[1]
    target = sys.argv[2]
    dry_run = '--dry-run' in sys.argv

    try:
        executor = Phase1Executor(source, target, dry_run)
        result = executor.execute()

        # Exit with error code if any modules failed
        sys.exit(0 if result["status"] == "success" else 1)
    except Exception as e:
        print(f"\n✗ Phase 1 failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
