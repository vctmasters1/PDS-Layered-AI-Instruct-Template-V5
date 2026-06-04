#!/usr/bin/env python3
"""
Project import compliance fixer.

Implements generic fix logic for common compliance violations:
- File renaming (to kebab-case/snake_case)
- Creating missing directories and files
- Updating .gitignore
- Archiving conflicting files

Generates audit trail of all changes, risks, and compatibility issues.

Usage:
  python import_fixer.py <report_json> <project_path> [--dry-run] [--auto]

Modes:
  --dry-run: Show what would be done without making changes
  --auto: Apply all fixes without prompting
"""

import os
import sys
import json
import shutil
from pathlib import Path
from typing import Dict, List, Any
import re


# Import audit logger
sys.path.insert(0, str(Path(__file__).parent))
try:
    from audit_logger import AuditLogger
except ImportError:
    AuditLogger = None


class ProjectFixer:
    """Applies compliance fixes to a project."""

    def __init__(self, project_path: str, dry_run: bool = False):
        self.project_path = Path(project_path)
        self.dry_run = dry_run
        self.applied_fixes = []
        self.skipped_fixes = []
        self.failed_fixes = []

        # Initialize audit logger if available
        self.audit = None
        if AuditLogger:
            self.audit = AuditLogger(str(project_path))
            self.audit.detect_patterns(str(project_path))

    def apply_fixes(self, findings: Dict[str, Any], auto_mode: bool = False) -> Dict[str, Any]:
        """Apply all fixes based on findings."""
        all_findings = findings.get("error", []) + findings.get("warning", [])

        for finding in all_findings:
            category = finding.get("category", "unknown")
            path = finding.get("path", "")

            try:
                if category == "naming":
                    self._fix_naming(path, finding)
                elif category == "missing":
                    self._fix_missing(path, finding)
                elif category == "security":
                    self._fix_security(path, finding)
                elif category == "structure":
                    self._fix_structure(path, finding)
                else:
                    self.skipped_fixes.append({
                        "path": path,
                        "reason": f"Unknown category: {category}"
                    })
            except Exception as e:
                self.failed_fixes.append({
                    "path": path,
                    "error": str(e)
                })

        return {
            "applied": len(self.applied_fixes),
            "skipped": len(self.skipped_fixes),
            "failed": len(self.failed_fixes),
            "details": {
                "applied_fixes": self.applied_fixes,
                "skipped_fixes": self.skipped_fixes,
                "failed_fixes": self.failed_fixes,
            }
        }

    def _fix_naming(self, path: str, finding: Dict[str, Any]):
        """Fix file naming violations."""
        full_path = self.project_path / path
        if not full_path.exists():
            raise Exception(f"File not found: {path}")

        message = finding.get("message", "")
        suggested_fix = finding.get("suggested_fix", "")

        # Extract suggested new name from fix text
        if "Rename to:" in suggested_fix:
            new_name = suggested_fix.split("Rename to:")[1].strip()
            new_path = full_path.parent / new_name

            if self.dry_run:
                self.applied_fixes.append({
                    "type": "rename",
                    "from": str(full_path),
                    "to": str(new_path),
                    "reason": message
                })
            else:
                if new_path.exists():
                    raise Exception(f"Target already exists: {new_path}")
                full_path.rename(new_path)
                self.applied_fixes.append({
                    "type": "rename",
                    "from": str(full_path),
                    "to": str(new_path),
                    "reason": message,
                    "status": "applied"
                })
        else:
            raise Exception(f"Could not parse suggested fix: {suggested_fix}")

    def _fix_missing(self, path: str, finding: Dict[str, Any]):
        """Fix missing files or directories."""
        message = finding.get("message", "")
        suggested_fix = finding.get("suggested_fix", "")

        if "missing readme.md" in message.lower():
            module_dir = self.project_path / path
            readme_path = module_dir / "README.md"
            content = self._generate_readme(path)

            if self.dry_run:
                self.applied_fixes.append({
                    "type": "create_file",
                    "path": str(readme_path),
                    "reason": message
                })
                if self.audit:
                    self.audit.log(
                        severity="info",
                        category="change.file_created",
                        path=str(readme_path),
                        action="CREATE",
                        details=message,
                        remediation="Review README.md and customize for your module"
                    )
            else:
                module_dir.mkdir(parents=True, exist_ok=True)
                readme_path.write_text(content)
                self.applied_fixes.append({
                    "type": "create_file",
                    "path": str(readme_path),
                    "reason": message,
                    "status": "applied"
                })
                if self.audit:
                    self.audit.log_file_created(str(readme_path), "README.md (template)")
                    self.audit.log_risk(
                        str(readme_path),
                        "template_customization",
                        "Generated README.md template - verify content is accurate for your module",
                        "Review and edit the generated README.md to match your module's actual purpose"
                    )

        elif "missing .ai/instruct.md" in message.lower() or "lacks .ai/instruct.md" in message.lower():
            module_dir = self.project_path / path
            ai_dir = module_dir / ".ai"
            instruct_path = ai_dir / "instruct.md"
            content = self._generate_instruct_md(path)

            if self.dry_run:
                self.applied_fixes.append({
                    "type": "create_file",
                    "path": str(instruct_path),
                    "reason": message
                })
                if self.audit:
                    self.audit.log(
                        severity="info",
                        category="change.file_created",
                        path=str(instruct_path),
                        action="CREATE",
                        details=message,
                        remediation="Review instruct.md and add module-specific rules"
                    )
            else:
                ai_dir.mkdir(parents=True, exist_ok=True)
                instruct_path.write_text(content)
                self.applied_fixes.append({
                    "type": "create_file",
                    "path": str(instruct_path),
                    "reason": message,
                    "status": "applied"
                })
                if self.audit:
                    self.audit.log_file_created(str(instruct_path), ".ai/instruct.md (template)")
                    self.audit.log_risk(
                        str(instruct_path),
                        "depth_priority_config",
                        "Created .ai/instruct.md - verify depth hierarchy is correct",
                        "Ensure parent .ai/instruct.md at root level and add module-specific rules"
                    )
        else:
            self.skipped_fixes.append({
                "path": path,
                "reason": f"Cannot auto-fix: {message}"
            })

    def _fix_security(self, path: str, finding: Dict[str, Any]):
        """Fix security issues (e.g., add to .gitignore)."""
        message = finding.get("message", "")
        suggested_fix = finding.get("suggested_fix", "")

        if "not in .gitignore" in message.lower():
            # Extract filename
            filename = path.split("/")[-1]
            gitignore_path = self.project_path / ".gitignore"

            if self.dry_run:
                self.applied_fixes.append({
                    "type": "update_gitignore",
                    "entry": filename,
                    "reason": message
                })
                if self.audit:
                    self.audit.log(
                        severity="info",
                        category="change.security",
                        path=str(gitignore_path),
                        action="UPDATE",
                        details=f"Will add: {filename}",
                        remediation="Verify .gitignore entry matches your project security needs"
                    )
            else:
                # Read existing .gitignore
                content = ""
                if gitignore_path.exists():
                    content = gitignore_path.read_text()

                # Add entry if not already present
                if filename not in content:
                    if not content.endswith("\n"):
                        content += "\n"
                    content += f"\n# Credential file (imported project)\n{filename}\n"

                    gitignore_path.write_text(content)
                    self.applied_fixes.append({
                        "type": "update_gitignore",
                        "entry": filename,
                        "reason": message,
                        "status": "applied"
                    })
                    if self.audit:
                        self.audit.log_file_modified(str(gitignore_path), filename, 1)
                        self.audit.log_risk(
                            str(path),
                            "gitignore_coverage",
                            f"Added {filename} to .gitignore - verify no sensitive data is already committed",
                            "Run 'git log --all --full-history -- " + filename + "' to check history"
                        )
                else:
                    self.skipped_fixes.append({
                        "path": path,
                        "reason": "Already in .gitignore"
                    })
        else:
            self.skipped_fixes.append({
                "path": path,
                "reason": f"Unknown security fix: {message}"
            })

    def _fix_structure(self, path: str, finding: Dict[str, Any]):
        """Fix structural issues."""
        message = finding.get("message", "")

        if "lacks .ai/instruct.md" in message.lower() or "missing .ai/instruct.md" in message.lower():
            module_dir = self.project_path / path
            ai_dir = module_dir / ".ai"
            instruct_path = ai_dir / "instruct.md"
            content = self._generate_instruct_md(path)

            if self.dry_run:
                self.applied_fixes.append({
                    "type": "create_file",
                    "path": str(instruct_path),
                    "reason": message
                })
            else:
                ai_dir.mkdir(parents=True, exist_ok=True)
                instruct_path.write_text(content)
                self.applied_fixes.append({
                    "type": "create_file",
                    "path": str(instruct_path),
                    "reason": message,
                    "status": "applied"
                })
        else:
            self.skipped_fixes.append({
                "path": path,
                "reason": f"Cannot auto-fix: {message}"
            })

    def _generate_readme(self, module_name: str) -> str:
        """Generate a basic README.md for a module."""
        # Calculate relative path to root based on module depth
        depth = module_name.count('/') + 1
        up = '/'.join(['..'] * depth)

        return f"""# {module_name.replace('-', ' ').title()}

[Module overview — fill in details about this module.]

## Contents

[Describe what's in this module.]

## Usage

[How to use this module.]

## See Also

- Parent documentation: [../README.md](../README.md)
- Framework conventions: [{up}/.ai/conventions.md]({up}/.ai/conventions.md) (if depth allows)
"""

    def _generate_instruct_md(self, module_path: str) -> str:
        """Generate a basic .ai/instruct.md for a module."""
        # Calculate relative path to root based on module depth
        # From .ai/instruct.md inside the module, we need to go up one more level
        # (because we're inside .ai/)
        depth = module_path.count('/') + 2
        up = '/'.join(['..'] * depth)

        return f"""# {module_path.replace('/', ' > ').title()} — Scope Rules

> Depth-priority: This file is authoritative for work inside `{module_path}/`.
> Parent rules: See [{up}/.ai/instruct.md]({up}/.ai/instruct.md)

## Scope

This scope covers all files under `{module_path}/`.

## Rules

[Add module-specific rules here.]

### Naming

[Any naming conventions specific to this module.]

### Structure

[Any structural conventions specific to this module.]

### Dependencies

[External dependencies or constraints.]

## See Also

- Framework conventions: [{up}/.ai/conventions.md]({up}/.ai/conventions.md)
- Maintenance rules: [{up}/.ai/maintenance.md]({up}/.ai/maintenance.md)
"""


