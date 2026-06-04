#!/usr/bin/env python3
"""
GUI Element ID Generator & Validator

Central controller for element ID generation ensuring all IDs follow
the 2-letter prefix convention and best practices.

This tool:
1. Generates IDs based on element type + semantic name
2. Validates IDs against the prefix registry
3. Checks for conflicts/duplicates in the codebase
4. Enforces naming standards (lowercase, snake_case)

Usage (as library):
    from gui_element_id import IDGenerator

    gen = IDGenerator()
    id = gen.generate(element_type='button', name='Submit Form')
    # Output: bu_submit_form

Usage (CLI):
    python gui_element_id.py --type button --name "Submit Form"
    python gui_element_id.py --type input --name "Email Address" --check-exists ./src
    python gui_element_id.py --validate bu_submit

Exit codes:
    0: Success
    1: Invalid input
    2: ID conflict detected
    3: Element type not recognized
"""

import argparse
import re
import sys
from pathlib import Path
from typing import Optional, Tuple, List, Dict
from enum import Enum


# ============================================================================
# Prefix Registry (mirrors .ai/coding-prefixes.md)
# ============================================================================

PREFIX_REGISTRY: Dict[str, str] = {
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
}

# Reverse mapping: element type → prefix
# Matches common naming variations
TYPE_TO_PREFIX: Dict[str, str] = {
    'button': 'bu',
    'btn': 'bu',
    'toggle': 'tg',
    'switch': 'sw',
    'input': 'in',
    'text': 'in',
    'email': 'in',
    'number': 'in',
    'password': 'in',
    'textbox': 'in',
    'checkbox': 'cb',
    'radio': 'rd',
    'slider': 'sl',
    'range': 'sl',
    'dropdown': 'dd',
    'select': 'dd',
    'option': 'dd',
    'modal': 'md',
    'dialog': 'dl',
    'alert': 'dl',
    'form': 'fd',
    'fieldset': 'fd',
    'table': 'tb',
    'grid': 'tb',
    'card': 'cr',
    'menu': 'mn',
    'sidebar': 'sb',
    'header': 'hd',
    'nav': 'hd',
    'footer': 'ft',
    'notification': 'nd',
    'alert': 'nd',
    'toast': 'nd',
    'link': 'lk',
    'anchor': 'lk',
    'icon': 'ic',
    'badge': 'bd',
    'loading': 'ld',
    'spinner': 'sp',
    'overlay': 'ov',
    'popover': 'pp',
    'popup': 'pp',
    'accordion': 'ac',
    'breadcrumb': 'br',
    'tooltip': 'tt',
    'pagination': 'pd',
    'result': 'sr',
    'comment': 'cm',
    'rating': 'rt',
    'keyboard': 'kb',
}


# ============================================================================
# ID Generator Engine
# ============================================================================

