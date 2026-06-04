#!/usr/bin/env python3
"""
Project import compliance analyzer.

Walks an imported project directory and identifies non-compliance with
AI-INSTRUCT V5 standards:
- Directory structure
- File naming conventions
- Missing .ai/instruct.md files
- Missing README.md at module level
- Credential exposure
- .dev-docs/ structure

Usage:
  python import_analyzer.py <project_path>

Output:
  - Structured report with violations grouped by severity
  - JSON-formatted findings for programmatic processing
"""

import os
import sys
import json
from pathlib import Path
from typing import Dict, List, Tuple, Any
from dataclasses import dataclass, asdict


@dataclass
class Finding:
    """A single compliance violation."""
    severity: str  # error, warning, info
    category: str  # structure, naming, missing, security, etc
    path: str  # relative path to file/dir
    message: str
    suggested_fix: str = ""


class ProjectAnalyzer:
    """Analyzes project structure and naming compliance."""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.findings: List[Finding] = []
        self.excluded_dirs = {
            '.git', '.github', '.vscode', 'node_modules', '__pycache__',
            '.pytest_cache', 'venv', '.venv', 'dist', 'build', '.next',
            '.nuxt', 'coverage', 'htmlcov', '.cache', '.ai'
        }

    def analyze(self) -> Dict[str, Any]:
        """Run full compliance analysis."""
        if not self.project_path.exists():
            return {"error": f"Path not found: {self.project_path}"}

        # Walk directory tree
        self._analyze_tree(self.project_path)

        # Organize findings by severity
        findings_by_severity = {
            "error": [f for f in self.findings if f.severity == "error"],
            "warning": [f for f in self.findings if f.severity == "warning"],
            "info": [f for f in self.findings if f.severity == "info"],
        }

        return {
            "project_path": str(self.project_path),
            "total_findings": len(self.findings),
            "by_severity": {
                "error": len(findings_by_severity["error"]),
                "warning": len(findings_by_severity["warning"]),
                "info": len(findings_by_severity["info"]),
            },
            "findings": {
                sev: [asdict(f) for f in findings]
                for sev, findings in findings_by_severity.items()
            },
        }

    def _analyze_tree(self, path: Path, depth: int = 0):
        """Recursively analyze directory structure."""
        try:
            entries = list(path.iterdir())
        except PermissionError:
            return

        dirs = [e for e in entries if e.is_dir()]
        files = [e for e in entries if e.is_file()]

        # Check directory-level compliance
        self._check_directory(path, depth)

        # Check file naming
        for file in files:
            self._check_file_naming(file)

        # Recurse into subdirectories
        for subdir in sorted(dirs):
            if subdir.name not in self.excluded_dirs and not subdir.name.startswith('.'):
                self._analyze_tree(subdir, depth + 1)

    def _check_directory(self, path: Path, depth: int):
        """Check directory-level compliance."""
        rel_path = path.relative_to(self.project_path)

        # Module directories (depth > 0) should have README.md
        if depth > 0 and path.name not in {'src', 'lib', 'test', 'tests', 'scripts', 'utils'}:
            readme_path = path / 'README.md'
            if not readme_path.exists():
                self.findings.append(Finding(
                    severity="warning",
                    category="missing",
                    path=str(rel_path),
                    message=f"Module missing README.md",
                    suggested_fix=f"Create {rel_path}/README.md with module overview"
                ))

        # Check for .ai/ directory (optional but encouraged at module boundaries)
        ai_path = path / '.ai'
        if depth > 0 and not ai_path.exists() and self._is_module_boundary(path):
            self.findings.append(Finding(
                severity="info",
                category="structure",
                path=str(rel_path),
                message="Module lacks .ai/instruct.md",
                suggested_fix=f"Create {rel_path}/.ai/instruct.md for module-specific rules"
            ))

    def _check_file_naming(self, file_path: Path):
        """Check file naming conventions."""
        name = file_path.name
        rel_path = file_path.relative_to(self.project_path)

        # Check credential files
        if self._is_credential_file(name):
            self.findings.append(Finding(
                severity="error",
                category="security",
                path=str(rel_path),
                message=f"Credential file not in .gitignore: {name}",
                suggested_fix=f"Add '{name}' to .gitignore (or use .env variables)"
            ))

        # Python files should be snake_case
        if file_path.suffix == '.py':
            base_name = name[:-3]  # Remove .py
            if not self._is_valid_snake_case(base_name):
                self.findings.append(Finding(
                    severity="warning",
                    category="naming",
                    path=str(rel_path),
                    message=f"Python file not snake_case: {name}",
                    suggested_fix=f"Rename to: {self._to_snake_case(base_name)}.py"
                ))

        # Shell scripts should be kebab-case
        if file_path.suffix in {'.ps1', '.sh', '.bash'}:
            base_name = name.split('.')[0]
            if not self._is_valid_kebab_case(base_name):
                self.findings.append(Finding(
                    severity="warning",
                    category="naming",
                    path=str(rel_path),
                    message=f"Shell script not kebab-case: {name}",
                    suggested_fix=f"Rename to: {self._to_kebab_case(base_name)}{file_path.suffix}"
                ))

        # .ai/ files
        if '.ai' in rel_path.parts:
            if name == 'instruct.md' and file_path.parent.name != '.ai':
                self.findings.append(Finding(
                    severity="warning",
                    category="structure",
                    path=str(rel_path),
                    message=f"instruct.md in wrong location",
                    suggested_fix=f"Move to {file_path.parent}/.ai/instruct.md"
                ))

    def _is_credential_file(self, name: str) -> bool:
        """Check if file looks like credentials."""
        credential_patterns = {'.env', '.pem', '.key', '.p12', '.pfx', '.secret', '.token'}
        for pattern in credential_patterns:
            if pattern in name:
                # Allow .example variants (templates)
                if name.endswith(f'.example{pattern}') or name.endswith(f'{pattern}.example'):
                    return False
                return True
        return False

    def _is_module_boundary(self, path: Path) -> bool:
        """Check if this directory is a natural module boundary."""
        name = path.name
        return name not in {'src', 'lib', 'test', 'tests', 'scripts', 'utils', 'config', 'api', 'db', 'gui', 'validation'} and not name.startswith('.')

    def _is_snake_case(self, name: str) -> bool:
        """Check if name is snake_case."""
        return name.replace('_', '').replace('-', '').isalnum() and '_' in name and name.islower()

    def _is_valid_snake_case(self, name: str) -> bool:
        """Check if name is valid snake_case (including all-lowercase)."""
        # Valid if: all lowercase AND (no hyphens OR has underscores)
        if name.islower() and not name.startswith('_'):
            # All lowercase without leading underscore is valid
            # (whether it has underscores or not)
            return '-' not in name
        return False

    def _is_kebab_case(self, name: str) -> bool:
        """Check if name is kebab-case."""
        return name.replace('-', '').isalnum() and '-' in name and name.islower()

    def _is_valid_kebab_case(self, name: str) -> bool:
        """Check if name is valid kebab-case (including all-lowercase)."""
        # Valid if: all lowercase AND (no underscores OR has hyphens)
        if name.islower() and not name.startswith('-'):
            # All lowercase without leading hyphen is valid
            # (whether it has hyphens or not)
            return '_' not in name
        return False

    def _to_snake_case(self, name: str) -> str:
        """Convert to snake_case."""
        import re
        s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
        return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower().replace('-', '_')

    def _to_kebab_case(self, name: str) -> str:
        """Convert to kebab-case."""
        import re
        s1 = re.sub('(.)([A-Z][a-z]+)', r'\1-\2', name)
        return re.sub('([a-z0-9])([A-Z])', r'\1-\2', s1).lower().replace('_', '-')


