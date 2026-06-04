#!/usr/bin/env python3
"""
API Endpoint Name Generator & Validator

Central controller for endpoint naming ensuring all endpoints follow
the {resource}_{action}[_{detail}] convention.

This tool:
1. Generates endpoint names from resource + action + optional detail
2. Maps to HTTP method(s)
3. Validates endpoints against conventions
4. Checks for conflicts/duplicates in the codebase
5. Suggests paths for common patterns

Usage (as library):
    from endpoint_generator import EndpointGenerator

    gen = EndpointGenerator()
    endpoint = gen.generate(resource='user', action='create')
    # Output: EndpointDef(name='user_create', methods=['POST'], path='/users')

Usage (CLI):
    python endpoint_generator.py --resource user --action list
    python endpoint_generator.py --resource product --action update --detail bulk
    python endpoint_generator.py --validate user_create
    python endpoint_generator.py --list-actions
    python endpoint_generator.py --check-exists user_detail ./src

Exit codes:
    0: Success
    1: Invalid input
    2: Conflict detected
    3: Resource or action not recognized
"""

import argparse
import re
import sys
from pathlib import Path
from typing import Optional, Tuple, List, Dict, Set
from dataclasses import dataclass


# ============================================================================
# Action Registry (mirrors .ai/api-conventions.md)
# ============================================================================

@dataclass
class ActionDef:
    """Definition of an API action."""
    name: str
    http_methods: List[str]
    semantics: str
    example_path: str


ACTION_REGISTRY: Dict[str, ActionDef] = {
    'list': ActionDef('list', ['GET'], 'Read collection', '/{resource}'),
    'create': ActionDef('create', ['POST'], 'Create resource', '/{resource}'),
    'detail': ActionDef('detail', ['GET'], 'Read single resource', '/{resource}/{id}'),
    'update': ActionDef('update', ['PUT', 'PATCH'], 'Update resource', '/{resource}/{id}'),
    'delete': ActionDef('delete', ['DELETE'], 'Remove resource', '/{resource}/{id}'),
    'search': ActionDef('search', ['GET', 'POST'], 'Query/filter collection', '/{resource}/search'),
    'export': ActionDef('export', ['GET'], 'Generate/download file', '/{resource}/export'),
    'import': ActionDef('import', ['POST'], 'Bulk upload data', '/{resource}/import'),
    'batch': ActionDef('batch', ['POST'], 'Bulk create/modify', '/{resource}/batch'),
    'validate': ActionDef('validate', ['POST', 'GET'], 'Validation check', '/{resource}/validate'),
    'webhook': ActionDef('webhook', ['POST'], 'Event notification', '/webhooks/{event}'),
    'auth': ActionDef('auth', ['POST'], 'Authentication action', '/auth/{action}'),
    'subscribe': ActionDef('subscribe', ['POST', 'PUT'], 'Add to collection', '/{resource}/subscribe'),
    'unsubscribe': ActionDef('unsubscribe', ['DELETE', 'POST'], 'Remove from collection', '/{resource}/unsubscribe'),
}


# ============================================================================
# Endpoint Generator Engine
# ============================================================================

