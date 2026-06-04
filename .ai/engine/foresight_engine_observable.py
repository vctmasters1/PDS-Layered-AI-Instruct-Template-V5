#!/usr/bin/env python3
"""
Observable Foresight Engine — Detect gaps and risks before acting

Enhanced version that logs findings to structured JSONL format.
Used by agents during foresight phase (before acting on a task).

Output: .ai/logs/foresight-*.jsonl (one JSON object per line)

Usage:
  python .ai/engine/foresight_engine_observable.py . --task "add new API endpoint"
  python .ai/engine/foresight_engine_observable.py . --context "file: api/routes.py"
"""

import sys
import json
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional
from enum import Enum


class GapCategory(Enum):
    """Categories of anticipated gaps."""
    ERROR_HANDLING = "error_handling"
    LOGGING = "logging"
    TESTING = "testing"
    DOCUMENTATION = "documentation"
    SECURITY = "security"
    PERFORMANCE = "performance"
    VALIDATION = "validation"
    NAMING = "naming"


class RiskLevel(Enum):
    """Risk severity levels."""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


@dataclass
class Gap:
    """Anticipated gap or missing piece."""
    category: str  # GapCategory
    title: str
    description: str
    files_affected: List[str]
    suggested_action: str
    severity: str = "info"


@dataclass
class Risk:
    """Anticipated risk or concern."""
    level: str  # RiskLevel
    title: str
    description: str
    mitigation: str
    files_affected: List[str]


@dataclass
class ForesightLog:
    """Complete foresight analysis log entry."""
    timestamp: str
    task_description: str
    context: Optional[str]
    scope: str  # e.g., "api" or "gui"
    gaps_found: List[Gap]
    risks_identified: List[Risk]
    recommendation: str


class ForesightEngine:
    """Detect gaps and risks in anticipation of a task."""

    def __init__(self, project_path: str = '.'):
        self.project_path = Path(project_path).resolve()
        self.gaps = []
        self.risks = []

    def analyze_task(self, task: str, context: str = None) -> ForesightLog:
        """Analyze a task for anticipated gaps and risks."""

        # Infer scope from task/context
        scope = self._infer_scope(task, context)

        # Run gap checklist
        self._check_gaps(scope)

        # Run risk checklist
        self._check_risks(scope)

        # Generate recommendation
        recommendation = self._generate_recommendation()

        log = ForesightLog(
            timestamp=datetime.now().isoformat(),
            task_description=task,
            context=context,
            scope=scope,
            gaps_found=self.gaps,
            risks_identified=self.risks,
            recommendation=recommendation
        )

        return log

    def _infer_scope(self, task: str, context: str = None) -> str:
        """Guess scope from task description."""
        task_lower = task.lower()

        if 'api' in task_lower or 'endpoint' in task_lower:
            return 'api'
        elif 'ui' in task_lower or 'component' in task_lower or 'gui' in task_lower:
            return 'gui'
        elif 'database' in task_lower or 'schema' in task_lower or 'migration' in task_lower:
            return 'database'
        elif 'test' in task_lower:
            return 'testing'
        else:
            return 'general'

    def _check_gaps(self, scope: str):
        """Run gap detection checklist."""

        # Error Handling Gap
        self.gaps.append(Gap(
            category=GapCategory.ERROR_HANDLING.value,
            title="Error handling not implemented",
            description="New code likely lacks error handling for edge cases",
            files_affected=["*.py", "*.ts"],
            suggested_action="Add try-catch, validate inputs, handle edge cases before shipping",
            severity="warning"
        ))

        # Logging Gap
        self.gaps.append(Gap(
            category=GapCategory.LOGGING.value,
            title="Logging not configured",
            description="New code may not emit structured logs for debugging",
            files_affected=["*.py", "*.ts"],
            suggested_action="Add debug/info/error logs; use structured format (JSON if applicable)",
            severity="info"
        ))

        # Testing Gap
        self.gaps.append(Gap(
            category=GapCategory.TESTING.value,
            title="Tests not written",
            description="New code likely lacks unit/integration tests",
            files_affected=["**/*.test.ts", "**/*_test.py"],
            suggested_action="Write unit tests for happy path and error cases",
            severity="warning"
        ))

        # Documentation Gap
        self.gaps.append(Gap(
            category=GapCategory.DOCUMENTATION.value,
            title="Documentation missing",
            description="Docstrings, comments, or API docs not yet written",
            files_affected=["*.py", "*.ts"],
            suggested_action="Add module docstrings, function docstrings, or API documentation",
            severity="info"
        ))

        # Scope-specific gaps
        if scope == 'api':
            self.gaps.append(Gap(
                category=GapCategory.NAMING.value,
                title="API endpoint not following convention",
                description="Endpoint name may not match semantic naming pattern",
                files_affected=["api/**/*.py", "api/**/*.ts"],
                suggested_action="Verify endpoint follows {resource}_{action} pattern; check .ai/api-conventions.md",
                severity="warning"
            ))

            self.gaps.append(Gap(
                category=GapCategory.VALIDATION.value,
                title="Input validation missing",
                description="Request parameters not validated",
                files_affected=["api/**/*.py"],
                suggested_action="Add schema validation (Joi, Yup, Pydantic); check required fields",
                severity="error"
            ))

        elif scope == 'gui':
            self.gaps.append(Gap(
                category=GapCategory.NAMING.value,
                title="UI element IDs not prefixed",
                description="Component elements may lack discoverable element IDs",
                files_affected=["gui/**/*.tsx", "gui/**/*.jsx"],
                suggested_action="Verify all interactive elements have 2-letter prefixes (bu_, in_, etc); see .ai/coding-prefixes.md",
                severity="warning"
            ))

        elif scope == 'database':
            self.gaps.append(Gap(
                category=GapCategory.NAMING.value,
                title="Schema not following naming convention",
                description="Table or column names may not match project conventions",
                files_affected=["db/migrations/*.sql"],
                suggested_action="Verify names follow pattern (tbl_, col_, idx_); check .ai/database-schema.md",
                severity="warning"
            ))

    def _check_risks(self, scope: str):
        """Run risk detection checklist."""

        # Security Risk
        self.risks.append(Risk(
            level=RiskLevel.ERROR.value,
            title="Potential security issue",
            description="New code may inadvertently expose credentials or create injection vulnerability",
            mitigation="Review for hardcoded secrets, SQL injection, XSS; never commit .env files",
            files_affected=["*.py", "*.ts"]
        ))

        # Performance Risk
        self.risks.append(Risk(
            level=RiskLevel.WARNING.value,
            title="Potential performance problem",
            description="Query or operation may be slow or cause N+1 problem",
            mitigation="Profile queries; check for nested loops over database calls; consider caching",
            files_affected=["api/**/*.py", "db/**/*.py"]
        ))

        # Scope-specific risks
        if scope == 'database':
            self.risks.append(Risk(
                level=RiskLevel.ERROR.value,
                title="Data loss risk in migration",
                description="Migration might delete or corrupt data",
                mitigation="Add backups, test migration in dev first, add rollback path",
                files_affected=["db/migrations/*.sql"]
            ))

    def _generate_recommendation(self) -> str:
        """Generate overall recommendation."""
        error_count = sum(1 for g in self.gaps if g.severity == "error")
        error_count += sum(1 for r in self.risks if r.level == "error")

        if error_count > 0:
            return "PROCEED WITH CAUTION: Fix all [ERROR] items before shipping"
        elif len(self.risks) > 0:
            return "PROCEED: Address [WARNING] items when possible"
        else:
            return "PROCEED: All checks passed"


