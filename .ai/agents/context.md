# Agent Context Contract

**Scope**: All agents under [`.github/agents/`](../../.github/agents/)
**Last Updated**: 2026-06-03

> Every agent in this project follows the **same context lifecycle**: envelope-in → load → act → update-out. This file is the **single source of truth** for that lifecycle. Agents do not reinvent it; they declare a **Context Manifest** in their own `.agent.md` body that conforms to this contract.

---

## Contents

| Section | What's here |
|---|---|
| [The Three Layers](#the-three-layers) | Envelope, discovered context, persistent state |
| [Envelope Schema](#envelope-schema) | Structured payload passed between agents |
| [Load Sequence](#load-sequence) | Four ordered steps every agent runs at invocation start |
| [Per-Agent Manifest](#per-agent-manifest) | What each `.agent.md` must declare |
| [Persistent State](#persistent-state) | `.ai/agents/state/` for stateful managers only |
| [Update Protocol](#update-protocol) | How and when agents write state back |
| [Heartbeat Integration](#heartbeat-integration) | Re-loading context mid-task |
| [Hard Rules](#hard-rules) | Non-negotiables across all agents |

---

## The Three Layers

| Layer | What it is | Lifetime | Where it lives |
|---|---|---|---|
| **A. Envelope** | Task + scope + governance + prior-stage output, passed agent→agent | Per task | In-memory; structured by the [Envelope Schema](#envelope-schema) |
| **B. Discovered context** | Files the agent reads at invocation start | Per invocation | Filesystem; read by the agent's tools |
| **C. Persistent state** | What survives across invocations | Long-lived | `.ai/agents/state/<agent>/`, `.ai/knowledge/`, `.ai/logs/`, `.ai/foresight/` |

Workers (`scaffolder`, `generator`, `validator`, `tester`, `reviewer`) use only A + B — they are stateless. Managers (`curator`, `todo-manager`, `prompt-manager`, `workflow-manager`, `learner`) also use C.

---

## Envelope Schema

Every delegation between agents carries this payload. The Router populates the first three fields; subsequent agents add to it.

```json
{
  "schema_version": "1.0",
  "task": "<original user request, verbatim>",
  "scope_path": "<directory whose .ai/instruct.md is authoritative>",
  "scope_authority_file": "<scope_path>/.ai/instruct.md",
  "background_files": ["<ancestor .ai/instruct.md files>"],
  "governance_refs": [
    { "rule_id": "...", "path": ".ai/governance/<file>.md", "severity": "hard|advisory" }
  ],
  "stage": "scaffold|generate|validate|test|review|curate|learn|cleanup|todo|workflow|prompt",
  "previous_output": { "from_agent": "...", "shape": "...", "data": "..." },
  "trace_id": "<short id for log correlation>"
}
```

Constraints:
- `schema_version` is **required**; agents reject envelopes whose major version they don't understand. Bump only via the Curator + an entry in [`.ai/index.md`](../index.md).
- `scope_path` never widens during a single delegation — re-route through the Router instead.
- `governance_refs` is additive, never replaces `.ai/instruct.md`.
- `previous_output` is `null` on the first stage.
- `trace_id` flows through every audit log entry the agent writes.

This schema is enforced by the [`delegate-task`](tools/delegate-task.json) governed tool.

---

## Load Sequence

Every agent's first action is to **load its context** in this exact order. Codified by the [`load-context`](tools/load-context.json) governed tool.

1. **Run [`pause-check`](tools/pause-check.json)** — if `.ai/PAUSE` exists, halt immediately. This is the **first** load step, before envelope validation.
2. **Validate envelope** against the schema above, including `schema_version`. Reject malformed payloads back to the caller — never guess missing fields.
3. **Read declared files** from the agent's [Context Manifest](#per-agent-manifest) `Reads` list, deepest-scope first per the depth-priority resolver ([`engine/get_effective_instructions.py`](../engine/get_effective_instructions.py)). Respect the agent's [Context Budget](#context-budgets).
4. **Load persistent state** (managers only) from `.ai/agents/state/<agent>/`. If absent, treat as a cold start and proceed.
5. **Apply governance overlay** — for each `governance_refs[*]`, read the rule file and add its constraints to the working set. Keep them as a separate list; do not collapse into `.ai/instruct.md`.

Output of the load: an in-memory **context bundle** the agent reasons over for the rest of the invocation. The bundle is *not* written to disk.

---

## Per-Agent Manifest

Every `.agent.md` includes a `## Context Manifest` section with these subsections:

```markdown
## Context Manifest

### Inputs (envelope)
- task, scope_path, scope_authority_file, background_files, governance_refs
- previous_output: <expected shape, e.g., "scaffold JSON" or "null">

### Reads (in order)
- <scope_path>/.ai/instruct.md
- .ai/conventions.md
- ... (every file the agent depends on)

### State
- path: .ai/agents/state/<agent>/<file>.json   (omit if stateless)
- shape: <one-line description>
- update_policy: append | snapshot | replace-with-archive

### Outputs (envelope additions for the next agent)
- <field>: <shape>
```

The Validator and Reviewer use these manifests to detect drift between what an agent declares and what it actually reads.

---

## Persistent State

Per-agent durable state lives under `.ai/agents/state/<agent>/`. **Stateful agents only** — see the [decision matrix](#which-agents-are-stateful) below.

| Agent | State file | What it holds |
|---|---|---|
| `curator` | `last-reconciliation.json` | Timestamp + counts of last drift sweep; list of files reconciled |
| `todo-manager` | `seen-todos.json` | Hash of each TODO's `(source, line, text)` so duplicates aren't re-flagged |
| `prompt-manager` | `last-scan.json` | Last commit SHA scanned, last file inventory hash |
| `workflow-manager` | `last-scan.json` | Last commit SHA scanned, current workflow inventory snapshot |
| `learner` | uses [`.ai/knowledge/`](../knowledge/) instead | (already has its own facility) |

### Which agents are stateful

Workers (scaffolder, generator, validator, tester, reviewer), router, supervisor, and cleanup are **stateless** — they re-derive everything from envelope + filesystem each run. Adding state to a worker would couple it to history it should not have.

### State directory rules

- `.ai/agents/state/` is **gitignored**. State is per-clone, never pushed.
- Each agent's state file uses a stable schema declared in its manifest.
- Schema changes are versioned: bump a `schema_version` field; archive the previous file per [`maintenance.md`](../maintenance.md#archive-patterns) before replacing.
- Never store secrets, user content, or anything that violates [`credentials.md`](../credentials.md).

---

## Update Protocol

Agents write back to state/knowledge/logs at task end. Codified by the [`update-context`](tools/update-context.json) governed tool.

| Destination | Policy | Allowed operations |
|---|---|---|
| `.ai/agents/state/<agent>/` | snapshot or replace-with-archive | Append-and-rotate, or write new + archive old |
| `.ai/knowledge/` | append-only | Add new entries; refine existing ones; never rewrite history |
| `.ai/logs/` | append-only | Audit entries only; one line/event per agent action |
| `.ai/foresight/` | append-only | Foresight-engine output only |

Update steps (every agent):

1. Compute what changed during this invocation (entries added, files touched).
2. For state writes: archive the previous snapshot first if `update_policy = replace-with-archive`.
3. Emit one audit-log entry to `.ai/logs/` via [`log-action`](tools/log-action.json) — include `trace_id` from the envelope.
4. **Emit one metric line** to `.ai/logs/metrics-YYYY-MM-DD.jsonl` via [`record-metric`](tools/record-metric.json) — same `trace_id`. This is mandatory for every agent at every invocation, including read-only and stateless agents.
5. Hand back the agent's outputs (per the manifest's `Outputs` section) to the caller.

---

## Heartbeat Integration

[`heartbeat.md`](../heartbeat.md) already mandates re-reading the active scope every N steps. The context contract extends that:

- At each heartbeat, also **re-run step 2** of the load sequence (`Reads`) — files may have been edited mid-task by another agent.
- Persistent state is **not** re-loaded mid-task; that would create read/write races. State is loaded once at start and written once at end.
- If a heartbeat detects that a `Reads` file changed in a way that invalidates current work (e.g., the scope's `.ai/instruct.md` was edited), the agent stops and reports back to the Supervisor instead of continuing on stale rules.

---

## Hard Rules

- **Always run `pause-check` before anything else.** If `.ai/PAUSE` exists, the agent stops — no exceptions, no overrides except a human removing the file.
- **Always validate the envelope first.** Malformed payloads are rejected, not patched.
- **Always honor your Context Budget.** Reading more than the budget allows is a drift signal the validator will flag.
- **Never widen `scope_path` mid-task.** Re-route through the Router.
- **Never write outside the destinations declared in the manifest's `State`.** A stateless agent that writes to `.ai/agents/state/` is a bug.
- **Never collapse governance into `.ai/instruct.md`.** Keep them separate.
- **Never persist secrets, user content, or session-only data** to long-lived state. Audit logs are the exception (and follow [`credentials.md`](../credentials.md): never log secrets).
- **Every state mutation gets an audit-log entry** with the envelope's `trace_id`.
- **Schema changes are versioned and archived.** No silent state-shape migrations.

---

## Context Budgets

Reading is not free. Every agent declares a **budget** in its manifest — the maximum files and bytes it should pull into context per invocation. Going over the budget without justification is a drift signal the validator flags.

### Default budgets

| Agent class | Files (max) | Bytes (max) | Rationale |
|---|---|---|---|
| Workers (scaffolder, generator, tester) | 12 | 80 KB | One scope + immediate convention files |
| Reviewers (validator, reviewer) | 20 | 150 KB | Must cross-check more conventions |
| Routers (router) | 6 | 30 KB | Identifies scope only, no deep reads |
| Managers (curator, todo-manager, prompt-manager, workflow-manager, deployment-manager, environment-manager) | 30 | 250 KB | System-wide responsibility |
| Read-only explorers (project-explorer) | unbounded | 500 KB | Discovery role; still bounded |

### Rules

- An agent that needs more than its budget must call [`retrieve-knowledge`](tools/retrieve-knowledge.json) for **targeted** snippets instead of reading whole files.
- The budget is per **invocation**, not per heartbeat. A heartbeat reload counts against the same budget.
- Override the default by declaring a `Budget:` line in the agent's `Context Manifest`. The Reviewer enforces declared budgets in CI.
- The Validator emits `budget-exceeded` warnings when an agent's recorded reads (from logs) exceed its declared budget.
