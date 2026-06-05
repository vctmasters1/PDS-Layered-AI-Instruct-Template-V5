---
mode: agent
description: Archive example code and guides to .archive/examples/ to start a clean slate
---

# `/hip-hide-example-code` — Archive Template Examples

When you adopt this template for a real project, you may want to hide the example code and guides that ship with it. This command archives (never deletes) all template examples to `.archive/examples/`.

## What Gets Archived

- `*_generator.py` files (config_generator.py, schema_generator.py, endpoint_generator.py, etc.)
- `*-guide.md` files (endpoint-generator-guide.md, gui-element-id-guide.md, etc.)
- `test-*.json`, `test_*.py` files (example test data)
- Utility scripts in `validation/`, `api/`, etc. that aren't part of your project
- Example `.dev-docs/` content (kept for reference, archived for tidiness)

## What Stays (Template Infrastructure)

- `.hi/` — all governance, prompts, agents, skills, registry ✓ stays
- `.github/` meta-instructions (copilot-instructions.md, AGENTS.md, etc.) ✓ stays
- `README.md`, `CONTRIBUTING.md`, `LICENSE` ✓ stay
- `.cursor/`, `.continue/`, `.clinerules/`, `.vscode/` ✓ stay
- `.github/dev-specs.md` — fill this in with your own project values

## How It Works

1. Discovers all files matching example patterns recursively
2. Creates `.archive/examples/` with mirrored directory structure
3. Moves files (preserves paths for recovery if needed)
4. Stages the archive in git (committed alongside your first real code)
5. Reports what was archived

## Usage

```
/hip-hide-example-code
```

The command is idempotent — running it twice won't duplicate anything.

## Recovery

If you archived something by mistake, it's in `.archive/examples/` — just move it back. See [Maintenance Rules](.hi/maintenance.md#archive-first-never-delete) for the convention.
