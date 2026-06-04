# validate-instructions.ps1
# Lint the AI-INSTRUCT system for common drift issues.
# Run from the project root:  pwsh .github/scripts/validate-instructions.ps1
#
# Checks:
#   1. No live instruction file leaves `[DATE]` as a literal placeholder
#      (template-scaffold files inside .github/prompts/ are exempt).
#   2. No file uses the retired `§` cross-reference syntax.
#   3. Any .ai/instruct.md or .ai/*.md with 5+ `##` sections has a `## Contents` table.
#   4. Frontmatter sanity: every *.prompt.md declares a `mode:` field;
#      every *.agent.md declares `description:` and (recommended) `tools:`.
#   5. Relative markdown links resolve. Every `](path)` link (skipping http,
#      https, mailto, and pure `#anchor` links) is resolved against the
#      containing file's directory and flagged if the target does not exist.
#      (node_modules/ directories are excluded from this check.)
#   6. File-naming conventions (per .ai/conventions.md#file-naming):
#        - Python (*.py): snake_case
#        - Shell / PowerShell (*.sh, *.ps1): kebab-case
#        - TypeScript / JavaScript (*.ts, *.tsx, *.js, *.jsx, *.mjs, *.cjs):
#          PascalCase, camelCase, or kebab-case (whichever is idiomatic for the
#          framework in use). snake_case is rejected.
#        - C / C++ (*.c, *.h, *.cpp, *.hpp, *.cc, *.hh): snake_case
#        - Markdown (*.md): kebab-case, except UPPER-KEBAB-CASE.md at repo root,
#          numbered guides (NN-kebab-case.md), and tool-mandated names
#          (copilot-instructions.md, SKILL.md, etc.).
#   7. Directory naming: kebab-case. Dot-prefixed directories (.ai/, .github/,
#      etc.), Python dunders (__pycache__), and ISSUE_TEMPLATE/ are exempt.
#   8. Plugins (.ai/plugins/*/plugin.yaml): manifest sanity, name/dir match,
#      valid status, required README.md and instruct.md, declared slash
#      commands resolve. Warnings on non-stable plugins are non-fatal.
#
# Exit code is 0 on success, 1 on any failure. Safe to wire into a pre-commit hook.

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/../..").Path
Set-Location $root

$problems = New-Object System.Collections.Generic.List[string]

function Add-Problem([string]$msg) { $problems.Add($msg) | Out-Null }

# Files to scan: every markdown under .ai/ and every */.ai/instruct.md and the meta file.
$instructionFiles = @(
  Get-ChildItem -Path . -Recurse -Force -File -Filter '*.md' |
  Where-Object {
    $rel = $_.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
    ($rel -like '.ai/*' -or $rel -like '*/.ai/*' -or $rel -eq '.github/copilot-instructions.md') -and
    $rel -notlike '*/.dev-docs/.old/*' -and
    $rel -notlike '.archive/*'
  }
)

foreach ($f in $instructionFiles) {
  $rel = $f.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
  $text = Get-Content -Raw -LiteralPath $f.FullName
  $isTemplate = $rel -like '.github/prompts/*'

  # 1. [DATE] placeholder check (skip template scaffolds).
  #    Match only at the start of a line so prose mentions like `**Last Updated**: [DATE]`
  #    inside backticks (used to *describe* the rule) are not flagged.
  if (-not $isTemplate -and $text -match '(?m)^\*\*Last Updated\*\*:\s*\[DATE\]') {
    Add-Problem "[DATE] placeholder unfilled: $rel"
  }

  # 2. § syntax check
  if ($text -match '\.md\s*§\s') {
    Add-Problem "Retired \u00a7 cross-reference syntax: $rel"
  }

  # 3. TOC requirement (count only real H2s, not those inside fenced code blocks)
  $textNoFences = [regex]::Replace($text, '(?ms)^```.*?^```', '')
  $h2Count = ([regex]::Matches($textNoFences, '(?m)^## ')).Count
  if ($h2Count -ge 5 -and $textNoFences -notmatch '(?m)^## Contents\b') {
    Add-Problem "Missing '## Contents' table (file has $h2Count sections): $rel"
  }
}

