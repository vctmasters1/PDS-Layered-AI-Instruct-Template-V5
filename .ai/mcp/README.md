# `.ai/mcp/` — Model Context Protocol server

> An MCP server bundled with this template. It exposes the project's governed tools and depth-priority instruction resolver to any MCP-aware client (VS Code Copilot, Cursor, Continue, Cline, Claude Code, etc.) over a single, tool-neutral interface.

---

## Contents

| Section | What's here |
|---|---|
| [What it exposes](#what-it-exposes) | The MCP tools surfaced to clients |
| [Two implementations, one contract](#two-implementations-one-contract) | Python + Node parity |
| [Install](#install) | Setup steps |
| [Wire to clients](#wire-to-clients) | Client configuration |
| [Workspace resolution](#workspace-resolution) | How the server finds the workspace |
| [Adding a project-specific tool](#adding-a-project-specific-tool) | Extending the tool catalog |
| [Why this design](#why-this-design) | Design rationale |

## What it exposes

| Tool | Purpose |
|---|---|
| `resolve_instructions(path)` | Walk from workspace root down to `path`; return the authoritative `.ai/instruct.md` plus background files. Includes the active `DEPLOY_MODE` scope if set. |
| `resolve_deployment_mode()` | Report the active `DEPLOY_MODE` and every available mode under `.deployment/`. |
| `list_governed_tools()` | Enumerate every governed tool in `.ai/agents/tools/` and `.ai/mcp/tools/`. |
| `get_governed_tool(name)` | Return one tool's full spec — checklist, safety level, payload schema. |
| `read_instruction(path)` | Read any instruction file under `.ai/`, `.deployment/`, `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`. Refuses anything else. |

The server is **advisory and read-only**: it returns checklists and structured metadata. The calling agent executes the steps in its own environment. This keeps the MCP surface safe by construction.

## Two implementations, one contract

Both servers expose the same tool set and read the same `.ai/` tree. Pick whichever runtime suits your project — the choice is invisible to MCP clients.

| Variant | Path | SDK |
|---|---|---|
| **Python** (primary) | [`python/`](python/) | [`mcp`](https://pypi.org/project/mcp/) (PyPI) |
| **Node** (twin) | [`node/`](node/) | [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) |

## Install

### Python

```bash
cd .ai/mcp/python
pip install -e .
```

### Node

```bash
cd .ai/mcp/node
npm install
```

## Wire to clients

Each tool reads its own pointer file. The pointers all reference *this* server; do not duplicate server logic per tool.

| Tool | Pointer file |
|---|---|
| VS Code Copilot | [`.vscode/mcp.json`](../../.vscode/mcp.json) |
| Cursor | [`.cursor/mcp.json`](../../.cursor/mcp.json) |
| Continue | `~/.continue/config.json` (per-user) — see [`.continue/rules/project.md`](../../.continue/rules/project.md) |
| Cline | configured via Cline UI; point `command` at `python -m pds_mcp` |
| Claude Code | `claude_desktop_config.json` (per-user) — same `command` shape |

## Workspace resolution

The server discovers its workspace in this order:

1. `--workspace <path>` CLI flag.
2. `PDS_WORKSPACE` environment variable.
3. Walk up from the server file looking for a directory containing both `.ai/` and `.github/`.
4. Fallback: current working directory.

If no `.ai/` directory is found, the server exits with code 2.

## Adding a project-specific tool

Project-specific governed tools go in [`.ai/mcp/tools/*.json`](tools/) (this directory exists; it is intentionally empty in the template). Drop a JSON file with the same shape as `.ai/agents/tools/consult-naming.json`:

```json
{
  "tool_name": "kebab-case-name",
  "description": "...",
  "checklist": ["1. ...", "2. ..."],
  "safety_level": "low|medium|high",
  "requires_approval": false
}
```

The MCP server picks it up on next start and exposes it via `list_governed_tools` / `get_governed_tool`. Always consult the [`naming`](../../.github/agents/pds-man-naming.agent.md) agent (Mode 3) before adding one.

## Why this design

- **Read-only by default.** Effectful operations stay with the host editor's tools (file I/O, terminal, git). The MCP server only returns plans + metadata.
- **Tool-neutral.** Same wire protocol for every editor; no per-editor adapter.
- **Single source of truth.** Tools live in `.ai/agents/tools/*.json` — the MCP server is just a transport.
- **Cross-runtime parity.** Python and Node twins keep deployments flexible; pick whichever your team already has installed.
