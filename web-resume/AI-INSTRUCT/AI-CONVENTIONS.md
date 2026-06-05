# AI-CONVENTIONS.md — Global Naming & File Organization

**Scope**: Entire workspace
**Authority**: Canonical — do not restate these rules elsewhere; link here instead
**Last Updated**: 2026-05-12

---

## File Naming

| Type | Convention | Example |
|------|-----------|---------|
| Source files | kebab-case | `user-auth.js`, `llm-client.js` |
| Directories | kebab-case | `api-routes`, `chrome-extension` |
| Variables | camelCase | `userData`, `listingId` |
| Classes / Types | PascalCase | `UserManager`, `FileStore` |
| Constants | UPPER_SNAKE_CASE | `LLM_API_URL`, `MAX_UPLOAD_SIZE` |
| Reference docs (user-facing) | UPPERCASE | `README.md`, `SETUP.md` |
| Numbered how-to guides | Numbered CamelCase | `1.HowToSetup.md`, `2.HowToDeploy.md` |
| Topic guides | kebab-case | `database-setup.md`, `deployment-guide.md` |
| ADRs | Date-prefixed | `2026-05-12-use-postgresql.md` |

---

## Resume Artifact Naming

These conventions must be preserved for compatibility with the existing pipeline:

| Artifact | Pattern | Example |
|----------|---------|---------|
| Job listing | `<Company>-<Role>.md` | `CMS-Controls-Ohio-BAS-Controls-Service-Technician.md` |
| Application folder | `NNNN-<listing-slug>/` | `0001-CMS-Controls-Ohio-BAS-Controls-Service-Technician/` |
| Resume draft | `<FullName>-<pass>.md` | `VictorMasters-000.md` |
| ATS score | `ats-score-<pass>.md/.json` | `ats-score-000.json` |
| Final DOCX/PDF | `<FullName>-001.docx/.pdf` | `VictorMasters-001.pdf` |
| Analysis | `analysis.md` | (fixed name) |

The `<FullName>` segment is stored per user in the database and injected at artifact creation time.

---

## Directory Organization

### Root Directory Is Minimal

Only these belong at the workspace root:

| What | Example |
|------|---------|
| Entry point | `README.md` |
| Core rules | `AI-INSTRUCT.md` |
| Global AI instructions | `AI-INSTRUCT/`, `.github/` |

### Per-Directory Structure

```
{directory}/
├── AI-INSTRUCT.md        ← Rules for this directory (always at root)
├── README.md             ← Overview (if public-facing)
├── [source / config]     ← Primary deliverables at root
└── .dev.md/              ← Development documentation
    ├── [active notes]
    └── .old.mds/         ← Archived / superseded notes
```

---

## AI-INSTRUCT File Conventions

- **One file per directory** — never split across multiple files at the same level
- **Self-contained** — each file is authoritative for its directory; no delegation upward
- **Authority header** — every AI-INSTRUCT.md begins with an authority block:

```markdown
**Authority**: DEEP — Authoritative for all work inside `{directory}/`
**Parent context**: [../AI-INSTRUCT.md](../AI-INSTRUCT.md)
**Last Updated**: [UPDATE THIS when architecture changes]
```

- **No duplication** — if a rule already exists in a parent or in `AI-INSTRUCT/`, link to it; don't copy it

---

## Code Comment Style

> See [.github/copilot-instructions.md](../.github/copilot-instructions.md) for the full comment convention.

Summary:
- Comment on **why**, not what
- One line preferred
- May reference the governing `AI-INSTRUCT.md` for non-obvious architectural constraints:

```js
// See server/AI-INSTRUCT.md — all DB access must go through the centralized database layer
const result = await db.query(SQL, params);
```
