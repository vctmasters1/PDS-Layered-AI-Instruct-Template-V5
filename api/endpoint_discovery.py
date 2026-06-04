#!/usr/bin/env python3
"""
API Endpoint Discovery Tool

Scans a codebase for API endpoints and generates a registry with their
metadata: resource, action, HTTP methods, paths, parameters, documentation.

Supports multiple patterns:
- Express: app.get(), app.post(), etc.
- FastAPI: @app.get(), @app.post(), etc.
- Django: path(), include(), etc.
- Generic: @route, router.add(), endpoint definitions

Usage:
    python endpoint_discovery.py --scan-root ./src --output endpoints.json
    python endpoint_discovery.py --scan-root . --framework fastapi --output registry.json

Exit codes:
    0: Success
    1: Argument error
    2: I/O error
    3: Parse error
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from enum import Enum


class Framework(Enum):
    """Supported web frameworks for pattern detection."""
    AUTO = "auto"           # Auto-detect
    EXPRESS = "express"     # Express.js / Node.js
    FASTAPI = "fastapi"     # FastAPI / Python
    DJANGO = "django"       # Django / Python
    GENERIC = "generic"     # Generic/language-agnostic


# ============================================================================
# Pattern Matchers (Framework-Specific)
# ============================================================================

# Express patterns: app.get(), router.post(), etc.
EXPRESS_PATTERNS = [
    # app.get('/path', handler)
    re.compile(r"(?:app|router)\.(get|post|put|patch|delete|all)\s*\(\s*['\"]([^'\"]+)['\"]"),
    # .get('/path', handler)
    re.compile(r"\.(get|post|put|patch|delete|all)\s*\(\s*['\"]([^'\"]+)['\"]"),
]

# FastAPI patterns: @app.get(), @router.post(), etc.
FASTAPI_PATTERNS = [
    # @app.get('/path'), @app.post('/path')
    re.compile(r"@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['\"]([^'\"]+)['\"]"),
    # def endpoint_name(...)
    re.compile(r"(?:async\s+)?def\s+([a-z_][a-z0-9_]*)\s*\("),
]

# Django patterns: path(), include(), etc.
DJANGO_PATTERNS = [
    # path('users/', views.user_list, name='user_list')
    re.compile(r"path\s*\(\s*['\"]([^'\"]+)['\"]"),
    # re_path(r'^users/$', views.user_list)
    re.compile(r"re_path\s*\(\s*r?['\"]([^'\"]+)['\"]"),
]

# Generic patterns (method-agnostic)
GENERIC_PATTERNS = [
    # @endpoint, @route, @api, etc.
    re.compile(r"@(?:endpoint|route|api|handler)\s*(?:\(\s*['\"]([^'\"]+)['\"]\s*\))?"),
    # endpoint definitions like resource_action
    re.compile(r"(?:def|class)\s+([a-z][a-z0-9_]*(?:_list|_create|_detail|_update|_delete|_search))\s*"),
]


# ============================================================================
# Discovery Engine
# ============================================================================

class EndpointDiscoveryEngine:
    """
    Scans a codebase for API endpoints and builds a registry.
    """

    def __init__(self, scan_root: Path, framework: Framework = Framework.AUTO):
        """
        Initialize the discovery engine.

        Args:
            scan_root: Root directory to scan
            framework: Web framework to detect patterns for
        """
        self.scan_root = Path(scan_root).resolve()
        self.framework = framework
        self.endpoints: List[Dict[str, Any]] = []
        self.warnings: List[str] = []

    def scan(self) -> None:
        """Scan the root directory for all API endpoints."""
        if not self.scan_root.exists():
            raise FileNotFoundError(f"Scan root does not exist: {self.scan_root}")

        print(f"🔍 Scanning {self.scan_root} for endpoints...")

        # Determine file types to scan
        scannable_extensions = {
            '.py',    # Python (FastAPI, Django)
            '.js',    # JavaScript (Express)
            '.ts',    # TypeScript
            '.tsx',
            '.jsx',
            '.java',  # Java
            '.cs',    # C#
            '.go',    # Go
            '.rs',    # Rust
            '.rb',    # Ruby
        }

        for file_path in self.scan_root.rglob('*'):
            if file_path.is_file() and file_path.suffix in scannable_extensions:
                self._scan_file(file_path)

        print(f"✓ Scan complete: {len(self.endpoints)} endpoints found")

    def _scan_file(self, file_path: Path) -> None:
        """Scan a single file for endpoint definitions."""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                lines = content.split('\n')

                for line_num, line in enumerate(lines, start=1):
                    self._scan_line(file_path, line_num, line)
        except Exception as e:
            self.warnings.append(f"Failed to read {file_path}: {e}")

    def _scan_line(self, file_path: Path, line_num: int, line: str) -> None:
        """Scan a single line for endpoint definitions."""
        # Skip comments and empty lines
        if line.strip().startswith('#') or line.strip().startswith('//'):
            return

        # Try framework-specific patterns
        endpoints_found = []

        if self.framework in (Framework.EXPRESS, Framework.AUTO):
            endpoints_found.extend(self._match_express(line))

        if self.framework in (Framework.FASTAPI, Framework.AUTO):
            endpoints_found.extend(self._match_fastapi(line))

        if self.framework in (Framework.DJANGO, Framework.AUTO):
            endpoints_found.extend(self._match_django(line))

        # Generic patterns
        endpoints_found.extend(self._match_generic(line))

        # Remove duplicates
        endpoints_found = list({e['path']: e for e in endpoints_found}.values())

        # Record endpoints
        for endpoint in endpoints_found:
            # Extract resource and action from path
            resource, action = self._extract_resource_action(endpoint['path'])

            self.endpoints.append({
                'path': endpoint['path'],
                'method': endpoint.get('method', 'UNKNOWN'),
                'resource': resource,
                'action': action,
                'file': str(file_path.relative_to(self.scan_root)),
                'line': line_num,
                'context': line.strip()[:100],
            })

    def _match_express(self, line: str) -> List[Dict]:
        """Match Express.js route patterns."""
        matches = []
        for pattern in EXPRESS_PATTERNS:
            for match in pattern.finditer(line):
                method = match.group(1).upper() if len(match.groups()) > 0 else 'GET'
                path = match.group(2) if len(match.groups()) > 1 else None
                if path:
                    matches.append({'path': path, 'method': method})
        return matches

    def _match_fastapi(self, line: str) -> List[Dict]:
        """Match FastAPI decorators."""
        matches = []
        for pattern in FASTAPI_PATTERNS:
            for match in pattern.finditer(line):
                if len(match.groups()) > 0:
                    first_group = match.group(1)
                    # Determine if it's a method or function name
                    if first_group in ('get', 'post', 'put', 'patch', 'delete'):
                        method = first_group.upper()
                        path = match.group(2) if len(match.groups()) > 1 else None
                        if path:
                            matches.append({'path': path, 'method': method})
                    else:
                        # It's a function name (endpoint_name pattern)
                        func_name = first_group
                        if '_' in func_name:
                            matches.append({'path': f'/{func_name.replace("_", "/")}', 'method': 'AUTO'})
        return matches

    def _match_django(self, line: str) -> List[Dict]:
        """Match Django URL patterns."""
        matches = []
        for pattern in DJANGO_PATTERNS:
            for match in pattern.finditer(line):
                path = match.group(1) if len(match.groups()) > 0 else None
                if path:
                    matches.append({'path': path, 'method': 'AUTO'})
        return matches

    def _match_generic(self, line: str) -> List[Dict]:
        """Match generic endpoint patterns."""
        matches = []
        for pattern in GENERIC_PATTERNS:
            for match in pattern.finditer(line):
                if len(match.groups()) > 0:
                    group_val = match.group(1)
                    if group_val:
                        # Could be a path or endpoint name
                        if '/' in group_val:
                            matches.append({'path': group_val, 'method': 'GENERIC'})
                        elif '_' in group_val and any(
                            action in group_val
                            for action in ('list', 'create', 'detail', 'update', 'delete', 'search')
                        ):
                            matches.append({'path': f'/{group_val}', 'method': 'GENERIC'})
        return matches

    def _extract_resource_action(self, path: str) -> tuple:
        """
        Extract resource and action from endpoint path.

        Examples:
            '/users' → ('user', 'list')
            '/users/{id}' → ('user', 'detail')
            '/users' (POST) → ('user', 'create')
            '/products/search' → ('product', 'search')
        """
        # Remove leading/trailing slashes and version prefixes
        path_clean = path.strip('/')
        path_clean = re.sub(r'^v\d+/', '', path_clean)  # Remove /v1, /v2, etc.
        path_clean = re.sub(r'^api/v\d+/', '', path_clean)  # Remove /api/v1, etc.

        if not path_clean:
            return ('unknown', 'unknown')

        # Split by /
        parts = [p for p in path_clean.split('/') if p and not p.startswith('{')]

        if not parts:
            return ('unknown', 'unknown')

        # First part is usually the resource
        resource = parts[0].rstrip('s')  # Remove trailing 's' for singularization

        # Determine action based on number of parts and path patterns
        if len(parts) == 1:
            # Single resource path: /users → resource_list
            action = 'list'
        elif len(parts) == 2:
            action_word = parts[1].lower()
            # Check for known actions
            if action_word in ('search', 'export', 'import', 'batch', 'validate'):
                action = action_word
            elif action_word == 'create':
                action = 'create'
            else:
                # Default: /users/{id} → detail
                action = 'detail'
        else:
            # Nested path: try to extract action from remaining parts
            action_word = parts[1].lower()
            if action_word in ('search', 'export', 'import', 'batch'):
                action = action_word
            else:
                action = 'unknown'

        return (resource, action)

    def get_report(self) -> Dict[str, Any]:
        """Generate a JSON-serializable report."""
        return {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'scan_root': str(self.scan_root),
            'framework': self.framework.value,
            'total_endpoints': len(self.endpoints),
            'endpoints': self.endpoints,
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
    print(f"Timestamp:       {report['timestamp']}")
    print(f"Framework:       {report['framework']}")
    print(f"Scan root:       {report['scan_root']}")
    print(f"Total found:     {report['total_endpoints']} endpoints")

    # Group by resource
    by_resource = {}
    by_method = {}
    for endpoint in report['endpoints']:
        resource = endpoint.get('resource', 'unknown')
        method = endpoint.get('method', 'UNKNOWN')

        if resource not in by_resource:
            by_resource[resource] = []
        by_resource[resource].append(endpoint)

        if method not in by_method:
            by_method[method] = 0
        by_method[method] += 1

    if by_resource:
        print(f"\nEndpoints by resource:")
        for resource in sorted(by_resource.keys()):
            count = len(by_resource[resource])
            print(f"  {resource:15}: {count:3} endpoints")

    if by_method:
        print(f"\nEndpoints by HTTP method:")
        for method in sorted(by_method.keys()):
            count = by_method[method]
            print(f"  {method:10}: {count:3} endpoints")

    if report['warnings']:
        print(f"\n⚠️  Warnings ({len(report['warnings'])}):")
        for warning in report['warnings'][:5]:
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
        description='Discover API endpoints in a codebase.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python endpoint_discovery.py --scan-root ./src
  python endpoint_discovery.py --scan-root . --framework fastapi --output endpoints.json
  python endpoint_discovery.py --scan-root ./api --framework express
        """,
    )

    parser.add_argument(
        '--scan-root',
        type=str,
        default='.',
        help='Root directory to scan (default: current directory)',
    )
    parser.add_argument(
        '--framework',
        type=str,
        choices=['auto', 'express', 'fastapi', 'django', 'generic'],
        default='auto',
        help='Framework to detect patterns for (default: auto)',
    )
    parser.add_argument(
        '--output',
        type=str,
        default=None,
        help='Write JSON report to this file (default: stdout)',
    )
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Print detailed output',
    )

    args = parser.parse_args()

    try:
        framework = Framework(args.framework)
        engine = EndpointDiscoveryEngine(args.scan_root, framework)
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
    except Exception as e:
        print(f"❌ Unexpected error: {e}", file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
