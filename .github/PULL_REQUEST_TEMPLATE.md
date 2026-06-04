<!--
PR template for repositories that use the PDS Depth-Priority Hierarchical AI-INSTRUCT V5 system.
Delete sections that don't apply to your change.
-->

## Summary

<!-- One or two sentences. What does this PR do and why? -->

## Type of change

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor (no behavior change)
- [ ] Documentation / `.ai/` instruction update
- [ ] Build / CI / tooling
- [ ] Other: ___

## AI-INSTRUCT discipline

> If this PR touches code, the instruction files that govern that code must stay accurate. See [AI-INSTRUCT Maintenance Rule](../.github/copilot-instructions.md#ai-instruct-maintenance-rule).

- [ ] Updated the relevant `.ai/instruct.md` file(s) **in this PR** if any architectural rule changed
- [ ] Ran `/ai-update-index` (or [`.github/scripts/validate-instructions.ps1`](../.github/scripts/validate-instructions.ps1)) and `.ai/index.md` is in sync
- [ ] No new module added without its own `.ai/instruct.md` + `.dev-docs/index.md`
- [ ] No `[PLACEHOLDER]` or `[DATE]` left in any live instruction file
- [ ] Did not duplicate content from a shallower `.ai/instruct.md` into a deeper one (see [No-Duplication Rule](../.ai/conventions.md#no-duplication-rule))

## Safety & credentials

- [ ] No secrets, API keys, or `.env` files staged (pre-commit hook should also block this)
- [ ] No destructive DB migrations without an explicit `down()` + reviewer call-out (see [Never Reset Databases](../.ai/maintenance.md#never-reset-databases))
- [ ] Files retired through the archive pattern, not `rm` (see [Never Delete Rule](../.ai/maintenance.md#never-delete-rule))

## Testing

<!-- What did you do to convince yourself this works? -->

- [ ] Unit tests added / updated
- [ ] Integration / E2E tests added / updated
- [ ] Manual verification steps documented below (if applicable)

## Reviewer notes

<!-- Anything specific you want the reviewer to focus on, gotchas, follow-up tickets, etc. -->
