# Reference Implementation — PDS Autonomous Layer

> **Audience**: Technical evaluators assessing whether the autonomous
> scaffold is production-ready.
>
> **Status**: Reference implementation. The orchestration loop, gating, and
> safety paths are real and exercised end-to-end. Agent calls themselves
> are **simulated** behind a clearly-marked `[STUB]` so the contract can be
> validated without an LLM bridge or sensitive-data exposure.

---

## Contents

| Section | Purpose |
|---|---|
| [What This Demonstrates](#what-this-demonstrates) | Concrete claims this implementation backs up |
| [Files](#files) | What lives in this folder |
| [How To Run](#how-to-run) | Two-command demo |
| [Expected Output](#expected-output) | What a successful run looks like |
| [Safety Controls](#safety-controls) | Every stop, gate, and refusal you can observe |
| [Going to Production](#going-to-production) | The single seam to swap |
| [Limitations](#limitations) | What this is not |

---

## What This Demonstrates

The PDS autonomous layer in [`.ai/autonomous/`](../) is not theoretical. This
folder gives you executable proof of:

1. **Bounded loop** — `autonomous_runner.py` implements `orchestrator.md` →
   "The Loop" exactly: select agent → safety guard → approval gate → invoke →
   log → persist. Single-threaded, idempotent persistence between iterations.
2. **Allowed-agents enforcement** — Any request to an agent outside
   `autonomy-config.yaml.allowed_agents` is rejected by the runner before
   the agent is ever called. The forbidden list (`pds-man-curator`,
   `pds-meta-learner`) is hard-coded as a second line of defence.
3. **Forbidden-write guard** — Planned writes to `.env`, `secrets/`,
   `.ai/governance/`, `.ai/index.md`, any `.ai/instruct.md`, `*.pem`, or
   `*.key` are refused at the orchestrator level. The agent never sees the
   request.
4. **Hard ceilings** — `max_steps`, `max_wall_clock_minutes`, and
   `max_files_modified` are enforced strictly. CLI overrides cannot loosen
   the YAML ceiling, only tighten it.
5. **PAUSE sentinel** — Creating `.ai/PAUSE` halts every active run at the
   next iteration. Demonstrated by `example_workflow.py` Step 4.
6. **Human-in-the-loop** — Default approval mode is `always`. The runner
   blocks on stdin before each agent hand-off and writes the decision
   (`auto` / `human` / `denied`) into the audit log.
7. **Append-only audit trail** — Every step writes one JSONL line at
   `.ai/logs/autonomous-YYYY-MM-DD.jsonl` with the exact 10 fields declared
   by `autonomy-config.yaml.logging.required_fields`. The summary fields are
   length-capped at 200 chars so a misbehaving backend cannot poison the log.
8. **Crash-safe queue** — `.ai/autonomous/queue.jsonl` gets one append per
   state transition (last-write-wins by `goal_id`). A torn write loses at
   most the last line.
9. **Sanitisation** — Goals are rejected if they exceed 500 chars, contain
   shell metacharacters, or match a known credential pattern.

Operational specifics this implementation honors:

- **Zero third-party dependencies.** Pure Python stdlib. The supply chain
  for this runner is exactly the Python interpreter you ship.
- **No data egress.** The simulated backend produces deterministic output;
  nothing leaves the runner. The log file format is designed to be safe to
  forward to a SIEM unchanged.
- **Default off.** `autonomy-config.yaml.enabled: false` means the runner
  refuses to start. `--allow-disabled` is required for sandbox demos and is
  itself logged.

---

## Files

| File | Purpose |
|---|---|
| [`autonomous_runner.py`](autonomous_runner.py) | The runner. ~600 LOC, no third-party deps, senior-engineer readable. |
| [`example_workflow.py`](example_workflow.py) | End-to-end demo: master-switch refusal, full pipeline run, queue inspection, PAUSE-sentinel halt. |
| [`README.md`](README.md) | This file. |
| `.gitignore` | Excludes runtime artefacts only. |

The runner generates two artefacts when it runs (both are gitignored at the
repo level):

- `.ai/logs/autonomous-YYYY-MM-DD.jsonl` — append-only step log
- `.ai/autonomous/queue.jsonl` — last-write-wins goal state

---

## How To Run

From the repository root:

```powershell
# The full guided demo (master-switch refusal, run, PAUSE halt).
python .ai/autonomous/reference-implementation/example_workflow.py
```

Or invoke the runner directly:

```powershell
# Default: human-in-the-loop, blocks on stdin before every agent.
python .ai/autonomous/reference-implementation/autonomous_runner.py `
  --goal "Add a /healthz endpoint to api/" `
  --allow-disabled

# Non-interactive demo. Still respects every stop and safety gate.
python .ai/autonomous/reference-implementation/autonomous_runner.py `
  --goal "Implement feature_module_v1 module" `
  --scope-hint "src/feature_module/" `
  --proposed-name "feature_module_v1" `
  --allow-disabled `
  --auto-approve
```

Exit codes:

| Code | Meaning |
|---|---|
| `0` | Run completed cleanly. |
| `1` | Unhandled exception (traceback printed). Recoverable with `/ai-autonomous-resume <goal_id>`. |
| `2` | Could not load `autonomy-config.yaml`. |
| `3` | `enabled: false` and `--allow-disabled` not passed. The default safe state. |
| `4` | CLI override tried to loosen a YAML ceiling. |
| `5` | Run halted (paused / aborted / safety violation). Inspect queue + log. |
| `130` | KeyboardInterrupt. State is persisted. |

---

## Expected Output

A successful 8-step run looks like this:

```text
=== PDS Autonomous Runner — reference implementation ===
goal_id will be issued at preflight; queue at .ai\autonomous\queue.jsonl
step log at .ai\logs\autonomous-2026-06-04.jsonl
approval mode: always; auto_approve=True

  step 1: about to invoke agent 'pds-meta-router'
    ...
  step 8: about to invoke agent 'pds-pipe-reviewer'
    ...

=== run complete ===
goal_id     : 01KT980795K9QR5KZZX7SF6769
status      : completed
steps       : 8
files (sim) : ['feature_module_v1/__init__.py',
               'feature_module_v1/core.py',
               'feature_module_v1/tests/test_core.py']
stop_reason : pipeline returned no further work
```

The corresponding JSONL log entries (one per step) match the schema in
`autonomy-config.yaml.logging.required_fields`:

```json
{"agent": "pds-pipe-reviewer", "approval": "auto", "duration_ms": 0,
 "goal_id": "01KT980795K9QR5KZZX7SF6769",
 "input_summary": "Final instruction-drift review",
 "outcome": "success",
 "output_summary": "[STUB] Reviewer: APPROVED — archive-first respected, ...",
 "safety_level": "low", "step_index": 8,
 "timestamp": "2026-06-04T11:58:50Z"}
```

---

## Safety Controls

You can observe every one of these by running `example_workflow.py` and
inspecting the log:

| Control | Where it fires | How to trigger |
|---|---|---|
| Master switch | Pre-flight, before any agent | Run without `--allow-disabled` (default) |
| Allowed agents | Per-step, before invocation | Set `request.agent = "pds-man-curator"` in a custom backend |
| Forbidden writes | Per-step, before invocation | Set `planned_writes = [".env"]` in a custom backend |
| Hard step ceiling | Per-iteration | Set `--max-steps` higher than YAML; refused with exit 4 |
| PAUSE sentinel | Per-iteration + heartbeat | `New-Item .ai/PAUSE` and rerun |
| Approval gate | Before each agent (default `always`) | Run without `--auto-approve` |
| Goal sanitiser | Pre-flight | `--goal "rm -rf /"` → rejected |
| Failure streak | After 3 consecutive `BLOCK`/`error` | Force a backend that returns `BLOCK` 3 times |

---

## Going to Production

The runner is intentionally agnostic about *how* an agent gets invoked. The
single seam is:

```python
class AgentBackend:
    def invoke(self, request: AgentRequest) -> AgentResult:
        ...
```

`SimulatedAgentBackend` is the demo implementation. To go live, subclass
`AgentBackend` and dispatch to your real PDS agent runtime — Copilot Chat,
an MCP server, an internal LLM gateway, a CLI agent, whatever you already
trust. Wire it into `main()` by replacing the line:

```python
backend = SimulatedAgentBackend()
```

Everything else — the gating, the logging, the queue, the PAUSE handling,
the safety guards — is the production code. It does not change when you
swap the backend.

Recommended production hardening on top of this reference:

1. Replace the stdin `ApprovalGate` with a Slack / ServiceNow / internal
   review portal integration. The runner only relies on the boolean return
   plus `decision_source`; the rest is already abstracted.
2. Run the runner inside a sandboxed user (no host package install rights)
   and a chroot/container with the project mounted read-write but `/etc`,
   `~`, and `/usr` read-only. The runner does not modify the host; the
   guard is a defense-in-depth measure.
3. Forward `.ai/logs/autonomous-*.jsonl` to your SIEM in real time. The
   schema is stable and PII-free by construction.
4. Add a watchdog process that creates `.ai/PAUSE` whenever upstream alerts
   fire (e.g. cost overrun, anomaly detection on the JSONL stream). The
   runner halts at the next iteration with no special integration needed.

---

## Limitations

- **Simulated agents.** Default outputs are deterministic stubs. The shape
  of each agent's contribution is honored; the content is not. This is
  deliberate — production swaps the backend.
- **No multi-tenant isolation.** This reference assumes one developer at
  one project. The version-control agent (`pds-man-versioncontrol`) is
  already in `allowed_agents` and would be the entry point for
  scope-locking; that integration is left for the production deployment.
- **Approval timeout is wall-clock.** The reference uses a blocking stdin
  read; the timeout field in YAML is informational. Production gates should
  enforce it via their own asynchronous mechanism.
- **YAML reader is restricted.** Only the keys the runner consults are
  parsed. The full YAML stays the source of truth for humans, validators,
  and other tools.