class IDGenerator:
    """
    Central controller for element ID generation and validation.
    """

    def __init__(self, strict_mode: bool = False):
        """
        Initialize the ID generator.

        Args:
            strict_mode: If True, raise exceptions on invalid inputs.
                        If False, warn and try to recover.
        """
        self.strict_mode = strict_mode
        self.warnings: List[str] = []

    def generate(
        self,
        element_type: str,
        name: str,
        verbose: bool = False
    ) -> str:
        """
        Generate a valid element ID from type and name.

        Args:
            element_type: Element type (e.g., 'button', 'input', 'modal')
            name: Semantic name (e.g., 'Submit Form', 'emailAddress', 'user-email')
            verbose: If True, print generation steps

        Returns:
            Generated ID (e.g., 'bu_submit_form')

        Raises:
            ValueError: If element_type is not recognized (strict mode only)
        """
        if verbose:
            print(f"🔨 Generating ID for {element_type}: '{name}'")

        # Step 1: Normalize element type
        element_type_normalized = self._normalize_element_type(element_type)
        if not element_type_normalized:
            msg = f"❌ Unrecognized element type: '{element_type}'"
            if self.strict_mode:
                raise ValueError(msg)
            self.warnings.append(msg)
            return None

        if verbose:
            print(f"   ✓ Element type: {element_type_normalized}")

        # Step 2: Lookup prefix
        prefix = self._get_prefix(element_type_normalized)
        if not prefix:
            msg = f"❌ No prefix mapping for: '{element_type_normalized}'"
            if self.strict_mode:
                raise ValueError(msg)
            self.warnings.append(msg)
            return None

        if verbose:
            print(f"   ✓ Prefix: {prefix}_")

        # Step 3: Normalize name
        name_normalized = self._normalize_name(name)
        if not name_normalized:
            msg = f"❌ Invalid name: '{name}' (empty after normalization)"
            if self.strict_mode:
                raise ValueError(msg)
            self.warnings.append(msg)
            return None

        if verbose:
            print(f"   ✓ Name: {name_normalized}")

        # Step 4: Construct ID
        element_id = f"{prefix}_{name_normalized}"

        if verbose:
            print(f"   ✓ Generated: {element_id}")

        return element_id

    def validate(self, element_id: str) -> Tuple[bool, str]:
        """
        Validate that an ID follows the convention.

        Args:
            element_id: ID to validate (e.g., 'bu_submit')

        Returns:
            (is_valid, message)
        """
        # Check format: {2-letter}_{name}
        pattern = r'^[a-z]{2}_[a-z0-9_]+$'
        if not re.match(pattern, element_id):
            return False, f"Invalid format: '{element_id}'. Expected: {{2-letter prefix}}_{{{name}}}"

        # Check prefix
        prefix = element_id.split('_')[0]
        if prefix not in PREFIX_REGISTRY:
            return False, f"Unrecognized prefix: '{prefix}'. See PREFIX_REGISTRY."

        return True, f"✓ Valid ID: {element_id} ({PREFIX_REGISTRY[prefix]})"

    def find_conflicts(self, element_id: str, search_root: Path) -> List[Dict]:
        """
        Search codebase for existing uses of the same ID.

        Args:
            element_id: ID to search for
            search_root: Root directory to scan

        Returns:
            List of conflicts: [{"file": ..., "line": ..., "context": ...}, ...]
        """
        conflicts = []
        pattern = re.compile(rf'["\']?{re.escape(element_id)}["\']?')

        for file_path in search_root.rglob('*'):
            if file_path.is_file() and self._is_scannable(file_path):
                try:
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        for line_num, line in enumerate(f, start=1):
                            if pattern.search(line):
                                conflicts.append({
                                    'file': str(file_path.relative_to(search_root)),
                                    'line': line_num,
                                    'context': line.strip()[:100],
                                })
                except Exception:
                    pass

        return conflicts

    # ========================================================================
    # Private Helpers
    # ========================================================================

    def _normalize_element_type(self, element_type: str) -> Optional[str]:
        """Normalize element type string."""
        normalized = element_type.lower().strip()
        if normalized in TYPE_TO_PREFIX:
            return normalized
        return None

    def _get_prefix(self, element_type: str) -> Optional[str]:
        """Get 2-letter prefix for element type."""
        return TYPE_TO_PREFIX.get(element_type.lower())

    def _normalize_name(self, name: str) -> Optional[str]:
        """
        Normalize a semantic name into snake_case identifier.

        Examples:
            'Submit Form' → 'submit_form'
            'emailAddress' → 'email_address'
            'user-email' → 'user_email'
            'USER EMAIL' → 'user_email'
        """
        # Remove leading/trailing whitespace
        name = name.strip()

        if not name:
            return None

        # Convert camelCase to snake_case
        # Insert underscore before uppercase letters preceded by lowercase
        name = re.sub(r'([a-z])([A-Z])', r'\1_\2', name)

        # Replace spaces, hyphens, dots with underscores
        name = re.sub(r'[\s\-\.]+', '_', name)

        # Convert to lowercase
        name = name.lower()

        # Remove leading/trailing underscores
        name = name.strip('_')

        # Collapse multiple underscores
        name = re.sub(r'_+', '_', name)

        # Remove non-alphanumeric (except underscore)
        name = re.sub(r'[^a-z0-9_]', '', name)

        return name if name else None

    @staticmethod
    def _is_scannable(file_path: Path) -> bool:
        """Check if file should be scanned for conflicts."""
        scannable = {
            '.jsx', '.tsx', '.js', '.ts', '.vue', '.html',
            '.css', '.scss', '.less', '.py', '.java', '.cs', '.go',
        }
        return file_path.suffix in scannable


