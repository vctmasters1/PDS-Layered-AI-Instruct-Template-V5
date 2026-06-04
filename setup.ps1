#!/usr/bin/env pwsh
# setup.ps1 — One-shot project setup for PDS-Layered-AI-Instruct-Template-V5
#
# What this does:
#   1. Verifies you are in a git repo
#   2. Installs the pre-commit hook (credential-leak protection)
#   3. Creates root .env from .env.example if missing
#   4. Runs the AI-INSTRUCT drift validator
#   5. Prints next steps (you still drive /ai-onboard yourself in Copilot Chat)
#
# Safe to re-run. Does not overwrite existing files.

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

Push-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
try {
  function Write-Step($n, $msg) { Write-Host "[$n/4] $msg" -ForegroundColor Green }
  function Write-Skip($n, $msg) { Write-Host "[$n/4] $msg" -ForegroundColor Yellow }

  Write-Host "==> PDS-Layered-AI-Instruct-Template-V5 setup" -ForegroundColor Cyan
  Write-Host ""

  # --- 1. git repo check ---
  if (-not (Test-Path .git)) {
    Write-Host "Not a git repo. Run 'git init' first, then re-run this script." -ForegroundColor Red
    exit 1
  }
  Write-Step 1 'git repo detected'

  # --- 2. install hooks ---
  if (Test-Path .github/hooks/install-hooks.ps1) {
    & pwsh -NoProfile -File .github/hooks/install-hooks.ps1
    Write-Step 2 'pre-commit hook installed (core.hooksPath -> .github/hooks)'
  }
  else {
    Write-Skip 2 '.github/hooks/install-hooks.ps1 not found — skipped'
  }

  # --- 3. .env scaffolding ---
  if (-not (Test-Path .env) -and (Test-Path .env.example)) {
    Copy-Item .env.example .env
    Write-Step 3 '.env created from .env.example (fill in real values)'
  }
  else {
    Write-Skip 3 '.env already exists or no .env.example — skipped'
  }

  # --- 4. validator ---
  if (Test-Path .github/scripts/validate-instructions.ps1) {
    Write-Host ""
    Write-Host "[4/4] Running AI-INSTRUCT drift validator..." -ForegroundColor Cyan
    try { & pwsh -NoProfile -File .github/scripts/validate-instructions.ps1 } catch { Write-Host $_ -ForegroundColor Yellow }
  }
  else {
    Write-Skip 4 'validator script not found — skipped'
  }

  Write-Host ""
  Write-Host "Setup complete." -ForegroundColor Green
  Write-Host @"

Next steps:
  1. Open this repo in VS Code with GitHub Copilot enabled.
  2. In Copilot Chat, run:    /ai-onboard
     (Interactive wizard that fills in every [PLACEHOLDER].)
  3. Read TEMPLATE-USAGE.md for the manual walkthrough.
  4. Read .examples/README.md for filled-in module examples.

"@
}
finally {
  Pop-Location
}
