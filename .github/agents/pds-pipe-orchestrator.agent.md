---
description: >
  [ARCHIVED 2026-06-04] This agent has been renamed to pds-man-imports (manager domain authority).
  See pds-man-imports.agent.md for current implementation.
archived: 2026-06-04
replacement: pds-man-imports
reason: Renamed from pds-pipe-orchestrator to pds-man-imports to reflect manager domain authority (not generic pipeline worker)
---

# ⚠️ ARCHIVED — This agent has been renamed

**Old name:** `pds-pipe-orchestrator`  
**New name:** `pds-man-imports`  
**Date:** 2026-06-04

## Reason for rename

The import orchestration role is **domain management**, not a generic pipeline worker. It now follows the manager naming pattern (`pds-man-*`) to indicate its authoritative role over the imports domain, including:

1. Phase 0-6 workflow orchestration
2. Post-import transformation and adaptation
3. Registry reconciliation coordination
4. Ongoing consolidation strategy

## Migration

All references have been updated to `pds-man-imports`. See [.github/agents/pds-man-imports.agent.md](pds-man-imports.agent.md) for the current implementation.

---

This file is archived but left for reference. All functionality now lives in [`pds-man-imports.agent.md`](pds-man-imports.agent.md).

---

## Safety Guardrails

| Guardrail | Enforcement |
|-----------|------------|
| No ad-hoc copies | Refuse `git clone` → `Move-Item` workflows |
| Credentials first | Phase 0c warns on `.env` files before any copy |
| Always validate | Validator must pass before commit |
| Audit trail | All decisions logged to `.ai/logs/import-*.jsonl` |
| Authority preserved | Each module's `.ai/instruct.md` remains authoritative |
| Registry merging | Never overwrite; merge and resolve conflicts |

---

## Error Handling

**If Phase 0 fails:**
- Report which phase failed and why
- Ask if user wants to override or fix first
- Do not proceed to Phases 1-6 without approval

**If migrator fails:**
- Stop orchestration
- Report error from migrator agent
- Ask if user wants to debug or abort

**If importer fails:**
- Stop orchestration
- Report error from importer agent
- Ask if user wants to fix manually or abort

**If validator fails:**
- Show validation errors
- Ask if user wants to fix and retry
- Do not commit on validation failure

---

## Related Prompts & Agents

- **Entry point:** `/ai-import-execute` — User-facing prompt that invokes this agent
- **Source analysis:** `pds-meta-migrator` — Scans and preserves source artifacts
- **Target integration:** `pds-pipe-importer` — Executes Phases 1-6 integration
- **Guards:** See [Governed Workflows](../../.github/copilot-instructions.md#governed-workflows--importmerge-pattern-guard)
- **Index:** See [Workflow Invocation Pattern](../../.github/copilot-instructions.md#workflow-invocation-pattern)
