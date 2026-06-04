#!/usr/bin/env python3
"""
Audit trail logging for project import operations.

Creates detailed logs of:
- All changes made (what, where, why)
- Risks detected (warnings about potential issues)
- Compatibility issues (patterns that might cause problems)
- Before/after snapshots
"""

import json
import sys
from pathlib import Path
from typing import List, Dict, Any
from dataclasses import dataclass, asdict
from datetime import datetime
import hashlib


@dataclass
class AuditEntry:
    """Single audit log entry."""
    timestamp: str
    severity: str  # info, warning, risk, error
    category: str  # change, compat, security, structure, naming, etc.
    path: str
    action: str
    details: str
    before_state: str = ""
    after_state: str = ""
    remediation: str = ""  # What user should do if it's a warning/risk


class AuditLogger:
    """Logs all import operations for review."""

    def __init__(self, project_path: str, output_dir: str = ".ai/import-logs"):
        self.project_path = Path(project_path)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        self.log_file = self.output_dir / f"import-audit-{timestamp}.jsonl"
        self.summary_file = self.output_dir / f"import-summary-{timestamp}.json"

        self.entries: List[AuditEntry] = []
        self.changes_by_category: Dict[str, int] = {}
        self.risks_detected: List[str] = []
        self.compat_warnings: List[str] = []

    def log(self, severity: str, category: str, path: str, action: str,
            details: str, before: str = "", after: str = "", remediation: str = ""):
        """Log a single audit entry."""
        entry = AuditEntry(
            timestamp=datetime.now().isoformat(),
            severity=severity,
            category=category,
            path=path,
            action=action,
            details=details,
            before_state=before,
            after_state=after,
            remediation=remediation
        )
        self.entries.append(entry)
        self.changes_by_category[category] = self.changes_by_category.get(category, 0) + 1

        if severity == "risk":
            self.risks_detected.append(f"{path}: {details}")
        elif severity == "warning" and "compat" in category:
            self.compat_warnings.append(f"{path}: {details}")

    def log_file_created(self, path: str, template_type: str):
        """Log file creation."""
        self.log(
            severity="info",
            category="change.file_created",
            path=path,
            action="CREATE",
            details=f"Created {template_type} file",
            remediation=f"Review {path} and customize for your project"
        )

    def log_file_modified(self, path: str, field: str, added_lines: int):
        """Log file modification."""
        self.log(
            severity="info",
            category="change.file_modified",
            path=path,
            action="UPDATE",
            details=f"Modified {field}: added {added_lines} line(s)",
            remediation=f"Verify {path} reflects your project configuration"
        )

    def log_compatibility_issue(self, path: str, issue_type: str, description: str):
        """Log potential compatibility issue."""
        self.log(
            severity="warning",
            category="compat.potential_issue",
            path=path,
            action="DETECTED",
            details=description,
            remediation=f"Review {path} for {issue_type} compatibility"
        )

    def log_risk(self, path: str, risk_type: str, description: str, remediation: str):
        """Log a risk that could cause problems later."""
        self.log(
            severity="risk",
            category=f"risk.{risk_type}",
            path=path,
            action="RISK",
            details=description,
            remediation=remediation
        )

    def log_naming_issue_skipped(self, path: str, issue: str, reason: str):
        """Log naming issues that weren't fixed."""
        self.log(
            severity="info",
            category="naming.skipped",
            path=path,
            action="SKIPPED",
            details=f"Naming: {issue}",
            remediation=f"Manual fix suggested: {reason}"
        )

    def detect_patterns(self, project_path: str):
        """Scan project for patterns that might cause issues."""
        project_path = Path(project_path)

        # Check for mixed Python versions
        py_files = list(project_path.rglob("*.py"))
        if py_files:
            has_py2_patterns = False
            has_type_hints = False

            for py_file in py_files[:10]:  # Sample first 10
                try:
                    content = py_file.read_text(errors='ignore')
                    if 'print ' in content and 'def ' in content:
                        has_py2_patterns = True
                    if '->' in content or ': int' in content:
                        has_type_hints = True
                except:
                    pass

            if has_py2_patterns and has_type_hints:
                self.log_compatibility_issue(
                    str(project_path),
                    "Python version",
                    "Project mixes Python 2 and Python 3 patterns"
                )

        # Check for uncommitted changes that might conflict
        if (project_path / ".git").exists():
            self.log_risk(
                str(project_path),
                "git_state",
                "Project has .git directory; import tool may conflict with uncommitted changes",
                "Run 'git status' before and after import to review all changes"
            )

        # Check for existing .ai/ structure
        if (project_path / ".ai").exists():
            self.log_risk(
                str(project_path / ".ai"),
                "existing_structure",
                "Project already has .ai/ directory; import may overwrite rules",
                "Backup .ai/ directory before running import in auto mode"
            )

        # Check for framework conflicts
        if (project_path / "pyproject.toml").exists():
            self.log_compatibility_issue(
                str(project_path / "pyproject.toml"),
                "Poetry/setuptools",
                "Project uses pyproject.toml; ensure AI-INSTRUCT rules don't conflict"
            )

        if (project_path / "package.json").exists():
            self.log_compatibility_issue(
                str(project_path / "package.json"),
                "Node.js/npm",
                "Project is Node.js; ensure shell script conventions match npm ecosystem"
            )

    def write_logs(self):
        """Write audit trail to disk."""
        # Write JSONL (one entry per line) for streaming
        with open(self.log_file, 'w') as f:
            for entry in self.entries:
                f.write(json.dumps(asdict(entry)) + '\n')

        # Write summary JSON
        summary = {
            "project_path": str(self.project_path),
            "import_timestamp": datetime.now().isoformat(),
            "log_file": str(self.log_file),
            "total_entries": len(self.entries),
            "changes_by_category": self.changes_by_category,
            "entries_by_severity": {
                "info": len([e for e in self.entries if e.severity == "info"]),
                "warning": len([e for e in self.entries if e.severity == "warning"]),
                "risk": len([e for e in self.entries if e.severity == "risk"]),
                "error": len([e for e in self.entries if e.severity == "error"]),
            },
            "risks_detected": self.risks_detected,
            "compat_warnings": self.compat_warnings,
            "recommendations": self._generate_recommendations()
        }

        with open(self.summary_file, 'w') as f:
            json.dump(summary, f, indent=2)

        return str(self.log_file), str(self.summary_file)

    def _generate_recommendations(self) -> List[str]:
        """Generate recommendations based on detected issues."""
        recs = []

        if self.risks_detected:
            recs.append("[URGENT] Review the risks detected above before committing")

        if self.compat_warnings:
            recs.append("[INFO] Check compatibility warnings; project may need additional setup")

        if self.changes_by_category.get("change.file_created", 0) > 5:
            recs.append("[INFO] Many files created; review them and customize as needed")

        if "risk.existing_structure" in str(self.risks_detected):
            recs.append("[INFO] Existing .ai/ structure detected; merge rules carefully")

        recs.append("[ACTION] Run: git diff (to review all changes)")
        recs.append("[ACTION] Run: git status (to verify nothing was committed prematurely)")

        return recs

    def print_summary(self):
        """Print human-readable summary."""
        print("\n" + "=" * 70)
        print("IMPORT AUDIT SUMMARY")
        print("=" * 70)
        print(f"Project: {self.project_path}")
        print(f"Total entries: {len(self.entries)}")
        print(f"Changes by category: {json.dumps(self.changes_by_category, indent=2)}")

        if self.risks_detected:
            print(f"\n[RISKS] ({len(self.risks_detected)})")
            for risk in self.risks_detected:
                print(f"  [RISK] {risk}")

        if self.compat_warnings:
            print(f"\n[COMPATIBILITY WARNINGS] ({len(self.compat_warnings)})")
            for warn in self.compat_warnings:
                print(f"  [WARN] {warn}")

        print(f"\nAudit logs: {self.log_file}")
        print(f"Summary: {self.summary_file}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python audit_logger.py <project_path>")
        sys.exit(1)

    project_path = sys.argv[1]
    logger = AuditLogger(project_path)
    logger.detect_patterns(project_path)

    # Example logging
    logger.log_file_created("config/README.md", "README")
    logger.log_file_modified(".gitignore", "credential entries", 1)
    logger.log_risk(
        "src/",
        "python_version",
        "Mixed Python 2/3 patterns detected",
        "Standardize on Python 3.10+ before import"
    )

    log_file, summary_file = logger.write_logs()
    logger.print_summary()
    print(f"\nLogged to: {log_file}")
