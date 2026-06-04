# `.ai/evals/` — Behavioral Eval Harness

**Scope**: Project-wide
**Last Updated**: 2026-06-04

> Convention-shaped validation (`/ai-validate`) checks naming, file shape, registry membership. **It does not check whether the agents actually behave correctly.** This directory is where behavioral evals live: golden traces and structured scenarios that pin down expected agent decisions and outputs.
>
> Evals are **not** unit tests for code. They are reproducible scenarios that pin down what an agent (or chain of agents) is *supposed to do* when given a representative input.

---

## Contents

| Section | What's here |
|---|---|
| [Why behavioral evals](#why-behavioral-evals) | The case for this layer |
| [Layout](#layout) | Directory structure |
| [Eval schema](#eval-schema) | YAML contract |
| [Running evals](#running-evals) | The runner |
| [What a good eval looks like](#what-a-good-eval-looks-like) | Authoring guidance |
| [CI integration](#ci-integration) | How to wire it |

---

## Why behavioral evals

The framework already has:

- **Drift validator** — checks structure, naming, indices.
- **Foresight engine** — predicts gaps before action.
- **Audit logs** — record what happened after the fact.

What's missing is a *forward-looking* check that says "given this user prompt and this scope, the supervisor agent should delegate to X, the validator should flag Y, and the final artifact should match Z." Behavioral evals close that gap.

They become valuable once you have:

- ≥5 routine AI workflows the team relies on (e.g., "add an API endpoint," "add a config var," "scaffold a module").
- A second tier of contributors who don't know the framework intimately and benefit from regression coverage on agent behavior.
- Any autonomous-tier task whose stop conditions you'd want to prove.

If you don't have those yet, skip this directory until you do.

---

## Layout

```
.ai/evals/
├── README.md            ← this file
├── schema.md            ← detailed YAML contract
├── runner.py            ← reference runner; pure stdlib, no external deps
├── examples/            ← starter evals (generic; safe to keep or delete)
│   ├── routing-delegation.eval.yaml
│   ├── naming-gate.eval.yaml
│   └── instruction-resolution.eval.yaml
└── results/             ← runtime output (gitignored)
```

`results/` is gitignored. Examples in `examples/` are deliberately generic so adopters can copy them as starting points; delete or rewrite them once the project has its own.

---

## Eval schema

Each eval is a single YAML file ending in `.eval.yaml`. Minimum fields:

```yaml
id: routing-delegation-001          # stable, kebab-case
description: Supervisor delegates "add config var" tasks to the generator.
scope: .                            # workspace path the eval is anchored to
input:
  prompt: "Add a new config variable FOO_BAR for the feature flag."
expectations:
  - kind: scope-authority           # which .ai/instruct.md should be authoritative
    equals: .ai/instruct.md
  - kind: governed-tools-consulted  # which tool checklists must appear in the trace
    includes:
      - consult-naming
      - generate-config-var
  - kind: registry-touched
    equals: .ai/config-vars.md
  - kind: forbidden
    excludes:
      - apply-safe-change           # this eval should NOT mutate code
severity: high                      # high | medium | low — affects CI exit code
```

See [`schema.md`](schema.md) for the full field reference.

The schema is **declarative and tool-neutral**: it describes expectations, not the runtime that produced them. The same eval can be replayed against any compliant runner (Python reference runner, an MCP-based runner, a CI shell script, etc.).

---

## Running evals

```bash
# Static evaluation (no model calls): checks structural expectations only —
# scope-authority resolution, governed-tool existence, registry presence.
python .ai/evals/runner.py

# Run a single eval
python .ai/evals/runner.py --eval routing-delegation-001

# Emit JSON for CI
python .ai/evals/runner.py --json > .ai/evals/results/last.json
```

The reference runner verifies the **static, deterministic** parts of each eval — the parts that don't require an LLM call. That's intentionally most of what matters: scope resolution, governed-tool wiring, registry membership, forbidden-action detection.

For **dynamic** evals (actually invoking an agent and grading its trace), wire the runner's `--trace` mode to your client of choice. The schema is stable; the runner is replaceable.

---

## What a good eval looks like

- **One claim per eval.** "Supervisor delegates X to Y" is one eval; "supervisor delegates X to Y and produces a valid artifact" is two.
- **Anchored to a scope.** Always set `scope:` so the depth-priority resolver runs against a real path.
- **Falsifiable.** If every expectation is "includes," the eval will pass even when the agent does too much. Use `excludes` and `equals` to pin behavior down.
- **Cheap.** Static checks first; only add dynamic checks for the handful of behaviors that actually drift.
- **Generic in this template, specific in your project.** The examples here describe the framework's own contracts. Replace them as your domain emerges.

---

## CI integration

Add to your CI workflow after the drift validator step:

```yaml
- name: Behavioral evals
  run: python .ai/evals/runner.py --json
```

Exit code is non-zero if any eval at `severity: high` fails. `medium` failures warn; `low` are informational. Tune in your runner config.

The runner is pure stdlib — no extra installs needed for the static path.
