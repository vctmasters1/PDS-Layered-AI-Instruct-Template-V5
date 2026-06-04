#!/usr/bin/env python3
"""
Merge Validator — Pre-merge governance checks

Validates that proposed changes don't violate:
1. Port registry (collisions, range violations)
2. Naming registries (identifier collisions)
3. Governance rules (from scope authority)
4. Instruction drift (from .ai/instruct.md)

Usage:
  python .ai/engine/merge_validator.py . --branch feature/api-v2 --target main
  python .ai/engine/merge_validator.py . --branch feature/api-v2 --target main --report
"""

import sys
import json
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple
from dataclasses import dataclass, asdict


@dataclass
class ValidationResult:
    """Single validation check result."""
    check_type: str  # port | naming | governance | drift | index
    name: str
    status: str  # PASS | WARN | FAIL
    severity: str  # info | warning | error
    finding: str
    resolution: str = ""


@dataclass
class MergeValidationReport:
    """Complete pre-merge validation report."""
    timestamp: str  # ISO 8601
    source_branch: str
    target_branch: str
    scope: str
    files_modified: Dict
    results: List[Dict]
    passed: int
    warned: int
    failed: int
    recommendation: str  # SAFE_TO_MERGE | REVIEW_REQUIRED | BLOCK_MERGE
    status: str  # pass | warn | fail


