"""
PDS AI-INSTRUCT — Behavioral eval runner (reference implementation).

Static-only by default. Reads every `.ai/evals/**/*.eval.yaml` file, validates
against the schema in `.ai/evals/schema.md`, and evaluates each expectation
using only filesystem and frontmatter inspection — no LLM calls.

Usage:
    python .ai/evals/runner.py
    python .ai/evals/runner.py --eval routing-delegation-001
    python .ai/evals/runner.py --json
    python .ai/evals/runner.py --dir .ai/evals/examples

Exit codes:
    0  All `high`-severity evals passed (medium/low failures warn only)
    1  At least one `high` eval failed
    2  Schema/IO error

The runner is pure stdlib. PyYAML is preferred when present; otherwise a tiny
loader handles the simple subset used by these eval files.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


# ── workspace resolution ────────────────────────────────────────────────────

def _find_workspace() -> Path:
    here = Path(__file__).resolve()
    for parent in [here, *here.parents]:
        if (parent / ".ai").is_dir() and (parent / ".github").is_dir():
            return parent
    return Path.cwd().resolve()


WORKSPACE = _find_workspace()


# ── tiny YAML loader (fallback) ─────────────────────────────────────────────

def _load_yaml(text: str) -> Any:
    """Try PyYAML; fall back to a minimal loader for the eval-file subset."""
    try:
        import yaml  # type: ignore

        return yaml.safe_load(text)
    except Exception:
        pass
    return _mini_yaml(text)


def _mini_yaml(text: str) -> Any:
    """
    Minimal YAML loader covering only the constructs used in eval files:
    mappings, sequences, scalars, simple block scalars. No anchors, no flow,
    no tags. Intentionally narrow — if anything trips it, install PyYAML.
    """
    lines = [ln.rstrip() for ln in text.splitlines()
             if ln.strip() and not ln.lstrip().startswith("#")]
    return _parse_block(lines, 0, 0)[0]


def _indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def _parse_scalar(s: str) -> Any:
    s = s.strip()
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        return s[1:-1]
    if s in ("true", "True"):
        return True
    if s in ("false", "False"):
        return False
    if s in ("null", "~", ""):
        return None
    try:
        if "." in s:
            return float(s)
        return int(s)
    except ValueError:
        return s


def _parse_block(lines: list[str], i: int, indent: int) -> tuple[Any, int]:
    if i >= len(lines):
        return None, i
    if lines[i].lstrip().startswith("- "):
        out: list[Any] = []
        while i < len(lines) and _indent(lines[i]) == indent and lines[i].lstrip().startswith("- "):
            inner = lines[i][indent + 2 :]
            if ":" in inner and not inner.strip().startswith('"'):
                synthetic = [" " * (indent + 2) + inner]
                j = i + 1
                while j < len(lines) and _indent(lines[j]) > indent:
                    synthetic.append(lines[j])
                    j += 1
                obj, _ = _parse_block(synthetic, 0, indent + 2)
                out.append(obj)
                i = j
            else:
                out.append(_parse_scalar(inner))
                i += 1
        return out, i
    obj: dict[str, Any] = {}
    while i < len(lines) and _indent(lines[i]) == indent:
        line = lines[i].strip()
        if ":" not in line:
            i += 1
            continue
        key, _, rest = line.partition(":")
        key = key.strip()
        rest = rest.strip()
        if rest:
            obj[key] = _parse_scalar(rest)
            i += 1
        else:
            j = i + 1
            if j < len(lines) and _indent(lines[j]) > indent:
                child, j = _parse_block(lines, j, _indent(lines[j]))
                obj[key] = child
                i = j
            else:
                obj[key] = None
                i += 1
    return obj, i


# ── frontmatter helper ──────────────────────────────────────────────────────

_FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def _read_frontmatter(p: Path) -> dict[str, Any]:
    if not p.exists():
        return {}
    text = p.read_text(encoding="utf-8")
    m = _FM_RE.match(text)
    if not m:
        return {}
    parsed = _load_yaml(m.group(1)) or {}
    return parsed if isinstance(parsed, dict) else {}


# ── data ────────────────────────────────────────────────────────────────────

@dataclass
class EvalResult:
    id: str
    severity: str
    status: str  # pass | fail | skipped | error
    duration_ms: int
    failures: list[dict[str, Any]] = field(default_factory=list)
    file: str = ""


# ── expectations ────────────────────────────────────────────────────────────

def _eval_expectation(exp: dict[str, Any], scope: Path) -> tuple[bool, dict[str, Any] | None]:
    kind = exp.get("kind")

    if kind == "scope-authority":
        target = exp.get("equals")
        # Walk from workspace down to scope, collect .ai/instruct.md
        rel = scope.resolve().relative_to(WORKSPACE)
        parts = [WORKSPACE, *[(WORKSPACE / Path(*rel.parts[: i + 1])) for i in range(len(rel.parts))]]
        candidates = [d / ".ai" / "instruct.md" for d in parts if (d / ".ai" / "instruct.md").exists()]
        if not candidates:
            return False, {"kind": kind, "expected": target, "got": None, "reason": "no .ai/instruct.md found"}
        deepest = candidates[-1]
        got = str(deepest.relative_to(WORKSPACE)).replace("\\", "/")
        if got == target:
            return True, None
        return False, {"kind": kind, "expected": target, "got": got}

    if kind == "background-includes":
        includes = exp.get("includes") or []
        rel = scope.resolve().relative_to(WORKSPACE)
        parts = [WORKSPACE, *[(WORKSPACE / Path(*rel.parts[: i + 1])) for i in range(len(rel.parts))]]
        present = {str((d / ".ai" / "instruct.md").relative_to(WORKSPACE)).replace("\\", "/")
                   for d in parts if (d / ".ai" / "instruct.md").exists()}
        missing = [p for p in includes if p not in present]
        if not missing:
            return True, None
        return False, {"kind": kind, "missing": missing}

    if kind == "governed-tools-consulted":
        names = exp.get("includes") or []
        tool_dirs = [WORKSPACE / ".ai" / "agents" / "tools", WORKSPACE / ".ai" / "mcp" / "tools"]
        existing: set[str] = set()
        for d in tool_dirs:
            if d.is_dir():
                for f in d.glob("*.json"):
                    if f.name.startswith("_"):
                        continue
                    existing.add(f.stem)
        missing = [n for n in names if n not in existing]
        if not missing:
            return True, None
        return False, {"kind": kind, "missing": missing}

    if kind == "registry-touched":
        target = exp.get("equals")
        targets = exp.get("includes") or ([target] if target else [])
        missing = [t for t in targets if not (WORKSPACE / t).exists()]
        if not missing:
            return True, None
        return False, {"kind": kind, "missing": missing}

    if kind == "forbidden":
        # Static mode: confirm tools exist as definitions; trace check is dynamic-only.
        names = exp.get("excludes") or []
        tool_dirs = [WORKSPACE / ".ai" / "agents" / "tools", WORKSPACE / ".ai" / "mcp" / "tools"]
        existing: set[str] = set()
        for d in tool_dirs:
            if d.is_dir():
                for f in d.glob("*.json"):
                    existing.add(f.stem)
        unknown = [n for n in names if n not in existing]
        if unknown:
            return False, {"kind": kind, "unknown_tool_definitions": unknown,
                           "reason": "forbidden tool name has no definition; check for typos"}
        return True, None  # trace-level check deferred to dynamic mode

    if kind == "file-pattern":
        path = exp.get("path")
        expect = exp.get("expect", "exists")
        if not path:
            return False, {"kind": kind, "reason": "missing 'path'"}
        matches = list(WORKSPACE.glob(path))
        exists = bool(matches)
        if expect == "exists" and exists:
            return True, None
        if expect == "absent" and not exists:
            return True, None
        return False, {"kind": kind, "path": path, "expect": expect, "found": exists}

    if kind == "frontmatter-field":
        f = exp.get("file")
        field_name = exp.get("field")
        equals = exp.get("equals")
        if not f or not field_name:
            return False, {"kind": kind, "reason": "missing 'file' or 'field'"}
        fm = _read_frontmatter(WORKSPACE / f)
        if field_name not in fm:
            return False, {"kind": kind, "file": f, "field": field_name, "reason": "field absent"}
        if equals is not None and fm[field_name] != equals:
            return False, {"kind": kind, "file": f, "field": field_name,
                           "expected": equals, "got": fm[field_name]}
        return True, None

    return False, {"kind": kind, "reason": "unknown expectation kind"}


# ── runner ──────────────────────────────────────────────────────────────────

def _validate_eval(doc: dict[str, Any], path: Path) -> str | None:
    for required in ("id", "description", "scope", "input", "expectations"):
        if required not in doc:
            return f"{path}: missing required field '{required}'"
    if not isinstance(doc["expectations"], list) or not doc["expectations"]:
        return f"{path}: 'expectations' must be a non-empty list"
    return None


def _run_eval(doc: dict[str, Any], path: Path) -> EvalResult:
    started = time.perf_counter()
    severity = doc.get("severity", "high")
    rid = doc["id"]
    rel_file = str(path.relative_to(WORKSPACE)).replace("\\", "/")

    if doc.get("disabled"):
        return EvalResult(rid, severity, "skipped", 0, file=rel_file)
    if doc.get("requires_runtime") == "dynamic":
        return EvalResult(rid, severity, "skipped", 0,
                          failures=[{"reason": "dynamic eval; --trace not provided"}],
                          file=rel_file)

    scope_str = doc.get("scope") or "."
    scope = (WORKSPACE / scope_str).resolve()
    if not scope.exists():
        return EvalResult(rid, severity, "error", 0,
                          failures=[{"reason": f"scope path does not exist: {scope_str}"}],
                          file=rel_file)

    failures: list[dict[str, Any]] = []
    for exp in doc["expectations"]:
        ok, fail = _eval_expectation(exp, scope)
        if not ok and fail is not None:
            failures.append(fail)

    duration = int((time.perf_counter() - started) * 1000)
    status = "pass" if not failures else "fail"
    return EvalResult(rid, severity, status, duration, failures, rel_file)


def _discover_evals(root: Path) -> list[Path]:
    return sorted(root.rglob("*.eval.yaml"))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="pds-evals")
    ap.add_argument("--dir", default=str(WORKSPACE / ".ai" / "evals"),
                    help="Directory to scan for *.eval.yaml")
    ap.add_argument("--eval", help="Run only the eval with this id")
    ap.add_argument("--json", action="store_true", help="Emit JSON Lines results")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    root = Path(args.dir).resolve()
    if not root.is_dir():
        print(f"ERROR: {root} is not a directory", file=sys.stderr)
        return 2

    files = _discover_evals(root)
    if not files:
        if not args.quiet:
            print(f"No *.eval.yaml files under {root}", file=sys.stderr)
        return 0

    results: list[EvalResult] = []
    for f in files:
        try:
            doc = _load_yaml(f.read_text(encoding="utf-8"))
            if not isinstance(doc, dict):
                results.append(EvalResult("?", "high", "error", 0,
                                          failures=[{"reason": "not a YAML mapping"}],
                                          file=str(f.relative_to(WORKSPACE)).replace("\\", "/")))
                continue
            err = _validate_eval(doc, f)
            if err:
                results.append(EvalResult(doc.get("id", "?"), doc.get("severity", "high"),
                                          "error", 0, failures=[{"reason": err}],
                                          file=str(f.relative_to(WORKSPACE)).replace("\\", "/")))
                continue
            if args.eval and doc["id"] != args.eval:
                continue
            results.append(_run_eval(doc, f))
        except Exception as e:  # pragma: no cover - defensive
            results.append(EvalResult("?", "high", "error", 0,
                                      failures=[{"reason": f"loader error: {e}"}],
                                      file=str(f.relative_to(WORKSPACE)).replace("\\", "/")))

    # report
    if args.json:
        for r in results:
            print(json.dumps(r.__dict__))
    elif not args.quiet:
        for r in results:
            mark = {"pass": "PASS", "fail": "FAIL", "skipped": "SKIP", "error": "ERR "}[r.status]
            print(f"[{mark}] {r.severity:6s} {r.id}  ({r.duration_ms} ms)  {r.file}")
            for fail in r.failures:
                print(f"        - {fail}")
        passed = sum(1 for r in results if r.status == "pass")
        failed = sum(1 for r in results if r.status == "fail")
        errored = sum(1 for r in results if r.status == "error")
        skipped = sum(1 for r in results if r.status == "skipped")
        print(f"\nSummary: {passed} pass, {failed} fail, {errored} error, {skipped} skipped")

    high_failures = [r for r in results if r.severity == "high" and r.status in ("fail", "error")]
    return 1 if high_failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
