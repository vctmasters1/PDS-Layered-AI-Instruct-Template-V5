---
rule_id: example-no-pii-in-logs
applies_to:
  paths:
    - "**/*"
  topics:
    - logging
    - credentials
  contexts:
    - generate
    - review
severity: advisory
---

# Example Governance Rule — No PII in Logs

> **This is a template/example rule.** It is `advisory` (not `hard`) so it cannot block work in a fresh template clone. Replace, edit, or remove this file when adopting the template into a real project — adjust `severity` to `hard` once the rule is real for your context.

## Contents

| Section | What's here |
|---|---|
| [Statement](#statement) | The rule itself |
| [Rationale](#rationale) | Why this rule exists |
| [How agents apply this rule](#how-agents-apply-this-rule) | Agent-side enforcement |
| [Out of scope](#out-of-scope) | What this rule does NOT cover |
| [See also](#see-also) | Related references |

## Statement

Logs emitted from any module must not contain personally identifiable information (PII): full names, email addresses, phone numbers, government IDs, IP addresses where not required, or any data covered by the project's privacy policy.

## Rationale

Logs are routinely shipped to retention systems, support tooling, and incident reviews where access controls are weaker than the primary data store. Treating logs as a back-channel for PII violates least-privilege and most data-protection regulations.

## How agents apply this rule

- **Generator**: when emitting `logger.info()` / `console.log()` / equivalent, never include user objects directly. Log identifiers (UUIDs, opaque tokens) instead.
- **Reviewer**: flag any log statement that interpolates fields known to be PII per the data dictionary.
- **Validator**: optional regex sweep for common patterns (`@`, phone-shaped digit groups) inside string literals passed to logger calls.

## Out of scope

- Structured audit logs that intentionally record actor identity for compliance — those have their own retention and access path. This rule targets diagnostic / debug logs only.
- Encrypted log fields where the encryption key is held by a separate system.

## See also

- [`.ai/credentials.md`](../credentials.md) — the broader rule that secrets must never appear in source, logs, or commits.
- [`.ai/governance/README.md`](README.md) — how this overlay is loaded and how `applies_to` is matched.