def run_observable_foresight(project_path: str, task: str, context: str = None):
    """Run foresight and log findings."""

    engine = ForesightEngine(project_path)
    log = engine.analyze_task(task, context)

    # Write to JSONL
    logs_dir = Path(project_path) / '.ai' / 'logs'
    logs_dir.mkdir(parents=True, exist_ok=True)

    log_file = logs_dir / f"foresight-{datetime.now().strftime('%Y%m%d_%H%M%S')}.jsonl"

    with open(log_file, 'a') as f:
        # Convert Gap/Risk dataclasses to dicts
        gaps_dicts = []
        for gap in log.gaps_found:
            gap_dict = asdict(gap)
            gap_dict['category'] = gap.category
            gaps_dicts.append(gap_dict)

        risks_dicts = []
        for risk in log.risks_identified:
            risk_dict = asdict(risk)
            risk_dict['level'] = risk.level
            risks_dicts.append(risk_dict)

        entry = {
            'timestamp': log.timestamp,
            'task_description': log.task_description,
            'context': log.context,
            'scope': log.scope,
            'gaps_count': len(gaps_dicts),
            'risks_count': len(risks_dicts),
            'gaps': gaps_dicts,
            'risks': risks_dicts,
            'recommendation': log.recommendation,
        }

        f.write(json.dumps(entry) + '\n')

    return log, log_file


def print_foresight_report(log: ForesightLog):
    """Print human-readable foresight report."""

    print("\n" + "="*70)
    print("FORESIGHT ANALYSIS")
    print("="*70)

    print(f"\nTask: {log.task_description}")
    if log.context:
        print(f"Context: {log.context}")
    print(f"Scope: {log.scope}")

    if log.gaps_found:
        print(f"\n[GAPS] Anticipated Missing Pieces ({len(log.gaps_found)})")
        for gap in log.gaps_found:
            icon = {"error": "[ERR]", "warning": "[WARN]", "info": "[INFO]"}[gap.severity]
            print(f"\n  {icon} {gap.title}")
            print(f"      {gap.description}")
            print(f"      Action: {gap.suggested_action}")

    if log.risks_identified:
        print(f"\n[RISKS] Anticipated Concerns ({len(log.risks_identified)})")
        for risk in log.risks_identified:
            icon = {"error": "[ERR]", "warning": "[WARN]", "info": "[INFO]"}[risk.level]
            print(f"\n  {icon} {risk.title}")
            print(f"      {risk.description}")
            print(f"      Mitigation: {risk.mitigation}")

    print(f"\n[RECOMMENDATION] {log.recommendation}")
    print("\n" + "="*70)


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Observable foresight analysis')
    parser.add_argument('project_path', nargs='?', default='.', help='Project path')
    parser.add_argument('--task', type=str, required=True, help='Task description')
    parser.add_argument('--context', type=str, help='Additional context (file, module, etc.)')

    args = parser.parse_args()

    log, log_file = run_observable_foresight(args.project_path, args.task, args.context)
    print_foresight_report(log)
    print(f"\n[OK] Logged to: {log_file}")
