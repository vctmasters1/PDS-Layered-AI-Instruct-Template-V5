param(
    [string]$DeviceId    = "",
    [string]$ApiBase     = "",
    [string]$BearerToken = ""
)

# ── Load defaults from .pds_pipeline_config.json ─────────────────────────────
$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$configFile = Join-Path $scriptDir ".pds_pipeline_config.json"
if (Test-Path $configFile) {
    $cfg = Get-Content $configFile -Raw | ConvertFrom-Json
    if (-not $ApiBase)     { $ApiBase     = $cfg.apiBase }
    if (-not $BearerToken) { $BearerToken = $cfg.bearerToken }
    if (-not $DeviceId)    { $DeviceId    = $cfg.deviceId }
}

if (-not $ApiBase -or -not $BearerToken -or -not $DeviceId) {
    Write-Error "Missing API connection details. Pass -ApiBase, -BearerToken, -DeviceId or save them via the Pipeline Push panel in VS Code."
    exit 1
}

$token = $BearerToken
$h = @{ Authorization = "Bearer $token" }
$id = $DeviceId
$base = $ApiBase.TrimEnd('/')

Write-Host "=== DEVICE STATUS ===" -ForegroundColor Cyan
$dev = Invoke-RestMethod -Uri "$base/devices/$id" -Headers $h
$dev | Select-Object lastSeenAt, pendingPipelineAt, ipAddress | Format-List

$now = [DateTimeOffset]::UtcNow
$lastSeen = [DateTimeOffset]::Parse($dev.lastSeenAt)
$age = ($now - $lastSeen).TotalSeconds
Write-Host "Last seen: $([math]::Round($age))s ago" -ForegroundColor $(if ($age -lt 15) {"Green"} elseif ($age -lt 60) {"Yellow"} else {"Red"})
Write-Host "Pending pipeline: $(if ($dev.pendingPipelineAt) { $dev.pendingPipelineAt } else { 'none (already consumed or never queued)' })"

Write-Host ""
Write-Host "=== LATEST TELEMETRY SNAPSHOT ===" -ForegroundColor Cyan
$tel = Invoke-RestMethod -Uri "$base/devices/$id/telemetry?limit=1" -Headers $h
$row = $tel.rows[0]
Write-Host "Packet #$($row.packetId)  uptime=$($row.deviceUptimeMs)ms  captured=$($row.capturedAt)"
Write-Host "ADC readings : $($row.snapshot.adcReadings.Count)"
Write-Host "PWM outputs  : $($row.snapshot.pwmOutputs.Count)"
Write-Host "GPIO states  : $($row.snapshot.gpioStates.Count)"
if ($row.snapshot.adcReadings.Count -gt 0) { $row.snapshot.adcReadings | Format-Table }
if ($row.snapshot.pwmOutputs.Count -gt 0)  { $row.snapshot.pwmOutputs  | Format-Table }
if ($row.snapshot.gpioStates.Count -gt 0)  { $row.snapshot.gpioStates  | Format-Table }
Write-Host ""
Write-Host "Total telemetry records: $($tel.total)"