# 4. Frontmatter sanity for prompts and agents
$promptFiles = Get-ChildItem -Path .github/prompts -Filter '*.prompt.md' -File -ErrorAction SilentlyContinue
foreach ($f in $promptFiles) {
  $rel = $f.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
  $head = (Get-Content -LiteralPath $f.FullName -TotalCount 10) -join "`n"
  if ($head -notmatch '(?m)^mode:\s*(ask|edit|agent)\s*$') {
    Add-Problem "Prompt missing 'mode: ask|edit|agent' in frontmatter: $rel"
  }
  if ($head -notmatch '(?m)^description:\s*\S') {
    Add-Problem "Prompt missing 'description:' in frontmatter: $rel"
  }
}

$agentFiles = Get-ChildItem -Path .github/agents -Filter '*.agent.md' -File -ErrorAction SilentlyContinue
foreach ($f in $agentFiles) {
  $rel = $f.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
  $head = (Get-Content -LiteralPath $f.FullName -TotalCount 30) -join "`n"
  if ($head -notmatch '(?m)^description:') {
    Add-Problem "Agent missing 'description:' in frontmatter: $rel"
  }
}

# 5. Relative link checker. Scan every .md file (excluding archives) and resolve
#    relative `](target)` links against the linking file's directory.
$allMdFiles = Get-ChildItem -Path . -Recurse -Force -File -Filter '*.md' |
Where-Object {
  $rel = $_.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
  $rel -notlike '.archive/*' -and $rel -notlike '*/.dev-docs/.old/*' -and $rel -notlike '*/.old/*' -and $rel -notlike '.github/tmp/*' -and $rel -notlike '.github/debug/*' -and $rel -notlike '*/node_modules/*'
}

$linkRegex = [regex]'\]\(([^)\s]+?)(?:\s+"[^"]*")?\)'
$fenceRegex = [regex]'(?ms)(^|\n)```.*?(\n```|\z)'
# Path fragments that always indicate an illustrative example, not a real link.
$placeholderFragments = @(
  'path/to/',
  'relative/path',
  'new/path/',
  'path\to\',
  '/some-module/',
  '<file>',
  '<path>'
)
foreach ($f in $allMdFiles) {
  $rel = $f.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
  $text = Get-Content -Raw -LiteralPath $f.FullName
  # Strip fenced code blocks so example links inside ``` ... ``` are not checked.
  $textNoFences = $fenceRegex.Replace($text, '')
  $dir = Split-Path -Parent $f.FullName

  foreach ($m in $linkRegex.Matches($textNoFences)) {
    $target = $m.Groups[1].Value
    # Skip URLs, mailto, pure anchors, code-like fragments
    if ($target -match '^(https?:|mailto:|#|tel:|ftp:)') { continue }
    # Strip any #anchor fragment from the target before resolving.
    $pathPart = ($target -split '#', 2)[0]
    if (-not $pathPart) { continue }
    # Skip targets that look like placeholders or shell snippets.
    if ($pathPart -match '[<>`*\s]' -or $pathPart -match '\[.*\]') { continue }
    $isPlaceholder = $false
    foreach ($frag in $placeholderFragments) {
      if ($pathPart.IndexOf($frag, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
        $isPlaceholder = $true; break
      }
    }
    if ($isPlaceholder) { continue }

    try {
      $full = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($dir, $pathPart))
    }
    catch {
      Add-Problem "Unresolvable link '$target' in $rel"
      continue
    }
    if (-not (Test-Path -LiteralPath $full)) {
      Add-Problem "Broken link '$target' in $rel"
    }
  }
}

# 6. File-naming conventions (per .ai/conventions.md).
#    - Python (*.py): snake_case — no '-' in basename
#    - Shell (*.sh) and PowerShell (*.ps1): kebab-case — no '_' in basename
#    Skip vendored / generated / archive directories.
$excludedDirs = @('.archive', 'node_modules', '.venv', 'venv', '__pycache__', '.git', '.pytest_cache', 'dist', 'build', 'out', '.next')

function Test-NamingExcluded([string]$rel) {
  foreach ($d in $excludedDirs) {
    if ($rel -like "*$d/*" -or $rel -like "$d/*") { return $true }
  }
  return $false
}

$pyFiles = Get-ChildItem -Path . -Recurse -Force -File -Filter '*.py' -ErrorAction SilentlyContinue
foreach ($f in $pyFiles) {
  $rel = $f.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
  if (Test-NamingExcluded $rel) { continue }
  if ($f.BaseName -match '-') {
    Add-Problem "Python file must be snake_case (no '-'): $rel — see .ai/conventions.md#file-naming"
  }
}

