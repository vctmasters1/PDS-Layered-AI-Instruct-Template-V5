#!/usr/bin/env pwsh
# setup.ps1 — One-shot project setup for PDS-Layered-AI-Instruct-Template-V5
#
# What this does:
#   1. Detects if cloned into unnecessary wrapper directory and flattens it
#   2. Verifies you are in a git repo
#   3. Installs the pre-commit hook (credential-leak protection)
#   4. Creates root .env from .env.example if missing
#   5. Runs the AI-INSTRUCT drift validator
#   6. Prints next steps (you still drive /ai-onboard yourself in Copilot Chat)
#
# Safe to re-run. Does not overwrite existing files.

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptName = Split-Path -Leaf $MyInvocation.MyCommand.Path

Push-Location $scriptDir
try {
  function Write-Step($n, $msg) { Write-Host "[$n/5] $msg" -ForegroundColor Green }
  function Write-Skip($n, $msg) { Write-Host "[$n/5] $msg" -ForegroundColor Yellow }

  Write-Host "==> PDS-Layered-AI-Instruct-Template-V5 setup" -ForegroundColor Cyan
  Write-Host ""

  # --- 0. Detect and flatten cloned wrapper directory ---
  $parent = Split-Path -Parent $scriptDir
  $parentName = Split-Path -Leaf $parent
  
  # If parent dir is PDS-Layered-AI-Instruct-Template-V5 and parent's parent has no .git,
  # we're likely in: PDS-Layered-AI-Instruct-Template-V5/PDS-Layered-AI-Instruct-Template-V5/
  # This happens when cloning created a wrapper.
  
  if ($parentName -eq "PDS-Layered-AI-Instruct-Template-V5") {
    $grandparent = Split-Path -Parent $parent
    if (Test-Path (Join-Path $parent ".git") -and -not (Test-Path (Join-Path $grandparent ".git"))) {
      # We're in the wrapper; the real repo is the parent
      Write-Host "[0/5] Detected unnecessary wrapper directory." -ForegroundColor Yellow
      Write-Host "      Moving contents up one level..." -ForegroundColor Yellow
      
      Pop-Location  # Go back to grandparent
      
      # Backup old wrapper for safety
      $backupName = "$parent.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
      Move-Item $parent $backupName -ErrorAction SilentlyContinue
      
      # Move real repo to the right place
      $tempName = "temp-repo-move-$(Get-Random)"
      Move-Item (Join-Path $backupName ".") $tempName
      Remove-Item $backupName -ErrorAction SilentlyContinue
      Move-Item $tempName $parent
      
      Push-Location $parent
      Write-Step 0 "Wrapper directory flattened"
    }
  }

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
    Write-Host "[5/5] Running AI-INSTRUCT drift validator..." -ForegroundColor Cyan
    try { & pwsh -NoProfile -File .github/scripts/validate-instructions.ps1 } catch { Write-Host $_ -ForegroundColor Yellow }
  }
  else {
    Write-Skip 5 'validator script not found — skipped'
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