# ============================================================================
# CLI Interface
# ============================================================================

def print_id_details(element_id: str, gen: IDGenerator, search_root: Optional[Path] = None) -> None:
    """Pretty-print ID details."""
    is_valid, msg = gen.validate(element_id)

    print("\n" + "=" * 70)
    print(f"Element ID: {element_id}")
    print("=" * 70)
    print(f"Status:     {msg}")

    if is_valid:
        prefix = element_id.split('_')[0]
        name = '_'.join(element_id.split('_')[1:])
        element_type = PREFIX_REGISTRY.get(prefix, 'Unknown')

        print(f"Prefix:     {prefix}_ ({element_type})")
        print(f"Name:       {name}")

        if search_root:
            conflicts = gen.find_conflicts(element_id, search_root)
            if conflicts:
                print(f"\n⚠️  Found {len(conflicts)} existing use(s):")
                for conflict in conflicts[:3]:
                    print(f"   {conflict['file']}:{conflict['line']}")
                if len(conflicts) > 3:
                    print(f"   ... and {len(conflicts) - 3} more")
            else:
                print(f"\n✓ No existing uses found in codebase")

    print("=" * 70)


def main():
    """Parse arguments and run the ID generator."""
    parser = argparse.ArgumentParser(
        description='Generate and validate GUI element IDs following prefix conventions.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate an ID
  python gui_element_id.py --type button --name "Submit"

  # Generate with conflict check
  python gui_element_id.py --type input --name "Email Address" --check-exists ./src

  # Validate an existing ID
  python gui_element_id.py --validate bu_submit

  # List all known prefixes
  python gui_element_id.py --list-prefixes
        """,
    )

    parser.add_argument(
        '--type',
        type=str,
        help='Element type (button, input, toggle, modal, etc.)',
    )
    parser.add_argument(
        '--name',
        type=str,
        help='Semantic name for the element',
    )
    parser.add_argument(
        '--validate',
        type=str,
        help='Validate an existing ID',
    )
    parser.add_argument(
        '--check-exists',
        type=str,
        help='Search for conflicts in this directory',
    )
    parser.add_argument(
        '--list-prefixes',
        action='store_true',
        help='List all known element types and prefixes',
    )
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Print detailed output',
    )
    parser.add_argument(
        '--strict',
        action='store_true',
        help='Fail on invalid input (default: warn and recover)',
    )

    args = parser.parse_args()

    try:
        gen = IDGenerator(strict_mode=args.strict)

        # List prefixes
        if args.list_prefixes:
            print("\n" + "=" * 70)
            print("KNOWN ELEMENT TYPES & PREFIXES")
            print("=" * 70)
            for prefix in sorted(PREFIX_REGISTRY.keys()):
                element_type = PREFIX_REGISTRY[prefix]
                # Find matching types
                matching_types = [t for t, p in TYPE_TO_PREFIX.items() if p == prefix]
                print(f"{prefix:2}_ → {element_type:25} (aliases: {', '.join(matching_types[:3])})")
            print("=" * 70)
            return 0

        # Generate ID
        if args.type and args.name:
            element_id = gen.generate(args.type, args.name, verbose=args.verbose)
            if not element_id:
                print(f"❌ Failed to generate ID")
                if gen.warnings:
                    for warning in gen.warnings:
                        print(f"   {warning}")
                return 1

            search_root = Path(args.check_exists) if args.check_exists else None
            print_id_details(element_id, gen, search_root)
            return 0

        # Validate ID
        if args.validate:
            search_root = Path(args.check_exists) if args.check_exists else None
            print_id_details(args.validate, gen, search_root)
            is_valid, _ = gen.validate(args.validate)
            return 0 if is_valid else 1

        # No action specified
        print("❌ Specify --type and --name to generate, --validate to check, or --list-prefixes")
        parser.print_help()
        return 1

    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        return 3


if __name__ == '__main__':
    sys.exit(main())
