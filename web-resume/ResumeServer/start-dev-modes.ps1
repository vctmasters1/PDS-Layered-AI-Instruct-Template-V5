# start-dev.ps1 — Enhanced multi-mode development launcher
# Supports: local (http), lan (self-signed HTTPS), production (DDNS + Let's Encrypt), railway (cloud)
# 
# Usage:
#   ./start-dev.ps1                    # Interactive mode selection
#   ./start-dev.ps1 -Mode local        # Use specified mode
#   ./start-dev.ps1 -Mode lan -StartLlms  # LAN mode with LM Studio
#
# Prerequisites: Docker Desktop, Node.js 22+, npm
#
# Flags:
#   -Mode <local|lan|production|railway>   Deployment mode (interactive if not specified)
#   -StartLlms                             Also run start-lms-instances.ps1

param(
    [ValidateSet("local", "lan", "production", "railway")]
    [string]$Mode,
    [switch]$StartLlms,
    [switch]$NoClient   # Don't start Vite dev server (server-only)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot

# ─── Functions ───────────────────────────────────────────────────────────────

function Select-DeploymentMode {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║          Resume Suite — Deployment Mode Selection             ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  1. LOCAL        Development on this machine" -ForegroundColor White
    Write-Host "                  - HTTP only on localhost:5173" -ForegroundColor DarkGray
    Write-Host "                  - Express :38291, Vite :5173" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  2. LAN          Pseudo-production on local network" -ForegroundColor White
    Write-Host "                  - HTTPS with self-signed cert" -ForegroundColor DarkGray
    Write-Host "                  - Access via LAN IP (192.168.1.80:443)" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  3. PRODUCTION   Public internet with DDNS + Let's Encrypt" -ForegroundColor White
    Write-Host "                  - Auto-renewing HTTPS certificate" -ForegroundColor DarkGray
    Write-Host "                  - Requires Dynu DDNS & port forwarding" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  4. RAILWAY      Cloud deployment (external)" -ForegroundColor White
    Write-Host "                  - Requires Railway account & environment variables" -ForegroundColor DarkGray
    Write-Host ""
    
    $choice = Read-Host "Enter choice (1-4)"
    
    return @{
        "1" = "local";
        "2" = "lan";
        "3" = "production";
        "4" = "railway"
    }[$choice]
}

function Create-EnvIfMissing {
    if (-not (Test-Path "$root\.env")) {
        Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
        Copy-Item "$root\.env.example" "$root\.env"
        Write-Host "  ✓ Created .env" -ForegroundColor Green
        Write-Host ""
        Write-Host "  IMPORTANT: Edit $root\.env and fill in:" -ForegroundColor Yellow
        Write-Host "    - JWT_SECRET (generate with: node -e `"console.log(require('crypto').randomBytes(48).toString('hex'))`")" -ForegroundColor DarkGray
        Write-Host "    - POSTGRES_PASSWORD (for production mode)" -ForegroundColor DarkGray
        Write-Host "    - DYNU_TOKEN (for production mode)" -ForegroundColor DarkGray
        Write-Host ""
        Write-Host "  Press Enter after editing .env..." -ForegroundColor DarkGray
        Read-Host
    }
}

function Generate-SelfSignedCert {
    $certDir = "$root\certs"
    $certPath = "$certDir\cert.pem"
    $keyPath = "$certDir\key.pem"
    
    if ((Test-Path $certPath) -and (Test-Path $keyPath)) {
        Write-Host "✓ Self-signed cert already exists" -ForegroundColor Green
        return
    }
    
    if (-not (Test-Path $certDir)) {
        New-Item -ItemType Directory -Path $certDir | Out-Null
    }
    
    Write-Host "Generating self-signed certificate..." -ForegroundColor Cyan
    Write-Host "  Path: $certPath" -ForegroundColor DarkGray
    
    # Use OpenSSL if available, otherwise use PowerShell certificate cmdlet
    if (Get-Command openssl -ErrorAction SilentlyContinue) {
        # OpenSSL method (faster)
        openssl req -x509 -newkey rsa:2048 -keyout $keyPath -out $certPath -days 365 -nodes `
            -subj "/CN=localhost/O=Resume Suite/C=US" 2>&1 | Out-Null
    } else {
        # PowerShell method
        $cert = New-SelfSignedCertificate -CertStoreLocation cert:\CurrentUser\My `
            -DnsName "localhost", "127.0.0.1", "resumesuite.local" `
            -NotAfter (Get-Date).AddYears(1) `
            -FriendlyName "Resume Suite Local Dev"
        
        Export-PfxCertificate -Cert $cert -FilePath "$certDir\cert.pfx" -Password (ConvertTo-SecureString -String "temp" -AsPlainText -Force) | Out-Null
        
        # Convert PFX to PEM (requires openssl or similar)
        # For now, store the cert info for Docker
        Write-Host "  ⚠ PowerShell-generated cert requires manual PEM conversion" -ForegroundColor Yellow
        Write-Host "    Or install OpenSSL: choco install openssl" -ForegroundColor DarkGray
    }
    
    Write-Host "✓ Certificate generated" -ForegroundColor Green
}

function Update-CaddyfileForMode {
    param([string]$DeployMode)
    
    $sourceFile = "$root\.caddyfiles\$DeployMode.Caddyfile"
    if (-not (Test-Path $sourceFile)) {
        if ($DeployMode -eq "local") {
            Write-Host "⚠ Local mode: Caddy not needed" -ForegroundColor DarkGray
            return
        }
        Write-Host "ERROR: Caddyfile not found: $sourceFile" -ForegroundColor Red
        throw "Missing Caddyfile for mode: $DeployMode"
    }
    
    Write-Host "Setting Caddyfile for $DeployMode mode..." -ForegroundColor Cyan
    Copy-Item $sourceFile "$root\Caddyfile" -Force
    Write-Host "✓ Caddyfile updated" -ForegroundColor Green
}

function Start-DockerServices {
    param([string]$DeployMode)
    
    Write-Host ""
    Write-Host "Starting Docker services..." -ForegroundColor Cyan
    
    if ($DeployMode -eq "local") {
        Write-Host "Starting PostgreSQL (docker-compose.dev.yml)..." -ForegroundColor Cyan
        docker compose -f "$root\docker-compose.dev.yml" up -d
    } else {
        Write-Host "Starting full stack (docker-compose.yml)..." -ForegroundColor Cyan
        docker compose -f "$root\docker-compose.yml" up -d
    }
    
    Write-Host "Waiting for PostgreSQL to be ready..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 3
    
    Write-Host "✓ Docker services started" -ForegroundColor Green
}

function Install-Dependencies {
    Write-Host ""
    Write-Host "Checking dependencies..." -ForegroundColor Cyan
    
    if (-not (Test-Path "$root\node_modules")) {
        Write-Host "Installing server dependencies..." -ForegroundColor Cyan
        Push-Location $root
        npm install
        Pop-Location
    } else {
        Write-Host "✓ Server dependencies already installed" -ForegroundColor Green
    }
    
    if (-not $NoClient) {
        if (-not (Test-Path "$root\client\node_modules")) {
            Write-Host "Installing client dependencies..." -ForegroundColor Cyan
            Push-Location "$root\client"
            npm install
            Pop-Location
        } else {
            Write-Host "✓ Client dependencies already installed" -ForegroundColor Green
        }
    }
}

function Show-ConnectionInfo {
    param([string]$DeployMode)
    
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║              Development Environment Running                   ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    
    switch ($DeployMode) {
        "local" {
            Write-Host "  Mode: LOCAL DEVELOPMENT" -ForegroundColor Green
            Write-Host "  Client:  http://localhost:5173" -ForegroundColor White
            Write-Host "  Server:  http://localhost:38291" -ForegroundColor White
            Write-Host "  DB:      postgres://localhost:5433" -ForegroundColor White
        }
        "lan" {
            Write-Host "  Mode: LAN / PSEUDO-PRODUCTION" -ForegroundColor Green
            Write-Host "  Public:  https://192.168.1.80" -ForegroundColor White
            Write-Host "  Note:    Browser will show security warning (click 'Proceed')" -ForegroundColor Yellow
            Write-Host "  Admin:   https://192.168.1.80/admin" -ForegroundColor White
        }
        "production" {
            Write-Host "  Mode: PRODUCTION (DDNS + Let's Encrypt)" -ForegroundColor Green
            Write-Host "  Domain:  https://pds-resume-suite.mywire.org" -ForegroundColor White
            Write-Host "  Note:    Ensure ports 80+443 are port-forwarded on router" -ForegroundColor Yellow
            Write-Host "  DDNS:    Auto-updating every 5 minutes" -ForegroundColor DarkGray
        }
        "railway" {
            Write-Host "  Mode: RAILWAY CLOUD DEPLOYMENT" -ForegroundColor Green
            Write-Host "  Note:    Deploy via: railway up" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host "  Press Ctrl+C or close terminal windows to stop." -ForegroundColor DarkGray
    Write-Host ""
}

# ─── Main Script ─────────────────────────────────────────────────────────────

Write-Host ""

# Prompt for mode if not specified
if (-not $Mode) {
    $Mode = Select-DeploymentMode
    Write-Host ""
}

Write-Host "Mode: $Mode" -ForegroundColor Cyan
Write-Host ""

# Optionally start LM Studio instances
if ($StartLlms) {
    Write-Host "Starting LM Studio instances..." -ForegroundColor Cyan
    & "$root\start-lms-instances.ps1"
    Write-Host ""
}

# Create .env if needed
Create-EnvIfMissing

# Setup based on mode
if ($Mode -eq "lan") {
    Generate-SelfSignedCert
}

Update-CaddyfileForMode $Mode
Start-DockerServices $Mode
Install-Dependencies

# Start services
Write-Host ""

if ($Mode -eq "local") {
    # Local development: Express + Vite
    Write-Host "Starting Express server (port 38291)..." -ForegroundColor Cyan
    $server = Start-Process pwsh -ArgumentList "-NoProfile", "-Command", "cd '$root'; node --watch server/server.js" -PassThru -WindowStyle Normal
    
    if (-not $NoClient) {
        Start-Sleep -Seconds 2
        Write-Host "Starting Vite dev server (port 5173)..." -ForegroundColor Cyan
        $client = Start-Process pwsh -ArgumentList "-NoProfile", "-Command", "cd '$root\client'; npm run dev" -PassThru -WindowStyle Normal
        Start-Sleep -Seconds 3
        Start-Process "http://localhost:5173"
    }
} else {
    # Production modes: Docker-managed services
    Write-Host "Services running in Docker Compose..." -ForegroundColor Cyan
    Write-Host "  View logs: docker compose logs -f app" -ForegroundColor DarkGray
}

Show-ConnectionInfo $Mode

# Keep script alive
if ($Mode -eq "local") {
    try {
        if ($server) { Wait-Process -Id $server.Id }
    } finally {
        if ($client) { Stop-Process -Id $client.Id -ErrorAction SilentlyContinue }
        docker compose -f "$root\docker-compose.dev.yml" down
    }
} else {
    try {
        Write-Host "Press Ctrl+C to stop services..." -ForegroundColor DarkGray
        while ($true) { Start-Sleep -Seconds 10 }
    } finally {
        Write-Host ""
        Write-Host "Stopping Docker services..." -ForegroundColor Yellow
        docker compose down
    }
}
