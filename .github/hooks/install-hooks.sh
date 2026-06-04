#!/bin/sh
# install-hooks.sh — Activate this repo's git hooks.
#
# Uses core.hooksPath so .github/hooks/ becomes the hook directory directly —
# no copying, no .sample suffixes, no per-developer drift. Updates to hooks
# propagate to the team via normal `git pull`.
#
# Run once after cloning:
#     bash .github/hooks/install-hooks.sh
#
# Windows users without Git Bash can run the PowerShell equivalent:
#     pwsh -NoProfile -File .github/hooks/install-hooks.ps1

set -e

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  echo "Error: not inside a git repository." >&2
  exit 1
fi

cd "$REPO_ROOT"

git config core.hooksPath .github/hooks
echo "[ok] core.hooksPath set to .github/hooks"

# Ensure shipped hook scripts are executable on POSIX systems.
for hook in .github/hooks/pre-commit .github/hooks/commit-msg; do
  if [ -f "$hook" ]; then
    chmod +x "$hook" 2>/dev/null || true
  fi
done

echo "Done. Hooks active for this clone."