def main():
    if len(sys.argv) < 3:
        print("Usage: python import_fixer.py <report_json> <project_path> [--dry-run] [--auto]")
        sys.exit(1)

    report_path = sys.argv[1]
    project_path = sys.argv[2]
    dry_run = "--dry-run" in sys.argv
    auto_mode = "--auto" in sys.argv

    # Load report
    try:
        with open(report_path, 'r') as f:
            report = json.load(f)
    except Exception as e:
        print(f"ERROR: Could not load report: {e}", file=sys.stderr)
        sys.exit(1)

    # Create fixer
    fixer = ProjectFixer(project_path, dry_run=dry_run)

    # Apply fixes
    findings = report.get("findings", {})
    result = fixer.apply_fixes(findings, auto_mode=auto_mode)

    # Print summary
    mode = "[DRY-RUN]" if dry_run else "[APPLY]"
    print(f"\n{mode} Fix Summary")
    print("=" * 70)
    print(f"Applied:  {result['applied']}")
    print(f"Skipped:  {result['skipped']}")
    print(f"Failed:   {result['failed']}")

    # Print details
    if result['details']['applied_fixes']:
        print("\n=== APPLIED ===")
        for fix in result['details']['applied_fixes']:
            if fix['type'] == 'rename':
                print(f"  RENAME: {fix['from']}")
                print(f"    => {fix['to']}")
            elif fix['type'] == 'create_file':
                print(f"  CREATE: {fix['path']}")
            elif fix['type'] == 'update_gitignore':
                print(f"  GITIGNORE: +{fix['entry']}")

    if result['details']['skipped_fixes']:
        print("\n=== SKIPPED ===")
        for fix in result['details']['skipped_fixes']:
            print(f"  {fix['path']}: {fix['reason']}")

    if result['details']['failed_fixes']:
        print("\n=== FAILED ===")
        for fix in result['details']['failed_fixes']:
            print(f"  {fix['path']}: {fix['error']}")

    # Write audit logs if available
    if fixer.audit:
        log_file, summary_file = fixer.audit.write_logs()
        print(f"\n[AUDIT] Logs written to:")
        print(f"  Full trail: {log_file}")
        print(f"  Summary:    {summary_file}")

        # Show critical risks if any
        if fixer.audit.risks_detected:
            print(f"\n[WARNING] {len(fixer.audit.risks_detected)} RISK(S) DETECTED:")
            for risk in fixer.audit.risks_detected[:3]:
                print(f"  [RISK] {risk}")
            if len(fixer.audit.risks_detected) > 3:
                print(f"  ... and {len(fixer.audit.risks_detected) - 3} more (see audit log)")

    # Output JSON for orchestrator
    print("\n---json---")
    print(json.dumps(result, indent=2))

    sys.exit(0 if result['failed'] == 0 else 1)


if __name__ == "__main__":
    main()
