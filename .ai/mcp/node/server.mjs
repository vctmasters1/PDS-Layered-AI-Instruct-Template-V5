#!/usr/bin/env node
/**
 * PDS AI-INSTRUCT — Node MCP server (twin of pds_mcp Python server).
 *
 * Exposes the same tools as the Python server. Use whichever runtime your
 * environment prefers; both speak stdio MCP and read the same `.ai/` tree.
 *
 * Run:
 *   node server.mjs                       (auto-detects workspace)
 *   PDS_WORKSPACE=/path/to/repo node server.mjs
 *
 * Requires: `npm install @modelcontextprotocol/sdk zod`
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// ── workspace resolution ────────────────────────────────────────────────────

async function resolveWorkspace() {
  const argIdx = process.argv.indexOf("--workspace");
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return path.resolve(process.argv[argIdx + 1]);
  }
  if (process.env.PDS_WORKSPACE) return path.resolve(process.env.PDS_WORKSPACE);

  const here = path.dirname(fileURLToPath(import.meta.url));
  let cursor = here;
  while (true) {
    try {
      const aiStat = await fs.stat(path.join(cursor, ".ai"));
      const ghStat = await fs.stat(path.join(cursor, ".github"));
      if (aiStat.isDirectory() && ghStat.isDirectory()) return cursor;
    } catch { /* keep walking */ }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return process.cwd();
}

const WORKSPACE = await resolveWorkspace();
try {
  const s = await fs.stat(path.join(WORKSPACE, ".ai"));
  if (!s.isDirectory()) throw new Error();
} catch {
  console.error(`ERROR: no .ai/ directory at ${WORKSPACE}`);
  process.exit(2);
}

// ── helpers ─────────────────────────────────────────────────────────────────

const rel = (p) => path.relative(WORKSPACE, p).split(path.sep).join("/");

function insideWorkspace(p) {
  const r = path.relative(WORKSPACE, path.resolve(p));
  return !r.startsWith("..") && !path.isAbsolute(r);
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readText(p) {
  return fs.readFile(p, "utf8");
}

async function isFile(p) {
  try { return (await fs.stat(p)).isFile(); } catch { return false; }
}

async function isDir(p) {
  try { return (await fs.stat(p)).isDirectory(); } catch { return false; }
}

// ── server ──────────────────────────────────────────────────────────────────

const server = new McpServer(
  { name: "pds-ai-instruct", version: "0.1.0" },
  {
    instructions:
      "PDS Depth-Priority Hierarchical AI-INSTRUCT. Use `resolve_instructions` " +
      "to find the authoritative `.ai/instruct.md` for any path. Use " +
      "`get_governed_tool` before performing any action that has a matching " +
      "tool definition (e.g., `consult-naming`, `archive-file`, `append-todo`).",
  },
);

// ── tools ───────────────────────────────────────────────────────────────────

server.tool(
  "resolve_instructions",
  "Walk from workspace root down to `path` and collect every `.ai/instruct.md`. Deepest is authoritative.",
  { path: z.string().default(".") },
  async ({ path: p }) => {
    const target = path.isAbsolute(p) ? path.resolve(p) : path.resolve(WORKSPACE, p);
    if (!insideWorkspace(target)) throw new Error(`path ${p} is outside the workspace`);

    const chain = [];
    let cursor = (await isDir(target)) ? target : path.dirname(target);
    while (true) {
      const candidate = path.join(cursor, ".ai", "instruct.md");
      if (await isFile(candidate)) chain.push(candidate);
      if (cursor === WORKSPACE) break;
      cursor = path.dirname(cursor);
    }
    chain.reverse();

    const mode = process.env.DEPLOY_MODE ?? null;
    let modeFile = null;
    if (mode) {
      const m = path.join(WORKSPACE, ".deployment", mode, ".ai", "instruct.md");
      if (await isFile(m)) modeFile = m;
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          scope_authority_file: chain.length ? rel(chain.at(-1)) : null,
          background_files: chain.slice(0, -1).map(rel),
          active_deployment_mode: mode,
          deployment_authority_file: modeFile ? rel(modeFile) : null,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "resolve_deployment_mode",
  "Report the active DEPLOY_MODE and list available modes under `.deployment/`.",
  {},
  async () => {
    const deploymentDir = path.join(WORKSPACE, ".deployment");
    const available = [];
    if (await isDir(deploymentDir)) {
      for (const entry of (await fs.readdir(deploymentDir)).sort()) {
        const child = path.join(deploymentDir, entry);
        const instruct = path.join(child, ".ai", "instruct.md");
        if ((await isDir(child)) && (await isFile(instruct))) {
          available.push({ mode: entry, authority_file: rel(instruct) });
        }
      }
    }
    const active = process.env.DEPLOY_MODE ?? null;
    const activeFile = active
      ? path.join(deploymentDir, active, ".ai", "instruct.md")
      : null;
    const activeAuthority =
      activeFile && (await isFile(activeFile)) ? rel(activeFile) : null;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ active, active_authority_file: activeAuthority, available }, null, 2),
      }],
    };
  },
);

