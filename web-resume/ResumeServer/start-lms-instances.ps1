# start-lms-instances.ps1
# Starts LM Studio server and loads 3 instances of the model,
# pinned to the RTX 5090s on CUDA devices 0, 1, 2.
# GPU 3 (RTX 4060 Ti) is the display GPU — NEVER used for LLMs.
#
# Run once before starting the Resume Suite server.
# Identifiers map to LLM_MODEL_IDS in .env:
#   LLM_MODEL_IDS=qwen-0,qwen-1,qwen-2

param(
    [string]$Model  = 'qwen/qwen3.6-27b',
    [int]   $Port   = 1234,
    [int]   $Ctx    = 32768,
    [string]$GPUs   = '0,1,2'   # CUDA device indices of the RTX 5090s
)

$ErrorActionPreference = 'Stop'

# Guard: refuse to run if GPU 3 (RTX 4060 Ti / display GPU) is in the list
if (($GPUs -split ',').Trim() -contains '3') {
    Write-Error "GPU 3 is the RTX 4060 Ti (display GPU) and must not be used for LLMs. Remove it from -GPUs."
    exit 1
}

Write-Host ''
Write-Host '=== Resume Suite — LLM Instance Launcher ===' -ForegroundColor Cyan
Write-Host "  Model  : $Model"
Write-Host "  Port   : $Port"
Write-Host "  Context: $Ctx tokens"
Write-Host "  GPUs   : $GPUs (CUDA device indices)"
Write-Host ''

# ─── 1. Pin GPUs via persistent user env var, then (re)start the LM Studio server ─
# CUDA_VISIBLE_DEVICES must be set at the User level so LM Studio's daemon process
# inherits it at startup — setting it only in the shell session isn't enough.
$currentCuda = [System.Environment]::GetEnvironmentVariable('CUDA_VISIBLE_DEVICES', 'User')
if ($currentCuda -ne $GPUs) {
    Write-Host "  Setting CUDA_VISIBLE_DEVICES=$GPUs as User env var..." -ForegroundColor Yellow
    [System.Environment]::SetEnvironmentVariable('CUDA_VISIBLE_DEVICES', $GPUs, 'User')
    Write-Host "  NOTE: If LM Studio is open in the system tray, close and reopen it for this to take full effect." -ForegroundColor Yellow
}
$env:CUDA_VISIBLE_DEVICES = $GPUs   # also set for this session

Write-Host 'Stopping any existing LM Studio server...' -ForegroundColor DarkCyan
lms server stop 2>&1 | Out-Null
Start-Sleep -Seconds 2

Write-Host 'Starting LM Studio server...' -ForegroundColor DarkCyan
lms server start --port $Port
# Give the server a moment to bind
Start-Sleep -Seconds 3

# Verify server is up
$status = lms server status 2>&1
if ($status -notmatch 'running|started|port') {
    Write-Warning "LM Studio server may not be running. Status: $status"
    Write-Warning 'Continue anyway? (Ctrl+C to abort)'
    Read-Host | Out-Null
}

# ─── 2. Load three named instances ───────────────────────────────────────────
$instances = @(
    @{ id = 'qwen-0'; label = 'Slot 0 (GPU 0 — 5090)' },
    @{ id = 'qwen-1'; label = 'Slot 1 (GPU 1 — 5090)' },
    @{ id = 'qwen-2'; label = 'Slot 2 (GPU 2 — 5090)' }
)

foreach ($inst in $instances) {
    Write-Host "Loading $($inst.label) → identifier: $($inst.id)..." -ForegroundColor DarkCyan
    lms load $Model `
        --identifier $inst.id `
        --context-length $Ctx `
        --gpu max `
        -y
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to load instance $($inst.id). Exit code: $LASTEXITCODE"
        exit 1
    }
    Write-Host "  ✓ $($inst.id) loaded" -ForegroundColor Green
}

Write-Host ''
Write-Host '=== All 3 instances ready ===' -ForegroundColor Green
Write-Host ''
Write-Host 'Make sure your .env has:' -ForegroundColor Yellow
Write-Host "  LLM_URLS=http://host.docker.internal:$Port" -ForegroundColor White
Write-Host '  LLM_MODEL_IDS=qwen-0,qwen-1,qwen-2' -ForegroundColor White
Write-Host ''
Write-Host 'Then restart the Resume Suite server:' -ForegroundColor Yellow
Write-Host '  cd ResumeServer; docker compose up -d --build' -ForegroundColor White
Write-Host ''
