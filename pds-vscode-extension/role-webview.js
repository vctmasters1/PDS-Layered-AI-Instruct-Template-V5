const fs   = require('fs');
const path = require('path');
const { DEFAULT_VARS, COMPONENTS, PDS_FB_BLOCKS, PREFABS, PERIPHERAL_TYPES } = require('./role-data');
const { BLOCK_REGISTRY } = require('@pds/pipeline');
const styles     = require('./role-webview-styles');

// !! CRITICAL — DO NOT change readFileSync back to require() !!
// role-webview-script.js MUST be loaded with fs.readFileSync, NOT require().
//
// WHY: require() + module.exports = `...` (template literal) causes Node.js to
// evaluate \n escape sequences as REAL newlines at load time. Any \n inside
// a single-quoted string in the webview JS (e.g. 'Warning:\n\nContinue?') becomes
// a literal line break, which is a JS syntax error when the browser parses the
// injected <script> block. The entire script block fails silently — the layout
// renders but NOTHING responds: no board cascade, no buttons, no drag/drop.
//
// SYMPTOM: UI looks correct but is completely non-interactive.
// FIX HISTORY: Fixed April 2026 (twice). Revert = guaranteed breakage.
//
// readFileSync reads the file as literal text. No escape processing. Safe.
const scriptBody = fs.readFileSync(path.join(__dirname, 'role-webview-script.js'), 'utf8');