def main():
    if len(sys.argv) < 2:
        print("Usage: python import_analyzer.py <project_path>")
        sys.exit(1)

    project_path = sys.argv[1]
    analyzer = ProjectAnalyzer(project_path)
    report = analyzer.analyze()

    if "error" in report and report["error"]:
        print(f"ERROR: {report['error']}", file=sys.stderr)
        sys.exit(1)

    # Print human-readable report
    print("=" * 70)
    print("PROJECT COMPLIANCE ANALYSIS".center(70))
    print("=" * 70)
    print(f"\nProject: {report['project_path']}")
    print(f"Total findings: {report['total_findings']}")
    print(f"  [ERR] Errors:   {report['by_severity']['error']}")
    print(f"  [WRN] Warnings: {report['by_severity']['warning']}")
    print(f"  [INF] Info:     {report['by_severity']['info']}")

    for severity in ['error', 'warning', 'info']:
        findings = report['findings'][severity]
        if not findings:
            continue

        print(f"\n=== {severity.upper()} ({len(findings)}) ===")
        for finding in findings:
            symbol = "[ERR]" if severity == "error" else "[WRN]" if severity == "warning" else "[INF]"
            print(f"{symbol} {finding['path']}")
            print(f"  {finding['message']}")
            if finding['suggested_fix']:
                print(f"  Fix: {finding['suggested_fix']}")

    # Also output JSON for programmatic processing
    json_path = Path(project_path) / '.compliance-report.json'
    with open(json_path, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"\n[OK] Full report saved to: {json_path}")

    sys.exit(0 if report['by_severity']['error'] == 0 else 1)


if __name__ == "__main__":
    main()