$shellFiles = Get-ChildItem -Path . -Recurse -Force -File -Include '*.sh', '*.ps1' -ErrorAction SilentlyContinue
foreach ($f in $shellFiles) {
  $rel = $f.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
  if (Test-NamingExcluded $rel) { continue }
  if ($f.BaseName -match '_') {
    Add-Problem "Shell/PowerShell file should be kebab-case (no '_'): $rel — see .ai/conventions.md#file-naming"
  }
}

# TypeScript / JavaScript: enforce the language's own idioms (we don't reinvent).
# Accepted patterns:
#   - PascalCase for *.tsx / *.jsx (React component convention)
#   - camelCase for hooks / utilities / general modules
#   - kebab-case for routes / scripts / lib files (Next.js / NestJS / Angular convention)
# Sub-extensions (.test, .spec, .d, .config, .stories, .route, .schema, .module,
#   .controller, .service, .repository, .types) are stripped before checking the stem.
$tsJsFiles = Get-ChildItem -Path . -Recurse -Force -File -Include '*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.cjs' -ErrorAction SilentlyContinue
foreach ($f in $tsJsFiles) {
  $rel = $f.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
  if (Test-NamingExcluded $rel) { continue }
  $stem = $f.BaseName
  # Strip stacked role/sub-extensions iteratively (e.g., login.integration.test -> login).
  $roleSuffix = '\.(test|spec|d|config|stories|route|schema|module|controller|service|repository|types|integration|e2e)$'
  while ($stem -cmatch $roleSuffix) {
    $stem = $stem -replace $roleSuffix, ''
  }
  # Accept PascalCase, camelCase, or kebab-case. Reject snake_case (not idiomatic in TS/JS).
  if ($stem -cmatch '^[A-Z][A-Za-z0-9]*$') { continue }              # PascalCase
  if ($stem -cmatch '^[a-z][a-zA-Z0-9]*$') { continue }              # camelCase
  if ($stem -cmatch '^[a-z0-9]+(-[a-z0-9]+)*$') { continue }         # kebab-case
  Add-Problem "TS/JS file should be PascalCase, camelCase, or kebab-case: $rel — see .ai/conventions.md#file-naming"
}

# C / C++: snake_case.c/.h/.cpp/.hpp — reject '-' in the stem.
$cFiles = Get-ChildItem -Path . -Recurse -Force -File -Include '*.c', '*.h', '*.cpp', '*.hpp', '*.cc', '*.hh' -ErrorAction SilentlyContinue
foreach ($f in $cFiles) {
  $rel = $f.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
  if (Test-NamingExcluded $rel) { continue }
  if ($f.BaseName -match '-') {
    Add-Problem "C/C++ file must be snake_case (no '-'): $rel — see .ai/conventions.md#file-naming"
  }
}

