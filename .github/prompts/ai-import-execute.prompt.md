---
mode: agent
description: Import/merge external projects with full Phase 0-6 orchestration and governance validation
---

# /ai-import-execute — Orchestrated Project Import Workflow

## Purpose

This prompt orchestrates a **complete, governed project import workflow** — from source validation through integration, modernization, and naming compliance checks. It is the **only authorized mechanism** for importing, cloning, or merging external projects into this workspace.

## Scope

- **Phase 0:** Operational validation (LLM dispatch, environment, credentials, naming conventions)
- **Phases 1-6:** Full artifact integration pipeline via agent delegation
- **Exit:** Clean integration with naming compliance verified, audit logged

## Execution Steps

### Stage 1: Recognize and Acknowledge

**Your job:** Confirm this is an import workflow.

If the user has mentioned any of these keywords:
- "clone" + project/repo reference
- "import" + external project name
- "merge" / "consolidate" / "integrate" + projects
- "adopt" / "migrate" + codebase

**Then proceed.** Otherwise, clarify intent.

**Action:** Ask the user for the **source location** (local directory path or GitHub URL).

---

### Stage 2: Phase 0 Validation

Before copying or integrating anything, run mandatory operational validation:

**Phase 0a — LLM Dispatch Test**
- Verify localhost:1234 (LM Studio) is accessible
- Test connectivity and model availability
- If offline, offer to continue with Copilot fallback

**Phase 0b — Environment Validation**
- Check for active venv or node_modules in current workspace
- Confirm Docker is running if using containers
- Verify host vs. container isolation strategy

**Phase 0c — Credentials Hygiene**
- Scan source project for `.env` files, `.pem` keys, credentials
- If found: **warn user** (do not block, but highlight for review)
- Verify `.gitignore` includes credential patterns

**Phase 0d — Module Supervisor Registration**
- Verify all 15 domain supervisors exist in `.github/agents/`
- Generate stubs if missing (pds-pipe-supervisor-*.agent.md)

**Phase 0e — Consolidation Planning**
- Count prompts in source project (estimate by complexity)
- Identify module structure (how many top-level directories)
- List deployment modes (dev-local, prod, etc.)

**Phase 0f — Naming Conventions & Registries**
- Validate 6 canonical registries exist:
  - `.ai/conventions.md`
  - `.ai/coding-prefixes.md`
  - `.ai/api-conventions.md`
  - `.ai/database-schema.md`
  - `.ai/error-codes.md`
  - `.ai/config-vars.md`
- Verify source project has module authority (`.ai/instruct.md` per module)
- Check for naming pattern violations
- Generate missing registries or authority files if needed

**Exit Criteria:**
- Phase 0 passes OR user approves warnings
- All registries exist
- Naming conventions validated
- Ready for Phases 1-6

---

### Stage 3: Invoke pds-man-imports (Phases 1-6)

**Action:** Delegate full import orchestration to the imports manager.

**Manager will execute:**

**Phase 1 — Artifact Preservation**
- Invoke: `python .ai/engine/phase1_executor.py <source_path> <target_path>`
- Copies all modules using robocopy (Windows) or rsync (POSIX)
- Copies infrastructure: `.github/prompts/`, `.github/agents/`, `.github/skills/`, `.github/hooks/`
- **Merges** (doesn't overwrite) — skips items if target already has them
- **Skips symlinks** to prevent duplication loops
- Preserves `.ai/instruct.md` and governance files

**Phase 2 — Source Analysis**
- Parse each module's `.ai/instruct.md`
- Extract naming patterns, endpoints, error codes, config vars
- Map to corresponding registries

**Phase 3 — Integration Planning**
- Merge `.deployment/` modes from source into target
- Update root `.ai/instruct.md` with merged module list
- Flag naming conflicts or duplicates

**Phase 4 — Modernization**
- Update root README.md with source project description
- Merge package.json scripts and dependencies
- Update `.github/CODEOWNERS` with source ownership

**Phase 5 — Registry Consolidation**
- Merge naming registries (coding prefixes, endpoints, error codes, etc.)
- Consult `pds-man-naming` for conflict resolution
- Regenerate canonical files

**Phase 6 — Validation & Audit**
- Run full instruction validator: `pwsh .github/scripts/validate-instructions.ps1`
- Verify no broken links or drift
- Generate audit log with all decisions
- Confirm module authority (each module's `.ai/instruct.md` is present and valid)

**Post-Import Transformation:**
- Adapt imported codebase to template architecture standards
- Ensure `.ai/instruct.md` scoping at all module levels
- Hand off registry reconciliations to `pds-man-naming`
- Hand off index updates to `pds-man-curator`

**Exit Criteria:**
- Validator passes with 0 errors
- All modules registered and discoverable
- Naming compliance verified
- Audit log complete

---

### Stage 5: Final Confirmation

**Your job:** Verify integration success and ask user for approval to commit.

**Checklist:**
- ✓ Phase 0 validation passed
- ✓ All 6 registry files exist and merged
- ✓ Module list updated in root `.ai/instruct.md`
- ✓ Validator shows 0 errors
- ✓ Audit log generated

**Action:** If all passes, ask user:
> "Import complete and validated. Ready to commit? (yes/no)"

If yes:
```
git add -A
git commit -m "feat: Import [SOURCE_PROJECT_NAME] with Phase 0-6 orchestration

- Imported [N] modules from [SOURCE]
- Merged registries: coding-prefixes, api-conventions, database-schema, error-codes, config-vars
- Updated root .ai/instruct.md with new module authority
- Phase 0-6 validation: PASS
- Audit log: [log-location]"
git push origin main
```

---

## Safety Guardrails

- **Never ad-hoc copy:** Always use this workflow, never run `git clone` → `Move-Item` manually
- **Never use `Copy-Item -Recurse`:** PowerShell's `Copy-Item` follows symlinks by default, causing duplication loops. Use **robocopy** instead (Phase 1 enforces this)
- **Always preserve audit:** Every decision logged to `.ai/logs/import-*.jsonl`
- **Always validate:** Validator must pass before commit
- **Credentials first:** Phase 0c warns on `.env` files; user must review
- **Authority last:** Registries and naming patterns validated in Phase 0f

## If Something Fails

1. **Phase 0 failure:** Report the issue and ask if user wants to override
2. **Migrator failure:** Stop; migrator will report what went wrong
3. **Importer failure:** Importer agent will provide detailed error context
4. **Validator failure:** Show errors; ask if user wants to fix manually or retry

Do not proceed to next stage on any failure unless user explicitly approves.

---

## See Also

- [Governed Workflows — Import/Merge Pattern Guard](../copilot-instructions.md#governed-workflows--importmerge-pattern-guard) in copilot-instructions.md
- [Workflow Invocation Pattern](../copilot-instructions.md#workflow-invocation-pattern) — workflows are repeatable, not one-time setup
- [.ai/instruct.md](../../.ai/instruct.md#governed-workflows--importmerge) — project-level import mandate
