# Governance — Scoped Policy & Regulation Overlay

**Scope**: Project-wide pluggable facility
**Last Updated**: 2026-06-03

> **This is a facility, not a rule set.** The template ships it empty. Populate it only if your project has external constraints — laws, regulations, customer contracts, certification standards, or organizational policies — that are **separate from** the codebase's own conventions.
>
> **Governance is not depth-priority.** Depth-priority `.ai/instruct.md` files describe *how this codebase works*. Governance describes *what external rules apply to a given context* (a region, a customer, a data class, a jurisdiction). The two compose: scope authority + governance overlay = effective rules.

---

## Contents

| Section | What's here |
|---|-------------|
| [What Governance Is (and Isn't)](#what-governance-is-and-isnt) | Boundary against depth-priority resolution |
| [How the Resolver Works](#how-the-resolver-works) | Default file-based resolver and how to override |
| [Rule File Format](#rule-file-format) | Frontmatter schema for `.ai/governance/*.md` files |
| [Examples of Governance Use Cases](#examples-of-governance-use-cases) | When to populate this directory |
| [When NOT to Use Governance](#when-not-to-use-governance) | Things that belong in `.ai/instruct.md` instead |

---

## What Governance Is (and Isn't)

| Belongs in `.ai/instruct.md` (depth-priority) | Belongs in `.ai/governance/` (overlay) |
|---|---|
| "All API routes use kebab-case" | "EU customers' data must remain in EU regions" |
| "Migrations are forward-only" | "HIPAA-tagged tables require encryption at rest" |
| "Use the `btn-` prefix for button IDs" | "Texas school district X bans third-party LLM calls" |
| "Errors throw `AppError` with a registered code" | "Customer Y's contract forbids storing PII for >30 days" |

**Rule of thumb**: if removing the constraint would not change the codebase's design — only its deployment context — it's governance.

---

## How the Resolver Works

The governed tool [`get-governance-rules`](../agents/tools/get-governance-rules.json) is the entry point. By default:

1. It reads every `.ai/governance/*.md` file (excluding this README).
2. It filters by each rule's frontmatter `applies_to` block against the agent's `(scope_path, topic, context)` query.
3. It returns the matching list as `governance_refs` to whichever agent asked.

To replace the default resolver (e.g., to call a regulator's API, query a customer-rules database, or look up state/district rules):

1. Create `.ai/governance/resolver.md` describing the active resolver and how it is invoked.
2. Override [`get-governance-rules`](../agents/tools/get-governance-rules.json) checklist step 2 to defer to your resolver.
3. Resolver outputs must still be a list of rule documents (or rule references) — agents always treat governance as a list of additive constraints.

---

## Rule File Format

Each rule lives in its own file: `.ai/governance/<rule-id>.md`.

```yaml
---
rule_id: <stable-id>           # e.g., "gdpr-data-residency-eu"
title: <short title>
authority: <issuer>             # e.g., "EU GDPR", "Customer Acme MSA", "Internal Policy P-014"
applies_to:
  paths:                        # glob patterns matched against scope_path; "**" = everywhere
    - "**"
  topics:                       # match against the request's topic keywords (any-of)
    - data-storage
    - api
  contexts:                     # any-of match against the agent's context bag (free-form keys)
    - region: eu
    - data_class: pii
severity: hard | advisory       # hard = block on violation; advisory = warn
last_reviewed: YYYY-MM-DD
---

# <Rule title>

## Constraint
One paragraph stating the rule precisely.

## Applies when
Plain-English restatement of `applies_to`.

## Verification
How an agent (especially the Validator/Reviewer) confirms compliance.

## Source
Link to the authority document, contract clause, or regulation section.
```

The Validator and Reviewer agents treat every `severity: hard` match as a blocking violation.

---

## Examples of Governance Use Cases

- **Regulatory**: GDPR, HIPAA, FERPA, PCI-DSS, SOX residency / retention / encryption rules.
- **Contractual**: per-customer MSA clauses (data residency, SLA, third-party service bans).
- **Jurisdictional**: state/district/school content rules (the original `f_temp` motivation).
- **Organizational**: internal security baselines that apply across multiple repos.
- **Certification**: SOC 2 / ISO 27001 control mappings tied to specific code paths.

---

## When NOT to Use Governance

- A coding convention that only this repo cares about → `.ai/conventions.md` or a module's `.ai/instruct.md`.
- A naming prefix or schema rule → the existing convention files (`coding-prefixes.md`, `database-schema.md`, etc.).
- A one-off TODO or in-progress decision → not a rule; do not file it here.

If you cannot point to an **external authority** for the rule, it does not belong in `.ai/governance/`.
