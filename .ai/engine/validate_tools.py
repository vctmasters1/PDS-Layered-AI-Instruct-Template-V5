"""Validate every governed-tool JSON against `_schema.json`.

Generic, run from repo root:
    python .ai/engine/validate_tools.py
Exit code 0 on success, 1 on any failure. Prints all failures, not just the first.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from jsonschema import Draft202012Validator
except ImportError:  # pragma: no cover - bootstrap only
    print("ERROR: jsonschema not installed. Run: pip install jsonschema", file=sys.stderr)
    sys.exit(2)

REPO = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO / ".ai" / "agents" / "tools" / "_schema.json"
TOOL_DIRS = [
    REPO / ".ai" / "agents" / "tools",
    REPO / ".ai" / "mcp" / "tools",
]


def main() -> int:
    if not SCHEMA_PATH.exists():
        print(f"FATAL: schema missing at {SCHEMA_PATH}", file=sys.stderr)
        return 2

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)

    failures: list[str] = []
    checked = 0

    for tool_dir in TOOL_DIRS:
        if not tool_dir.is_dir():
            continue
        for tool_file in sorted(tool_dir.glob("*.json")):
            if tool_file.name.startswith("_"):
                continue  # _schema.json and friends
            checked += 1
            try:
                doc = json.loads(tool_file.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                failures.append(f"{tool_file}: invalid JSON — {exc}")
                continue

            # tool_name must equal file stem
            stem = tool_file.stem
            if doc.get("tool_name") != stem:
                failures.append(
                    f"{tool_file}: tool_name='{doc.get('tool_name')}' must equal file stem '{stem}'"
                )

            for err in sorted(validator.iter_errors(doc), key=lambda e: e.path):
                loc = "/".join(str(p) for p in err.path) or "<root>"
                failures.append(f"{tool_file}: {loc}: {err.message}")

    if failures:
        print(f"Tool schema validation FAILED ({len(failures)} issue(s) across {checked} file(s)):")
        for f in failures:
            print(f"  - {f}")
        return 1

    print(f"Tool schema validation OK ({checked} file(s)).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
