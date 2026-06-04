# Agent runtime convention

**Scope**: `.github/agents/`
**Last Updated**: 2026-06-04

> Frontmatter `tools:` whitelists are honored when the agent is invoked through chat-mode (`@pds-pipe-super`, `@pds-meta-explorer`, etc.). They are **not** reliably honored when the agent is dispatched via the `runSubagent` tool in current VS Code Copilot builds — subagents receive a near-empty toolset regardless of frontmatter.
>
> This file defines the `runtime:` field convention so the limitation is explicit, machine-checkable, and route-aware.

---

## Contents

| Section | What's here |
|---|---|
| [The `runtime:` field](#the-runtime-field) | Field definition |
| [Values](#values) | `chat-only` \| `subagent-safe` \| `either` |
| [How agents and orchestrators use it](#how-agents-and-orchestrators-use-it) | Routing rules |
| [Migration](#migration) | What to do for existing agents |

---

## The `runtime:` field

Add a top-level `runtime:` field to any `.agent.md` frontmatter:

```yaml
---
description: Read-only codebase exploration agent.
runtime: chat-only        # chat-only | subagent-safe | either
tools:
  - file_search
  - grep_search
  - read_file
---
```

If absent, agents default to `runtime: chat-only`. This is the safe default because the chat path is where `tools:` whitelists are reliably enforced today.

---

## Values

| Value | Meaning | When to use |
|---|---|---|
| `chat-only` | The agent depends on its `tools:` whitelist being enforced and on conversational context. Do not dispatch via `runSubagent`. | Anything that needs scoped tool access (read-only explorers, registry curators, reviewers). |
| `subagent-safe` | The agent does not rely on tool restriction or chat context — its work is well-defined enough to run in a near-empty toolset, or it explicitly performs only file reads available in the subagent toolset. | Tightly scoped research/audit agents whose only behavior is "read these files and report." |
| `either` | The agent works in both modes. The orchestrator may pick. | Rare; reserved for stateless utility agents. |

A subagent-safe agent must declare in its body what minimum tools it actually needs and gracefully degrade if they are absent.

---

## How agents and orchestrators use it

- **Orchestrators** (`pds-pipe-super`, `pds-meta-router`, `/ai-route`) MUST consult the `runtime:` field before delegating. A `chat-only` agent is invoked by emitting a `@<agent-name>` mention or a slash command, never via `runSubagent`.
- **Validators** check that every `.agent.md` either declares `runtime:` or accepts the `chat-only` default.
- **Authors** of new agents who want subagent dispatch must explicitly set `runtime: subagent-safe` and accept the implication that `tools:` is advisory in that path.

---

## Migration

Existing agents in this template default to `chat-only` without modification — no edit required. Add an explicit `runtime:` line only if:

1. You need a particular agent to be safely dispatchable via `runSubagent`, **and**
2. You have audited the agent's body for assumptions about tool availability.

Until the platform fixes tool-passthrough for `runSubagent`, do not mark agents `subagent-safe` lightly.