class EndpointGenerator:
    """
    Central controller for endpoint name generation and validation.
    """

    def __init__(self, strict_mode: bool = False, api_version: str = 'v1'):
        """
        Initialize the endpoint generator.

        Args:
            strict_mode: If True, raise exceptions on invalid inputs.
            api_version: Default API version (used in path suggestions)
        """
        self.strict_mode = strict_mode
        self.api_version = api_version
        self.warnings: List[str] = []

    def generate(
        self,
        resource: str,
        action: str,
        detail: Optional[str] = None,
        verbose: bool = False
    ) -> Optional[Dict]:
        """
        Generate a valid endpoint definition from resource, action, and detail.

        Args:
            resource: Resource name (singular, lowercase) e.g., 'user', 'product'
            action: Action name (lowercase) e.g., 'list', 'create', 'detail'
            detail: Optional detail/qualifier e.g., 'bulk', 'archived'
            verbose: Print generation steps

        Returns:
            Endpoint definition dict with name, methods, path, or None on error
        """
        if verbose:
            print(f"🔨 Generating endpoint for {resource}/{action}")

        # Step 1: Normalize resource
        resource_normalized = self._normalize_resource(resource)
        if not resource_normalized:
            msg = f"❌ Invalid resource: '{resource}'"
            if self.strict_mode:
                raise ValueError(msg)
            self.warnings.append(msg)
            return None

        if verbose:
            print(f"   ✓ Resource: {resource_normalized}")

        # Step 2: Lookup action
        if action.lower() not in ACTION_REGISTRY:
            msg = f"❌ Unknown action: '{action}'. Use --list-actions to see valid actions."
            if self.strict_mode:
                raise ValueError(msg)
            self.warnings.append(msg)
            return None

        action_def = ACTION_REGISTRY[action.lower()]
        if verbose:
            print(f"   ✓ Action: {action_def.name} → HTTP {', '.join(action_def.http_methods)}")

        # Step 3: Normalize detail
        detail_normalized = None
        if detail:
            detail_normalized = self._normalize_detail(detail)
            if not detail_normalized:
                msg = f"❌ Invalid detail: '{detail}'"
                if self.strict_mode:
                    raise ValueError(msg)
                self.warnings.append(msg)
                return None
            if verbose:
                print(f"   ✓ Detail: {detail_normalized}")

        # Step 4: Construct endpoint name
        if detail_normalized:
            endpoint_name = f"{resource_normalized}_{action}_{detail_normalized}"
        else:
            endpoint_name = f"{resource_normalized}_{action}"

        # Step 5: Suggest path
        path = self._suggest_path(resource_normalized, action_def, detail_normalized)

        if verbose:
            print(f"   ✓ Generated: {endpoint_name}")
            print(f"   ✓ HTTP Methods: {', '.join(action_def.http_methods)}")
            print(f"   ✓ Suggested path: /api/{self.api_version}{path}")

        return {
            'name': endpoint_name,
            'resource': resource_normalized,
            'action': action,
            'detail': detail_normalized,
            'http_methods': action_def.http_methods,
            'path_template': path,
            'path_with_version': f"/api/{self.api_version}{path}",
        }

    def validate(self, endpoint_name: str) -> Tuple[bool, str]:
        """
        Validate that an endpoint name follows the convention.

        Args:
            endpoint_name: Name to validate (e.g., 'user_create')

        Returns:
            (is_valid, message)
        """
        # Check format: {resource}_{action}[_{detail}]
        pattern = r'^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
        if not re.match(pattern, endpoint_name):
            return False, f"Invalid format: '{endpoint_name}'. Expected: {{resource}}_{{action}}[_{{detail}}]"

        parts = endpoint_name.split('_')
        if len(parts) < 2:
            return False, f"Invalid format: must have resource and action (e.g., 'user_create')"

        # Extract action (second-to-last or last part)
        # Handle: resource_action or resource_action_detail
        # We need to find which part is the action
        potential_action = parts[1]

        if potential_action not in ACTION_REGISTRY:
            return False, f"Unrecognized action: '{potential_action}'. Use --list-actions to see valid actions."

        return True, f"✓ Valid endpoint: {endpoint_name}"

    def find_conflicts(self, endpoint_name: str, search_root: Path) -> List[Dict]:
        """
        Search codebase for existing uses of the same endpoint.

        Args:
            endpoint_name: Endpoint name to search for
            search_root: Root directory to scan

        Returns:
            List of conflicts: [{"file": ..., "line": ..., "context": ...}, ...]
        """
        conflicts = []
        # Match endpoint name in strings, function names, router definitions
        pattern = re.compile(
            rf"(?:def|function|route|@app|@router)?.*?\b{re.escape(endpoint_name)}\b",
            re.IGNORECASE
        )

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

    def _normalize_resource(self, resource: str) -> Optional[str]:
        """Normalize resource name (singular, lowercase, no special chars)."""
        resource = resource.lower().strip()
        # Remove trailing 's' if plural
        if resource.endswith('s') and not resource.endswith('ss'):
            resource = resource[:-1]
        # Keep only alphanumerics
        resource = re.sub(r'[^a-z0-9_]', '', resource)
        return resource if resource else None

    def _normalize_detail(self, detail: str) -> Optional[str]:
        """Normalize detail/qualifier (lowercase, snake_case)."""
        detail = detail.lower().strip()
        detail = re.sub(r'[\s\-]+', '_', detail)
        detail = re.sub(r'[^a-z0-9_]', '', detail)
        return detail if detail else None

    def _suggest_path(self, resource: str, action_def: ActionDef, detail: Optional[str]) -> str:
        """Suggest a path template for the endpoint."""
        # Start with base path
        base = f"/{resource}s"  # pluralize for path

        # Handle action-specific paths
        if action_def.name == 'list':
            return base
        elif action_def.name == 'create':
            return base
        elif action_def.name == 'detail':
            return f"{base}/{{id}}"
        elif action_def.name == 'update':
            return f"{base}/{{id}}"
        elif action_def.name == 'delete':
            return f"{base}/{{id}}"
        elif action_def.name == 'search':
            return f"{base}/search"
        elif action_def.name == 'export':
            if detail:
                return f"{base}/export.{detail}"
            return f"{base}/export"
        elif action_def.name == 'import':
            return f"{base}/import"
        elif action_def.name == 'batch':
            return f"{base}/batch"
        elif action_def.name == 'validate':
            return f"{base}/validate"
        else:
            # Generic path
            if detail:
                return f"{base}/{action_def.name}/{detail}"
            return f"{base}/{action_def.name}"

    @staticmethod
    def _is_scannable(file_path: Path) -> bool:
        """Check if file should be scanned for conflicts."""
        scannable = {
            '.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.cs', '.go',
            '.rb', '.php', '.rs', '.swift', '.kt',
        }
        return file_path.suffix in scannable


