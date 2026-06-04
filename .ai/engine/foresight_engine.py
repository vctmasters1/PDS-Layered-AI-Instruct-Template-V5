import json
import subprocess
from datetime import datetime
from pathlib import Path

from get_effective_instructions import get_effective_instructions

# .ai/ root relative to this script (engine/ is one level below .ai/)
_AI_ROOT = Path(__file__).resolve().parent.parent


def get_staged_changes() -> list:
    """Pull staged git diff as a list of change descriptors."""
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--unified=2"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            return [{"source": "git-staged", "diff": result.stdout[:4000]}]
    except (subprocess.SubprocessError, FileNotFoundError):
        pass
    return []


def run_foresight_analysis(
    current_path: str, task_context: dict, recent_changes: list = None
):
    """
    Advanced foresight engine — predicts gaps, risks, and proactive improvements
    before changes are made. Results are appended to .ai/knowledge/anticipated-gaps.md.

    Args:
        current_path:    Working directory to resolve effective instructions for.
        task_context:    Dict describing the planned task (free-form keys/values).
        recent_changes:  Optional list of change descriptors. When None, automatically
                         populated from staged git diff.
    """
    instructions = get_effective_instructions(current_path)

    if recent_changes is None:
        recent_changes = get_staged_changes()

    analysis = {
        "timestamp": datetime.now().isoformat(),
        "path": current_path,
        "gaps": [],
        "risks": [],
        "proactive_suggestions": [],
        "confidence": 0.0,
    }

    # Build a combined context string from task + recent changes for keyword analysis
    task_str = str(task_context).lower()
    if recent_changes:
        task_str += " " + " ".join(str(c).lower() for c in recent_changes)

    # ── Gap detection ──────────────────────────────────────────────────────────
    if not any(kw in task_str for kw in ("error", "except", "catch")):
        analysis["gaps"].append(
            {
                "type": "error_handling",
                "severity": "high",
                "description": "Missing error handling patterns",
                "recommendation": "Add structured try/except with logging per instructions",
            }
        )

    if not any(kw in task_str for kw in ("log", "logger", "logging")):
        analysis["gaps"].append(
            {
                "type": "observability",
                "severity": "medium",
                "description": "Missing logging",
                "recommendation": "Add structured logging",
            }
        )

    if not any(kw in task_str for kw in ("test", "spec", "assert")):
        analysis["gaps"].append(
            {
                "type": "test_coverage",
                "severity": "medium",
                "description": "No test coverage referenced for this change",
                "recommendation": "Add or update tests for changed behaviour",
            }
        )

    # ── Risk forecasting ───────────────────────────────────────────────────────
    if any(kw in task_str for kw in ("database", "query", "sql")):
        analysis["risks"].append(
            {
                "type": "security",
                "probability": "medium",
                "description": "Potential SQL injection or credential exposure",
                "recommendation": "Use parameterized queries + run safety audit",
            }
        )

    if any(kw in task_str for kw in ("secret", "password", "token", "api_key")):
        analysis["risks"].append(
            {
                "type": "credential_exposure",
                "probability": "high",
                "description": "Credential-related terms detected in change context",
                "recommendation": "Verify no secrets are hardcoded; use env vars per .ai/credentials.md",
            }
        )

    if any(kw in task_str for kw in ("delete", "remove", "drop", "rm ")):
        analysis["risks"].append(
            {
                "type": "data_loss",
                "probability": "medium",
                "description": "Destructive operation detected",
                "recommendation": "Archive instead of delete per .ai/maintenance.md#never-delete-rule",
            }
        )

    # ── Proactive suggestions ──────────────────────────────────────────────────
    analysis["proactive_suggestions"] = [
        "Consider adding rate limiting for public endpoints",
        "Add integration test coverage for this change",
    ]

    analysis["confidence"] = 0.75

    # ── Append to knowledge base ───────────────────────────────────────────────
    knowledge_file = _AI_ROOT / "knowledge" / "anticipated-gaps.md"
    knowledge_file.parent.mkdir(parents=True, exist_ok=True)
    with open(knowledge_file, "a") as f:
        f.write(
            f"\n## Analysis {analysis['timestamp']}\n{json.dumps(analysis, indent=2)}\n"
        )

    return analysis
