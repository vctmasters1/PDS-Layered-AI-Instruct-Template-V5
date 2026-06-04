"""
PDS AI-INSTRUCT — Python MCP server.

Exposes the project's governed tools (`.ai/agents/tools/*.json`) and
depth-priority instruction resolver as Model Context Protocol tools, so any
MCP-aware client (VS Code Copilot, Cursor, Continue, Cline, Claude Code, etc.)
can consult them through one consistent interface.

Tools exposed:
  - resolve_instructions(path)        depth-priority `.ai/instruct.md` walk
  - resolve_deployment_mode()          read $DEPLOY_MODE + matching scope file
  - list_governed_tools()              enumerate `.ai/agents/tools/*.json`
  - get_governed_tool(name)            return one tool's full spec
  - list_deployment_modes()            enumerate `.deployment/<mode>/`
  - read_instruction(path)             read any `.ai/instruct.md` by path

This server is **advisory**: it returns checklists + structured metadata,
not effects. The calling agent performs the actions in its own environment.
That keeps the MCP surface safe by construction (read-only) and tool-neutral.

Run:
    python -m pds_mcp.server                 # stdio (default; what MCP clients use)
    python -m pds_mcp.server --workspace .   # explicit workspace root

Requires: `pip install "mcp>=1.0"`
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

try:
    from mcp.server.fastmcp import FastMCP
except ImportError as e:
    sys.stderr.write(
        "ERROR: the `mcp` package is not installed.\n"
        "Install with: pip install \"mcp>=1.0\"\n"
    )
    raise SystemExit(1) from e


# ── workspace resolution ────────────────────────────────────────────────────

def _resolve_workspace(arg: str | None) -> Path:
    if arg:
        return Path(arg).resolve()
    env = os.environ.get("PDS_WORKSPACE")
    if env:
        return Path(env).resolve()
    # Walk up from this file looking for the marker directory `.ai/`
    here = Path(__file__).resolve()
    for parent in [here, *here.parents]:
        if (parent / ".ai").is_dir() and (parent / ".github").is_dir():
            return parent
    return Path.cwd().resolve()


parser = argparse.ArgumentParser(prog="pds-mcp")
parser.add_argument("--workspace", help="Workspace root (defaults to PDS_WORKSPACE env or auto-detected)")
args, _ = parser.parse_known_args()
WORKSPACE = _resolve_workspace(args.workspace)

if not (WORKSPACE / ".ai").is_dir():
    sys.stderr.write(f"ERROR: no .ai/ directory at {WORKSPACE}\n")
    raise SystemExit(2)


# ── server ──────────────────────────────────────────────────────────────────

mcp = FastMCP(
    "pds-ai-instruct",
    instructions=(
        "PDS Depth-Priority Hierarchical AI-INSTRUCT. Use `resolve_instructions` "
        "to find the authoritative `.ai/instruct.md` for any path. Use "
        "`get_governed_tool` before performing any action that has a matching "
        "tool definition (e.g., `consult-naming`, `archive-file`, `append-todo`)."
    ),
)


# ── helpers ─────────────────────────────────────────────────────────────────

def _read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def _safe_relative(p: Path) -> str:
    try:
        return str(p.relative_to(WORKSPACE)).replace("\\", "/")
    except ValueError:
        return str(p)


def _is_inside_workspace(p: Path) -> bool:
    try:
        p.resolve().relative_to(WORKSPACE)
        return True
    except ValueError:
        return False


# ── tools ───────────────────────────────────────────────────────────────────

@mcp.tool()
def resolve_instructions(path: str = ".") -> dict[str, Any]:
    """
    Walk from the workspace root down to `path` and collect every
    `.ai/instruct.md` along the way. The deepest is authoritative; shallower
    files are background context.

    Returns:
        {
          "scope_authority_file": "<deepest .ai/instruct.md, repo-relative>",
          "background_files": ["<shallower .ai/instruct.md>", ...],
          "active_deployment_mode": "<DEPLOY_MODE if set, else null>",
          "deployment_authority_file": "<.deployment/<mode>/.ai/instruct.md if active, else null>"
        }
    """
    target = (WORKSPACE / path).resolve() if not Path(path).is_absolute() else Path(path).resolve()
    if not _is_inside_workspace(target):
        raise ValueError(f"path {path!r} is outside the workspace")

    chain: list[Path] = []
    cursor = target if target.is_dir() else target.parent
    while True:
        candidate = cursor / ".ai" / "instruct.md"
        if candidate.is_file():
            chain.append(candidate)
        if cursor == WORKSPACE:
            break
        cursor = cursor.parent

    chain.reverse()  # shallowest → deepest

    result: dict[str, Any] = {
        "scope_authority_file": _safe_relative(chain[-1]) if chain else None,
        "background_files": [_safe_relative(p) for p in chain[:-1]],
        "active_deployment_mode": None,
        "deployment_authority_file": None,
    }

    mode = os.environ.get("DEPLOY_MODE")
    if mode:
        mode_file = WORKSPACE / ".deployment" / mode / ".ai" / "instruct.md"
        if mode_file.is_file():
            result["active_deployment_mode"] = mode
            result["deployment_authority_file"] = _safe_relative(mode_file)
        else:
            result["active_deployment_mode"] = mode  # set but unknown
    return result


@mcp.tool()
def resolve_deployment_mode() -> dict[str, Any]:
    """Report the active DEPLOY_MODE and list available modes under `.deployment/`."""
    deployment_dir = WORKSPACE / ".deployment"
    available: list[dict[str, str]] = []
    if deployment_dir.is_dir():
        for child in sorted(deployment_dir.iterdir()):
            instruct = child / ".ai" / "instruct.md"
            if child.is_dir() and instruct.is_file():
                available.append({
                    "mode": child.name,
                    "authority_file": _safe_relative(instruct),
                })
    active = os.environ.get("DEPLOY_MODE")
    return {
        "active": active,
        "active_authority_file": (
            _safe_relative(deployment_dir / active / ".ai" / "instruct.md")
            if active and (deployment_dir / active / ".ai" / "instruct.md").is_file()
            else None
        ),
        "available": available,
    }


@mcp.tool()
def list_governed_tools() -> list[dict[str, Any]]:
    """Enumerate every governed-tool JSON under `.ai/agents/tools/` and `.ai/mcp/tools/`."""
    out: list[dict[str, Any]] = []
    for root in [WORKSPACE / ".ai" / "agents" / "tools", WORKSPACE / ".ai" / "mcp" / "tools"]:
        if not root.is_dir():
            continue
        for jf in sorted(root.glob("*.json")):
            try:
                spec = json.loads(_read_text(jf))
            except json.JSONDecodeError:
                continue
            out.append({
                "tool_name": spec.get("tool_name", jf.stem),
                "description": spec.get("description", ""),
                "safety_level": spec.get("safety_level", "unknown"),
                "requires_approval": spec.get("requires_approval", False),
                "source": _safe_relative(jf),
            })
    return out


@mcp.tool()
def get_governed_tool(name: str) -> dict[str, Any]:
    """
    Return the full spec for one governed tool, including its checklist and
    safety metadata. The calling agent executes the checklist; this server
    does not perform the actions.
    """
    for root in [WORKSPACE / ".ai" / "agents" / "tools", WORKSPACE / ".ai" / "mcp" / "tools"]:
        candidate = root / f"{name}.json"
        if candidate.is_file():
            spec = json.loads(_read_text(candidate))
            spec["_source"] = _safe_relative(candidate)
            return spec
    raise FileNotFoundError(f"governed tool {name!r} not found")


@mcp.tool()
def read_instruction(path: str) -> dict[str, Any]:
    """
    Read an instruction file. `path` must be repo-relative and point to a file
    under `.ai/`, `.deployment/`, `AGENTS.md`, `CLAUDE.md`, or
    `.github/copilot-instructions.md`. Anything else is refused.
    """
    target = (WORKSPACE / path).resolve()
    if not _is_inside_workspace(target):
        raise ValueError("path is outside the workspace")
    if not target.is_file():
        raise FileNotFoundError(_safe_relative(target))

    rel = target.relative_to(WORKSPACE).as_posix()
    allowed = (
        rel.startswith(".ai/")
        or rel.startswith(".deployment/")
        or rel.startswith(".github/copilot-instructions")
        or rel in {"AGENTS.md", "CLAUDE.md"}
    )
    if not allowed:
        raise PermissionError(
            f"{rel!r} is not an instruction surface; this tool only reads .ai/, "
            ".deployment/, AGENTS.md, CLAUDE.md, .github/copilot-instructions.md"
        )

    return {"path": rel, "content": _read_text(target)}


# ── entry point ─────────────────────────────────────────────────────────────

def main() -> None:
    mcp.run()  # stdio transport (default)


if __name__ == "__main__":
    main()
