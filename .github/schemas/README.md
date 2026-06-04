# `.github/schemas/`

JSON Schemas for the YAML frontmatter blocks used in this template's customization files.

| Schema | Applies to | Enforced by |
|---|---|---|
| [`prompt-frontmatter.schema.json`](prompt-frontmatter.schema.json) | `.github/prompts/*.prompt.md` | `.github/scripts/validate-instructions.ps1` (section 4) |
| [`agent-frontmatter.schema.json`](agent-frontmatter.schema.json) | `.github/agents/*.agent.md` | same |

These schemas are **informational and editor-facing**. The PowerShell validator is the runtime source of truth — the schemas here document the same contract in a portable, machine-readable form so editors with JSON Schema support can offer completion and inline validation.

## Editor wiring (optional)

VS Code can validate the YAML frontmatter against these schemas via the [YAML extension](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml). See [`../../.vscode/settings.json`](../../.vscode/settings.json) for the `yaml.schemas` entry (commented example).

## See also

- [`.ai/agents/tools/_schema.json`](../../.ai/agents/tools/_schema.json) — schema for governed-tool JSON files (enforced by `.ai/engine/validate_tools.py`).
- [`.github/copilot-instructions.md` → YAML Frontmatter Schema](../copilot-instructions.md#yaml-frontmatter-schema) — narrative description of the same fields.
