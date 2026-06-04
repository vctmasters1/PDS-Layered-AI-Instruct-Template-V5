"""Tests for the tool-schema validator. Generic, table-driven."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
VALIDATOR = REPO / ".ai" / "engine" / "validate_tools.py"


def test_repo_tools_pass_schema() -> None:
    """Every governed tool currently in the repo must satisfy the schema."""
    result = subprocess.run(
        [sys.executable, str(VALIDATOR)],
        capture_output=True,
        text=True,
        cwd=str(REPO),
    )
    assert result.returncode == 0, (
        f"validate_tools.py failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
    )


def test_validator_rejects_missing_safety_level(tmp_path: Path, monkeypatch) -> None:
    """A bad tool file must fail. Smoke test by copying validator and pointing at tmp dir."""
    bad = {
        "tool_name": "bad-tool",
        "description": "x" * 30,
        "checklist": ["1. step"],
        "requires_approval": False,
    }
    tools_dir = tmp_path / ".ai" / "agents" / "tools"
    tools_dir.mkdir(parents=True)
    (tools_dir / "_schema.json").write_text(
        (REPO / ".ai" / "agents" / "tools" / "_schema.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    (tools_dir / "bad-tool.json").write_text(json.dumps(bad), encoding="utf-8")

    # copy validator script and patch REPO root to tmp_path
    src = VALIDATOR.read_text(encoding="utf-8").replace(
        "REPO = Path(__file__).resolve().parents[2]",
        f"REPO = Path(r'{tmp_path}')",
    )
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    runner = bin_dir / "validate_tools.py"
    runner.write_text(src, encoding="utf-8")

    result = subprocess.run(
        [sys.executable, str(runner)],
        capture_output=True,
        text=True,
        cwd=str(tmp_path),
    )
    assert result.returncode == 1
    assert "safety_level" in result.stdout
