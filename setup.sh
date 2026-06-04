#!/usr/bin/env bash
# setup.sh — One-shot project setup for PDS-Layered-AI-Instruct-Template-V5
#
# What this does:
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

cyan "==> PDS-Layered-AI-Instruct-Template-V4 setup"
echo

# --- 1. git repo check -----------------------------------------------------
if [ ! -d .git ]; then
  red "Not a git repo. Run 'git init' first, then re-run this script."
  exit 1
fi
green "[1/4] git repo detected"

# --- 2. install git hooks --------------------------------------------------
if [ -x .github/hooks/install-hooks.sh ] || [ -f .github/hooks/install-hooks.sh ]; then
  bash .github/hooks/install-hooks.sh
  green "[2/4] pre-commit hook installed (core.hooksPath -> .github/hooks)"
else
  yellow "[2/4] .github/hooks/install-hooks.sh not found — skipped"
fi

# --- 3. .env scaffolding ---------------------------------------------------
if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  green "[3/4] .env created from .env.example (fill in real values)"
else
  yellow "[3/4] .env already exists or no .env.example — skipped"
fi

# --- 4. validator ----------------------------------------------------------
if command -v pwsh >/dev/null 2>&1 && [ -f .github/scripts/validate-instructions.ps1 ]; then
  echo
  cyan "[4/4] Running AI-INSTRUCT drift validator..."
  pwsh -NoProfile -File .github/scripts/validate-instructions.ps1 || true
else
  yellow "[4/4] PowerShell (pwsh) not found — skipping validator. Install pwsh or run /ai-validate in Copilot Chat."
fi

echo
green "Setup complete."
cat <<EOF

Next steps:
  1. Open this repo in VS Code with GitHub Copilot enabled.
  2. In Copilot Chat, run:    /ai-onboard
     (Interactive wizard that fills in every [PLACEHOLDER].)
  3. Read TEMPLATE-USAGE.md for the manual walkthrough.
  4. Read .examples/README.md for filled-in module examples.

EOF