# ============================================================================
# CLI Interface
# ============================================================================

def print_endpoint_details(endpoint_def: Dict, gen: EndpointGenerator, search_root: Optional[Path] = None) -> None:
    """Pretty-print endpoint definition details."""
    if not endpoint_def:
        print("❌ Failed to generate endpoint")
        return

    print("\n" + "=" * 70)
    print(f"Endpoint: {endpoint_def['name']}")
    print("=" * 70)
    print(f"Resource:        {endpoint_def['resource']}")
    print(f"Action:          {endpoint_def['action']}")
    if endpoint_def.get('detail'):
        print(f"Detail:          {endpoint_def['detail']}")
    print(f"HTTP Methods:    {', '.join(endpoint_def['http_methods'])}")
    print(f"Path Template:   {endpoint_def['path_template']}")
    print(f"Full Path:       {endpoint_def['path_with_version']}")

    if search_root:
        conflicts = gen.find_conflicts(endpoint_def['name'], search_root)
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
    """Parse arguments and run the endpoint generator."""
    parser = argparse.ArgumentParser(
        description='Generate and validate API endpoint names following conventions.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate an endpoint
  python endpoint_generator.py --resource user --action create

  # Generate with detail
  python endpoint_generator.py --resource user --action batch --detail import

  # Validate an existing endpoint
  python endpoint_generator.py --validate user_create

  # List all known actions
  python endpoint_generator.py --list-actions

  # Check for conflicts
  python endpoint_generator.py --resource product --action detail --check-exists ./src
        """,
    )

    parser.add_argument(
        '--resource',
        type=str,
        help='Resource name (singular, lowercase)',
    )
    parser.add_argument(
        '--action',
        type=str,
        help='Action name (list, create, update, delete, etc.)',
    )
    parser.add_argument(
        '--detail',
        type=str,
        help='Optional detail/qualifier (e.g., bulk, archived, csv)',
    )
    parser.add_argument(
        '--validate',
        type=str,
        help='Validate an existing endpoint name',
    )
    parser.add_argument(
        '--check-exists',
        type=str,
        help='Search for conflicts in this directory',
    )
    parser.add_argument(
        '--list-actions',
        action='store_true',
        help='List all known actions',
    )
    parser.add_argument(
        '--api-version',
        type=str,
        default='v1',
        help='API version for path suggestions (default: v1)',
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
        gen = EndpointGenerator(strict_mode=args.strict, api_version=args.api_version)

        # List actions
        if args.list_actions:
            print("\n" + "=" * 70)
            print("KNOWN ACTIONS")
            print("=" * 70)
            for action_name in sorted(ACTION_REGISTRY.keys()):
                action_def = ACTION_REGISTRY[action_name]
                print(f"{action_name:15} HTTP {', '.join(action_def.http_methods):15} {action_def.semantics}")
            print("=" * 70)
            return 0

        # Generate endpoint
        if args.resource and args.action:
            endpoint_def = gen.generate(
                args.resource,
                args.action,
                detail=args.detail,
                verbose=args.verbose
            )
            if not endpoint_def:
                print(f"❌ Failed to generate endpoint")
                if gen.warnings:
                    for warning in gen.warnings:
                        print(f"   {warning}")
                return 1

            search_root = Path(args.check_exists) if args.check_exists else None
            print_endpoint_details(endpoint_def, gen, search_root)
            return 0

        # Validate endpoint
        if args.validate:
            is_valid, msg = gen.validate(args.validate)
            print(f"\n{msg}\n")
            return 0 if is_valid else 1

        # No action specified
        print("❌ Specify --resource and --action to generate, --validate to check, or --list-actions")
        parser.print_help()
        return 1

    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        return 3


if __name__ == '__main__':
    sys.exit(main())
