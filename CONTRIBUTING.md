# Contributing Guide

Thanks for helping improve this template.

## Scope for contributions

- Improve clarity and adoption of the layered instruction system.
- Keep changes lightweight and template-safe for new adopters.
- Prefer additive changes over disruptive structural rewrites.

## Before opening a PR

1. Run setup once if needed:
   - `bash setup.sh` (macOS/Linux/WSL/Git Bash)
   - `pwsh setup.ps1` (Windows PowerShell)
2. Run the validator:
   - `pwsh -NoProfile -File .github/scripts/validate-instructions.ps1`
3. Confirm no secrets or `.env` files are staged.

## Style expectations

- Keep docs concise, practical, and copy/paste friendly.
- Preserve existing naming and folder conventions.
- Update cross-references when moving or adding instruction files.
- Prefer examples that are realistic but not tied to private project data.

## Safety conventions

- Do not commit credentials, tokens, or real secrets.
- Use archive-first maintenance patterns (don’t hard-delete historical context).
- Keep AI guidance explicit and scoped; avoid ambiguous “global” rules when module rules are better.

## Suggested PR format

- **What changed**
- **Why it changed**
- **How validated** (commands run + outcomes)
