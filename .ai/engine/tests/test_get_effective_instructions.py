"""Tests for the depth-priority resolver. Generic, no project knowledge required."""
from __future__ import annotations

import sys
import textwrap
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import get_effective_instructions as _GEI  # noqa: E402


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(content), encoding="utf-8")


def test_returns_empty_when_no_instructions(tmp_path: Path) -> None:
    result = _GEI.get_effective_instructions(str(tmp_path))
    assert result == ""


def test_returns_root_when_only_root_exists(tmp_path: Path) -> None:
    _write(tmp_path / ".ai" / "instruct.md", "ROOT RULE")
    result = _GEI.get_effective_instructions(str(tmp_path / "src" / "deep"))
    assert "ROOT RULE" in result


def test_deepest_wins_appears_last(tmp_path: Path) -> None:
    _write(tmp_path / ".ai" / "instruct.md", "ROOT")
    _write(tmp_path / "module" / ".ai" / "instruct.md", "MODULE")
    _write(tmp_path / "module" / "sub" / ".ai" / "instruct.md", "SUB")
    out = _GEI.get_effective_instructions(str(tmp_path / "module" / "sub"))
    # all three present
    assert "ROOT" in out and "MODULE" in out and "SUB" in out
    # deepest appears last per the merge contract
    assert out.rfind("SUB") > out.rfind("MODULE") > out.rfind("ROOT")


def test_skips_directories_without_instruct(tmp_path: Path) -> None:
    _write(tmp_path / ".ai" / "instruct.md", "ROOT")
    # middle dir has no .ai/instruct.md
    (tmp_path / "module" / "sub").mkdir(parents=True)
    _write(tmp_path / "module" / "sub" / ".ai" / "instruct.md", "SUB")
    out = _GEI.get_effective_instructions(str(tmp_path / "module" / "sub"))
    assert "ROOT" in out and "SUB" in out