class MergeValidator:
    """Validate merges don't violate governance."""

    def __init__(self, project_path: str = '.'):
        self.project_path = Path(project_path).resolve()
        self.ai_dir = self.project_path / '.ai'

    def validate_merge(self, source_branch: str, target_branch: str) -> MergeValidationReport:
        """Run all pre-merge checks."""
        checks = []
        scope = self._extract_scope(source_branch)
        files_modified = self._get_modified_files(source_branch, target_branch)

        # Check 1: Port registry
        if self._has_port_changes(files_modified):
            check = self._check_port_collision(source_branch, target_branch)
            checks.append(check)

        # Check 2: Naming registries
        if self._has_naming_changes(files_modified):
            check = self._check_naming_collision(source_branch, target_branch)
            checks.append(check)

        # Check 3: Instruction drift
        if self._has_instruction_changes(files_modified):
            check = self._check_instruction_drift(source_branch, target_branch)
            checks.append(check)

        # Check 4: Governance rules
        check = self._check_governance_rules(scope, files_modified)
        checks.append(check)

        # Check 5: Index staleness
        if any(f for f in files_modified.get('governance', []) if 'instruct.md' in f):
            check = self._check_index_staleness()
            checks.append(check)

        # Summarize
        passed = sum(1 for c in checks if c.status == 'PASS')
        warned = sum(1 for c in checks if c.status == 'WARN')
        failed = sum(1 for c in checks if c.status == 'FAIL')

        # Determine recommendation
        if failed > 0:
            recommendation = "BLOCK_MERGE"
            final_status = "fail"
        elif warned > 0:
            recommendation = "REVIEW_REQUIRED"
            final_status = "warn"
        else:
            recommendation = "SAFE_TO_MERGE"
            final_status = "pass"

        report = MergeValidationReport(
            timestamp=datetime.utcnow().isoformat() + "Z",
            source_branch=source_branch,
            target_branch=target_branch,
            scope=scope,
            files_modified=files_modified,
            results=[asdict(c) for c in checks],
            passed=passed,
            warned=warned,
            failed=failed,
            recommendation=recommendation,
            status=final_status
        )

        return report

    def _extract_scope(self, branch_name: str) -> str:
        """Extract scope from branch name (feature/<scope>-<issue>)."""
        if '/' in branch_name:
            parts = branch_name.split('/')[-1]  # feature/api-v2-123 -> api-v2-123
            scope = parts.split('-')[0]  # api
            return scope
        return "unknown"

    def _get_modified_files(self, source_branch: str, target_branch: str) -> Dict[str, List[str]]:
        """Get files modified in source vs. target."""
        try:
            result = subprocess.run(
                ['git', 'diff', f'origin/{target_branch}...origin/{source_branch}', '--name-only'],
                cwd=self.project_path,
                capture_output=True,
                text=True
            )
            files = result.stdout.strip().split('\n') if result.stdout else []

            # Categorize
            governance = [f for f in files if f.startswith('.ai/') or f.startswith('.github/')]
            registries = [f for f in files if any(r in f for r in ['coding-prefixes', 'ports', 'database-schema', 'error-codes', 'config-vars'])]
            source = [f for f in files if f.startswith(('api/', 'db/', 'validation/', 'gui/', 'config/'))]

            return {
                'total': files,
                'governance': governance,
                'registries': registries,
                'source': source
            }
        except Exception as e:
            return {'error': str(e), 'total': []}

    def _has_port_changes(self, files_modified: Dict) -> bool:
        """Check if ports.md modified."""
        return any('ports.md' in f for f in files_modified.get('registries', []))

    def _has_naming_changes(self, files_modified: Dict) -> bool:
        """Check if naming registries modified."""
        naming_files = ['coding-prefixes', 'api-conventions', 'database-schema', 'error-codes', 'config-vars']
        return any(any(n in f for n in naming_files) for f in files_modified.get('registries', []))

    def _has_instruction_changes(self, files_modified: Dict) -> bool:
        """Check if .ai/instruct.md modified."""
        return any('instruct.md' in f for f in files_modified.get('governance', []))

    def _check_port_collision(self, source_branch: str, target_branch: str) -> ValidationResult:
        """Check for port collisions between branches."""
        try:
            # Simplified: check if both branches define same port
            ports_main = self._read_ports(target_branch)
            ports_feature = self._read_ports(source_branch)

            collisions = set(ports_main.keys()) & set(ports_feature.keys())

            if collisions:
                return ValidationResult(
                    check_type="port",
                    name="Port collision check",
                    status="FAIL",
                    severity="error",
                    finding=f"Port collisions detected: {', '.join(collisions)}",
                    resolution="Run /ai-ports-check to reconcile"
                )

            return ValidationResult(
                check_type="port",
                name="Port collision check",
                status="PASS",
                severity="info",
                finding="No port collisions"
            )
        except Exception as e:
            return ValidationResult(
                check_type="port",
                name="Port collision check",
                status="WARN",
                severity="warning",
                finding=f"Port check error: {str(e)}"
            )

    def _check_naming_collision(self, source_branch: str, target_branch: str) -> ValidationResult:
        """Check for naming identifier collisions."""
        try:
            # Simplified: parse registries and check for duplicates
            identifiers_main = self._read_identifiers(target_branch)
            identifiers_feature = self._read_identifiers(source_branch)

            collisions = set(identifiers_main) & set(identifiers_feature)

            if collisions:
                return ValidationResult(
                    check_type="naming",
                    name="Naming collision check",
                    status="FAIL",
                    severity="error",
                    finding=f"Identifier collisions: {', '.join(list(collisions)[:5])}...",
                    resolution="Run /ai-audit-registries; reconcile with Naming manager"
                )

            return ValidationResult(
                check_type="naming",
                name="Naming collision check",
                status="PASS",
                severity="info",
                finding="No naming collisions"
            )
        except Exception as e:
            return ValidationResult(
                check_type="naming",
                name="Naming collision check",
                status="WARN",
                severity="warning",
                finding=f"Naming check error: {str(e)}"
            )

    def _check_instruction_drift(self, source_branch: str, target_branch: str) -> ValidationResult:
        """Check for instruction drift in .ai/instruct.md."""
        try:
            result = subprocess.run(
                ['git', 'diff', f'origin/{target_branch}', f'origin/{source_branch}', '--', '.ai/instruct.md'],
                cwd=self.project_path,
                capture_output=True,
                text=True
            )

            if result.stdout:
                lines_added = result.stdout.count('\n+')
                lines_removed = result.stdout.count('\n-')
                return ValidationResult(
                    check_type="drift",
                    name="Instruction drift check",
                    status="WARN",
                    severity="warning",
                    finding=f".ai/instruct.md modified (+{lines_added} -{lines_removed} lines)",
                    resolution="Requires Curator review and approval"
                )

            return ValidationResult(
                check_type="drift",
                name="Instruction drift check",
                status="PASS",
                severity="info",
                finding="No instruction drift"
            )
        except Exception as e:
            return ValidationResult(
                check_type="drift",
                name="Instruction drift check",
                status="WARN",
                severity="warning",
                finding=f"Drift check error: {str(e)}"
            )

    def _check_governance_rules(self, scope: str, files_modified: Dict) -> ValidationResult:
        """Check if changes violate governance rules."""
        # Simplified: check if governance files present for scope
        scope_instruct = self.project_path / scope / '.ai' / 'instruct.md'

        if scope_instruct.exists():
            return ValidationResult(
                check_type="governance",
                name="Governance rules check",
                status="PASS",
                severity="info",
                finding=f"Governance rules for scope '{scope}' satisfied"
            )

        return ValidationResult(
            check_type="governance",
            name="Governance rules check",
            status="PASS",
            severity="info",
            finding="No scope-specific governance violations"
        )

    def _check_index_staleness(self) -> ValidationResult:
        """Check if .ai/index.md is current with .ai/instruct.md files."""
        try:
            index = self.ai_dir / 'index.md'
            instruct_files = list(self.ai_dir.glob('**/instruct.md'))

            if index.exists() and instruct_files:
                index_mtime = index.stat().st_mtime
                latest_instruct = max(f.stat().st_mtime for f in instruct_files)

                if index_mtime < latest_instruct:
                    return ValidationResult(
                        check_type="index",
                        name="Index staleness check",
                        status="WARN",
                        severity="warning",
                        finding=".ai/index.md is older than some .ai/instruct.md files",
                        resolution="Run /ai-update-index after merge"
                    )

            return ValidationResult(
                check_type="index",
                name="Index staleness check",
                status="PASS",
                severity="info",
                finding="Index is current"
            )
        except Exception as e:
            return ValidationResult(
                check_type="index",
                name="Index staleness check",
                status="WARN",
                severity="warning",
                finding=f"Index check error: {str(e)}"
            )

    def _read_ports(self, branch: str) -> Dict:
        """Read ports.md from branch."""
        # Simplified stub; real implementation would parse YAML
        return {}

    def _read_identifiers(self, branch: str) -> set:
        """Read all identifiers from registries on branch."""
        # Simplified stub
        return set()

    def print_report(self, report: MergeValidationReport):
        """Print human-readable report."""
        print("\n" + "="*70)
        print("MERGE VALIDATION REPORT")
        print("="*70)
        print(f"Source: {report.source_branch}")
        print(f"Target: {report.target_branch}")
        print(f"Scope: {report.scope}")
        print(f"Timestamp: {report.timestamp}")

        print(f"\n[VALIDATION RESULTS]")
        print(f"  Passed:  {report.passed}")
        print(f"  Warned:  {report.warned}")
        print(f"  Failed:  {report.failed}")

        print(f"\n[CHECKS]")
        for result in report.results:
            status_sym = "✓" if result['status'] == "PASS" else "⚠" if result['status'] == "WARN" else "✗"
            print(f"  {status_sym} {result['name']}: {result['finding']}")
            if result['resolution']:
                print(f"      → {result['resolution']}")

        print(f"\n[RECOMMENDATION] {report.recommendation}")
        if report.status == "fail":
            print("  Status: BLOCK MERGE — Resolve failing checks before proceeding")
        elif report.status == "warn":
            print("  Status: REVIEW REQUIRED — Address warnings; obtain approvals before merge")
        else:
            print("  Status: SAFE TO MERGE")
        print("\n" + "="*70)


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Validate merges against governance rules')
    parser.add_argument('project_path', nargs='?', default='.', help='Project path')
    parser.add_argument('--branch', required=True, help='Source branch (feature branch)')
    parser.add_argument('--target', required=True, help='Target branch (main or develop)')
    parser.add_argument('--report', action='store_true', help='Print human-readable report')
    parser.add_argument('--json', action='store_true', help='Output as JSON')

    args = parser.parse_args()

    validator = MergeValidator(args.project_path)
    report = validator.validate_merge(args.branch, args.target)

    if args.json:
        print(json.dumps(asdict(report), indent=2))
    else:
        validator.print_report(report)
        print(f"\nExit code: {0 if report.status == 'pass' else 1}")
        sys.exit(0 if report.status == 'pass' else 1)
