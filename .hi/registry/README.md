# Hierarchical Instruct Discovery System

**V6 Architecture**: Filesystem-as-source discovery for prompt/agent/skill/workflow registration.

---

## How It Works

The discovery engine scans `.github/.hi/` and generates a **registry** — a JSON file that lists all discoverable artifacts in your project.

### Top-Dog vs Subordinate

- **Top-Dog** (root project): Scans itself + all sub-projects. Generates `master-registry.json`
- **Subordinate** (sub-project): Scans only itself. Generates `local-registry.json`. Also emits a signal for parent to regenerate.

### Artifact Types

| Pattern | Type | Example |
|---------|------|---------|
| `hip-*.prompt.md` | Prompt (slash command) | `hip-validate.prompt.md` |
| `hia-*.agent.md` | Agent | `hia-router.agent.md` |
| `hia-{module}-*.agent.md` | Module-scoped agent | `hia-api-validator.agent.md` |
| `SKILL.md` | Skill (in subdirectory) | `project-navigation/SKILL.md` |
| `hiw-*.yml` | Workflow | `hiw-discovery-auditor.yml` |

### Module Prefixing

When a sub-project creates artifacts, they're automatically prefixed in the master registry:

```
api/.github/.hi/agents/tier-1/hia-custom.agent.md
  ↓ (scanned by top-dog)
  ↓ (prefixed with module name)
master-registry.json: hia-api-custom
```

This avoids naming collisions: `hia-api-validate` vs `hia-config-validate` are different artifacts.

---

## Running Discovery

### Manual Scan

```bash
# At root level
python .github/.hi/registry/discovery-engine.py --scope . --output .ai/discovery/master-registry.json

# In a sub-project
python .github/.hi/registry/discovery-engine.py --scope . --output .ai/discovery/local-registry.json
```

### Automatic Scan (Post-Merge Hook)

The `.github/.hi/hooks/post-merge` hook runs automatically after `git merge` or `git checkout`, regenerating registries.

### Watch Mode (Development)

```bash
python .github/.hi/registry/watch-mode.py
```

Runs discovery automatically when files change (optional, for real-time updates).

---

## Registry Format

### Master Registry (`.ai/discovery/master-registry.json`)

```json
{
  "role": "top_dog",
  "scope_root": "/path/to/project",
  "scan_time": "2026-06-05T06:37:36.082356",
  "artifacts": [
    {
      "name": "validate",
      "path": ".github/.hi/prompts/hip-validate.prompt.md",
      "type": "prompt",
      "module_prefix": null,
      "full_qualified_name": "hip-validate"
    },
    {
      "name": "custom",
      "path": "api/.github/.hi/agents/tier-1/hia-custom.agent.md",
      "type": "agent",
      "module_prefix": "api",
      "tier": "tier-1",
      "full_qualified_name": "hia-api-custom"
    }
  ],
  "errors": [],
  "warnings": [],
  "summary": {
    "total_artifacts": 2,
    "prompts": 1,
    "agents": 1,
    "skills": 0,
    "workflows": 0,
    "errors": 0,
    "warnings": 0
  }
}
```

### Local Registry (`.ai/discovery/local-registry.json` in sub-project)

Same structure, but `role: "subordinate"` and contains only that sub-project's artifacts (no module prefix).

---

## Errors & Validation

### Collision Detection

If two artifacts have the same fully-qualified name:

```
hia-api-validate appears in both:
  - api/.github/.hi/agents/tier-1/hia-validate.agent.md
  - api/.github/.hi/agents/tier-1/hia-validate.agent.md  (duplicate!)
```

The engine writes errors to `.ai/discovery/errors.jsonl` and exits with code 1.

### Naming Conventions

Artifacts **must** follow the naming patterns:
- Prompts: `hip-{name}.prompt.md`
- Agents: `hia-{name}.agent.md` or `hia-{module}-{name}.agent.md`
- Skills: Place `SKILL.md` inside a skill directory
- Workflows: `hiw-{name}.yml` or `hiw-{name}.yaml`

Misnamed artifacts are logged as warnings but don't block discovery.

---

## Integration Points

### Slash Commands

After running discovery, all `hip-*.prompt.md` files in `.github/.hi/prompts/` are automatically discoverable as `/hip-{name}` commands.

### Agents

Agents in `.github/.hi/agents/` are indexed by tier and callable via the routing gateway.

### Governance

The discovery registry feeds into governance workflows:
- **Audit**: Detect naming violations, collisions, oversized files
- **Compliance**: Ensure imports, skills, tools conform to template
- **Orchestration**: Route requests to the correct agent based on full-qualified name

---

## Troubleshooting

### "Role detection failed"

Engine couldn't determine if root or subordinate. Check:
- Root has `.github/copilot-instructions.md`? (required for top-dog)
- Or has `.ai/index.md`?
- Or has root-level `AGENTS.md`?

### "0 artifacts found"

Engine ran successfully but found nothing. Check:
- `.github/.hi/` directory exists?
- Artifacts follow naming pattern: `hip-`, `hia-`, `SKILL.md`, `hiw-`?
- Artifacts in correct location?

### Collision errors

Two artifacts have the same fully-qualified name. Rename one:

```bash
# Bad
api/.github/.hi/agents/hia-validate.agent.md
config/.github/.hi/agents/hia-validate.agent.md

# Good
api/.github/.hi/agents/hia-validate.agent.md
config/.github/.hi/agents/hia-transform.agent.md
```

Or use module prefixing to disambiguate (discovery will add it automatically).

---

## Next Steps

1. Move all prompts to `.github/.hi/prompts/` (Phase 3)
2. Move all agents to `.github/.hi/agents/` (Phase 4)
3. Run discovery to generate master registry
4. Update entry points (AGENTS.md, copilot-instructions.md) to reference new paths
5. Commit registry and file changes
