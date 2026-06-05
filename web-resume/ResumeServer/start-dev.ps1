# start-dev.ps1 — Starts the full local development environment.
# Runs PostgreSQL in Docker, the Express server, and the Vite dev server.
# Prerequisites: Docker Desktop, Node.js 22+, npm
#
# Flags:
#   -StartLlms   Also run start-lms-instances.ps1 to load LM Studio model instances

param(
    [switch]$StartLlms
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot

# ─── Optionally start LM Studio instances ────────────────────────────────────
if ($StartLlms) {
    Write-Host "Starting LM Studio instances..." -ForegroundColor Cyan
    & "$root\start-lms-instances.ps1"
    Write-Host ""
}

Write-Host "Starting PostgreSQL (docker-compose.dev.yml)..." -ForegroundColor Cyan
docker compose -f "$root\docker-compose.dev.yml" up -d

Write-Host "Waiting for PostgreSQL to be ready..." -ForegroundColor DarkGray
Start-Sleep -Seconds 3

# Install server deps if needed
if (-not (Test-Path "$root\node_modules")) {
    Write-Host "Installing server dependencies..." -ForegroundColor Cyan
    Push-Location $root
    npm install
    Pop-Location
}

# Install client deps if needed
if (-not (Test-Path "$root\client\node_modules")) {
    Write-Host "Installing client dependencies..." -ForegroundColor Cyan
    Push-Location "$root\client"
    npm install
    Pop-Location
}

# Create .env from .env.example if it doesn't exist
if (-not (Test-Path "$root\.env")) {
    Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item "$root\.env.example" "$root\.env"
    Write-Host "  Edit $root\.env and set JWT_SECRET before running setup." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Starting Express server (port 38291)..." -ForegroundColor Cyan
$server = Start-Process pwsh -ArgumentList "-NoProfile", "-Command", "cd '$root'; node --watch server/server.js" -PassThru -WindowStyle Normal

Write-Host "Starting Vite dev server (port 5173)..." -ForegroundColor Cyan
$client = Start-Process pwsh -ArgumentList "-NoProfile", "-Command", "cd '$root\client'; npm run dev" -PassThru -WindowStyle Normal

Write-Host ""
Write-Host "Development environment running:" -ForegroundColor Green
Write-Host "  Server:  http://localhost:38291" -ForegroundColor White
Write-Host "  Client:  http://localhost:5173" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C or close the terminal windows to stop." -ForegroundColor DarkGray

# Keep this script alive so Ctrl+C can clean up
try {
    Wait-Process -Id $server.Id
} finally {
    Stop-Process -Id $client.Id -ErrorAction SilentlyContinue
    docker compose -f "$root\docker-compose.dev.yml" down
}
