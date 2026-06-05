param(
    [string]$Role        = "",
    [string]$DeviceId    = "",
    [string]$ApiBase     = "",
    [string]$BearerToken = "",
    [switch]$FullPush    = $false   # Push fresh L1/L2/L3 (factory defaults). Default: meta-only (preserves device L3)
)

# ── Load defaults from .pds_pipeline_config.json ─────────────────────────────
# Config file lives at PDS-BuildTools/.pds_pipeline_config.json (one level above scripts/)
$scriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildToolsDir = Split-Path -Parent $scriptDir
$configFile    = Join-Path $buildToolsDir ".pds_pipeline_config.json"
if (Test-Path $configFile) {
    $cfg = Get-Content $configFile -Raw | ConvertFrom-Json
    if (-not $ApiBase)     { $ApiBase     = $cfg.apiBase }
    if (-not $BearerToken) { $BearerToken = $cfg.bearerToken }
    if (-not $DeviceId)    { $DeviceId    = $cfg.deviceId }
}

if (-not $Role) {
    Write-Error "Specify -Role <role_id>  (e.g. -Role AERO-001)"
    exit 1
}
if (-not $ApiBase -or -not $BearerToken -or -not $DeviceId) {
    Write-Error "Missing API connection details. Pass -ApiBase, -BearerToken, -DeviceId or save them via the Pipeline Push panel in VS Code."
    exit 1
}

$RoleDir    = Join-Path $buildToolsDir "dist\defaults\$Role"
$RolePrefix = $Role

$l1b64 = $null; $l2b64 = $null; $l3b64 = $null
if ($FullPush) {
    $l1 = [IO.File]::ReadAllBytes("$RoleDir\${RolePrefix}_l1.bin")
    $l2 = [IO.File]::ReadAllBytes("$RoleDir\${RolePrefix}_l2.bin")
    $l3 = [IO.File]::ReadAllBytes("$RoleDir\${RolePrefix}_l3.bin")
    $l1b64 = [Convert]::ToBase64String($l1)
    $l2b64 = [Convert]::ToBase64String($l2)
    $l3b64 = [Convert]::ToBase64String($l3)
    Write-Host "l1=$($l1.Length)  l2=$($l2.Length)  l3=$($l3.Length) bytes"
} else {
    Write-Host "(meta-only push — device L3 preserved; use -FullPush to reset L1/L2/L3)"
}