# Markdown: kebab-case.md everywhere except a small allow-list.
#   - Root meta files: UPPER-KEBAB-CASE.md (README, CONTRIBUTING, CHANGELOG, LICENSE, AGENTS, CLAUDE, TEMPLATE-USAGE, etc.)
#   - Numbered user guides: NN-kebab-case.md
#   - Tool-mandated: copilot-instructions.md, SKILL.md
#   - .dev-docs/ allows index.md plus free-form notes (skipped)
$mdFiles = Get-ChildItem -Path . -Recurse -Force -File -Filter '*.md' -ErrorAction SilentlyContinue
foreach ($f in $mdFiles) {
  $rel = $f.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
  if (Test-NamingExcluded $rel) { continue }
  if ($rel -like '*/.dev-docs/*' -or $rel -like '.dev-docs/*') { continue }
  if ($rel -like '.github/tmp/*' -or $rel -like '.github/debug/*') { continue }
  $name = $f.Name
  $stem = $f.BaseName

  # Tool-mandated names anywhere in the tree.
  if ($name -in 'SKILL.md', 'copilot-instructions.md', 'CODEOWNERS', 'PULL_REQUEST_TEMPLATE.md', 'README.md') { continue }

  # Role-suffixed markdown: kebab-case-stem.<role>.md (e.g., pds-man-naming.agent.md, ai-archive.prompt.md, foo.instructions.md).
  if ($stem -cmatch '^[a-z0-9]+(-[a-z0-9]+)*\.(agent|prompt|instructions|skill)$') { continue }

  # Files at repo root: UPPER-KEBAB-CASE.md is the root-meta convention.
  $isRoot = ($rel -eq $name)
  if ($isRoot) {
    if ($stem -cmatch '^[A-Z][A-Z0-9-]*$') { continue }
    if ($stem -cmatch '^[a-z][a-z0-9-]*$') { continue }  # also accept lowercase kebab at root
    Add-Problem "Root markdown should be UPPER-KEBAB-CASE.md (or kebab-case.md): $rel — see .ai/conventions.md#file-naming"
    continue
  }

  # Numbered guides (any directory): NN-kebab-case.md
  if ($stem -cmatch '^[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*$') { continue }

  # Standard kebab-case.md (leading dot allowed for intentionally-hidden template/policy files)
  if ($stem -cmatch '^\.?[a-z0-9]+(-[a-z0-9]+)*$' -or $stem -cmatch '^\.?[a-z0-9]+(\.[a-z0-9]+)*$') { continue }

  # ISSUE_TEMPLATE/ files use SCREAMING_SNAKE by GitHub convention.
  if ($rel -like '.github/ISSUE_TEMPLATE/*') { continue }

  Add-Problem "Markdown file should be kebab-case.md: $rel — see .ai/conventions.md#file-naming"
}

# Directories: kebab-case. Skip dot-prefixed, vendored, generated, and Python package dunders.
$dirs = Get-ChildItem -Path . -Recurse -Force -Directory -ErrorAction SilentlyContinue
foreach ($d in $dirs) {
  $rel = $d.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
  if (Test-NamingExcluded $rel) { continue }
  # Skip if any path component is dot-prefixed (.ai, .github, .vscode, .dev-docs, .archive, .examples...).
  $skipDot = $false
  foreach ($part in $rel.Split('/')) {
    if ($part.StartsWith('.')) { $skipDot = $true; break }
  }
  if ($skipDot) { continue }
  $leaf = $d.Name
  # Allow Python dunders and conventional GitHub uppercase dirs.
  if ($leaf -match '^__.+__$') { continue }
  if ($leaf -in 'ISSUE_TEMPLATE') { continue }
  if ($leaf -cmatch '^[a-z0-9]+(-[a-z0-9]+)*$') { continue }
  Add-Problem "Directory should be kebab-case: $rel — see .ai/conventions.md#directory-naming"
}

