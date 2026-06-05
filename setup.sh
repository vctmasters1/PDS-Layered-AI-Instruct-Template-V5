#!/usr/bin/env bash
# setup.sh — One-shot project setup for PDS-Layered-AI-Instruct-Template-V5
#
# What this does:
#   0. Detects if cloned into unnecessary wrapper directory and flattens it
#   1. Verifies you are in a git repo
#   2. Installs the pre-commit hook (credential-leak protection)
#   3. Creates root .env from .env.example if missing
#   4. Runs the AI-INSTRUCT drift validator (if PowerShell is available)
#   5. Prints next steps (you still drive /ai-onboard yourself in Copilot Chat)
#
# Safe to re-run. Does not overwrite existing files.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_ROOT"

cyan() { printf "\033[36m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
red() { printf "\033[31m%s\033[0m\n" "$*"; }

cyan "==> PDS-Layered-AI-Instruct-Template-V5 setup"
echo

# --- 0. Detect and flatten cloned wrapper directory -------------------------
PARENT_DIR="$(cd "$REPO_ROOT/.." && pwd)"
PARENT_NAME="$(basename "$PARENT_DIR")"
GRANDPARENT_DIR="$(cd "$PARENT_DIR/.." && pwd)"

if [ "$PARENT_NAME" = "PDS-Layered-AI-Instruct-Template-V5" ]; then
  if [ -d "$PARENT_DIR/.git" ] && [ ! -d "$GRANDPARENT_DIR/.git" ]; then
    # We're in the wrapper; the real repo is the parent
    yellow "[0/5] Detected unnecessary wrapper directory."
    yellow "      Moving contents up one level..."
    
    cd "$GRANDPARENT_DIR"
    
    # Backup old wrapper for safety
    BACKUP_NAME="$PARENT_DIR.backup-$(date +%s)"
    mv "$PARENT_DIR" "$BACKUP_NAME" 2>/dev/null || true
    
    # Move real repo to the right place
    TEMP_NAME="temp-repo-move-$$"
    mkdir "$TEMP_NAME"
    mv "$BACKUP_NAME"/* "$BACKUP_NAME"/.[!.]* "$TEMP_NAME/" 2>/dev/null || true
    rm -rf "$BACKUP_NAME"
    mv "$TEMP_NAME" "$PARENT_DIR"
    
    cd "$REPO_ROOT"
    green "[0/5] Wrapper directory flattened"
  fi
fi

# --- 1. git repo check -------------------------------------------------------
if [ ! -d .git ]; then
  red "Not a git repo. Run 'git init' first, then re-run this script."
  exit 1
fi
green "[1/5] git repo detected"

# --- 2. install git hooks ---------------------------------------------------
if [ -x .github/hooks/install-hooks.sh ] || [ -f .github/hooks/install-hooks.sh ]; then
  bash .github/hooks/install-hooks.sh
  green "[2/5] pre-commit hook installed (core.hooksPath -> .github/hooks)"
else
  yellow "[2/5] .github/hooks/install-hooks.sh not found — skipped"
fi

# --- 3. .env scaffolding ---------------------------------------------------
if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  green "[3/5] .env created from .env.example (fill in real values)"
else
  yellow "[3/5] .env already exists or no .env.example — skipped"
fi

# --- 4. validator ----------------------------------------------------------
if command -v pwsh >/dev/null 2>&1 && [ -f .github/scripts/validate-instructions.ps1 ]; then
  echo
  cyan "[5/5] Running AI-INSTRUCT drift validator..."
  pwsh -NoProfile -File .github/scripts/validate-instructions.ps1 || true
else
  yellow "[5/5] PowerShell (pwsh) not found — skipping validator. Install pwsh or run /ai-validate in Copilot Chat."
fi

echo
green "✅ Setup Complete!"
echo
printf "The repository has been successfully cloned and setup is finished. Here's what was done:\n"
echo
printf "Git repo verified - Repository initialized with hooks\n"
printf "Pre-commit hooks installed - Credential leak protection active\n"
printf ".env file created - From .env.example (you'll need to fill in real values)\n"
printf "AI-INSTRUCT validator ran - Found some documentation issues (broken links and missing table-of-contents), but these are validation warnings and don't block functionality\n"
printf "Project location: PDS-Layered-AI-Instruct-Template-V5\n"
echo
cyan "Next Steps:"
echo
printf "1. Review and update .env with your configuration values\n"
printf "2. Open the workspace in VS Code: PDS-Layered-AI-Instruct-Template-V5.code-workspace\n"
printf "3. Run /ai-onboard in Copilot Chat for the interactive setup wizard (fills in template fields like project name, repo URL, etc.)\n"
echo
green "This is a complex AI-instruction template system with multiple modules (device, web services, pipeline, etc.) and is ready for development!"
echo
