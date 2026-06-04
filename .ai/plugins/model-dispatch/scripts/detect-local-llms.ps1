#!/usr/bin/env pwsh
# detect-local-llms.ps1 — read-only inventory of local LLM endpoints + machine specs.
#
# Honours .ai/environment.md: never installs, never modifies the host.
# Adopters run this manually before editing tiers.yaml.
#
# Probes (each independent; failures are reported, not fatal):
#   - LM Studio HTTP server on common ports
#   - LM Studio `lms` CLI (downloaded + loaded models)
#   - Ollama HTTP API + `ollama` CLI
#   - CPU / RAM / GPU(s)
#   - nvidia-smi (accurate VRAM, if NVIDIA present)
#
# Output is human-readable. For machine consumption, parse the headings.

$ErrorActionPreference = 'Continue'

function Write-Heading([string]$t) {
  Write-Host ""
  Write-Host "=== $t ===" -ForegroundColor Cyan
}

# ---- LM Studio HTTP ----------------------------------------------------------
Write-Heading "LM Studio HTTP server"
$lmsPorts = @(1234, 1235)
$lmsFound = $false
foreach ($p in $lmsPorts) {
  try {
    $r = Invoke-RestMethod -Uri "http://localhost:$p/v1/models" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "UP on port $p" -ForegroundColor Green
    $r.data | Select-Object id, owned_by | Format-Table -AutoSize
    $lmsFound = $true
    break
  }
  catch { }
}
if (-not $lmsFound) {
  Write-Host "DOWN on $($lmsPorts -join ', ')" -ForegroundColor Yellow
  Write-Host "  Start via: LM Studio -> Developer -> Start Server  (or: lms server start)"
}

# ---- LM Studio CLI -----------------------------------------------------------
Write-Heading "LM Studio CLI (lms)"
$lms = Get-Command lms -ErrorAction SilentlyContinue
if ($lms) {
  Write-Host "lms at: $($lms.Source)" -ForegroundColor Green
  Write-Host "-- downloaded --"
  & lms ls 2>&1
  Write-Host "-- loaded --"
  & lms ps 2>&1
}
else {
  Write-Host "lms CLI not on PATH" -ForegroundColor Yellow
}

# ---- Ollama HTTP -------------------------------------------------------------
Write-Heading "Ollama"
try {
  $tags = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 2 -ErrorAction Stop
  Write-Host "UP on port 11434" -ForegroundColor Green
  $tags.models | ForEach-Object {
    [pscustomobject]@{
      name   = $_.name
      GB     = [math]::Round($_.size / 1GB, 2)
      family = $_.details.family
      params = $_.details.parameter_size
      quant  = $_.details.quantization_level
    }
  } | Format-Table -AutoSize
}
catch {
  Write-Host "DOWN on port 11434" -ForegroundColor Yellow
}
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if ($ollama) { Write-Host "ollama CLI at: $($ollama.Source)" -ForegroundColor Green }

# ---- Machine ----------------------------------------------------------------
Write-Heading "Machine specs"
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
if ($cpu) {
  Write-Host ("CPU: {0}  ({1} cores / {2} threads)" -f $cpu.Name.Trim(), $cpu.NumberOfCores, $cpu.NumberOfLogicalProcessors)
}
$ram = Get-CimInstance Win32_ComputerSystem
if ($ram) {
  Write-Host ("RAM: {0} GB" -f ([math]::Round($ram.TotalPhysicalMemory / 1GB, 1)))
}

# ---- GPUs -------------------------------------------------------------------
Write-Heading "GPUs (WMI)"
$gpus = Get-CimInstance Win32_VideoController |
  Where-Object { $_.Name -notmatch 'Basic|Remote|Mirage|Virtual' }
$gpuIndex = 0
$gpus | ForEach-Object {
  Write-Host ("GPU $gpuIndex`: {0}  (driver {1})" -f $_.Name, $_.DriverVersion)
  $gpuIndex++
}

Write-Heading "nvidia-smi (accurate VRAM if NVIDIA present)"
$nvsmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($nvsmi) {
  & nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version --format=csv 2>&1
} else {
  Write-Host "nvidia-smi NOT FOUND (skip if no NVIDIA GPU)"
}

Write-Host ""
Write-Host "Next: copy tiers.example.yaml to tiers.yaml and fill model_id fields" -ForegroundColor Green
Write-Host "      based on what was detected above. Then flip plugin.yaml status to 'experimental'."
