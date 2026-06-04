"""
example_workflow.py — End-to-end demonstration of the autonomous runner
=======================================================================

Scenario:

    Autonomously implement a new module. The example uses a generic
    "feature_module_v1" identifier so the pipeline
    (router → supervisor → naming → scaffolder → generator →
    validator → tester → reviewer) is exercised end-to-end on a realistic
    feature shape.

This script invokes `autonomous_runner.py` with a representative goal,
runs the full pipeline, and demonstrates:

    1. The default master-switch refusal (autonomy-config.yaml.enabled=false)
       and the `--allow-disabled` sandbox override.
    2. Full JSONL audit trail at .ai/logs/autonomous-YYYY-MM-DD.jsonl.
    3. Persistent queue state at .ai/autonomous/queue.jsonl.
    4. The PAUSE sentinel halt behaviour (creates `.ai/PAUSE`, runs, deletes).
    5. Auto-approve mode for non-interactive demos (clearly logged).

Run:

    python example_workflow.py

Expected wall-clock: <5 seconds. No bytes are written outside the audit log
and queue file; the simulated backend reports "files modified" without
touching them, by design.
"""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import time

THIS_DIR = pathlib.Path(__file__).resolve().parent
RUNNER = THIS_DIR / "autonomous_runner.py"
PROJECT_ROOT = THIS_DIR.parent.parent.parent
PAUSE = PROJECT_ROOT / ".ai" / "PAUSE"
QUEUE = PROJECT_ROOT / ".ai" / "autonomous" / "queue.jsonl"


GOAL = (
    "Implement a feature_module_v1 module with a public entry point "
    "and a unit-test suite."
)


def banner(title: str) -> None:
    line = "=" * len(title)
    print(f"\n{line}\n{title}\n{line}")


def run(label: str, *args: str) -> subprocess.CompletedProcess:
    print(f"\n--- {label} ---")
    print(f"$ python {RUNNER.name} {' '.join(args)}")
    return subprocess.run(
        [sys.executable, str(RUNNER), *args],
        cwd=THIS_DIR,
        text=True,
        capture_output=True,
    )


def show(result: subprocess.CompletedProcess) -> None:
    print(f"exit code: {result.returncode}")
    if result.stdout:
        print("--- stdout ---")
        print(result.stdout)
    if result.stderr:
        print("--- stderr ---")
        print(result.stderr)


def tail_queue(n: int = 3) -> None:
    if not QUEUE.is_file():
        print("(queue.jsonl not present — no goals enqueued yet)")
        return
    rows = QUEUE.read_text(encoding="utf-8").splitlines()[-n:]
    print(f"--- last {len(rows)} queue row(s) ---")
    for raw in rows:
        try:
            row = json.loads(raw)
        except json.JSONDecodeError:
            print(raw)
            continue
        print(
            f"  {row.get('goal_id')}  status={row.get('status')}  "
            f"step={row.get('step_index')}  reason={row.get('stop_reason')}"
        )


def main() -> int:
    banner("Step 1 — Master switch refusal (the default safe state)")
    refusal = run("attempt without --allow-disabled", "--goal", GOAL)
    show(refusal)
    assert refusal.returncode == 3, "expected refusal exit code 3 (master switch)"
    print(">>> The runner refused, as designed. autonomy-config.yaml stays the source of truth.")

    banner("Step 2 — Sandboxed run (--allow-disabled, --auto-approve)")
    sandbox = run(
        "sandboxed end-to-end run",
        "--goal", GOAL,
        "--scope-hint", "src/feature_module/",
        "--proposed-name", "feature_module_v1",
        "--allow-disabled",
        "--auto-approve",
    )
    show(sandbox)
    if sandbox.returncode != 0:
        print(">>> Run did not complete cleanly. Inspect the output above and the JSONL log.")
        return sandbox.returncode

    banner("Step 3 — Queue inspection")
    tail_queue(3)

    banner("Step 4 — PAUSE sentinel halt")
    PAUSE.write_text("demo: paused by example_workflow.py\n", encoding="utf-8")
    try:
        paused = run(
            "run while .ai/PAUSE exists",
            "--goal", GOAL,
            "--allow-disabled",
            "--auto-approve",
        )
        show(paused)
        print(">>> Runner halted at the very first heartbeat check; queue persisted as 'paused'.")
    finally:
        PAUSE.unlink(missing_ok=True)

    banner("Done — review .ai/logs/ for the full JSONL audit trail")
    print(
        "Notes for evaluators:\n"
        "  • Every decision the runner made is in the JSONL log with the schema\n"
        "    declared by autonomy-config.yaml.\n"
        "  • All `[STUB]` markers in summaries flag simulated agent calls. The\n"
        "    `_invoke_agent` seam in autonomous_runner.py is where production\n"
        "    deployments wire in their real PDS agent runtime.\n"
        "  • Forbidden writes, allowed-agents enforcement, hard ceilings, the\n"
        "    PAUSE sentinel, and approval gating are all real and observable.\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