# ── Read role JSON for pipeline/block aliases (meta overlay) ────────────────
# Saved by the Role Editor to PDS-Role/saved_roles/<role_id>.json
# Flatten nested blocks (fan_float.fan_outputs etc.) to match L1 flat order.
$meta = $null
$wsRoot     = Split-Path -Parent $buildToolsDir
$roleJsonPath = Join-Path $wsRoot "PDS-Role\saved_roles\$Role.json"
if (Test-Path $roleJsonPath) {
    try {
        $roleConfig = Get-Content $roleJsonPath -Raw | ConvertFrom-Json
        if ($roleConfig.pipelines) {
            $metaPipelines = @()
            foreach ($pl in $roleConfig.pipelines) {
                $flatBlocks = @()
                foreach ($blk in $pl.blocks) {
                    $blockMeta = @{ alias = if ($blk.alias) { $blk.alias } else { '' }; blockType = $blk.blockType }
                    if ($blk.PSObject.Properties['fieldMeta'] -and $blk.fieldMeta) {
                        $blockMeta['fieldMeta'] = $blk.fieldMeta
                    }
                    $flatBlocks += $blockMeta
                    if ($blk.fan_outputs) {
                        foreach ($fo in $blk.fan_outputs) {
                            $foMeta = @{ alias = if ($fo.alias) { $fo.alias } else { '' }; blockType = $fo.blockType }
                            if ($fo.PSObject.Properties['fieldMeta'] -and $fo.fieldMeta) {
                                $foMeta['fieldMeta'] = $fo.fieldMeta
                            }
                            $flatBlocks += $foMeta
                        }
                    }
                }
                $pipelineEntry = @{ name = $pl.name; blocks = $flatBlocks }
                if ($pl.PSObject.Properties['kind'] -and $pl.kind -eq 'sensor') {
                    $pipelineEntry['internal'] = $true
                }
                $metaPipelines += $pipelineEntry
            }
            $meta = @{
                pipelines   = $metaPipelines
                role        = $Role
                displayName = if ($roleConfig.PSObject.Properties['display_name']) { $roleConfig.display_name } else { $null }
                pushedAt    = (Get-Date -Format 'o')
            }
            Write-Host "role meta: $($metaPipelines.Count) pipeline(s) from $roleJsonPath"
        }
        # Build pinLabels map: { "<gpio>": "<human label>" } from pin_assignments
        # Used by GET /live-state to overlay firmware auto-labels (e.g. "PWM18") with user names.
        if ($roleConfig.PSObject.Properties['pin_assignments'] -and $roleConfig.pin_assignments) {
            $pinLabels = @{}
            foreach ($prop in $roleConfig.pin_assignments.PSObject.Properties) {
                $entry = $prop.Value
                if ($entry.PSObject.Properties['gpio'] -and $entry.PSObject.Properties['label'] -and [int]$entry.gpio -ge 0) {
                    $pinLabels[[string][int]$entry.gpio] = [string]$entry.label
                }
            }
            if ($pinLabels.Count -gt 0) {
                if ($meta) { $meta.pinLabels = $pinLabels }
                else        { $meta = @{ pinLabels = $pinLabels } }
                Write-Host "role meta: $($pinLabels.Count) pin label(s) mapped from pin_assignments"
            }
        }

        # Build sensorRefMap: { "adc:<pin>": { sensorRef, alias, kind, pin, pipelineId } }
        #                      { "gpio:<pin>": { sensorRef, alias, kind, pin, pipelineId } }
        # Enables the server to reverse-map a telemetry reading (by pin) back to the role's
        # canonical sensor_ref string (e.g. "sensors_main_01:0:0" for adc_channel 35).
        # See .dev.md/TELEMETRY-REFERENCE-ARCHITECTURE.md for the full mechanism.
        $sensorRefMap = @{}
        foreach ($pl in $roleConfig.pipelines) {
            $blIdx = 0
            foreach ($blk in $pl.blocks) {
                # sensor_analog → adc:<adc_channel> → <pipeline_id>:<blockIndex>:0
                if ($blk.blockType -eq "sensor_analog" -and
                    $blk.PSObject.Properties['settings'] -and
                    $blk.settings.PSObject.Properties['adc_channel']) {
                    $adc = [string][int]$blk.settings.adc_channel
                    $sensorRefMap["adc:$adc"] = @{
                        sensorRef    = "$($pl.id):${blIdx}:0"
                        alias        = if ($blk.alias) { $blk.alias } else { "ADC$adc" }
                        kind         = "adc"
                        pin          = [int]$blk.settings.adc_channel
                        pipelineId   = [string]$pl.id
                        pipelineName = [string]$pl.name
                        blockIndex   = $blIdx
                    }
                }
                # sensor_dht22_temp / sensor_dht22_humid → periph:<pin_data>:temp|humid
                # Key uses physical pin (not peripheral_id) to match firmware's pin-based report
                elseif (($blk.blockType -eq "sensor_dht22_temp" -or $blk.blockType -eq "sensor_dht22_humid") -and
                        $blk.PSObject.Properties['settings'] -and
                        $blk.settings.PSObject.Properties['peripheral_id']) {
                    $periphId = [string]$blk.settings.peripheral_id
                    $chan     = if ($blk.blockType -eq "sensor_dht22_temp") { "temp" } else { "humid" }
                    $def      = if ($blk.blockType -eq "sensor_dht22_temp") { "Temperature" } else { "Humidity" }
                    # Resolve physical pin from peripherals array
                    $periph  = $roleConfig.peripherals | Where-Object { $_.id -eq $periphId } | Select-Object -First 1
                    $pinKey  = if ($periph -and $periph.PSObject.Properties['pins'] -and
                                   $periph.pins.PSObject.Properties['pin_data']) {
                                   [string][int]$periph.pins.pin_data
                               } else { $periphId }   # fallback: id-based key if pin not resolvable
                    $sensorRefMap["periph:${pinKey}:${chan}"] = @{
                        sensorRef    = "$($pl.id):${blIdx}:0"
                        alias        = if ($blk.alias) { $blk.alias } else { $def }
                        kind         = "peripheral"
                        pin          = if ($periph -and $periph.PSObject.Properties['pins'] -and
                                          $periph.pins.PSObject.Properties['pin_data']) { [int]$periph.pins.pin_data } else { -1 }
                        pipelineId   = [string]$pl.id
                        pipelineName = [string]$pl.name
                        blockIndex   = $blIdx
                    }
                }
                # sensor_ph / sensor_ec → periph:<pin_adc>:ph|ppm
                # Peripheral_id resolves to pin_adc via the role's peripherals array
                elseif (($blk.blockType -eq "sensor_ph" -or $blk.blockType -eq "sensor_ec") -and
                        $blk.PSObject.Properties['settings'] -and
                        $blk.settings.PSObject.Properties['peripheral_id']) {
                    $field    = if ($blk.blockType -eq "sensor_ph") { "ph" } else { "ppm" }
                    $defAlias = if ($blk.blockType -eq "sensor_ph") { "PH" } else { "PPM" }
                    $periphId = [string]$blk.settings.peripheral_id
                    $periph   = $roleConfig.peripherals | Where-Object { $_.id -eq $periphId } | Select-Object -First 1
                    $pin_adc  = if ($periph -and $periph.PSObject.Properties['pins'] -and
                                    $periph.pins.PSObject.Properties['pin_adc']) {
                                    [int]$periph.pins.pin_adc
                                } else { -1 }
                    if ($pin_adc -ge 0) {
                        $sensorRefMap["periph:${pin_adc}:${field}"] = @{
                            sensorRef    = "$($pl.id):${blIdx}:0"
                            alias        = if ($blk.alias) { $blk.alias } else { $defAlias }
                            kind         = "periph"
                            pin          = $pin_adc
                            field        = $field
                            pipelineId   = [string]$pl.id
                            pipelineName = [string]$pl.name
                            blockIndex   = $blIdx
                        }
                    }
                }
                # gpio_input → gpio:<pin_input> → <pipeline_id>:<blockIndex>
                elseif ($blk.blockType -eq "gpio_input" -and
                        $blk.PSObject.Properties['settings'] -and
                        $blk.settings.PSObject.Properties['pin_input']) {
                    $gpio = [string][int]$blk.settings.pin_input
                    $sensorRefMap["gpio:$gpio"] = @{
                        sensorRef    = "$($pl.id):${blIdx}"
                        alias        = if ($blk.alias) { $blk.alias } else { "GPIO$gpio" }
                        kind         = "gpio"
                        pin          = [int]$blk.settings.pin_input
                        pipelineId   = [string]$pl.id
                        pipelineName = [string]$pl.name
                        blockIndex   = $blIdx
                    }
                }
                $blIdx++
            }
        }
        if ($sensorRefMap.Count -gt 0) {
            if ($meta) { $meta.sensorRefMap = $sensorRefMap }
            else        { $meta = @{ sensorRefMap = $sensorRefMap } }
            Write-Host "role meta: $($sensorRefMap.Count) sensor ref(s) mapped (sensorRefMap)"
        }

        # Second pass: reassign sensor readings from input pipelines to the pipeline
        # that consumes them via sensor_value or gpio_value blocks.
        # e.g. sensor_analog for GPIO 35 lives in "MainBoard" but Fogger/Peltier has a
        # sensor_value with sensor_ref "sensors_main_01:0:0" — reassign adc:35 → Fogger/Peltier.
        # First-come-first-served: once a sensorRef key is assigned to a consumer, skip further refs.
        if ($sensorRefMap.Count -gt 0) {
            $sensorRefToKey = @{}
            foreach ($kv in $sensorRefMap.GetEnumerator()) {
                $sensorRefToKey[[string]$kv.Value.sensorRef] = $kv.Key
            }
            $assignedKeys = @{}
            foreach ($pl in $roleConfig.pipelines) {
                if ($pl.PSObject.Properties['kind'] -and $pl.kind -eq 'sensor') { continue }
                $blIdx = 0
                foreach ($blk in $pl.blocks) {
                    # sensor_value: sensor_ref = "<plId>:<blockIdx>:0"
                    if ($blk.blockType -eq 'sensor_value' -and
                        $blk.PSObject.Properties['settings'] -and
                        $blk.settings.PSObject.Properties['sensor_ref']) {
                        $ref = [string]$blk.settings.sensor_ref
                        if ($sensorRefToKey.ContainsKey($ref)) {
                            $key = $sensorRefToKey[$ref]
                            if (-not $assignedKeys.ContainsKey($key)) {
                                $assignedKeys[$key] = $true
                                $sensorRefMap[$key]['pipelineName'] = [string]$pl.name
                                $sensorRefMap[$key]['blockIndex']   = $blIdx
                            }
                        }
                    }
                    # gpio_value: input_ref = "<plId>:<blockIdx>" (no trailing :0)
                    elseif ($blk.blockType -eq 'gpio_value' -and
                            $blk.PSObject.Properties['settings'] -and
                            $blk.settings.PSObject.Properties['input_ref']) {
                        $ref = [string]$blk.settings.input_ref
                        if ($sensorRefToKey.ContainsKey($ref)) {
                            $key = $sensorRefToKey[$ref]
                            if (-not $assignedKeys.ContainsKey($key)) {
                                $assignedKeys[$key] = $true
                                $sensorRefMap[$key]['pipelineName'] = [string]$pl.name
                                $sensorRefMap[$key]['blockIndex']   = $blIdx
                            }
                        }
                    }
                    $blIdx++
                }
            }
        }

        # Build timerRefMap: { "timer:0": { label, timerId, pipelineId, blockType } }
        # Timer index matches the order timer blocks are initialized by the pipeline engine
        # (pipeline order, then block order within each pipeline) — same order as timer_defs.
        # Used by GET /live-state to overlay firmware generic labels with user-defined names.
        $timerRefMap = @{}
        if ($roleConfig.PSObject.Properties['timer_defs'] -and $roleConfig.timer_defs) {
            $timerIdx = 0
            foreach ($td in $roleConfig.timer_defs) {
                # Infer block type from which timing fields are present:
                #   on_ms + off_ms  -> timer_cycle
                #   duration_ms     -> timer_countdown
                #   otherwise       -> timer_countup
                $blockType = if ($td.PSObject.Properties['on_ms'])       { "timer_cycle" }
                             elseif ($td.PSObject.Properties['duration_ms']) { "timer_countdown" }
                             else { "timer_countup" }

                $entry = @{
                    label     = [string]$td.label
                    timerId   = $timerIdx
                    defId     = [string]$td._id
                    blockType = $blockType
                }
                if ($blockType -eq "timer_cycle") {
                    $entry.onMs  = [int]$td.on_ms
                    $entry.offMs = [int]$td.off_ms
                }
                if ($blockType -eq "timer_countdown") {
                    $entry.durationMs = [int]$td.duration_ms
                }
                # Resolve pipeline name from _id (format: tm_<pipelineIdx>_<blockIdx>[_<subIdx>])
                $idParts = ([string]$td._id) -split '_'
                if ($idParts.Length -ge 3) {
                    $plIdx = [int]$idParts[1]
                    $blIdx = [int]$idParts[2]
                    if ($plIdx -lt $roleConfig.pipelines.Count) {
                        $entry.pipelineName = [string]$roleConfig.pipelines[$plIdx].name
                        $entry.blockIndex   = $blIdx
                    }
                }
                $timerRefMap["timer:$timerIdx"] = $entry
                $timerIdx++
            }
        }
        if ($timerRefMap.Count -gt 0) {
            if ($meta) { $meta.timerRefMap = $timerRefMap }
            else        { $meta = @{ timerRefMap = $timerRefMap } }
            Write-Host "role meta: $($timerRefMap.Count) timer(s) mapped (timerRefMap)"
        }

        # Build outputRefMap: { "pwm:<gpio>": { pipelineName, blockIndex, alias } }
        #                      { "gpio:<gpio>": { pipelineName, blockIndex, alias } }
        # Maps actuator output pins back to their pipeline for dashboard grouping.
        # Resolves output_pin_ref / pin_output IDs → gpio via the flat output_pins array.
        $outputRefMap = @{}
        if ($roleConfig.PSObject.Properties['output_pins'] -and $roleConfig.output_pins) {
            $opById = @{}
            foreach ($op in $roleConfig.output_pins) {
                if ($op.PSObject.Properties['id'] -and $op.PSObject.Properties['gpio']) {
                    $opById[[string]$op.id] = [int]$op.gpio
                }
            }
            foreach ($pl in $roleConfig.pipelines) {
                $flatIdx = 0
                foreach ($blk in $pl.blocks) {
                    $toCheck = @( @{ b = $blk; idx = $flatIdx } )
                    $flatIdx++
                    if ($blk.PSObject.Properties['fan_outputs'] -and $blk.fan_outputs) {
                        foreach ($fo in $blk.fan_outputs) {
                            $toCheck += @{ b = $fo; idx = $flatIdx }
                            $flatIdx++
                        }
                    }
                    foreach ($entry in $toCheck) {
                        $b    = $entry.b
                        $bIdx = $entry.idx
                        if ($b.blockType -eq "pwm_output" -and
                            $b.PSObject.Properties['settings'] -and
                            $b.settings.PSObject.Properties['output_pin_ref']) {
                            $ref  = [string]$b.settings.output_pin_ref
                            $gpio = if ($opById.ContainsKey($ref)) { $opById[$ref] } else { -1 }
                            if ($gpio -ge 0) {
                                $craf = if ($b.settings.PSObject.Properties['count_rate_at_full'] -and $b.settings.count_rate_at_full -ne $null) { [double]$b.settings.count_rate_at_full } else { 0.0 }
                                $outputRefMap["pwm:$gpio"] = @{
                                    pipelineName    = [string]$pl.name
                                    blockIndex      = $bIdx
                                    alias           = if ($b.alias) { $b.alias } else { "PWM$gpio" }
                                    countRateAtFull = $craf
                                }
                            }
                        }
                        elseif ($b.blockType -eq "gpio_output" -and
                                $b.PSObject.Properties['settings'] -and
                                $b.settings.PSObject.Properties['pin_output']) {
                            $ref  = [string]$b.settings.pin_output
                            $gpio = if ($opById.ContainsKey($ref)) { $opById[$ref] }
                                    elseif ($ref -match '^\d+$') { [int]$ref }
                                    else { -1 }
                            if ($gpio -ge 0) {
                                $outputRefMap["gpio:$gpio"] = @{
                                    pipelineName = [string]$pl.name
                                    blockIndex   = $bIdx
                                    alias        = if ($b.alias) { $b.alias } else { "GPIO$gpio" }
                                }
                            }
                        }
                    }
                }
            }
        }
        if ($outputRefMap.Count -gt 0) {
            if ($meta) { $meta.outputRefMap = $outputRefMap }
            else        { $meta = @{ outputRefMap = $outputRefMap } }
            Write-Host "role meta: $($outputRefMap.Count) output ref(s) mapped (outputRefMap)"
        }
    } catch {
        Write-Warning "Could not read role JSON at $roleJsonPath — publishing without meta"
    }
} else {
    Write-Warning "No saved role JSON found at $roleJsonPath — publishing without pipeline/block names"
}

$headers = @{ Authorization = "Bearer $BearerToken"; "Content-Type" = "application/json" }

if ($FullPush) {
    $bodyHash = @{ l1 = $l1b64; l2 = $l2b64; l3 = $l3b64 }
    if ($meta) { $bodyHash.meta = $meta }
    $body = ConvertTo-Json $bodyHash -Depth 10
    $r = Invoke-RestMethod -Uri "$ApiBase/devices/$DeviceId/pipeline" -Method POST -Headers $headers -Body $body
} else {
    if (-not $meta) {
        Write-Warning "No meta to push (no role JSON found). Nothing to do."
        exit 0
    }
    $bodyHash = @{ meta = $meta }
    $body = ConvertTo-Json $bodyHash -Depth 10
    $r = Invoke-RestMethod -Uri "$ApiBase/devices/$DeviceId/pipeline-meta" -Method PATCH -Headers $headers -Body $body
}
$r | ConvertTo-Json -Depth 5
