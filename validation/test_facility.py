#!/usr/bin/env python3
"""
Generic Test Facility for Prefixed Elements

Reads a prefix discovery report (JSON) and applies validation strategies
based on element type. Extensible for different testing frameworks.

This is the "coordination layer" that:
1. Reads prefixes-found.json (from discovery.py)
2. Routes each element to appropriate test strategy
3. Aggregates results and reports findings

Usage:
    python test_facility.py --registry prefixes-found.json
    python test_facility.py --registry prefixes-found.json --strategy existence
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Optional, Dict, List, Any
from enum import Enum


class TestStrategy(Enum):
    """Available test strategies."""
    EXISTENCE = "existence"         # Element is defined
    ACCESSIBILITY = "accessibility" # ARIA labels, roles, keyboard support
    FUNCTIONAL = "functional"       # Click handlers, state changes
    VISUAL = "visual"              # Screenshots, visual regression


# ============================================================================
# Test Strategy Implementations
# ============================================================================

class ExistenceValidator:
    """
    Validates that discovered elements actually exist in the codebase.

    This is the foundation: if an element ID was discovered (and matched
    a known prefix), it passed basic existence. This validator confirms
    that and flags duplicates.
    """

    def __init__(self, report: Dict[str, Any]):
        self.report = report
        self.elements = report.get('elements', [])

    def validate(self) -> Dict[str, Any]:
        """Run existence checks."""
        results = {
            'strategy': 'existence',
            'total_elements': len(self.elements),
            'checks': [],
            'summary': {
                'passed': 0,
                'failed': 0,
                'warnings': 0,
            },
        }

        # Track duplicates
        seen = {}
        for elem in self.elements:
            elem_id = elem['id']
            if elem_id not in seen:
                seen[elem_id] = []
            seen[elem_id].append(elem)

        # Validate each element
        for elem in self.elements:
            elem_id = elem['id']
            prefix = elem['prefix']

            check = {
                'element': elem_id,
                'status': 'pass',
                'findings': [],
            }

            # Check 1: Element exists (always true if discovered)
            check['findings'].append({
                'type': 'element_found',
                'message': f"Element '{elem_id}' found at {elem['file']}:{elem['line']}",
            })

            # Check 2: Detect duplicates
            if len(seen[elem_id]) > 1:
                check['findings'].append({
                    'type': 'warning',
                    'severity': 'medium',
                    'message': f"Element '{elem_id}' appears {len(seen[elem_id])} times",
                    'locations': [
                        f"{e['file']}:{e['line']}" for e in seen[elem_id]
                    ],
                })
                results['summary']['warnings'] += 1

            # Check 3: Validate prefix is recognized (already done in discovery)
            if prefix not in self._get_known_prefixes():
                check['status'] = 'fail'
                check['findings'].append({
                    'type': 'error',
                    'message': f"Unrecognized prefix '{prefix}' for element '{elem_id}'",
                })
                results['summary']['failed'] += 1
            else:
                results['summary']['passed'] += 1

            results['checks'].append(check)

        return results

    @staticmethod
    def _get_known_prefixes() -> set:
        """Return set of known 2-letter prefixes."""
        return {
            'bu', 'tg', 'in', 'cb', 'rd', 'sw', 'sl', 'dd',
            'md', 'dl', 'fd', 'tb', 'cr', 'mn', 'sb', 'hd',
            'ft', 'nd', 'lk', 'ic', 'bd', 'ld', 'ov', 'pp',
            'ac', 'br', 'tt', 'sp', 'pd', 'sr', 'cm', 'rt', 'kb',
        }


class AccessibilityValidator:
    """
    Validates accessibility best practices for interactive elements.

    Flags:
    - Buttons without aria-label or text content
    - Form inputs without associated <label>
    - Missing role attributes for custom components
    """

    def __init__(self, report: Dict[str, Any]):
        self.report = report
        self.elements = report.get('elements', [])

    def validate(self) -> Dict[str, Any]:
        """Run accessibility checks."""
        results = {
            'strategy': 'accessibility',
            'status': 'deferred',
            'message': (
                'Accessibility validation requires semantic analysis of source code. '
                'This strategy is implemented in framework-specific test suites '
                '(e.g., Playwright, Cypress) that can parse DOM attributes. '
                'Run framework-specific accessibility tests via CI/CD pipeline.'
            ),
            'next_steps': [
                'Integrate axe-core or similar accessibility audit tool',
                'Run in Playwright: await expect(page).toHaveNoViolations()',
                'Run in Cypress: cy.checkA11y()',
            ],
        }
        return results


class FunctionalValidator:
    """
    Validates functional behavior of interactive elements.

    Framework-agnostic stub; actual tests live in:
    - E2E tests (Playwright, Cypress): click, state changes
    - Component tests (Vitest, Jest): event handlers, callbacks
    """

    def __init__(self, report: Dict[str, Any]):
        self.report = report
        self.elements = report.get('elements', [])

    def validate(self) -> Dict[str, Any]:
        """Run functional checks."""
        # Classify elements by type
        interactive_elements = [
            e for e in self.elements
            if e['prefix'] in ('bu', 'tg', 'in', 'cb', 'rd', 'sw', 'sl', 'dd')
        ]

        results = {
            'strategy': 'functional',
            'status': 'deferred',
            'interactive_elements_found': len(interactive_elements),
            'message': (
                'Functional testing requires test framework integration. '
                'Use framework-specific test runners to validate behavior.'
            ),
            'recommended_tests': {
                'bu': 'onClick handlers, disabled state',
                'tg': 'state changes, onChange callbacks',
                'in': 'onChange, onBlur, validation',
                'cb': 'selection state, bulk operations',
                'rd': 'radio group behavior, mutual exclusion',
                'sw': 'toggle state, side effects',
                'sl': 'value changes, bounds validation',
                'dd': 'option selection, filtering',
            },
            'framework_guidance': [
                'Playwright: Use locator(id=element_id).click(), .fill()',
                'Jest/Vitest: Mock handlers and verify they were called',
                'Cypress: cy.get(\'#element_id\').click(), cy.get(\'input\').type()',
            ],
        }
        return results


class VisualValidator:
    """
    Validates visual consistency via screenshot regression.

    Framework-agnostic stub; actual tests live in visual regression tools:
    - Percy, Chromatic, BackstopJS
    - Playwright: page.screenshot()
    """

    def __init__(self, report: Dict[str, Any]):
        self.report = report
        self.elements = report.get('elements', [])

    def validate(self) -> Dict[str, Any]:
        """Run visual checks."""
        visual_components = [
            e for e in self.elements
            if e['prefix'] in ('cr', 'md', 'dl', 'nd', 'pp', 'ac')
        ]

        results = {
            'strategy': 'visual',
            'status': 'deferred',
            'visual_components_found': len(visual_components),
            'message': (
                'Visual regression testing requires a dedicated tool. '
                'Prefixed elements provide the discovery mechanism; '
                'use a visual testing service for actual regression detection.'
            ),
            'visual_components_by_type': {
                e['prefix']: [x['id'] for x in self.elements if x['prefix'] == e['prefix']]
                for e in set(visual_components)
            },
            'recommended_tools': [
                'Percy: Automate visual testing with Playwright/Cypress',
                'Chromatic: Storybook integration for component visual testing',
                'BackstopJS: Self-hosted visual regression',
            ],
        }
        return results


# ============================================================================
# Test Coordinator
# ============================================================================

class TestFacility:
    """
    Coordinates test strategies and aggregates results.
    """

    def __init__(self, report_path: str):
        self.report_path = Path(report_path)
        self.report = self._load_report()

    def _load_report(self) -> Dict[str, Any]:
        """Load discovery report from JSON file."""
        with open(self.report_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def run_strategy(self, strategy: TestStrategy) -> Dict[str, Any]:
        """Run a specific test strategy."""
        if strategy == TestStrategy.EXISTENCE:
            validator = ExistenceValidator(self.report)
        elif strategy == TestStrategy.ACCESSIBILITY:
            validator = AccessibilityValidator(self.report)
        elif strategy == TestStrategy.FUNCTIONAL:
            validator = FunctionalValidator(self.report)
        elif strategy == TestStrategy.VISUAL:
            validator = VisualValidator(self.report)
        else:
            raise ValueError(f"Unknown strategy: {strategy}")

        return validator.validate()

    def run_all(self) -> Dict[str, Any]:
        """Run all test strategies."""
        strategies = [
            TestStrategy.EXISTENCE,
            TestStrategy.ACCESSIBILITY,
            TestStrategy.FUNCTIONAL,
            TestStrategy.VISUAL,
        ]

        results = {
            'timestamp': self.report.get('timestamp'),
            'scan_root': self.report.get('scan_root'),
            'strategies': {},
        }

        for strategy in strategies:
            print(f"Running {strategy.value} validation...")
            results['strategies'][strategy.value] = self.run_strategy(strategy)

        return results


# ============================================================================
# CLI
# ============================================================================

def print_results(results: Dict[str, Any]) -> None:
    """Pretty-print validation results."""
    print("\n" + "=" * 70)
    print("TEST FACILITY RESULTS")
    print("=" * 70)
    print(f"Timestamp:  {results['timestamp']}")
    print(f"Scan root:  {results['scan_root']}")

    for strategy_name, strategy_results in results.get('strategies', {}).items():
        print(f"\n{strategy_name.upper()}: {strategy_results.get('status', 'N/A')}")
        if 'summary' in strategy_results:
            summary = strategy_results['summary']
            print(f"  Passed: {summary['passed']}, Failed: {summary['failed']}, Warnings: {summary['warnings']}")

    print("\n" + "=" * 70)


def main():
    """Parse arguments and run test facility."""
    parser = argparse.ArgumentParser(
        description='Test framework for prefixed elements.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python test_facility.py --registry prefixes-found.json
  python test_facility.py --registry prefixes-found.json --strategy existence
  python test_facility.py --registry prefixes-found.json --all --output results.json
        """,
    )

    parser.add_argument(
        '--registry',
        type=str,
        required=True,
        help='Path to discovery report (JSON) from discovery.py',
    )
    parser.add_argument(
        '--strategy',
        type=str,
        choices=['existence', 'accessibility', 'functional', 'visual'],
        default='existence',
        help='Test strategy to run (default: existence)',
    )
    parser.add_argument(
        '--all',
        action='store_true',
        help='Run all strategies',
    )
    parser.add_argument(
        '--output',
        type=str,
        default=None,
        help='Write results to JSON file',
    )

    args = parser.parse_args()

    try:
        facility = TestFacility(args.registry)

        if args.all:
            results = facility.run_all()
        else:
            strategy = TestStrategy(args.strategy)
            strategy_result = facility.run_strategy(strategy)
            results = {
                'timestamp': facility.report.get('timestamp'),
                'scan_root': facility.report.get('scan_root'),
                'strategies': {args.strategy: strategy_result},
            }

        print_results(results)

        if args.output:
            output_path = Path(args.output)
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(results, f, indent=2)
            print(f"\n✓ Results written to {output_path}")

        return 0

    except FileNotFoundError as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        return 2
    except Exception as e:
        print(f"❌ Unexpected error: {e}", file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
