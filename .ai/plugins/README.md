# `.ai/plugins/` — Optional Capability Modules

**Scope**: Project-wide
**Last Updated**: 2026-06-04

> Plugins are **opt-in capability modules** that extend the AI-INSTRUCT framework
> without modifying its core. The framework is fully functional with this
> directory empty; plugins add cross-cutting capabilities (model dispatch,
> telemetry sinks, retrieval back-ends, etc.) that adopters can enable per
> project.

---

## Contents

| Section | What's here |
|---------|-------------|
| [Why Plugins](#why-plugins) | Rationale for the opt-in layer |
| [Plugin Contract](#plugin-contract) | Required files; the manifest schema |
| [Lifecycle](#lifecycle) | `disabled` → `experimental` → `stable` |
| [Discovery](#discovery) | How the validator finds and reports plugins |
| [Depth-Priority Interaction](#depth-priority-interaction) | A plugin's `instruct.md` is authoritative inside its directory only |
| [Capabilities a Plugin May Provide](#capabilities-a-plugin-may-provide) | Frontmatter fields, slash commands, validator checks, tools |
| [Adopter Workflow](#adopter-workflow) | How a downstream user enables and configures a plugin |
| [Authoring a New Plugin](#authoring-a-new-plugin) | Step-by-step |
| [Reference Plugins](#reference-plugins) | Ships-with examples |

---

## Why Plugins

The 19 agents, 13 slash commands, and depth-priority resolver are deliberately
**model-agnostic**, **transport-agnostic**, and **infrastructure-agnostic**.
Adopters fork this template into wildly different stacks; baking opinionated
runtime concerns (which LLM, which embedding store, which metrics sink) into
the core would force every adopter to fight the same defaults.

Plugins isolate those opinions. Each plugin:

- Lives entirely under its own `.ai/plugins/<name>/` directory.
- Declares what it provides in a `plugin.yaml` manifest.
- Is **invisible** unless its manifest is present and `status:` is not `disabled`.
- May be removed by deleting its directory — nothing else needs to change.

---

## Plugin Contract

Every plugin directory MUST contain:

```
.ai/plugins/<name>/
├── plugin.yaml              ← REQUIRED — manifest (schema below)
├── instruct.md              ← REQUIRED — depth-priority instructions for the plugin scope
└── README.md                ← REQUIRED — adopter-facing overview & enable steps
```

A plugin MAY also contain:

```
├── tools/*.json             ← governed-tool checklists, scoped to the plugin
├── adapters/*.md            ← integration contracts (LM Studio, Ollama, etc.)
├── examples/                ← reference configs adopters copy + edit
├── scripts/                 ← discovery / probe scripts for the adopter
└── state/                   ← runtime state (gitignored — never commit)
```

### Manifest Schema (`plugin.yaml`)

```yaml
name: <kebab-case>            # REQUIRED. Must match directory name.
version: <semver>             # REQUIRED. e.g. 0.1.0
status: disabled              # REQUIRED. One of: disabled | experimental | stable
description: <one line>       # REQUIRED. Surfaces in discovery output.

requires:                     # OPTIONAL.
  framework: ">=5.0"          #   Minimum AI-INSTRUCT template version.
  plugins: []                 #   Other plugins this depends on (by name).
  tools: []                   #   External CLIs/services expected (informational).

provides:                     # OPTIONAL. Declares what the plugin contributes.
  capabilities: []            #   Free-form tags (e.g. "model-routing", "telemetry").
  frontmatter_fields: []      #   Optional frontmatter keys agents/prompts MAY use
                              #     when this plugin is active (e.g. "model").
  slash_commands: []          #   Slash commands shipped under .github/prompts/
                              #     that ONLY make sense when this plugin is active.
  validator_checks: []        #   Validator check IDs this plugin contributes.
  governed_tools: []          #   Tool filenames under this plugin's tools/

owner: <name or handle>       # OPTIONAL. Maintainer contact.
links:                        # OPTIONAL. Docs / upstream / spec.
  docs: <url-or-path>
```

The validator parses this manifest and warns on missing required fields,
bad `status:` values, and undeclared dependencies.

---

## Lifecycle

| Status | Meaning | Validator behaviour |
|---|---|---|
| `disabled` | Present on disk, but the plugin must not affect runtime behaviour. Adopters edit to flip status when ready. | Manifest is validated; no other checks fire. |
| `experimental` | Active but unstable. Adopters opt in knowingly. | Full validation; warnings printed but do not fail the build. |
| `stable` | Active and production-ready. | Full validation; any failure exits non-zero. |

A plugin **cannot relax a rule** from a shallower `.ai/*.md`. (Example: a
plugin cannot permit committing `.env`.) The plugin's `instruct.md` is
authoritative **for its own directory**, not for the project.

---

## Discovery

Two ways to enumerate active plugins:

1. **Validator** — `pwsh .github/scripts/validate-instructions.ps1` prints
   every plugin it finds, with its `status:` and any manifest issues.
2. **Slash command** — `/ai-plugin-discover` (see
   [.github/prompts/ai-plugin-discover.prompt.md](../../.github/prompts/ai-plugin-discover.prompt.md))
   lists plugins, summarises capabilities, and optionally runs any
   `scripts/detect-*.ps1` discovery probes the plugin ships.

---

## Depth-Priority Interaction

A plugin's `instruct.md` participates in the standard depth-priority
hierarchy. When a tool, prompt, or agent is operating inside
`.ai/plugins/<name>/`, that plugin's `instruct.md` is the deepest scope
and wins — exactly the same rule as for any other directory.

Outside the plugin directory, the plugin's `instruct.md` is **not**
authoritative. Anything a plugin needs the rest of the project to honour
must be expressed through:

- A `validator_checks:` entry the central validator runs, or
- A documented `frontmatter_fields:` contract adopters opt into, or
- A `slash_commands:` entry the adopter invokes deliberately.

This keeps the core framework's behaviour fully predictable.

---

## Capabilities a Plugin May Provide

| Capability | What it means |
|---|---|
| **frontmatter field** | Plugin reserves a YAML key (e.g. `model:`) that prompts and agents MAY declare. Validator checks the value resolves against the plugin's config. |
| **slash command** | A `*.prompt.md` shipped in `.github/prompts/` that only makes sense when the plugin is active. The plugin owns its lifecycle. |
| **governed tool** | Standard governed-tool JSON files under the plugin's `tools/`, validated against `.ai/agents/tools/_schema.json`. |
| **validator check** | A named lint rule the central validator wires into its run when the plugin is `experimental`/`stable`. |
| **discovery script** | A `scripts/detect-*.ps1` (or `.sh`) the adopter runs to inventory their environment — see [Reference Plugins](#reference-plugins) for the pattern. |
| **adapter spec** | A `.md` file under `adapters/` describing how to talk to an external service. No code — just the contract. |

---

## Adopter Workflow

1. **Inspect** — run `/ai-plugin-discover` to see what plugins ship with the template and which are active.
2. **Probe** — run any discovery scripts the plugin provides (e.g. for
   model-dispatch, probe local LLM endpoints + machine specs).
3. **Configure** — copy `examples/*` into the plugin's own working files,
   edit for the adopter's environment.
4. **Enable** — flip `status: disabled` → `experimental` in `plugin.yaml`.
5. **Validate** — run `pwsh .github/scripts/validate-instructions.ps1` to
   confirm the manifest and config are well-formed.
6. **Promote** — once stable in practice, flip to `status: stable`.

To disable: flip status back to `disabled`, or delete the plugin directory.

---

## Authoring a New Plugin

1. Pick a kebab-case name. Consult the naming agent if unsure
   ([.github/agents/pds-man-naming.agent.md](../../.github/agents/pds-man-naming.agent.md)).
2. Create `.ai/plugins/<name>/` with the three required files.
3. Set `status: disabled` until the plugin is usable.
4. If the plugin contributes a slash command, governed tool, or validator
   check, declare it in `plugin.yaml → provides:`.
5. Add `.ai/plugins/<name>/state/` to the plugin's own `.gitignore` (or
   rely on the project-wide rule that ignores `.ai/plugins/*/state/`).
6. Document enable steps in the plugin's `README.md`.
7. Run the validator. Commit.

---

## Reference Plugins

- **[`model-dispatch/`](model-dispatch/README.md)** — Optional model-routing
  layer. Ships disabled. Provides a `model:` frontmatter contract, a
  `/ai-plugin-discover`-runnable discovery script for local LLM inventory,
  and a reference tier table. Adopters with multiple local/cloud models can
  enable it; everyone else ignores it.
