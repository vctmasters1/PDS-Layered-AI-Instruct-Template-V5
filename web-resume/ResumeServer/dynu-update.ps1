# dynu-update.ps1 — Dynu DDNS IP updater
# Updates your DDNS domain with your current public IP every N minutes
# Can be run standalone or scheduled via Windows Task Scheduler
#
# Setup:
#   1. Get your Dynu API token from: https://www.dynu.com/ControlPanel/DynamicDNS/API
#   2. Set it in: ResumeServer\.env (DYNU_TOKEN=...)
#   3. Run this script once to test
#   4. Schedule it to run every 5 minutes via Task Scheduler (optional)
#
# Scheduling (Windows Task Scheduler):
#   1. Open Task Scheduler (taskschd.msc)
#   2. Create Basic Task: "DynuUpdate-ResumeSuite"
#   3. Trigger: Repeat every 5 minutes indefinitely
#   4. Action: pwsh.exe with argument: -NonInteractive -WindowStyle Hidden -File "K:\PDS-Master-001\WEB-Resume\ResumeServer\dynu-update.ps1"
#   5. Settings: Allow on-demand; Run with highest privileges
#
# Manual scheduling via PowerShell (run as admin):
#   See: register-scheduled-task-dynu.ps1

param(
    [string]$ConfigPath = "$PSScriptRoot\.env",
    [int]$UpdateIntervalSeconds = 300  # 5 minutes
)

# ─── Configuration ───────────────────────────────────────────────────────────

# Load configuration from .env
function Load-Config {
    if (-not (Test-Path $ConfigPath)) {
        Write-Host "ERROR: Config file not found: $ConfigPath" -ForegroundColor Red
        Write-Host "Please create .env with DYNU_TOKEN set" -ForegroundColor Yellow
        exit 1
    }
    
    $config = @{}
    Get-Content $ConfigPath | Where-Object { $_ -match "^[^#]" } | ForEach-Object {
        $key, $value = $_ -split '=', 2
        $config[$key.Trim()] = $value.Trim() -replace '^"|"$'
    }
    return $config
}

function Get-PublicIP {
    try {
        # Primary method: AWS checkip
        $ip = (Invoke-WebRequest -Uri "https://checkip.amazonaws.com" -TimeoutSec 5).Content.Trim()
        return $ip
    } catch {
        try {
            # Fallback: icanhazip.com
            $ip = (Invoke-WebRequest -Uri "https://icanhazip.com" -TimeoutSec 5).Content.Trim()
            return $ip
        } catch {
            Write-Host "ERROR: Failed to get public IP" -ForegroundColor Red
            return $null
        }
    }
}

function Update-DynuIP {
    param(
        [string]$Domain,
        [string]$Token,
        [string]$IP
    )
    
    # Dynu API: https://www.dynu.com/ControlPanel/DynamicDNS/API
    $uri = "https://api.dynu.com/nic/update?username=$Domain&password=$Token&myip=$IP"
    
    try {
        $response = Invoke-WebRequest -Uri $uri -TimeoutSec 10 -UseBasicParsing
        $result = $response.Content
        
        if ($result -match "good|nochg") {
            return @{
                Success = $true
                Message = $result
            }
        } else {
            return @{
                Success = $false
                Message = "Dynu API error: $result"
            }
        }
    } catch {
        return @{
            Success = $false
            Message = "Update failed: $_"
        }
    }
}

function Log-Update {
    param([string]$Message)
    
    $logFile = "$PSScriptRoot\.dynu-update.log"
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] $Message"
    Add-Content -Path $logFile -Value $logEntry
    Write-Host $logEntry
}

# ─── Main Loop ───────────────────────────────────────────────────────────────

$config = Load-Config

$domain = $config['DDNS_DOMAIN']
$token = $config['DYNU_TOKEN']

if (-not $domain -or -not $token) {
    Write-Host "ERROR: DDNS_DOMAIN and DYNU_TOKEN must be set in .env" -ForegroundColor Red
    exit 1
}

Write-Host "Dynu DDNS Updater" -ForegroundColor Cyan
Write-Host "Domain: $domain" -ForegroundColor DarkGray
Write-Host "Checking interval: $UpdateIntervalSeconds seconds" -ForegroundColor DarkGray
Write-Host ""

$lastIP = $null

while ($true) {
    $currentIP = Get-PublicIP
    
    if ($null -eq $currentIP) {
        Log-Update "⚠ Could not fetch public IP, retrying..."
        Start-Sleep -Seconds 30
        continue
    }
    
    if ($currentIP -ne $lastIP) {
        Log-Update "Updating Dynu: $domain → $currentIP"
        $result = Update-DynuIP -Domain $domain -Token $token -IP $currentIP
        
        if ($result.Success) {
            Log-Update "✓ Dynu updated successfully: $($result.Message)"
            $lastIP = $currentIP
        } else {
            Log-Update "✗ Dynu update failed: $($result.Message)"
        }
    } else {
        Log-Update "✓ No IP change (still $currentIP)"
    }
    
    Start-Sleep -Seconds $UpdateIntervalSeconds
}
