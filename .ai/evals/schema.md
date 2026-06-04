# Eval Schema

**Scope**: `.ai/evals/`
**Last Updated**: 2026-06-04

> Reference for the YAML contract every `.ai/evals/**/*.eval.yaml` must satisfy. The reference runner (`runner.py`) validates against this schema before evaluating expectations.

---

## Contents

| Section | What's here |
|---|---|
| [Top-level fields](#top-level-fields) | Required and optional fields |
| [Input](#input) | The `input` object |
| [Expectations](#expectations) | Expectation kinds and operands |
| [Result format](#result-format) | Runner output and exit codes |
| [Versioning](#versioning) | Schema version policy |

---

## Top-level fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (kebab-case) | yes | Stable identifier. Must be unique across all evals. |
| `description` | string | yes | One-line, human-readable claim. |
| `scope` | string (workspace-relative path) | yes | Path the eval is anchored to. Used by the depth-priority resolver. `.` = workspace root. |
| `input` | object | yes | Scenario input. See [Input](#input). |
| `expectations` | list | yes | One or more expectations. See [Expectations](#expectations). |
| `severity` | enum | no | `high` (default), `medium`, `low`. Controls runner exit code. |
| `tags` | list[string] | no | Free-form labels (e.g., `routing`, `naming`, `autonomous`). |
| `requires_runtime` | enum | no | `static` (default), `dynamic`. `dynamic` evals are skipped unless `--trace` is provided. |
| `disabled` | bool | no | If `true`, the runner skips this eval and reports it as `skipped`. Use sparingly; prefer deletion. |

---

## Input

The `input` object is intentionally minimal in the static path. Each runner may extend it for its own dynamic mode.

```yaml
input:
  prompt: "..."           # the user prompt under evaluation
  active_agent: "..."     # optional; agent the prompt is addressed to
  deploy_mode: "..."      # optional; sets DEPLOY_MODE for resolution
```

---

## Expectations

Each expectation is an object with a `kind` field. The reference runner ships these kinds:

| `kind` | Operands | Static? | Meaning |
|---|---|---|---|
| `scope-authority` | `equals` (path) | yes | The deepest `.ai/instruct.md` for `scope` must match this path. |
| `background-includes` | `includes` (list of paths) | yes | All listed `.ai/instruct.md` files must appear as background context for `scope`. |
| `governed-tools-consulted` | `includes` (list of tool names) | yes | Each named tool must exist under `.ai/agents/tools/` or `.ai/mcp/tools/`. Dynamic mode additionally checks the trace. |
| `registry-touched` | `equals` or `includes` (registry file path) | yes | The given registry file(s) must exist. Dynamic mode checks they were updated in the trace. |
| `forbidden` | `excludes` (list of tool names) | yes | None of the listed governed tools may exist *in the trace*. Static mode confirms they exist as definitions, then defers the trace check. |
| `file-pattern` | `path` (glob), `expect` (`exists` \| `absent`) | yes | Asserts a file pattern's presence or absence under `scope`. |
| `frontmatter-field` | `file`, `field`, `equals` | yes | Asserts a YAML-frontmatter field on a `.agent.md`/`.prompt.md`/`SKILL.md`. |

Expectations are **AND**-combined within an eval. If any expectation fails, the eval fails.

---

## Result format

The runner emits one record per eval, JSON Lines on `--json`:

```json
{
  "id": "routing-delegation-001",
  "status": "pass",         // pass | fail | skipped | error
  "severity": "high",
  "duration_ms": 4,
  "failures": [             // present only on fail/error
    { "kind": "scope-authority", "expected": ".ai/instruct.md", "got": "..." }
  ]
}
```

Aggregate exit code policy:

| Outcome | Exit code |
|---|---|
| All `high` evals pass | `0` |
| Any `high` fail | `1` |
| Any `medium` fail (no `high` failures) | `0`, with warning summary |
| Any `low` fail | `0`, informational |
| Schema or IO error | `2` |

---

## Versioning

This schema is `1.0`. Backward-incompatible changes bump the major; additive optional fields bump the minor. Evals may declare a `schema_version` top-level field; if absent, `1.0` is assumed.
