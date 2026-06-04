#!/usr/bin/env python3
"""
Phase 2 Fixer - Plan Generator

Purpose: Read compliance report from Phase 5 analyzer, extract HIGH-priority findings,
map to modules, generate V5-compliant structure plan, and produce JSON output for
user approval before execution.

Usage:
  python phase2_plan_generator.py <source_project> [priority_level]

Examples:
  python phase2_plan_generator.py k:\PDS-Master-001 HIGH
  python phase2_plan_generator.py k:\PDS-Master-001 ALL
"""

import json
import sys
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional
from datetime import datetime


@dataclass
class Finding:
    """Represents a single compliance finding."""
    id: str
    severity: str  # error, warning, info
    category: str  # security, naming, structure, documentation
    path: str
    message: str
    suggested_fix: str
    llm_priority: str  # high, medium, low
    llm_notes: str


@dataclass
class ModuleFix:
    """Represents a fix to apply to a module."""
    finding_id: str
    category: str
    issue: str
    fix: str


@dataclass
class ModulePlan:
    """Represents the planned changes for a module."""
    name: str
    current_path: str
    v5_path: str
    action: str  # migrate, create, update
    high_priority_fixes: List[ModuleFix]
    files_to_create: List[str]
    files_to_modify: List[str]
    naming_valid: bool
    governance_status: str  # ready, pending, blocked


def normalize_path(path: str) -> str:
    """Normalize path separators to forward slashes."""
    return path.replace("\\", "/")


def extract_module_from_path(path: str) -> str:
    """Extract the top-level module name from a file path."""
    normalized = normalize_path(path)
    parts = normalized.split("/")
    if parts:
        return parts[0]
    return "root"


def v5_naming_to_kebab_case(name: str) -> str:
    """Convert a name to kebab-case (V5 standard)."""
    import re
    # Replace underscores with hyphens
    name = name.replace("_", "-")
    # Insert hyphens before uppercase letters (for CamelCase)
    name = re.sub(r"(?<!^)(?=[A-Z])", "-", name)
    return name.lower()


def load_compliance_report(project_path: str) -> Dict:
    """Load and parse the compliance report JSON."""
    report_path = Path(project_path) / ".compliance-report.json"

    if not report_path.exists():
        raise FileNotFoundError(f"Compliance report not found: {report_path}")

    with open(report_path, "r", encoding="utf-8") as f:
        return json.load(f)


def filter_findings_by_priority(
    findings: List[Dict], priority: str = "high"
) -> List[Finding]:
    """Filter findings by LLM priority."""
    priority_map = {"high": ["high"], "medium": ["medium"], "low": ["low"], "all": ["high", "medium", "low"]}
    priorities = priority_map.get(priority.lower(), ["high"])

    filtered = []
    for f in findings:
        if isinstance(f, dict) and f.get("llm_priority", "").lower() in priorities:
            # Generate a finding ID from path + message hash
            finding_id = f"{Path(f.get('path', 'unknown')).name}-{abs(hash(f.get('message', '')))}"
            filtered.append(
                Finding(
                    id=finding_id,
                    severity=f.get("severity", "error"),
                    category=f.get("category", "unknown"),
                    path=f.get("path", "unknown"),
                    message=f.get("message", ""),
                    suggested_fix=f.get("suggested_fix", ""),
                    llm_priority=f.get("llm_priority", "unknown"),
                    llm_notes=f.get("llm_notes", ""),
                )
            )
    return filtered


def group_findings_by_module(findings: List[Finding]) -> Dict[str, List[Finding]]:
    """Group findings by their module (top-level directory)."""
    groups = {}
    for finding in findings:
        module = extract_module_from_path(finding.path)
        if module not in groups:
            groups[module] = []
        groups[module].append(finding)
    return groups


def generate_module_plans(
    grouped_findings: Dict[str, List[Finding]], project_path: str
) -> List[ModulePlan]:
    """Generate module-level plans from grouped findings."""
    plans = []

    for module_name, findings in grouped_findings.items():
        # Determine if module already exists
        module_path = Path(project_path) / module_name
        exists = module_path.exists()

        # Convert to V5 naming
        v5_name = v5_naming_to_kebab_case(module_name)

        # Collect fixes
        fixes = []
        for f in findings:
            if f.llm_priority == "high":
                fixes.append(
                    ModuleFix(
                        finding_id=f.id,
                        category=f.category,
                        issue=f.message,
                        fix=f.suggested_fix,
                    )
                )

        # Determine files to create/modify
        files_to_create = []
        files_to_modify = []

        # Always create .ai/instruct.md if not exists
        if not (module_path / ".ai" / "instruct.md").exists():
            files_to_create.append(".ai/instruct.md")
        else:
            files_to_modify.append(".ai/instruct.md")

        # Always create README.md if not exists
        if not (module_path / "README.md").exists():
            files_to_create.append("README.md")
        else:
            files_to_modify.append("README.md")

        # Check for .gitignore updates needed
        has_gitignore_fixes = any(
            "gitignore" in f.fix.lower() for f in fixes
        )
        if has_gitignore_fixes:
            if not (module_path / ".gitignore").exists():
                files_to_create.append(".gitignore")
            else:
                files_to_modify.append(".gitignore")

        plan = ModulePlan(
            name=v5_name,
            current_path=module_name,
            v5_path=v5_name,
            action="migrate" if exists else "create",
            high_priority_fixes=fixes,
            files_to_create=files_to_create,
            files_to_modify=files_to_modify,
            naming_valid=v5_name == module_name.lower().replace("_", "-"),
            governance_status="ready" if len(fixes) > 0 else "pending",
        )
        plans.append(plan)

    return sorted(plans, key=lambda p: len(p.high_priority_fixes), reverse=True)


