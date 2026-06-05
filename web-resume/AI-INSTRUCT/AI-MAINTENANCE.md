# AI-MAINTENANCE.md — Archiving & Development Documentation Patterns

**Scope**: Entire workspace
**Authority**: Canonical — do not restate these rules elsewhere; link here instead
**Last Updated**: 2026-05-12

---

## `.dev.md/` — Development Documentation

Every directory that accumulates development notes uses a `.dev.md/` subdirectory.

### Rules

1. `.dev.md/` holds anything that **supports** development but is NOT a primary deliverable:
   - Session notes and reports
   - Status tracking
   - Architecture reviews in progress
   - Temporary working guides
   - Scratch notes

2. `.dev.md/.old.mds/` holds **stale or superseded** docs. Move outdated files here instead of deleting them. AI assistants should **ignore `.old.mds/` contents** by default unless explicitly asked.

3. **Keep at directory root**: `AI-INSTRUCT.md`, `README.md`, source code, essential config. Never let dev notes clutter the root.

### Structure

```
{any-directory}/
├── AI-INSTRUCT.md               ← KEEP at root
├── README.md                    ← KEEP at root
├── [source code / config]       ← KEEP at root
└── .dev.md/
    ├── [active dev notes]       ← Current working notes
    └── .old.mds/                ← Stale docs (ignored by default)
```

---

## File-Level Archiving Patterns

| Pattern | When to use |
|---------|-------------|
| `filename.old.ext` | A single file no longer active but kept for reference (e.g. `server.old.js`) |
| `filename.archive.ext` | A single file intentionally archived with a clear signal it's done |
| `.archive/` subdirectory | A batch of related files being archived together |
| `.dev.md/.old.mds/` | Stale **development documentation** specifically |
| `.junk/` | Artifacts inherited from a previous project — use during cleanup, then delete |

---

## AI-INSTRUCT Update Rule

**Whenever you make an architectural change, update the relevant `AI-INSTRUCT.md` file(s) in the same operation.** Never defer this.

An architectural change includes:
- Adding, removing, or renaming a module, package, layer, or subsystem
- Changing API contracts, data schemas, or protocols
- Adding a new major directory or removing one
- Changing authentication or authorization patterns
- Any change that would make existing AI-INSTRUCT guidance incorrect

---

## `.junk/` Cleanup

`.junk/` is a temporary holding area for inherited artifacts. Once reviewed and handled, **delete the `.junk/` folder entirely**. Add it to `.gitignore` during the cleanup phase.

---

## UserData Is Runtime Data

`UserData/` contains user-generated files managed by the server at runtime. It must:
- Never be committed to git (`.gitignore`)
- Never be manually edited except for debugging
- Always be created/modified through server API calls or admin scripts
