# devspecs-clean.ps1 — Git clean filter for .github/dev-specs.md
#
# Purpose: Locally we keep "Template Development" mode for framework work,
# but anything committed/pushed must present as "Production / Adoption" so
# adopters cloning this repo get a functioning project skeleton, not the
# framework-development scaffold.
#
# This filter runs at `git add` time. It rewrites the Project Mode block
# from Template-Development-checked to Production-Adoption-checked.
#
# Install (one-time, local only — never committed):
#   git config filter.devspecs-mode.clean "pwsh -NoProfile -File .github/scripts/devspecs-clean.ps1"
#   git config filter.devspecs-mode.smudge cat
#   git config filter.devspecs-mode.required true
#
# Wired up by .gitattributes: ".github/dev-specs.md filter=devspecs-mode"

$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$content = [Console]::In.ReadToEnd()

# Swap the two checkboxes in the Project Mode block
$content = $content -replace '(?m)^- \[x\] \*\*Template Development\*\*', '- [ ] **Template Development**'
$content = $content -replace '(?m)^- \[ \] \*\*Production / Adoption\*\*', '- [x] **Production / Adoption**'

# Replace the "Set exactly one" assertion line (literal substring swap)
$content = $content.Replace(
  'This repository is in TEMPLATE DEVELOPMENT mode.** We are building the framework and example plugins.',
  'This repository is in PRODUCTION / ADOPTION mode.** A team is using the framework to run a real project.')

[Console]::Out.Write($content)
