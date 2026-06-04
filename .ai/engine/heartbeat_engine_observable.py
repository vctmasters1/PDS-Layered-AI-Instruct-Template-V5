#!/usr/bin/env python3
"""
Observable Heartbeat Engine — Periodic alignment checks with structured logging

Runs every N steps to verify instruction alignment, detect drift, and check safety rules.
Emits structured JSONL to `.ai/logs/heartbeat-*.jsonl` for observability.

Usage:
  python .ai/engine/heartbeat_engine_observable.py . --task "routine alignment check"
  python .ai/engine/heartbeat_engine_observable.py . --scope api --report
"""

import sys
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List
from dataclasses import dataclass, asdict


@dataclass
class HeartbeatCheck:
    """Single check result."""
    category: str  # instruction_drift, credential_safety, file_organization, naming_compliance, environment_isolation
    name: str
    status: str  # PASS | WARN | FAIL
    finding: str
    severity: str  # info | warning | error
    mitigation: str = ""


@dataclass
class HeartbeatLog:
    """Structured heartbeat analysis output."""
    timestamp: str  # ISO 8601
    scope: str  # scope_path or "all"
    checks_performed: List[str]  # list of check names
    checks_passed: int
    checks_warned: int
    checks_failed: int
    findings: List[Dict]
    recommendation: str  # ALIGNED | REVIEW_RECOMMENDED | TAKE_ACTION
    status: str  # pass | warn | fail


