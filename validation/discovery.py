#!/usr/bin/env python3
"""
Element Prefix Discovery & Validation Engine

Scans a codebase for 2-letter element prefixes (e.g., bu_, tg_, in_) and generates
a registry of discovered elements with their locations. Used by automated test systems
to enable metadata-driven validation.

Usage:
    python discovery.py --scan-root ./src --output prefixes-found.json
    python discovery.py --help

Exit codes:
    0: Success
    1: Argument parsing error
    2: I/O error (file not found, permission denied)
    3: Validation error (unrecognized prefix)
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Optional, Dict, List, Any
from datetime import datetime


# ============================================================================
# Configuration
# ============================================================================

# File extensions to scan. Add or remove based on your project's needs.
SCANNABLE_EXTENSIONS = {
    # Frontend
    '.jsx', '.tsx', '.js', '.ts',
    '.vue', '.html',
    '.css', '.scss', '.less',
    # Backend & config
    '.py', '.java', '.cs', '.go', '.rb',
    # Markup
    '.md', '.xml',
}

# Regex pattern to match 2-letter prefixes: {ll}_{identifier}
# Matches: bu_submit, tg_darkmode, in_email123, etc.
PREFIX_PATTERN = re.compile(r'[a-z]{2}_[a-zA-Z0-9_]+')

# Master prefix registry (from .ai/coding-prefixes.md)
MASTER_PREFIXES = {
    'bu': 'Button',
    'tg': 'Toggle',
    'in': 'Input field',
    'cb': 'Checkbox',
    'rd': 'Radio button',
    'sw': 'Switch/Toggle control',
    'sl': 'Slider/Range input',
    'dd': 'Dropdown/Select',
    'md': 'Modal dialog',
    'dl': 'Dialog (lighter)',
    'fd': 'Form/Fieldset',
    'tb': 'Table',
    'cr': 'Card',
    'mn': 'Menu',
    'sb': 'Sidebar',
    'hd': 'Header',
    'ft': 'Footer',
    'nd': 'Notification/Alert',
    'lk': 'Link/Anchor',
    'ic': 'Icon',
    'bd': 'Badge',
    'ld': 'Loading indicator',
    'ov': 'Overlay',
    'pp': 'Popover/Popup',
    'ac': 'Accordion',
    'br': 'Breadcrumb',
    'tt': 'Tooltip',
    'sp': 'Spinner',
    'pd': 'Pagination',
    'sr': 'Searchable result',
    'cm': 'Comment',
    'rt': 'Rating',
    'kb': 'Keyboard shortcut',
    # Code element prefixes (see .ai/coding-prefixes.md § Code Element Prefixes)
    'ap': 'API endpoint handler',
    'ev': 'Event/telemetry',
    'mt': 'Metric',
    'wk': 'Worker/background job',
    'fl': 'Feature flag',
    'st': 'State machine state',
}


# ============================================================================
# Discovery Engine
# ============================================================================

class PrefixDiscoveryEngine:
    """
    Scans a directory tree for element prefixes and builds a registry.
    """

    def __init__(self, scan_root: Path, strict_mode: bool = False):
        """
        Initialize the discovery engine.

        Args:
            scan_root: Root directory to scan (relative or absolute)
            strict_mode: If True, raise error on unrecognized prefix;
                        if False, warn and continue
        """
        self.scan_root = Path(scan_root).resolve()
        self.strict_mode = strict_mode
        self.elements: List[Dict[str, Any]] = []
        self.warnings: List[str] = []

    def scan(self) -> None:
        """Scan the root directory for all prefixed elements."""
        if not self.scan_root.exists():
            raise FileNotFoundError(f"Scan root does not exist: {self.scan_root}")

        print(f"🔍 Scanning {self.scan_root}...")

        for file_path in self.scan_root.rglob('*'):
            if file_path.is_file() and file_path.suffix in SCANNABLE_EXTENSIONS:
                self._scan_file(file_path)

        print(f"✓ Scan complete: {len(self.elements)} elements found")

    def _scan_file(self, file_path: Path) -> None:
        """Scan a single file for prefixed elements."""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                for line_num, line in enumerate(f, start=1):
                    self._scan_line(file_path, line_num, line)
        except Exception as e:
            self.warnings.append(f"Failed to read {file_path}: {e}")

    def _scan_line(self, file_path: Path, line_num: int, line: str) -> None:
        """Scan a single line for prefixed elements."""
        for match in PREFIX_PATTERN.finditer(line):
            element_id = match.group(0)
            prefix = element_id.split('_')[0]

            # Validate prefix
            if prefix not in MASTER_PREFIXES:
                msg = f"{file_path.relative_to(self.scan_root)}:{line_num}: Unrecognized prefix '{prefix}' in '{element_id}'"
                if self.strict_mode:
                    raise ValueError(msg)
                else:
                    self.warnings.append(msg)
                    continue

            # Record element
            col_num = match.start() + 1
            context = line.strip()[:80]  # First 80 chars for context

            self.elements.append({
                'id': element_id,
                'prefix': prefix,
                'type': MASTER_PREFIXES[prefix],
                'file': str(file_path.relative_to(self.scan_root)),
                'line': line_num,
                'column': col_num,
                'context': context,
            })

    def get_report(self) -> Dict[str, Any]:
        """Generate a JSON-serializable report."""
        return {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'scan_root': str(self.scan_root),
            'total_elements': len(self.elements),
            'elements': self.elements,
            'warnings': self.warnings,
        }


# ============================================================================
# Statistics & Reporting
# ============================================================================

def print_summary(report: Dict[str, Any]) -> None:
    """Print a human-readable summary of the scan results."""
    print("\n" + "=" * 70)
    print(f"SCAN SUMMARY")
    print("=" * 70)
    print(f"Timestamp:     {report['timestamp']}")
    print(f"Scan root:     {report['scan_root']}")
    print(f"Total found:   {report['total_elements']} elements")

    # Group by prefix
    by_prefix = {}
    for elem in report['elements']:
        prefix = elem['prefix']
        if prefix not in by_prefix:
            by_prefix[prefix] = []
        by_prefix[prefix].append(elem)

    if by_prefix:
        print(f"\nBreakdown by type:")
        for prefix in sorted(by_prefix.keys()):
            count = len(by_prefix[prefix])
            element_type = MASTER_PREFIXES.get(prefix, 'Unknown')
            print(f"  {prefix:2}_ ({element_type:20}): {count:3} elements")

    if report['warnings']:
        print(f"\n⚠️  Warnings ({len(report['warnings'])}):")
        for warning in report['warnings'][:5]:  # Show first 5
            print(f"  - {warning}")
        if len(report['warnings']) > 5:
            print(f"  ... and {len(report['warnings']) - 5} more")

    print("=" * 70)


# ============================================================================
# CLI
# ============================================================================

def main():
    """Parse arguments and run the discovery engine."""
    parser = argparse.ArgumentParser(
        description='Discover and validate element prefixes in a codebase.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python discovery.py --scan-root ./src
  python discovery.py --scan-root . --output prefixes-found.json
  python discovery.py --scan-root ./components --output report.json --verbose
        """,
    )

    parser.add_argument(
        '--scan-root',
        type=str,
        default='.',
        help='Root directory to scan (default: current directory)',
    )
    parser.add_argument(
        '--output',
        type=str,
        default=None,
        help='Write JSON report to this file (default: stdout)',
    )
    parser.add_argument(
        '--strict',
        action='store_true',
        help='Fail on first unrecognized prefix (default: warn and continue)',
    )
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Print detailed output',
    )

    args = parser.parse_args()

    try:
        engine = PrefixDiscoveryEngine(args.scan_root, strict_mode=args.strict)
        engine.scan()
        report = engine.get_report()

        # Print summary
        print_summary(report)

        # Write to file if requested
        if args.output:
            output_path = Path(args.output)
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(report, f, indent=2)
            print(f"\n✓ Report written to {output_path}")
        else:
            # Print JSON to stdout
            print("\nJSON Output:")
            print(json.dumps(report, indent=2))

        return 0

    except FileNotFoundError as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        return 2
    except ValueError as e:
        print(f"❌ Validation error: {e}", file=sys.stderr)
        return 3
    except Exception as e:
        print(f"❌ Unexpected error: {e}", file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
