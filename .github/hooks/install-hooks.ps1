# install-hooks.ps1 — Activate this repo's git hooks on Windows (no bash required).
#
# Uses core.hooksPath so .github/hooks/ becomes the hook directory directly.
# Updates to hooks propagate to the team via normal `git pull`.
#
# Run once after cloning:
#     pwsh -NoProfile -File .github/hooks/install-hooks.ps1
#
# Note: the shipped pre-commit hook is a POSIX shell script. On Windows it runs
# under the `sh.exe` bundled with Git for Windows, which is installed by default
# with any standard Git install. No additional tooling is required.

$ErrorActionPreference = 'Stop'

$repoRoot = (& git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) {
  Write-Error "Not inside a git repository."
  exit 1
}

Set-Location $repoRoot

& git config core.hooksPath .github/hooks
Write-Host "[ok] core.hooksPath set to .github/hooks" -ForegroundColor Green
Write-Host "Done. Hooks active for this clone."