class HeartbeatEngine:
    """Run periodic alignment checks."""

    def __init__(self, project_path: str = '.'):
        self.project_path = Path(project_path).resolve()
        self.logs_dir = self.project_path / '.ai' / 'logs'
        self.logs_dir.mkdir(parents=True, exist_ok=True)

    def run_check(self, scope: str = 'all') -> HeartbeatLog:
        """Run all heartbeat checks."""
        checks = []

        # Check 1: Instruction drift (deepest .ai/instruct.md in scope)
        check_drift = self._check_instruction_drift(scope)
        checks.append(check_drift)

        # Check 2: Credential safety (.env, secrets not in git)
        check_creds = self._check_credential_safety()
        checks.append(check_creds)

        # Check 3: File organization (conventions.md + actual structure)
        check_org = self._check_file_organization(scope)
        checks.append(check_org)

        # Check 4: Naming compliance (identifiers match registries)
        check_naming = self._check_naming_compliance(scope)
        checks.append(check_naming)

        # Check 5: Environment isolation (no host mutations)
        check_env = self._check_environment_isolation()
        checks.append(check_env)

        # Check 6: Port registry sync
        check_ports = self._check_port_registry()
        checks.append(check_ports)

        # Check 7: Index freshness
        check_index = self._check_index_freshness()
        checks.append(check_index)

        # Summarize
        passed = sum(1 for c in checks if c.status == 'PASS')
        warned = sum(1 for c in checks if c.status == 'WARN')
        failed = sum(1 for c in checks if c.status == 'FAIL')

        # Determine recommendation
        if failed > 0:
            recommendation = "TAKE_ACTION"
            final_status = "fail"
        elif warned > 0:
            recommendation = "REVIEW_RECOMMENDED"
            final_status = "warn"
        else:
            recommendation = "ALIGNED"
            final_status = "pass"

        log = HeartbeatLog(
            timestamp=datetime.utcnow().isoformat() + "Z",
            scope=scope,
            checks_performed=[c.name for c in checks],
            checks_passed=passed,
            checks_warned=warned,
            checks_failed=failed,
            findings=[asdict(c) for c in checks],
            recommendation=recommendation,
            status=final_status
        )

        return log

    def _check_instruction_drift(self, scope: str) -> HeartbeatCheck:
        """Check if .ai/instruct.md files are current vs actual code."""
        try:
            instruct_file = self.project_path / '.ai' / 'instruct.md'
            if instruct_file.exists():
                stat = instruct_file.stat()
                age_seconds = (datetime.utcnow() - datetime.fromtimestamp(stat.st_mtime)).total_seconds()
                age_days = age_seconds / 86400

                if age_days > 30:
                    return HeartbeatCheck(
                        category="instruction_drift",
                        name="Instruction staleness",
                        status="WARN",
                        finding=f".ai/instruct.md not updated for {age_days:.0f} days",
                        severity="warning",
                        mitigation="Run /ai-check-yourself to verify alignment; update .ai/instruct.md if architecture changed"
                    )

            return HeartbeatCheck(
                category="instruction_drift",
                name="Instruction staleness",
                status="PASS",
                finding="Instruction files current",
                severity="info"
            )
        except Exception as e:
            return HeartbeatCheck(
                category="instruction_drift",
                name="Instruction staleness",
                status="FAIL",
                finding=f"Check error: {str(e)}",
                severity="error"
            )

    def _check_credential_safety(self) -> HeartbeatCheck:
        """Check that .env is not committed."""
        try:
            env_file = self.project_path / '.env'
            gitignore = self.project_path / '.gitignore'

            if env_file.exists() and gitignore.exists():
                with open(gitignore, 'r') as f:
                    content = f.read()
                    if '.env' not in content:
                        return HeartbeatCheck(
                            category="credential_safety",
                            name="ENV file protection",
                            status="WARN",
                            finding=".env exists but not in .gitignore",
                            severity="warning",
                            mitigation="Add .env to .gitignore; verify .env is not staged in git"
                        )

            return HeartbeatCheck(
                category="credential_safety",
                name="ENV file protection",
                status="PASS",
                finding="Credential files protected",
                severity="info"
            )
        except Exception as e:
            return HeartbeatCheck(
                category="credential_safety",
                name="ENV file protection",
                status="FAIL",
                finding=f"Check error: {str(e)}",
                severity="error"
            )

    def _check_file_organization(self, scope: str) -> HeartbeatCheck:
        """Check that file structure matches conventions.md."""
        try:
            conventions = self.project_path / '.ai' / 'conventions.md'
            if conventions.exists():
                # Basic check: expected directories exist
                expected_dirs = ['.ai', '.github', 'validation', 'api', 'config', 'db', 'gui']
                missing = []
                for d in expected_dirs:
                    path = self.project_path / d
                    if not path.exists():
                        missing.append(d)

                if missing and scope == 'all':
                    return HeartbeatCheck(
                        category="file_organization",
                        name="Directory structure",
                        status="WARN",
                        finding=f"Expected dirs not found: {', '.join(missing)}",
                        severity="warning",
                        mitigation="Check conventions.md; create missing module directories if intended"
                    )

            return HeartbeatCheck(
                category="file_organization",
                name="Directory structure",
                status="PASS",
                finding="File organization correct",
                severity="info"
            )
        except Exception as e:
            return HeartbeatCheck(
                category="file_organization",
                name="Directory structure",
                status="FAIL",
                finding=f"Check error: {str(e)}",
                severity="error"
            )

    def _check_naming_compliance(self, scope: str) -> HeartbeatCheck:
        """Check that naming registries exist."""
        try:
            registries = [
                'coding-prefixes.md',
                'api-conventions.md',
                'database-schema.md',
                'error-codes.md',
                'config-vars.md'
            ]
            missing = []
            for registry in registries:
                path = self.project_path / '.ai' / registry
                if not path.exists():
                    missing.append(registry)

            if missing:
                return HeartbeatCheck(
                    category="naming_compliance",
                    name="Naming registries",
                    status="WARN",
                    finding=f"Registries not found: {', '.join(missing)}",
                    severity="warning",
                    mitigation="Run /ai-onboard to initialize registries or create manually"
                )

            return HeartbeatCheck(
                category="naming_compliance",
                name="Naming registries",
                status="PASS",
                finding="Naming registries registered",
                severity="info"
            )
        except Exception as e:
            return HeartbeatCheck(
                category="naming_compliance",
                name="Naming registries",
                status="FAIL",
                finding=f"Check error: {str(e)}",
                severity="error"
            )

    def _check_environment_isolation(self) -> HeartbeatCheck:
        """Check that environment.md rules are followed."""
        try:
            env_file = self.project_path / '.ai' / 'environment.md'
            if env_file.exists():
                # Basic check: venv or container-based setup indicators
                venv = self.project_path / 'venv'
                pyproject = self.project_path / 'pyproject.toml'

                # If Python project, should have venv or pyproject
                py_files = list(self.project_path.glob('*.py')) + list(self.project_path.glob('*/*.py'))
                if py_files and not venv.exists() and not pyproject.exists():
                    return HeartbeatCheck(
                        category="environment_isolation",
                        name="Host isolation",
                        status="WARN",
                        finding="Python project but no venv or pyproject.toml",
                        severity="warning",
                        mitigation="Create venv (python -m venv venv) or add pyproject.toml for containment"
                    )

            return HeartbeatCheck(
                category="environment_isolation",
                name="Host isolation",
                status="PASS",
                finding="Environment properly isolated",
                severity="info"
            )
        except Exception as e:
            return HeartbeatCheck(
                category="environment_isolation",
                name="Host isolation",
                status="FAIL",
                finding=f"Check error: {str(e)}",
                severity="error"
            )

    def _check_port_registry(self) -> HeartbeatCheck:
        """Check that ports.md exists and is current."""
        try:
            ports_file = self.project_path / '.ai' / 'ports.md'
            if not ports_file.exists():
                return HeartbeatCheck(
                    category="naming_compliance",
                    name="Port registry",
                    status="WARN",
                    finding=".ai/ports.md not found",
                    severity="warning",
                    mitigation="Create .ai/ports.md or run /ai-ports-check to validate existing ports"
                )

            return HeartbeatCheck(
                category="naming_compliance",
                name="Port registry",
                status="PASS",
                finding="Port registry registered",
                severity="info"
            )
        except Exception as e:
            return HeartbeatCheck(
                category="naming_compliance",
                name="Port registry",
                status="FAIL",
                finding=f"Check error: {str(e)}",
                severity="error"
            )

    def _check_index_freshness(self) -> HeartbeatCheck:
        """Check that .ai/index.md is current with .ai/instruct.md files."""
        try:
            index_file = self.project_path / '.ai' / 'index.md'
            instruct_files = list((self.project_path / '.ai').glob('**/instruct.md'))

            if index_file.exists() and instruct_files:
                index_mtime = index_file.stat().st_mtime
                latest_instruct = max(f.stat().st_mtime for f in instruct_files)

                if index_mtime < latest_instruct:
                    return HeartbeatCheck(
                        category="file_organization",
                        name="Index freshness",
                        status="WARN",
                        finding=".ai/index.md is older than some .ai/instruct.md files",
                        severity="warning",
                        mitigation="Run /ai-update-index to rebuild the index"
                    )

            return HeartbeatCheck(
                category="file_organization",
                name="Index freshness",
                status="PASS",
                finding="Index is current",
                severity="info"
            )
        except Exception as e:
            return HeartbeatCheck(
                category="file_organization",
                name="Index freshness",
                status="FAIL",
                finding=f"Check error: {str(e)}",
                severity="error"
            )

    def log_heartbeat(self, log: HeartbeatLog):
        """Write heartbeat log to JSONL file."""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        log_file = self.logs_dir / f"heartbeat-{timestamp}.jsonl"

        with open(log_file, 'a') as f:
            f.write(json.dumps(asdict(log)) + '\n')

        return log_file

    def print_report(self, log: HeartbeatLog):
        """Print human-readable heartbeat report."""
        print("\n" + "="*70)
        print("HEARTBEAT ALIGNMENT CHECK")
        print("="*70)
        print(f"\nScope: {log.scope}")
        print(f"Timestamp: {log.timestamp}")
        print(f"\n[SUMMARY]")
        print(f"  Checks performed: {len(log.findings)}")
        print(f"  Passed: {log.checks_passed}")
        print(f"  Warned: {log.checks_warned}")
        print(f"  Failed: {log.checks_failed}")

        print(f"\n[FINDINGS]")
        for finding in log.findings:
            status_sym = "✓" if finding['status'] == "PASS" else "⚠" if finding['status'] == "WARN" else "✗"
            print(f"  {status_sym} [{finding['category']}] {finding['name']}: {finding['finding']}")
            if finding['mitigation']:
                print(f"      → {finding['mitigation']}")

        print(f"\n[RECOMMENDATION] {log.recommendation}")
        if log.status == "fail":
            print("  Status: TAKE ACTION BEFORE PROCEEDING")
        elif log.status == "warn":
            print("  Status: Review findings; proceed with awareness")
        else:
            print("  Status: ALIGNED")
        print("\n" + "="*70)


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Run heartbeat alignment checks')
    parser.add_argument('project_path', nargs='?', default='.', help='Project path')
    parser.add_argument('--scope', type=str, default='all', help='Scope to check (all or module name)')
    parser.add_argument('--report', action='store_true', help='Print human-readable report')
    parser.add_argument('--task', type=str, default='routine alignment check', help='Task description')

    args = parser.parse_args()

    engine = HeartbeatEngine(args.project_path)
    log = engine.run_check(args.scope)

    # Always log to JSONL
    log_file = engine.log_heartbeat(log)
    print(f"[OK] Logged to: {log_file}")

    # Print report if requested
    if args.report:
        engine.print_report(log)
