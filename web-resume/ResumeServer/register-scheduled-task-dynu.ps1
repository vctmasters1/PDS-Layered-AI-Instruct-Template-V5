# register-scheduled-task-dynu.ps1 — Setup Dynu DDNS auto-update task
# Registers a Windows Task Scheduler task to run dynu-update.ps1 every 5 minutes
#
# MUST BE RUN AS ADMINISTRATOR
#
# Usage:
#   1. Open PowerShell as Administrator
#   2. Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
#   3. cd "K:\PDS-Master-001\WEB-Resume\ResumeServer"
#   4. .\register-scheduled-task-dynu.ps1
#
# To view the task:
#   Get-ScheduledTask -TaskName "DynuUpdate-ResumeSuite" | Format-List *
#
# To remove the task:
#   Unregister-ScheduledTask -TaskName "DynuUpdate-ResumeSuite" -Confirm:$false

#Requires -RunAsAdministrator

param(
    [string]$TaskName = "DynuUpdate-ResumeSuite",
    [string]$ScriptPath = "K:\PDS-Master-001\WEB-Resume\ResumeServer\dynu-update.ps1",
    [int]$IntervalMinutes = 5
)

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Dynu DDNS Auto-Update Task Registration                   ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $ScriptPath)) {
    Write-Host "ERROR: Script not found: $ScriptPath" -ForegroundColor Red
    exit 1
}

# Check if task already exists
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Write-Host "Found existing task '$TaskName'" -ForegroundColor Yellow
    Write-Host "Removing old task..." -ForegroundColor Cyan
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false | Out-Null
    Start-Sleep -Seconds 1
}

# Create the task action
$action = New-ScheduledTaskAction `
    -Execute "pwsh.exe" `
    -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -File `"$ScriptPath`""

# Create the trigger: repeat every N minutes, starting now, indefinitely
$trigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
    -RepetitionDuration ([TimeSpan]::MaxValue)

# Create the task settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -RunOnlyIfIdle:$false

# Register the task
Write-Host ""
Write-Host "Registering task: $TaskName" -ForegroundColor Cyan
Write-Host "  Script:   $ScriptPath" -ForegroundColor DarkGray
Write-Host "  Interval: Every $IntervalMinutes minutes" -ForegroundColor DarkGray
Write-Host "  User:     SYSTEM (runs with highest privileges)" -ForegroundColor DarkGray
Write-Host ""

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -RunLevel Highest `
    -User "SYSTEM" | Out-Null

Write-Host "✓ Task registered successfully" -ForegroundColor Green
Write-Host ""

# Run the task once immediately to test
Write-Host "Running task once to test..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "✓ Task is now running" -ForegroundColor Green
Write-Host ""
Write-Host "To view task status:" -ForegroundColor DarkGray
Write-Host "  Get-ScheduledTask -TaskName '$TaskName' | Format-List *" -ForegroundColor Gray
Write-Host ""
Write-Host "To view logs:" -ForegroundColor DarkGray
Write-Host "  Get-Content '$($ScriptPath -replace '\.ps1', '.log')'" -ForegroundColor Gray
Write-Host ""
