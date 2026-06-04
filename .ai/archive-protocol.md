# Archive Protocol — Never Delete, Always Replace-with-Archive

**Version**: 1.0.0
**Last Updated**: 2025-01-16
**Scope**: Mandatory archive-first pattern for all file replacements and removals

---

## Contents

| Section | What's here |
|---------|-------------|
| [Core Rule](#core-rule) | Never delete — always archive |
| [Archive Paths](#archive-paths) | Where archives live (`.old/` mirroring) |
| [Archive Operations](#archive-operations) | Step-by-step archive procedure |
| [Archive Retention & Cleanup](#archive-retention--cleanup) | 180-day threshold, deletion approval |
| [When to Archive](#when-to-archive) | Triggers and decision criteria |
| [What NOT to Archive](#what-not-to-archive) | Exclusions |
| [Tools & Integration](#tools--integration) | Cleanup agent, hooks |
| [Examples](#examples) | Worked examples |
| [Reviewer Responsibility](#reviewer-responsibility) | Verification checklist |
| [Related Files](#related-files) | Cross-references |
| [YAML Frontmatter (if attached to AI instruction)](#yaml-frontmatter-if-attached-to-ai-instruction) | Embedding metadata |

---

## Core Rule

**Never delete a file directly. Archive it first.**

When a file becomes stale, orphaned, superseded, or must be removed:
1. Move it to the appropriate `.old/` archive directory (path-mirroring)
2. Timestamp-tag the archive (YYYYMMDD format in directory name)
3. Leave a pointer or README explaining why it was archived
4. Commit the archive operation in Git before committing any replacement

---

## Archive Paths

### User files (source code, config, documentation)

```
[file] → [file].old/[YYYYMMDD]/[file]
```

**Example:**
```
src/legacy_handler.js → src/legacy_handler.js.old/20250115/legacy_handler.js
config/old_settings.yaml → config/old_settings.yaml.old/20250116/old_settings.yaml
```

### Dev docs (`.dev-docs/`)

```
.dev-docs/[file] → .dev-docs/.old/[YYYYMMDD]/[file]
```

**Example:**
```
.dev-docs/deprecated-api.md → .dev-docs/.old/20250115/deprecated-api.md
```

### AI system files (`.ai/`, `.github/`, etc.)

```
.ai/[file] → .ai/.old/[YYYYMMDD]/[file]
.github/agents/[file] → .github/agents/.old/[YYYYMMDD]/[file]
```

**Example:**
```
.ai/knowledge/old-cheatsheet.md → .ai/knowledge/.old/20250115/old-cheatsheet.md
```

### Knowledge base entries (`.ai/knowledge/`)

Follows standard path-mirroring to `.old/` within same directory:

```
.ai/knowledge/cheat-sheets/old-pattern.md → .ai/knowledge/.old/20250115/cheat-sheets/old-pattern.md
```

---

## Archive Operations

### Step 1: Create archive directory (if needed)

```bash
mkdir -p "$(dirname "$file").old/20250115"
```

PowerShell:
```powershell
New-Item -Path "$file.old\20250115" -ItemType Directory -Force
```

### Step 2: Move file to archive

```bash
mv "$file" "${file}.old/20250115/"
```

PowerShell:
```powershell
Move-Item -Path $file -Destination "$($file).old\20250115\"
```

### Step 3: Leave a pointer/README (optional, recommended)

Create a `.old/README.md` explaining the archival:

```markdown
# Archive Summary

## 20250115

- **legacy_handler.js**: Replaced by new_handler.js (see PR #XXX). Kept for reference until confirmed working for 2+ sprints.

```

### Step 4: Commit archive to Git

```bash
git add -A
git commit -m "archive: move legacy_handler.js to archive (replaced by new_handler.js)"
```

---

## Archive Retention & Cleanup

### Retention Period

- Archives older than **180 days** may be deleted (per [`.ai/knowledge/.cleanup-policy.md`](../.ai/knowledge/.cleanup-policy.md))
- Archives in user files: retain for **1 year minimum** unless explicitly deprecated
- Archives in `.ai/knowledge/`: follow cleanup policy (180-day threshold)

### Cleanup Procedure

Use the `memory_hygiene.py` engine (if KB-related):

```bash
python .ai/engine/memory_hygiene.py . --older-than 180 --dry-run
python .ai/engine/memory_hygiene.py . --older-than 180 --archive
```

For user files, manual review before deletion is required.

---

## When to Archive

### Superseded by another file

Move old version to archive; keep both until new version is confirmed working.

**Example:**
```
db/schema_v1.sql → db/schema_v1.sql.old/20250115/
# New version: db/schema_v2.sql is now active
```

### Deprecated module or subsystem

Archive the entire module or subsystem structure:

```
api/deprecated-endpoint/ → api/deprecated-endpoint.old/20250115/
```

### Failed experiment or branch code

Archive code that didn't make it to production:

```
experiments/new-auth.py → experiments/new-auth.py.old/20250115/
```

### Renamed or moved file

Archive the old location; create at new location:

```
config/settings.yaml → config/settings.yaml.old/20250115/
# New location: .config/app-settings.yaml
```

### Temporary or debug files

Archive after task complete:

```
.github/debug/test-run.log → .github/tmp/.old/20250115/test-run.log
```

---

## What NOT to Archive

- **Git objects** (`.git/` contents) — never touch directly
- **Live log files** (if actively being written) — rotate first, then archive
- **Runtime temp files** (`.ai/foresight/`, `.ai/logs/` during active session) — let them age naturally
- **Build artifacts** (ignored by `.gitignore`) — delete directly, no archive needed
- **Personal VS Code settings** (`.vscode/settings.local.json`) — gitignored, not archived

---

## Tools & Integration

### Manual Archive (CLI)

Recommended tool: the `cleanup` agent ([`pds-pipe-cleanup.agent.md`](../.github/agents/pds-pipe-cleanup.agent.md))

```bash
# Or use prompts:
/ai-archive <filepath>  # Archives and creates pointer
```

### Validator Checks (Automated)

The [Reviewer](../.github/agents/pds-pipe-reviewer.agent.md) verifies:
- Archive-first was used (no direct deletions in change set)
- Archive directory structure follows path-mirroring
- Timestamping is correct (YYYYMMDD format)

---

## Examples

### Example 1: Replacing a config file

**Before:**
```
config/app.yaml (v1, now broken)
```

**Operation:**
```bash
mkdir -p config/app.yaml.old/20250116
mv config/app.yaml config/app.yaml.old/20250116/app.yaml
# Create new config/app.yaml (v2)
git add -A
git commit -m "archive: replace config/app.yaml with v2 (v1 in archive)"
```

**After:**
```
config/app.yaml (v2, active)
config/app.yaml.old/20250116/app.yaml (v1, archived)
```

### Example 2: Archiving an agent that's no longer used

**Before:**
```
.github/agents/pds-legacy-processor.agent.md (obsolete)
```

**Operation:**
```bash
mkdir -p .github/agents/.old/20250115
mv .github/agents/pds-legacy-processor.agent.md .github/agents/.old/20250115/
git add -A
git commit -m "archive: retire pds-legacy-processor.agent.md (functionality merged to Router)"
```

**After:**
```
.github/agents/.old/20250115/pds-legacy-processor.agent.md (archived, reference only)
```

### Example 3: Archiving a KB entry that's no longer relevant

**Before:**
```
.ai/knowledge/cheat-sheets/old-framework.md (outdated)
```

**Operation:**
```bash
python .ai/engine/memory_hygiene.py . --search "old-framework" --archive
```

**Result:**
```
.ai/knowledge/.old/20250115/cheat-sheets/old-framework.md (archived)
```

---

## Reviewer Responsibility

The [Reviewer](../.github/agents/pds-pipe-reviewer.agent.md) (stage 5) **must verify**:
- ✓ Every file removal was preceded by an archive
- ✓ Archive directory follows path-mirroring convention
- ✓ Timestamp is in YYYYMMDD format
- ✓ Pointer or README left (if recommended)
- ✗ No direct deletions without archive

If any rule violated: **FAIL** stage 5; send back to Generator.

---

## Related Files

- [`.ai/maintenance.md`](maintenance.md) — never-delete rules
- [`.ai/knowledge/.cleanup-policy.md`](knowledge/.cleanup-policy.md) — KB archival policy (180-day threshold)
- [`.github/agents/pds-pipe-cleanup.agent.md`](../.github/agents/pds-pipe-cleanup.agent.md) — cleanup worker agent
- [`.github/agents/pds-pipe-reviewer.agent.md`](../.github/agents/pds-pipe-reviewer.agent.md) — archive-first verification

---

## YAML Frontmatter (if attached to AI instruction)

```yaml
---
rule_name: archive-first-protocol
enforcement: mandatory
applies_to:
  - file-replacement
  - file-removal
  - feature-deprecation
  - module-retirement
checkpoints:
  - validator: pds-pipe-reviewer.agent.md (stage 5)
    condition: every removal must have corresponding archive
---
```