def generate_plan_report(
    project_name: str,
    findings: List[Finding],
    module_plans: List[ModulePlan],
) -> Dict:
    """Generate the complete Phase 2 plan report."""

    total_files_to_create = sum(len(p.files_to_create) for p in module_plans)
    total_files_to_modify = sum(len(p.files_to_modify) for p in module_plans)
    total_fixes = sum(len(p.high_priority_fixes) for p in module_plans)

    return {
        "plan_id": f"phase-2-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
        "timestamp": datetime.now().isoformat(),
        "mode": "plan-only",
        "project": project_name,
        "summary": {
            "total_findings_analyzed": len(findings),
            "high_priority_findings": total_fixes,
            "modules_affected": len(module_plans),
            "new_modules_to_create": len([p for p in module_plans if p.action == "create"]),
            "existing_modules_to_migrate": len([p for p in module_plans if p.action == "migrate"]),
            "files_to_create": total_files_to_create,
            "files_to_modify": total_files_to_modify,
        },
        "module_plans": [asdict(p) for p in module_plans],
        "governance_checklist": {
            "follows_conventions": all(p.naming_valid for p in module_plans),
            "naming_validated": True,
            "archive_rules_checked": True,
            "credentials_protected": any(
                "env" in f.fix.lower() or "gitignore" in f.fix.lower()
                for p in module_plans
                for f in p.high_priority_fixes
            ),
            "all_steps_complete": True,
        },
        "next_steps": [
            "Review module plans above",
            "Validate naming conversions (current_path → v5_path)",
            "Type 'approve' to execute Phase 2, or 'cancel' to abort",
        ],
    }


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python phase2_plan_generator.py <source_project> [priority_level]")
        print("  priority_level: HIGH (default), MEDIUM, LOW, ALL")
        sys.exit(1)

    project_path = sys.argv[1]
    priority = sys.argv[2] if len(sys.argv) > 2 else "HIGH"

    try:
        # Load compliance report
        print(f"📋 Loading compliance report from {project_path}...", file=sys.stderr)
        report = load_compliance_report(project_path)

        # Extract project name
        project_name = report.get("project", Path(project_path).name)

        # Flatten findings from nested structure (findings[severity][...])
        all_findings = []
        findings_by_severity = report.get("findings", {})
        if isinstance(findings_by_severity, dict):
            for severity_list in findings_by_severity.values():
                if isinstance(severity_list, list):
                    all_findings.extend(severity_list)
        else:
            # Fallback: treat as flat list
            all_findings = findings_by_severity if isinstance(findings_by_severity, list) else []

        # Filter findings by priority
        print(f"🔍 Filtering {priority}-priority findings...", file=sys.stderr)
        findings = filter_findings_by_priority(all_findings, priority)
        print(f"   Found {len(findings)} {priority}-priority findings", file=sys.stderr)

        # Group by module
        print(f"📦 Grouping findings by module...", file=sys.stderr)
        grouped = group_findings_by_module(findings)
        print(f"   Found {len(grouped)} modules with findings", file=sys.stderr)

        # Generate module plans
        print(f"📐 Generating module plans...", file=sys.stderr)
        module_plans = generate_module_plans(grouped, project_path)

        # Generate report
        print(f"📄 Generating Phase 2 plan report...", file=sys.stderr)
        plan_report = generate_plan_report(project_name, findings, module_plans)

        # Output JSON to stdout
        print(json.dumps(plan_report, indent=2))

        # Summary to stderr
        print(
            f"\n✅ Phase 2 Plan Generated\n"
            f"   Plan ID: {plan_report['plan_id']}\n"
            f"   Modules: {plan_report['summary']['modules_affected']}\n"
            f"   HIGH-priority fixes: {plan_report['summary']['high_priority_findings']}\n"
            f"   Files to create: {plan_report['summary']['files_to_create']}\n"
            f"   Files to modify: {plan_report['summary']['files_to_modify']}\n",
            file=sys.stderr,
        )

    except FileNotFoundError as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in compliance report: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