server.tool(
  "list_governed_tools",
  "Enumerate every governed-tool JSON under `.ai/agents/tools/` and `.ai/mcp/tools/`.",
  {},
  async () => {
    const out = [];
    for (const root of [
      path.join(WORKSPACE, ".ai", "agents", "tools"),
      path.join(WORKSPACE, ".ai", "mcp", "tools"),
    ]) {
      if (!(await isDir(root))) continue;
      for (const f of (await fs.readdir(root)).filter((f) => f.endsWith(".json")).sort()) {
        try {
          const spec = JSON.parse(await readText(path.join(root, f)));
          out.push({
            tool_name: spec.tool_name ?? path.basename(f, ".json"),
            description: spec.description ?? "",
            safety_level: spec.safety_level ?? "unknown",
            requires_approval: spec.requires_approval ?? false,
            source: rel(path.join(root, f)),
          });
        } catch { /* skip malformed */ }
      }
    }
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  },
);

server.tool(
  "get_governed_tool",
  "Return the full spec for one governed tool (checklist + safety metadata).",
  { name: z.string() },
  async ({ name }) => {
    for (const root of [
      path.join(WORKSPACE, ".ai", "agents", "tools"),
      path.join(WORKSPACE, ".ai", "mcp", "tools"),
    ]) {
      const candidate = path.join(root, `${name}.json`);
      if (await isFile(candidate)) {
        const spec = JSON.parse(await readText(candidate));
        spec._source = rel(candidate);
        return { content: [{ type: "text", text: JSON.stringify(spec, null, 2) }] };
      }
    }
    throw new Error(`governed tool ${name} not found`);
  },
);

server.tool(
  "read_instruction",
  "Read an instruction file under .ai/, .deployment/, AGENTS.md, CLAUDE.md, or .github/copilot-instructions*.",
  { path: z.string() },
  async ({ path: p }) => {
    const target = path.resolve(WORKSPACE, p);
    if (!insideWorkspace(target)) throw new Error("path is outside the workspace");
    if (!(await isFile(target))) throw new Error(`not a file: ${rel(target)}`);

    const r = rel(target);
    const allowed =
      r.startsWith(".ai/") ||
      r.startsWith(".deployment/") ||
      r.startsWith(".github/copilot-instructions") ||
      r === "AGENTS.md" ||
      r === "CLAUDE.md";
    if (!allowed) {
      throw new Error(`${r} is not an instruction surface`);
    }
    const content = await readText(target);
    return { content: [{ type: "text", text: JSON.stringify({ path: r, content }, null, 2) }] };
  },
);

// ── start ───────────────────────────────────────────────────────────────────

await server.connect(new StdioServerTransport());
