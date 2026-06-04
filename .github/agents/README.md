# Agents Index

This template ships **21 agents** organized into three namespaces. Each agent is a constrained persona with a specific job — pick by namespace prefix, then by the "Invoke when…" column.

| Namespace | Role |
|---|---|
| `pds-pipe-*` | **Pipeline workers.** Do the actual work inside one resolved scope (scaffold → generate → validate → test → review → cleanup). Orchestrated by the supervisor. |
| `pds-man-*` | **Domain managers.** Maintain a single registry, surface, or convention end-to-end (naming, ports, prompts, workflows, version control, deployment, todos, environment). Read code, propose edits, hand off to other managers. |
| `pds-meta-*` | **System-level agents.** Operate on the AI-INSTRUCT system itself or across all scopes (router, explorer, observer, learner, compliance reviewer). |

> **Authority:** No agent overrides the depth-priority rule — the deepest `.ai/instruct.md` always wins. Agents augment that authority; they do not replace it.

## Pipeline (`pds-pipe-*`) — 7 agents

The standard build chain inside one scope. Invoked top-down by the supervisor.

| Agent | Invoke when… |
|---|---|
| [`pds-pipe-super`](pds-pipe-super.agent.md) | You need an end-to-end task within one scope and want sequencing handled. The supervisor delegates to scaffolder → generator → validator → tester → reviewer. |
| [`pds-pipe-scaffolder`](pds-pipe-scaffolder.agent.md) | You want a structured plan (no final code) before generation. |
| [`pds-pipe-generator`](pds-pipe-generator.agent.md) | A scaffold has been approved and you want final code/config produced. |
| [`pds-pipe-validator`](pds-pipe-validator.agent.md) | Read-only check that current state honors `.ai/` conventions and the scope's `instruct.md`. |
| [`pds-pipe-tester`](pds-pipe-tester.agent.md) | The generator output passed validation and you need tests written. |
| [`pds-pipe-reviewer`](pds-pipe-reviewer.agent.md) | Final instruction-drift review before the supervisor finalizes. |
| [`pds-pipe-cleanup`](pds-pipe-cleanup.agent.md) | Files need archiving (path-mirroring) — never deletion. Always archive-first. |

## Domain managers (`pds-man-*`) — 9 agents

Each owns one surface and is **consulted before** changes to that surface.

| Agent | Owns | Invoke when… |
|---|---|---|
| [`pds-man-naming`](pds-man-naming.agent.md) | 5 naming registries | Before creating, renaming, or registering **anything**: files, modules, agents, endpoints, tables, error codes, config vars. |
| [`pds-man-ports`](pds-man-ports.agent.md) | `.ai/ports.md` | Adding a service that listens on a port; resolving collisions; reconciling hardcoded ports vs registry. |
| [`pds-man-prompt`](pds-man-prompt.agent.md) | `.github/prompts/` | A workflow has been repeated ≥2 times and could become a slash command; or an existing prompt drifted from current code. |
| [`pds-man-workflow`](pds-man-workflow.agent.md) | `.github/workflows/` | CI/CD YAML needs adding/updating/retiring. |
| [`pds-man-versioncontrol`](pds-man-versioncontrol.agent.md) | Branch strategy, scope locks | Multi-developer coordination, merge validation, registry reconciliation across branches. Backs `/ai-git`. |
| [`pds-man-deployment`](pds-man-deployment.agent.md) | `.deployment/<mode>/` | A deployment mode's `instruct.md` drifted from code (env vars, services, ports, domains). |
| [`pds-man-environment`](pds-man-environment.agent.md) | Host-vs-container isolation | Before any command that could mutate the host (global installs, package managers, PATH changes). Never installs silently. |
| [`pds-man-todo`](pds-man-todo.agent.md) | `.github/todo/` | Project-level or per-module TODO maintenance, deduplication, aging. |
| [`pds-man-curator`](pds-man-curator.agent.md) | `.ai/instruct.md` files, `.ai/index.md`, `AGENTS.md`, `CLAUDE.md` | After every architectural change — keeps the instruction system itself current. **Edits only governance files; never source.** |

## System / meta (`pds-meta-*`) — 5 agents

Operate above any single scope.

| Agent | Invoke when… |
|---|---|
| [`pds-meta-router`](pds-meta-router.agent.md) | An incoming request needs to be routed to the deepest authoritative `.ai/instruct.md` and the right supervisor. Does no work itself — only routes. |
| [`pds-meta-explorer`](pds-meta-explorer.agent.md) | "Where is X?" / "How is Y wired?" — read-only navigation of the AI-INSTRUCT hierarchy. Never modifies files. |
| [`pds-meta-observer`](pds-meta-observer.agent.md) | Aggregate `.ai/logs/metrics-*.jsonl`, surface anomalies (token spikes, repeated failures, growing-file trends). |
| [`pds-meta-learner`](pds-meta-learner.agent.md) | Distill durable insights from a completed task into `.ai/knowledge/`. Proposes (does not apply) instruction edits via the curator. |
| [`pds-meta-compliance`](pds-meta-compliance.agent.md) | Read-only structural critic — catches monolithic drift, oversized files, leaky abstractions, duplication that should be a shared module. |

## Quick-pick decision tree

```
Need to do work?
├── Within one scope, end-to-end → pds-pipe-super
├── Just need a plan            → pds-pipe-scaffolder
├── Just need code              → pds-pipe-generator
├── Just need tests             → pds-pipe-tester
└── Just need to archive        → pds-pipe-cleanup

Touching a surface?
├── Naming anything new          → pds-man-naming (REQUIRED first)
├── A port                       → pds-man-ports
├── A slash command              → pds-man-prompt
├── A workflow yaml              → pds-man-workflow
├── Git branches / merges        → pds-man-versioncontrol
├── A deployment mode            → pds-man-deployment
├── Anything host-mutating       → pds-man-environment (REQUIRED first)
├── A todo                       → pds-man-todo
└── An .ai/ instruction file     → pds-man-curator

Need orientation or insight?
├── "Where is X?"                → pds-meta-explorer
├── Route a fresh request        → pds-meta-router
├── Health/metrics digest        → pds-meta-observer
├── Capture a lesson learned     → pds-meta-learner
└── Structural critique          → pds-meta-compliance
```

## See also

- [`.ai/index.md`](../../.ai/index.md) — master index of every instruction section.
- [`.github/copilot-instructions.md` → Custom Agents](../copilot-instructions.md#custom-agents-githubagents) — meta rules for adding agents.
- [`.github/schemas/agent-frontmatter.schema.json`](../schemas/agent-frontmatter.schema.json) — frontmatter contract.