# 8. Plugins (.ai/plugins/*/plugin.yaml).
#    - Manifest must exist and parse.
#    - `name:` must match the directory name.
#    - `status:` must be one of disabled|experimental|stable.
#    - Each declared slash command must exist under .github/prompts/.
#    Warnings are reported as problems for `stable` plugins (fail), and as
#    soft warnings (printed but not failing) for `experimental` plugins.
$pluginRoot = Join-Path $root '.ai/plugins'
$pluginCount = 0
$pluginWarnings = New-Object System.Collections.Generic.List[string]
if (Test-Path -LiteralPath $pluginRoot) {
  $pluginDirs = Get-ChildItem -Path $pluginRoot -Directory -ErrorAction SilentlyContinue
  foreach ($pd in $pluginDirs) {
    $manifest = Join-Path $pd.FullName 'plugin.yaml'
    if (-not (Test-Path -LiteralPath $manifest)) { continue }   # not a plugin dir
    $pluginCount++
    $relPlugin = $pd.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
    $lines = Get-Content -LiteralPath $manifest

    function Get-YamlScalar([string[]]$src, [string]$key) {
      foreach ($ln in $src) {
        if ($ln -match "^\s*$([regex]::Escape($key))\s*:\s*(.+?)\s*$") {
          return $Matches[1].Trim().Trim('"').Trim("'")
        }
      }
      return $null
    }

    $name = Get-YamlScalar $lines 'name'
    $status = Get-YamlScalar $lines 'status'
    $version = Get-YamlScalar $lines 'version'

    $isStable = ($status -eq 'stable')
    $report = if ($isStable) { ${function:Add-Problem} } else { { param($m) $pluginWarnings.Add($m) | Out-Null } }

    if (-not $name) { & $report "Plugin manifest missing 'name': $relPlugin/plugin.yaml" }
    elseif ($name -ne $pd.Name) {
      & $report "Plugin 'name: $name' must match directory '$($pd.Name)': $relPlugin/plugin.yaml"
    }
    if (-not $version) { & $report "Plugin manifest missing 'version': $relPlugin/plugin.yaml" }
    if (-not $status) {
      & $report "Plugin manifest missing 'status': $relPlugin/plugin.yaml"
    }
    elseif ($status -notin @('disabled', 'experimental', 'stable')) {
      & $report "Plugin 'status: $status' must be disabled|experimental|stable: $relPlugin/plugin.yaml"
    }

    # README.md and instruct.md required.
    foreach ($req in @('README.md', 'instruct.md')) {
      if (-not (Test-Path -LiteralPath (Join-Path $pd.FullName $req))) {
        & $report "Plugin missing required file '$req': $relPlugin/"
      }
    }

    # Declared slash commands must exist (only check when not disabled).
    if ($status -ne 'disabled') {
      $inProvides = $false
      $inSlash = $false
      foreach ($ln in $lines) {
        if ($ln -match '^\s*provides\s*:\s*$') { $inProvides = $true; continue }
        if ($inProvides -and $ln -match '^\S') { $inProvides = $false; $inSlash = $false }
        if ($inProvides -and $ln -match '^\s*slash_commands\s*:\s*$') { $inSlash = $true; continue }
        if ($inSlash) {
          if ($ln -match '^\s*-\s*(.+?)\s*$') {
            $sc = $Matches[1].Trim()
            $scFile = Join-Path $root ".github/prompts/$sc.prompt.md"
            if (-not (Test-Path -LiteralPath $scFile)) {
              & $report "Plugin declares slash command '/$sc' but .github/prompts/$sc.prompt.md does not exist: $relPlugin/"
            }
          }
          elseif ($ln -notmatch '^\s*-' -and $ln -match '^\s*\S') {
            $inSlash = $false
          }
        }
      }
    }
  }
}

# 9. Index freshness: .ai/index.md must be at least as recent as the newest
#    .ai/instruct.md it indexes. Drift indicates `/ai-update-index` was not
#    run after an architectural change.
$indexFile = Join-Path $root '.ai/index.md'
if (Test-Path -LiteralPath $indexFile) {
  $indexMtime = (Get-Item -LiteralPath $indexFile).LastWriteTimeUtc
  $instructFiles = Get-ChildItem -Path . -Recurse -Force -File -Filter 'instruct.md' -ErrorAction SilentlyContinue |
  Where-Object {
    $rel = $_.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
    ($rel -like '.ai/*' -or $rel -like '*/.ai/*') -and
    $rel -notlike '*/.old/*' -and $rel -notlike '.archive/*'
  }
  $stale = $instructFiles | Where-Object { $_.LastWriteTimeUtc -gt $indexMtime }
  if ($stale.Count -gt 0) {
    $newest = ($stale | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1)
    $newestRel = $newest.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
    Add-Problem ".ai/index.md is older than $($stale.Count) instruct.md file(s) (newest: $newestRel) — run /ai-update-index"
  }
}

if ($problems.Count -eq 0) {
  if ($pluginWarnings.Count -gt 0) {
    Write-Host "Plugin warnings ($($pluginWarnings.Count) — non-fatal for non-stable plugins):" -ForegroundColor Yellow
    foreach ($w in $pluginWarnings) { Write-Host "  - $w" -ForegroundColor DarkYellow }
  }
  $extra = if ($pluginCount -gt 0) { ", $pluginCount plugin(s) scanned" } else { '' }
  Write-Host "OK: AI-INSTRUCT validation passed ($($instructionFiles.Count) files scanned$extra)." -ForegroundColor Green
  exit 0
}
else {
  Write-Host "FAIL: $($problems.Count) issue(s) found:" -ForegroundColor Red
  foreach ($p in $problems) { Write-Host "  - $p" -ForegroundColor Yellow }
  if ($pluginWarnings.Count -gt 0) {
    Write-Host "Plugin warnings ($($pluginWarnings.Count) — non-fatal):" -ForegroundColor Yellow
    foreach ($w in $pluginWarnings) { Write-Host "  - $w" -ForegroundColor DarkYellow }
  }
  exit 1
}
