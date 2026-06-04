# .github/scripts

Committed utility scripts that ship with this template. Unlike [`.github/debug/`](../debug/README.md), the contents of this directory are **part of the codebase** and are tracked by git.

## Contents

| Script | Purpose |
|--------|---------|
| [validate-instructions.ps1](validate-instructions.ps1) | Lints the AI-INSTRUCT system for drift (unfilled `[DATE]`, missing `## Contents` tables, retired `§` syntax, malformed frontmatter, broken relative links). Run from project root: `pwsh -NoProfile -File .github/scripts/validate-instructions.ps1`. Also exposed as `/ai-validate`. |

## Rules

- Scripts here are committed and reviewed like any other source file.
- Cross-platform: prefer scripts that run under both PowerShell 7+ (Windows/macOS/Linux) and standard POSIX shells where possible.
- Do **not** place AI-generated debug utilities here — those belong in [`.github/debug/`](../debug/README.md).
