# .archive

Holds files and directories retired from active use, preserved for reference.

Files are moved here mirroring their original path — `.archive/src/foo.ts` came from `src/foo.ts`.
For a single file that doesn't warrant moving, rename it in place as `filename.old.ext`.

## Rules

- Preserve the original path when moving files here
- Treat all contents as **read-only reference only** — do not modify archived files
- Copilot should **ignore** this directory in searches unless explicitly asked

> Full rules: [Archive Patterns](../.ai/maintenance.md#archive-patterns)