function getRolePanelHtml(targets, boards, savedRoles, modules, pinCaps, nonce, cspSource) {
    const targetsJson    = JSON.stringify(targets || []);
    const boardsJson     = JSON.stringify(boards || []);
    const savedRolesJson = JSON.stringify(savedRoles || []);
    const modulesJson    = JSON.stringify(modules || []);
    const pinCapsJson    = JSON.stringify(pinCaps || {});

    const defaultVarsJson = JSON.stringify(DEFAULT_VARS);
    const componentsJson  = JSON.stringify(COMPONENTS);
    const fbBlocksJson       = JSON.stringify(PDS_FB_BLOCKS);
    const prefabsJson        = JSON.stringify(PREFABS);
    const blockRegistryJson  = JSON.stringify(BLOCK_REGISTRY);

    const peripheralTypesJson = JSON.stringify(PERIPHERAL_TYPES);

    // CSP: unsafe-inline covers both the main script block and all inline handlers in
    // dynamically-rendered HTML. Per spec, 'unsafe-inline' is silently ignored when a nonce
    // is present — so we do NOT use a nonce here. The webview is already sandboxed by VS Code.
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:;">`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${csp}
<title>PDS Role Editor</title>
<style>
${styles}
</style>
</head>
<body>

<!-- ── LEFT SIDEBAR ── -->
<div class="left-sidebar" id="left-sidebar">
    <div class="resize-handle" id="resize-handle"></div>
    <div class="section-header" onclick="toggleSection(this, 'pin-map-wrapper')" style="display:flex;align-items:center;justify-content:space-between;">
        <span>GPIO Pin Map <span class="chevron">▾</span></span>
        <div style="display:inline-flex;align-items:center;gap:4px;" onclick="event.stopPropagation()">
        <button class="print-pin-btn" onclick="printPinMap()" title="Print pin map in current order">&#128438; Print</button>
        <div class="auto-assign-split">
            <button class="auto-assign-btn" onclick="autoAssignPins(false)" title="Auto-assign unassigned pins, keeping existing manual assignments">Auto Assign</button><button class="auto-assign-arrow" onclick="toggleAutoAssignMenu(this)" title="More options">&#9660;</button>
            <div class="auto-assign-menu" id="auto-assign-menu" style="display:none">
                <div class="auto-assign-menu-item" onclick="autoAssignPins(true); document.getElementById('auto-assign-menu').style.display='none'">Force Reassign All</div>
            </div>
        </div>
        </div>
    </div>
    <div class="pin-map-wrapper" id="pin-map-wrapper">
        <table class="pin-table" id="pin-table">
            <thead><tr>
                <th onclick="sortPinMap('gpio')" id="th-gpio">GPIO <span class="sort-arrow">▾</span></th>
                <th onclick="sortPinMap('physical')" id="th-physical">Phy# <span class="sort-arrow">▾</span></th>
                <th onclick="sortPinMap('jpin')" id="th-jpin">J# <span class="sort-arrow">▾</span></th>
                <th onclick="sortPinMap('caps')" id="th-caps">Caps <span class="sort-arrow">▾</span></th>
                <th onclick="sortPinMap('assigned')" id="th-assigned">Assigned <span class="sort-arrow">▾</span></th>
            </tr></thead>
            <tbody id="pin-table-body">
                <tr><td colspan="5" style="padding:12px; color:var(--vscode-descriptionForeground); font-size:11px; text-align:center;">Select a board to see pins</td></tr>
            </tbody>
        </table>
    </div>
    <div class="h-resize-handle" id="left-v-resize"></div>
    <div class="section-header" onclick="toggleSection(this, 'peripherals-wrapper')" style="display:flex;align-items:center;justify-content:space-between;">
        <span>Peripherals <span class="chevron">▾</span></span>
        <button class="add-peripheral-btn" onclick="event.stopPropagation(); showAddPeripheralMenu(this)" title="Add a new peripheral">+ Add</button>
        <div class="add-peripheral-menu" id="add-peripheral-menu" style="display:none"></div>
    </div>
    <div class="peripherals-wrapper" id="peripherals-wrapper">
        <div class="mutex-groups-panel">
            <div class="mutex-groups-header">
                <span class="mutex-groups-title">Mutex Groups</span>
                <button class="mutex-add-btn" onclick="addMutexGroup()" title="Define a new mutual-exclusion group">+ Group</button>
            </div>
            <div id="mutex-groups-list"></div>
        </div>
        <div id="peripherals-list"></div>
    </div>
    <div class="h-resize-handle" id="left-v-resize2"></div>
    <div class="section-header" onclick="toggleSection(this, 'var-registry-wrapper')">
        Variable Registry <span class="chevron">▾</span>
    </div>
    <div class="var-registry-wrapper" id="var-registry-wrapper">
        <div style="padding:12px; color:var(--vscode-descriptionForeground); font-size:11px; text-align:center;">
            Enable modules to see variables
        </div>
    </div>
    <div class="h-resize-handle" id="left-v-resize3"></div>
    <div class="section-header" onclick="toggleSection(this, 'partition-layout-wrapper')">
        Flash Partitions <span class="chevron">▾</span>
    </div>
    <div class="partition-layout-wrapper" id="partition-layout-wrapper">
        <div id="partition-layout-content"></div>
    </div>
</div>

<!-- ── MAIN PANEL ── -->
<div class="main-panel">

    <!-- Top Bar: Selectors + Identity + Actions -->
    <div class="top-bar">
        <div class="top-bar-group">
            <label>Board</label>
            <select id="sel-board">
                <option value="">— select —</option>
            </select>
            <span id="lbl-target" style="font-size:10px; color:var(--vscode-descriptionForeground); margin-left:4px;"></span>
        </div>
        <div class="top-bar-group">
            <label>HwRev</label>
            <select id="sel-hwrev" disabled>
                <option value="">—</option>
            </select>
            <input type="text" id="inp-new-hwrev" placeholder="hwrev_002" style="width:90px; display:none;" />
        </div>
        <div class="top-bar-group">
            <label>Role</label>
            <select id="sel-role" disabled>
                <option value="">—</option>
            </select>
        </div>
        <div class="top-bar-group" id="div-role-id" style="display:none;">
            <label>ID</label>
            <input type="text" id="inp-role-id" placeholder="h2o_002" style="width:90px;" />
        </div>
        <div class="top-bar-group">
            <label>DisplayName</label>
            <select id="sel-display-name" disabled>
                <option value="">—</option>
            </select>
            <input type="text" id="inp-display-name-new" placeholder="Chiller 60W" style="width:120px; display:none;" />
        </div>
        <div class="top-bar-group">
            <label>Device Type</label>
            <input type="text" id="inp-device-type" placeholder="aero-ctrl" style="width:100px;" />
        </div>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="btn-save">Save</button>
        <button class="btn btn-secondary" id="btn-generate">Generate</button>
        <button class="btn btn-secondary" id="btn-dryrun">Dry Run</button>
    </div>

    <!-- Function Module Cards (system services) -->
    <div id="modules-container">
        <div class="placeholder" id="main-placeholder">
            Select a target to begin adding function modules.
        </div>
    </div>

    <!-- Pipelines / Routines Tabs -->
    <div style="margin-top:12px;">
        <div class="pipeline-tabs">
            <button class="pipeline-tab active" id="tab-pipelines" onclick="switchPipelineTab('pipeline')">Pipelines</button>
            <button class="pipeline-tab" id="tab-routines" onclick="switchPipelineTab('routine')">Routines</button>
            <button class="pipeline-tab" id="tab-inputs" onclick="switchPipelineTab('input')">Inputs</button>
            <button class="pipeline-tab" id="tab-outputs" onclick="switchPipelineTab('output')">Outputs</button>
            <button class="pipeline-tab" id="tab-timers" onclick="switchPipelineTab('timer')">Timers</button>
        </div>
        <div id="pipelines-container"></div>
        <button class="add-instance-btn" id="btn-add-pipeline" style="margin-top:6px; max-width:200px;">+ Add Pipeline</button>
    </div>
</div>

<!-- ── RIGHT SIDEBAR ── -->
<div class="right-sidebar" id="right-sidebar">
    <div class="right-resize-handle" id="right-resize-handle"></div>
    <div class="section-header" data-toggle="fb-palette-wrapper">
        pds_fb Elements <span class="chevron">▾</span>
    </div>
    <div class="fb-palette-wrapper" id="fb-palette-wrapper" style="height:55%"></div>
    <div class="h-resize-handle" id="right-v-resize"></div>
    <div class="section-header" data-toggle="prefabs-wrapper">
        Prefabs <span class="chevron">▾</span>
    </div>
    <div class="prefabs-wrapper" id="prefabs-wrapper"></div>
</div>

<script>
    const vscode = acquireVsCodeApi();
    const targets    = ${targetsJson};
    const boards     = ${boardsJson};
    const savedRoles = ${savedRolesJson};
    const allModules = ${modulesJson};
    const pinCaps    = ${pinCapsJson};
    const defaultVars = ${defaultVarsJson};
    const components  = ${componentsJson};
    const fbBlocks      = ${fbBlocksJson};
    const prefabs       = ${prefabsJson};
    const blockRegistry = ${blockRegistryJson};
    const peripheralTypes = ${peripheralTypesJson};
${scriptBody}
</script>
</body>
</html>`;
}

module.exports = { getRolePanelHtml };
