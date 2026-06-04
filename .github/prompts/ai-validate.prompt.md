---
mode: agent
description: Run the AI-INSTRUCT drift validator and report findings.
---

# /ai-validate

Run the project's instruction-drift validator and surface results clearly.

## Steps

1. Read [.github/dev-specs.md](../dev-specs.md) to confirm the developer shell and OS.

2. Run instruction-drift validation:
   - **Windows / pwsh**: `pwsh -NoProfile -File .github/scripts/validate-instructions.ps1`
   - **macOS / Linux** (pwsh installed): same command — `pwsh` works cross-platform.
   - Capture stdout and exit code.

3. **Run port registry validation**:
   - `python .ai/engine/port_validator.py . --scope .`
   - Report any ERROR/WARN findings (collisions, range violations, unregistered services, drift, orphaned)

4. If both exit with code `0`: report "Validation passed (instructions + ports)" and file/port counts scanned.

5. If either exits non-zero: list issues grouped by category:
   - **Instruction drift**: Unfilled placeholders, retired syntax, missing TOCs, frontmatter problems, broken links
   - **Index drift**: `.ai/index.md` older than indexed `instruct.md` files (run `/ai-update-index`)
   - **Port issues**: Collision (two services same port), range_violation (outside allowlist), unregistered (not in `.ai/ports.md`), drift (hardcoded vs registry), orphaned (in registry but no service)

6. For each issue, propose a one-line fix. **Do not auto-edit** unless user asks. Only auto-fix unambiguous updates (e.g., today's date for stale `**Last Updated**`).

7. Exit with one-sentence summary and recommended next step (e.g., "Run `/ai-update-index` after fixing links; run `/ai-ports-check --fix` to sync port registry" or similar).

## Notes

- The validator script lives at [.github/scripts/validate-instructions.ps1](../scripts/validate-instructions.ps1). If it is missing, that itself is the finding — instruct the user to restore from git or reinstall the template.
- This prompt does not commit, push, or modify config — it only reads and reports.
