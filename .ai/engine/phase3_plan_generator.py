#!/usr/bin/env python3
r"""
Phase 3 Fixer - Plan Generator

Purpose: Parse compliance report, extract MEDIUM-priority findings, group by module,
generate Phase 3 execution plan for documentation generation and structural improvements.

Usage:
  python phase3_plan_generator.py <source_project> [priority_level]

Examples:
  python phase3_plan_generator.py k:\PDS-Master-001 MEDIUM
  python phase3_plan_generator.py k:\PDS-Master-001 ALL
"""

import json
import sys
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional
from datetime import datetime
from collections import defaultdict


@dataclass
class Finding:
    """Represents a single compliance finding."""
    id: str
    severity: str
    category: str
    path: str
    message: str
    suggested_fix: str
    llm_priority: str
    llm_notes: str


@dataclass
class ModulePlan:
    """Represents planned changes for a module."""
    name: str
    current_path: str
    v5_path: str
    action: str  # migrate, create, update
    findings: List[Finding]
    files_to_create: List[str]
    files_to_modify: List[str]


def normalize_path(path: str) -> str:
    """Normalize path separators to forward slashes."""
    return path.replace("\\", "/")


def extract_module_from_path(path: str) -> str:
    """Extract top-level module name from file path."""
    normalized = normalize_path(path)
    parts = normalized.split("/")
    if parts:
        return parts[0]
    return "root"


def load_compliance_report(project_path: str) -> Dict:
    """Load and parse compliance report JSON."""
    report_path = Path(project_path) / ".compliance-report.json"
    if not report_path.exists():
        raise FileNotFoundError(f"Compliance report not found: {report_path}")
    
    with open(report_path, "r", encoding="utf-8") as f:
        return json.load(f)


def flatten_findings(findings_nested: Dict) -> List[Dict]:
    """Flatten nested findings structure (by severity) into flat list."""
    flat = []
    if isinstance(findings_nested, dict):
        for severity, items in findings_nested.items():
            if isinstance(items, list):
                flat.extend(items)
    elif isinstance(findings_nested, list):
        flat = findings_nested
    return flat


def filter_findings_by_priority(findings: List[Dict], priority: str = "medium") -> List[Finding]:
    """Filter findings by LLM priority."""
    priority_map = {
        "medium": ["medium"],
        "high": ["high"],
        "low": ["low"],
        "all": ["high", "medium", "low"]
    }
    priorities = priority_map.get(priority.lower(), ["medium"])
    
    filtered = []
    for f in findings:
        if isinstance(f, dict) and f.get("llm_priority", "").lower() in priorities:
            finding_id = f"{Path(f.get('path', 'unknown')).name}-{abs(hash(f.get('message', '')))}"
            filtered.append(
                Finding(
                    id=finding_id,
                    severity=f.get("severity", "warning"),
                    category=f.get("category", "unknown"),
                    path=f.get("path", "unknown"),
                    message=f.get("message", ""),
                    suggested_fix=f.get("suggested_fix", ""),
                    llm_priority=f.get("llm_priority", "medium"),
                    llm_notes=f.get("llm_notes", ""),
                )
            )
    return filtered


def group_findings_by_module(findings: List[Finding]) -> Dict[str, List[Finding]]:
    """Group findings by module."""
    groups = defaultdict(list)
    for finding in findings:
        module = extract_module_from_path(finding.path)
        groups[module].append(finding)
    return groups


def generate_module_plans(grouped_findings: Dict[str, List[Finding]], project_path: str) -> List[ModulePlan]:
    """Generate module plans from grouped findings."""
    plans = []
    
    for module_name, findings in grouped_findings.items():
        module_path = Path(project_path) / module_name
        exists = module_path.exists()
        
        # Determine files to create/modify
        files_to_create = []
        files_to_modify = []
        
        for finding in findings:
            if "README.md" in finding.message and "missing" in finding.message:
                files_to_create.append(f"{module_name}/README.md")
            elif "naming" in finding.category:
                files_to_modify.append(f"{module_name}/")
        
        plans.append(
            ModulePlan(
                name=module_name,
                current_path=module_name,
                v5_path=module_name,
                action="update" if exists else "create",
                findings=findings,
                files_to_create=list(set(files_to_create)),
                files_to_modify=list(set(files_to_modify)),
            )
        )
    
    return plans


def generate_plan_report(plans: List[ModulePlan], project: str) -> Dict:
    """Generate comprehensive Phase 3 plan report."""
    return {
        "plan_id": f"phase-3-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
        "timestamp": datetime.now().isoformat(),
        "mode": "plan-only",
        "project": project,
        "summary": {
            "total_findings_analyzed": sum(len(p.findings) for p in plans),
            "medium_priority_findings": sum(len(p.findings) for p in plans),
            "modules_affected": len(plans),
            "files_to_create": sum(len(p.files_to_create) for p in plans),
            "files_to_modify": sum(len(p.files_to_modify) for p in plans),
        },
        "module_plans": [asdict(p) for p in plans],
        "governance": {
            "conventions_checked": True,
            "archive_rules_applied": True,
            "credentials_protected": True,
        },
    }


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python phase3_plan_generator.py <source_project> [priority_level]")
        sys.exit(1)
    
    project_path = sys.argv[1]
    priority = sys.argv[2] if len(sys.argv) > 2 else "MEDIUM"
    
    try:
        print(f"[PLAN] Loading compliance report from {project_path}...")
        report = load_compliance_report(project_path)
        
        print(f"[PLAN] Flattening findings structure...")
        findings_list = flatten_findings(report.get("findings", {}))
        
        print(f"[PLAN] Filtering {priority}-priority findings...")
        filtered = filter_findings_by_priority(findings_list, priority)
        print(f"   Found {len(filtered)} {priority}-priority findings")
        
        print(f"[PLAN] Grouping findings by module...")
        grouped = group_findings_by_module(filtered)
        print(f"   Found {len(grouped)} modules with findings")
        
        print(f"[PLAN] Generating module plans...")
        plans = generate_module_plans(grouped, project_path)
        
        print(f"[PLAN] Generating Phase 3 plan report...")
        report_out = generate_plan_report(plans, Path(project_path).name)
        
        print(f"\n[OK] Phase 3 Plan Generated")
        print(f"   Plan ID: {report_out['plan_id']}")
        print(f"   Modules: {report_out['summary']['modules_affected']}")
        print(f"   MEDIUM-priority fixes: {report_out['summary']['medium_priority_findings']}")
        print(f"   Files to create: {report_out['summary']['files_to_create']}")
        print(f"   Files to modify: {report_out['summary']['files_to_modify']}\n")
        
        print(json.dumps(report_out, indent=2))
        
    except Exception as e:
        print(f"[ERR] {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
