// CSS for the PDS Role Editor webview panel.
// Imported as a string by role-webview.js — do not add JS or HTML here.

module.exports = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        height: 100vh; overflow: hidden;
        display: flex;
    }

    /* ── LEFT SIDEBAR — Pin Map & Variables ── */
    .left-sidebar {
        width: 280px; min-width: 180px; max-width: 50vw;
        background: var(--vscode-sideBar-background);
        border-right: 1px solid var(--vscode-panel-border);
        display: flex; flex-direction: column;
        overflow-x: hidden; overflow-y: auto; position: relative;
    }

    /* Resize handle */
    .resize-handle {
        position: absolute; top: 0; right: -3px;
        width: 6px; height: 100%; cursor: col-resize; z-index: 10;
    }
    .resize-handle:hover, .resize-handle.active {
        background: var(--vscode-focusBorder);
    }
    .left-sidebar .section-header {
        font-size: 11px; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.5px; color: var(--vscode-sideBarSectionHeader-foreground);
        padding: 8px 12px 4px; border-bottom: 1px solid var(--vscode-panel-border);
        background: var(--vscode-sideBarSectionHeader-background);
        display: flex; justify-content: space-between; align-items: center;
        cursor: pointer; user-select: none; position: relative;
    }
    .left-sidebar .section-header:hover { opacity: 0.85; }
    .section-header .chevron { transition: transform 0.15s; }
    .section-header.collapsed .chevron { transform: rotate(-90deg); }
    .auto-assign-split {
        position: relative; display: inline-flex; flex-shrink: 0;
    }
    .auto-assign-btn {
        font-size: 10px; font-weight: 600; padding: 2px 8px;
        border-radius: 3px 0 0 3px;
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: 1px solid var(--vscode-button-border, transparent);
        cursor: pointer; white-space: nowrap;
        text-transform: none; letter-spacing: 0;
    }
    .auto-assign-btn:hover { filter: brightness(1.2); }
    .print-pin-btn {
        font-size: 10px; font-weight: 600; padding: 2px 8px;
        border-radius: 3px;
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: 1px solid var(--vscode-button-border, transparent);
        cursor: pointer; white-space: nowrap;
    }
    .print-pin-btn:hover { filter: brightness(1.2); }
    .auto-assign-arrow {
        font-size: 9px; padding: 2px 5px;
        border-radius: 0 3px 3px 0;
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: 1px solid var(--vscode-button-border, transparent);
        border-left: 1px solid var(--vscode-panel-border);
        cursor: pointer;
    }
    .auto-assign-arrow:hover { filter: brightness(1.2); }
    .auto-assign-menu {
        position: absolute; top: 100%; right: 0; z-index: 200;
        background: var(--vscode-menu-background, var(--vscode-editorWidget-background));
        border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
        border-radius: 3px; min-width: 140px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        margin-top: 2px;
    }
    .auto-assign-menu-item {
        font-size: 11px; padding: 5px 10px; cursor: pointer; white-space: nowrap;
        color: var(--vscode-menu-foreground, var(--vscode-foreground));
    }
    .auto-assign-menu-item:hover {
        background: var(--vscode-menu-selectionBackground, var(--vscode-list-activeSelectionBackground));
        color: var(--vscode-menu-selectionForeground, var(--vscode-list-activeSelectionForeground));
    }

    /* Pin Map Table */
    .pin-map-wrapper {
        height: 220px; flex-shrink: 0; overflow-y: auto; min-height: 40px;
    }
    .pin-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .pin-table th {
        text-align: left; font-weight: 600; color: var(--vscode-descriptionForeground);
        padding: 3px 6px; border-bottom: 1px solid var(--vscode-panel-border);
        position: sticky; top: 0; background: var(--vscode-sideBar-background); z-index: 1;
        cursor: pointer; user-select: none; white-space: nowrap;
    }
    .pin-table th:hover { color: var(--vscode-foreground); }
    .pin-table th .sort-arrow { font-size: 8px; margin-left: 2px; opacity: 0.5; }
    .pin-table th.sorted .sort-arrow { opacity: 1; color: var(--vscode-textLink-foreground); }
    .pin-table td {
        padding: 2px 6px; border-bottom: 1px solid var(--vscode-panel-border);
    }
    .pin-jpin { color: var(--vscode-descriptionForeground); font-size: 10px; white-space: nowrap; }
        vertical-align: middle;
    }
    .pin-table tr.assigned { background: rgba(88, 166, 255, 0.08); }
    .pin-table tr.reserved { opacity: 0.55; font-style: italic; }
    .pin-table tr.reserved .pin-name { color: var(--vscode-descriptionForeground); }
    .pin-table tr.conflict td { background: rgba(248, 81, 73, 0.15); }
    .pin-name { font-family: monospace; font-weight: 500; white-space: nowrap; font-size: 10px; }
    .pin-caps { display: flex; gap: 2px; flex-wrap: wrap; }
    .cap-badge {
        font-size: 8px; padding: 1px 4px; border-radius: 3px; font-weight: 600;
        line-height: 1.4;
    }
    .cap-GPIO  { background: #21262d; color: #8b949e; }
    .cap-ADC-1 { background: #1a2a1a; color: #2ecc71; }
    .cap-ADC-2 { background: #2a1e0a; color: #e67e22; }
    .cap-PWM   { background: #1a2a1a; color: #3fb950; }
    .cap-SPI   { background: #2a2a1a; color: #d29922; }
    .cap-I2C   { background: #2a1a2a; color: #a78bfa; }
    .cap-UART  { background: #2a1a1a; color: #f85149; }
    .pin-assigned {
        font-size: 10px; color: var(--vscode-textLink-foreground);
        max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .pin-assigned[draggable="true"] {
        cursor: grab; border-radius: 3px; padding: 1px 4px;
        background: rgba(88, 166, 255, 0.12); transition: background 0.15s;
    }
    .pin-assigned[draggable="true"]:hover { background: rgba(88, 166, 255, 0.25); }
    .pin-assigned.dragging { opacity: 0.4; }
    .pin-table tr.drop-target td { background: rgba(63, 185, 80, 0.18); }
    .pin-table tr.drop-target-invalid td { background: rgba(248, 81, 73, 0.15); }

    /* Horizontal (vertical-resize) handle shared by both sidebars */
    .h-resize-handle {
        height: 5px; flex-shrink: 0; cursor: row-resize;
        background: var(--vscode-panel-border); position: relative;
        transition: background 0.12s;
    }
    .h-resize-handle:hover, .h-resize-handle.active { background: var(--vscode-focusBorder); }

    /* Variable Registry */
    .var-registry-wrapper {
        overflow-y: auto; min-height: 40px; height: 150px; flex-shrink: 0;
    }
    .partition-layout-wrapper {
        overflow-y: auto; min-height: 40px; height: 100px; flex-shrink: 0;
    }
    .var-group-title {
        font-size: 10px; font-weight: 600; padding: 4px 12px 2px;
        color: var(--vscode-descriptionForeground); text-transform: uppercase;
        letter-spacing: 0.4px; background: var(--vscode-sideBarSectionHeader-background);
        border-bottom: 1px solid var(--vscode-panel-border);
    }
    .var-row {
        display: flex; align-items: center; gap: 4px;
        padding: 2px 12px; font-size: 10px;
        border-bottom: 1px solid var(--vscode-panel-border);
    }
    .var-row:hover { background: var(--vscode-list-hoverBackground); }
    .var-row input[type="checkbox"] { margin: 0; flex-shrink: 0; }
    .var-name { font-family: monospace; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .var-type { color: var(--vscode-descriptionForeground); font-size: 9px; flex-shrink: 0; }
    .var-remote-badge {
        font-size: 8px; padding: 0 4px; border-radius: 2px;
        background: #1a2a1a; color: #3fb950; flex-shrink: 0;
    }
    .var-const-badge {
        font-size: 8px; padding: 0 4px; border-radius: 2px;
        background: #21262d; color: #8b949e; flex-shrink: 0;
    }

    /* ── Peripherals Section ── */
    .peripherals-wrapper {
        overflow-y: auto; min-height: 40px; height: 130px; flex-shrink: 0;
    }
    .add-peripheral-btn {
        font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 3px;
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: 1px solid var(--vscode-button-border, transparent);
        cursor: pointer; white-space: nowrap; flex-shrink: 0;
        text-transform: none; letter-spacing: 0;
    }
    .add-peripheral-btn:hover { filter: brightness(1.2); color: var(--vscode-button-secondaryForeground); }
    .add-peripheral-menu {
        position: absolute; right: 8px; top: 100%; z-index: 200;
        background: var(--vscode-menu-background, var(--vscode-editorWidget-background));
        border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
        border-radius: 3px; min-width: 200px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .add-peripheral-menu-item {
        font-size: 11px; padding: 5px 10px; cursor: pointer; white-space: nowrap;
        color: var(--vscode-menu-foreground, var(--vscode-foreground));
    }
    .add-peripheral-menu-item:hover {
        background: var(--vscode-menu-selectionBackground, var(--vscode-list-activeSelectionBackground));
        color: var(--vscode-menu-selectionForeground, var(--vscode-list-activeSelectionForeground));
    }
    .periph-card {
        border: 1px solid var(--vscode-panel-border); border-radius: 6px;
        overflow: hidden; margin: 6px 8px;
        transition: border-color 0.12s;
    }
    .periph-card-header {
        display: flex; align-items: center; gap: 6px;
        padding: 5px 8px; cursor: pointer;
        background: var(--vscode-sideBarSectionHeader-background);
        border-bottom: 1px solid var(--vscode-panel-border);
        user-select: none; font-size: 11px;
    }
    .periph-card-header:hover { background: var(--vscode-list-hoverBackground); }
    .periph-type-badge {
        font-size: 8px; padding: 1px 5px; border-radius: 3px; font-weight: 700;
        background: #2a1a2a; color: #a78bfa; flex-shrink: 0; text-transform: uppercase;
    }
    .periph-alias {
        flex: 1; font-weight: 600; color: var(--vscode-foreground);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .periph-alias-input {
        flex: 1; font-size: 11px; font-weight: 600; background: transparent;
        border: none; border-bottom: 1px solid var(--vscode-input-border);
        color: var(--vscode-foreground); padding: 0; outline: none; min-width: 0;
    }
    .periph-chevron { font-size: 8px; color: var(--vscode-descriptionForeground); flex-shrink: 0; transition: transform 0.15s; }
    .periph-chevron.collapsed { transform: rotate(-90deg); }
    .periph-remove-btn {
        font-size: 10px; padding: 1px 5px; border-radius: 3px; cursor: pointer; flex-shrink: 0;
        background: transparent; color: var(--vscode-descriptionForeground);
        border: 1px solid transparent;
    }
    .periph-remove-btn:hover { color: #f85149; border-color: #f85149; }
    .periph-mutex-badge {
        font-size: 8px; padding: 1px 5px; border-radius: 3px; font-weight: 700;
        background: #1a1e2e; color: #f59e0b; border: 1px solid #92400e; flex-shrink: 0;
        text-transform: uppercase; letter-spacing: 0.03em;
    }
    /* ── Mutex Groups panel ── */
    .mutex-groups-panel {
        padding: 6px 8px 4px; border-bottom: 1px solid var(--vscode-panel-border);
    }
    .mutex-groups-header {
        display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;
    }
    .mutex-groups-title {
        font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
        color: var(--vscode-descriptionForeground);
    }
    .mutex-add-btn {
        font-size: 9px; padding: 1px 6px; border-radius: 3px; cursor: pointer;
        background: transparent; color: var(--vscode-button-foreground);
        border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
    }
    .mutex-add-btn:hover { background: var(--vscode-button-hoverBackground); }
    #mutex-groups-list {
        display: flex; flex-wrap: wrap; gap: 4px; min-height: 20px;
    }
    .mutex-group-chip {
        display: flex; align-items: center; gap: 4px;
        padding: 1px 4px 1px 6px; border-radius: 10px;
        background: #1a1e2e; border: 1px solid #92400e; font-size: 9px;
    }
    .mutex-group-chip input {
        background: transparent; border: none; outline: none;
        color: #f59e0b; font-size: 9px; font-weight: 700; width: 70px;
        text-transform: uppercase;
    }
    .mutex-group-chip-remove {
        cursor: pointer; color: var(--vscode-descriptionForeground); font-size: 9px;
        background: none; border: none; padding: 0; line-height: 1;
    }
    .mutex-group-chip-remove:hover { color: #f85149; }
    .mutex-group-empty {
        font-size: 9px; color: var(--vscode-descriptionForeground); font-style: italic; padding: 2px 0;
    }
    /* ── Peripheral mutex select ── */
    .periph-mutex-select {
        font-size: 8px; padding: 1px 4px; border-radius: 3px;
        background: #1a1e2e; color: #f59e0b; border: 1px solid #92400e;
        cursor: pointer; flex-shrink: 0; max-width: 100px;
    }
    .periph-body {
        padding: 4px 8px 8px 8px;
    }
    .periph-section-label {
        font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
        color: var(--vscode-descriptionForeground); margin: 6px 0 3px;
    }
    .periph-pin-row, .periph-cfg-row {
        display: flex; align-items: center; gap: 6px; margin-bottom: 3px;
    }
    .periph-pin-label, .periph-cfg-label {
        width: 90px; flex-shrink: 0; color: var(--vscode-descriptionForeground);
        font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .periph-pin-input, .periph-cfg-input {
        flex: 1; min-width: 0; font-size: 11px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 3px; padding: 2px 4px;
    }
    .periph-pin-cap {
        font-size: 8px; padding: 1px 4px; border-radius: 3px; font-weight: 600;
        background: #21262d; color: #8b949e; flex-shrink: 0;
    }
    .periph-signals {
        display: flex; flex-direction: column; gap: 2px; margin-top: 2px;
    }
    .periph-signal-row {
        display: flex; align-items: center; gap: 5px;
    }
    .periph-signal-name {
        font-family: monospace; font-size: 10px; font-weight: 700;
        color: var(--vscode-textLink-foreground);
        width: 42px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .periph-signal-type {
        font-size: 10px; color: var(--vscode-descriptionForeground);
        flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .periph-sig-assigned {
        cursor: grab; font-size: 10px; color: var(--vscode-textLink-foreground);
        background: rgba(88,166,255,0.12); border-radius: 3px; padding: 1px 5px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 110px;
        flex-shrink: 0;
    }
    .periph-sig-assigned:hover { background: rgba(88,166,255,0.25); }
    .periph-sig-assigned.dragging { opacity: 0.4; }
    .periph-sig-unassigned {
        font-size: 10px; color: var(--vscode-descriptionForeground); flex-shrink: 0; min-width: 20px;
    }
    .periph-signal-row.sig-drop-target { background: rgba(63,185,80,0.18); border-radius: 3px; }
    .periph-signal-row.sig-drop-invalid { background: rgba(248,81,73,0.15); border-radius: 3px; }
    .periph-empty {
        padding: 12px; color: var(--vscode-descriptionForeground); font-size: 11px;
        text-align: center;
    }

    /* ── MAIN PANEL — Function Cards ── */
    .main-panel {
        flex: 1; overflow-y: auto; padding: 12px 20px;
        display: flex; flex-direction: column; gap: 12px;
    }

    /* Top bar: selectors + actions */
    .top-bar {
        display: flex; align-items: center; gap: 12px;
        padding: 8px 12px; border-radius: 6px;
        background: var(--vscode-sideBarSectionHeader-background);
        border: 1px solid var(--vscode-panel-border);
        flex-wrap: wrap;
    }
    .top-bar label {
        font-size: 11px; font-weight: 600; text-transform: uppercase;
        color: var(--vscode-descriptionForeground); letter-spacing: 0.3px;
    }
    .top-bar select, .top-bar input[type="text"] {
        padding: 4px 8px; background: var(--vscode-input-background);
        color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border);
        border-radius: 3px; font-size: 12px;
    }
    .top-bar select:focus, .top-bar input:focus { outline: 1px solid var(--vscode-focusBorder); }
    .top-bar-group { display: flex; align-items: center; gap: 4px; }
    .top-bar .spacer { flex: 1; }
    .btn {
        padding: 5px 12px; border: none; border-radius: 3px;
        font-size: 11px; cursor: pointer; font-weight: 500;
    }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }

    /* Function cards */
    .func-card {
        border: 1px solid var(--vscode-panel-border);
        border-radius: 6px; overflow: hidden;
    }
    .func-card.disabled { opacity: 0.5; }
    .func-card-header {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 12px; cursor: pointer; user-select: none;
        background: var(--vscode-sideBarSectionHeader-background);
        border-bottom: 1px solid var(--vscode-panel-border);
    }
    .func-card-header:hover { opacity: 0.9; }
    .func-card-header input[type="checkbox"] { margin: 0; }
    .func-card-title { font-size: 13px; font-weight: 600; flex: 1; }
    .func-card-locked { font-size: 10px; color: var(--vscode-descriptionForeground); }
    .func-card-chevron { transition: transform 0.15s; font-size: 10px; }
    .func-card.collapsed .func-card-chevron { transform: rotate(-90deg); }
    .func-card.collapsed .func-card-body { display: none; }
    .func-card-body { padding: 10px 12px; }

    /* Instance rows inside a function card */
    .instance-group {
        margin-bottom: 10px; padding: 8px;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 4px; background: var(--vscode-editor-background);
    }
    .instance-header {
        display: flex; align-items: center; gap: 6px;
        margin-bottom: 6px; font-size: 12px; font-weight: 600;
    }
    .instance-header .instance-label { flex: 1; }
    .instance-alias {
        flex: 1; background: transparent; border: 1px solid transparent;
        border-radius: 3px; color: var(--vscode-foreground); font-size: 12px;
        font-weight: 600; padding: 2px 4px; outline: none;
    }
    .instance-alias:hover { border-color: var(--vscode-input-border); }
    .instance-alias:focus { border-color: var(--vscode-focusBorder); background: var(--vscode-input-background); }
    .instance-alias::placeholder { color: var(--vscode-descriptionForeground); font-weight: 600; }
    .instance-remove {
        background: none; border: none; color: var(--vscode-descriptionForeground);
        cursor: pointer; font-size: 14px; padding: 0 4px;
    }
    .instance-remove:hover { color: #f85149; }
    .add-instance-btn {
        font-size: 11px; padding: 6px 10px; margin-top: 4px;
        background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.35);
        color: #38bdf8; cursor: pointer;
        border-radius: 3px; width: 100%; font-weight: 500;
    }
    .add-instance-btn:hover { background: rgba(56, 189, 248, 0.16); border-color: #38bdf8; }

    /* Sub-component groups (nested feature blocks like dosing pumps) */
    .subcomp-group {
        margin-top: 8px; border: 1px solid var(--vscode-panel-border);
        border-radius: 5px; overflow: hidden;
    }
    .subcomp-header {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 10px; cursor: pointer; user-select: none;
        background: var(--vscode-sideBarSectionHeader-background);
        border-bottom: 1px solid var(--vscode-panel-border);
        font-size: 11px; font-weight: 600;
    }
    .subcomp-header:hover { opacity: 0.85; }
    .subcomp-chevron { transition: transform 0.15s; font-size: 9px; }
    .subcomp-group.collapsed .subcomp-chevron { transform: rotate(-90deg); }
    .subcomp-group.collapsed .subcomp-body { display: none; }
    .subcomp-body { padding: 8px 10px; }
    .subcomp-label { flex: 1; }

    /* Per-header background tinting */
    .header-block { padding: 8px; border-radius: 4px; margin-bottom: 6px; }
    .header-block[data-hue="0"] { background: rgba(248, 113, 113, 0.05); border-left: 3px solid rgba(248, 113, 113, 0.4); }
    .header-block[data-hue="1"] { background: rgba(251, 191, 36, 0.05); border-left: 3px solid rgba(251, 191, 36, 0.4); }
    .header-block[data-hue="2"] { background: rgba(52, 211, 153, 0.05); border-left: 3px solid rgba(52, 211, 153, 0.4); }
    .header-block[data-hue="3"] { background: rgba(96, 165, 250, 0.05); border-left: 3px solid rgba(96, 165, 250, 0.4); }
    .header-block[data-hue="4"] { background: rgba(167, 139, 250, 0.05); border-left: 3px solid rgba(167, 139, 250, 0.4); }
    .header-block[data-hue="5"] { background: rgba(244, 114, 182, 0.05); border-left: 3px solid rgba(244, 114, 182, 0.4); }
    .header-block[data-hue="6"] { background: rgba(45, 212, 191, 0.05); border-left: 3px solid rgba(45, 212, 191, 0.4); }
    .header-block[data-hue="7"] { background: rgba(253, 186, 116, 0.05); border-left: 3px solid rgba(253, 186, 116, 0.4); }

    /* ADC scaling row */
    .adc-scaling { display: flex; gap: 6px; padding: 4px 0; flex-wrap: wrap; align-items: center; }
    .adc-scaling .scale-field { display: flex; align-items: center; gap: 3px; }
    .adc-scaling .scale-field label { font-size: 10px; color: var(--vscode-descriptionForeground); min-width: 50px; }
    .adc-scaling .scale-field input {
        width: 60px; padding: 2px 4px; font-size: 10px; font-family: monospace;
        background: var(--vscode-input-background); color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border); border-radius: 3px;
    }

    /* Pin slot rows inside an instance */
    .pin-slot {
        display: flex; align-items: center; gap: 6px;
        padding: 3px 0; font-size: 11px;
    }
    .pin-slot-label { min-width: 80px; color: var(--vscode-descriptionForeground); }
    .pin-slot select {
        flex: 1; padding: 3px 6px;
        background: var(--vscode-input-background); color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border); border-radius: 3px;
        font-size: 11px; font-family: monospace;
    }
    .pin-slot select.conflict { border-color: #f85149; background: rgba(248,81,73,0.1); }
    .pin-slot .pin-func-label {
        font-size: 10px; color: var(--vscode-descriptionForeground); min-width: 50px;
    }

    /* Variable row inside instance */
    .instance-var {
        display: flex; align-items: center; gap: 6px;
        padding: 3px 0; font-size: 11px;
    }
    .instance-var label { min-width: 120px; font-family: monospace; font-size: 11px; }
    .instance-var input[type="text"], .instance-var input[type="number"], .instance-var select {
        flex: 1; min-width: 60px; max-width: 200px; padding: 3px 6px;
        background: var(--vscode-input-background); color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border); border-radius: 3px;
        font-size: 11px;
    }
    .instance-var .var-type-badge {
        font-size: 9px; color: var(--vscode-descriptionForeground); min-width: 55px; text-align: right;
    }
    .instance-var input[type="checkbox"] { margin: 0; }

    /* Placeholder */
    .placeholder {
        color: var(--vscode-descriptionForeground); font-style: italic;
        padding: 40px; text-align: center;
        border: 1px dashed var(--vscode-panel-border);
        border-radius: 6px;
    }

    /* ── RIGHT SIDEBAR — pds_fb Palette + Prefabs ── */
    .right-sidebar {
        width: 220px; min-width: 320px; max-width: 40vw;
        background: var(--vscode-sideBar-background);
        border-left: 1px solid var(--vscode-panel-border);
        display: flex; flex-direction: column;
        overflow: hidden; position: relative;
    }
    .right-resize-handle {
        position: absolute; top: 0; left: -3px;
        width: 6px; height: 100%; cursor: col-resize; z-index: 10;
    }
    .right-resize-handle:hover, .right-resize-handle.active {
        background: var(--vscode-focusBorder);
    }
    .right-sidebar .section-header {
        font-size: 11px; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.5px; color: var(--vscode-sideBarSectionHeader-foreground);
        padding: 8px 12px 4px; border-bottom: 1px solid var(--vscode-panel-border);
        background: var(--vscode-sideBarSectionHeader-background);
        display: flex; justify-content: space-between; align-items: center;
        cursor: pointer; user-select: none;
    }
    .right-sidebar .section-header:hover { opacity: 0.85; }

    /* pds_fb palette */
    .fb-palette-wrapper { height: 55%; flex-shrink: 0; overflow-y: auto; min-height: 40px; padding: 6px; }
    .fb-palette-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .fb-cat-section {
        font-size: 9px; font-weight: 700; text-transform: uppercase;
        color: var(--vscode-descriptionForeground); letter-spacing: 0.5px;
        padding: 5px 2px 2px; grid-column: 1 / -1;
    }
    .fb-block-tile {
        padding: 5px 7px; border-radius: 4px; cursor: pointer; user-select: none;
        border: 1px solid var(--vscode-panel-border);
        background: var(--vscode-editor-background);
        transition: border-color 0.12s, background 0.12s;
        display: flex; flex-direction: column; gap: 2px;
    }
    .fb-block-tile:hover { border-color: var(--vscode-focusBorder); background: var(--vscode-list-hoverBackground); }
    .fb-block-tile.no-target { opacity: 0.45; cursor: not-allowed; }
    .fb-tile-label { font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fb-tile-ports { font-size: 9px; color: var(--vscode-descriptionForeground); }
    .fb-cat-hmi    .fb-tile-label { color: #39d0d8; }
    .fb-cat-input  .fb-tile-label { color: #58a6ff; }
    .fb-cat-output .fb-tile-label { color: #3fb950; }
    .fb-cat-logic  .fb-tile-label { color: #d29922; }
    .fb-cat-timer  .fb-tile-label { color: #f97583; }
    .fb-cat-utility .fb-tile-label { color: #a78bfa; }

    /* Prefabs */
    .prefabs-wrapper { flex: 1; overflow-y: auto; min-height: 40px; padding: 6px; }
    .prefab-tile {
        padding: 6px 8px; border-radius: 4px; margin-bottom: 4px; cursor: pointer;
        border: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background);
        transition: border-color 0.12s, background 0.12s;
    }
    .prefab-tile:hover { border-color: var(--vscode-focusBorder); background: var(--vscode-list-hoverBackground); }
    .prefab-tile-label { font-size: 11px; font-weight: 600; }
    .prefab-tile-desc { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
    .prefab-tile-chips { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
    .prefab-chip {
        font-size: 9px; padding: 1px 5px; border-radius: 3px;
        background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
    }

    /* ── "Run Until" exit conditions panel ── */
    .run-until-panel {
        border-left: 2px solid rgba(56,189,248,0.45); margin: 0 0 3px 8px;
        padding: 4px 0 4px 8px;
    }
    .run-until-header {
        font-size: 10px; font-weight: 600; color: rgba(56,189,248,0.85);
        text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px;
    }
    .run-until-row {
        display: flex; align-items: center; gap: 4px; margin-bottom: 3px;
    }
    .run-until-label-input {
        width: 90px; flex-shrink: 0; padding: 2px 5px; font-size: 11px;
        background: var(--vscode-input-background); color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border); border-radius: 3px; outline: none;
    }
    .run-until-label-input:focus { border-color: var(--vscode-focusBorder); }
    .run-until-row select {
        flex: 1; padding: 2px 4px; font-size: 11px;
        background: var(--vscode-input-background); color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border); border-radius: 3px;
    }
    .run-until-remove-btn {
        padding: 1px 5px; font-size: 10px; cursor: pointer; flex-shrink: 0;
        background: transparent; border: 1px solid rgba(200,80,80,0.3);
        color: rgba(220,100,100,0.9); border-radius: 3px;
    }
    .run-until-remove-btn:hover { background: rgba(200,80,80,0.12); }
    .run-until-add-btn {
        margin-top: 3px; padding: 2px 8px; font-size: 10px; cursor: pointer;
        background: rgba(56,189,248,0.08); border: 1px solid rgba(56,189,248,0.35);
        color: rgba(56,189,248,0.9); border-radius: 3px;
    }
    .run-until-add-btn:hover { background: rgba(56,189,248,0.18); }
    .run-until-conditions-header {
        font-size: 10px; font-weight: 600; color: rgba(56,189,248,0.65);
        text-transform: uppercase; letter-spacing: 0.04em;
        margin: 6px 0 3px; border-top: 1px solid rgba(56,189,248,0.2); padding-top: 5px;
    }

    /* ── Pipeline / Routine tabs ── */
    .pipeline-tabs {
        display: flex; gap: 0; margin-bottom: 8px;
        border-bottom: 1px solid var(--vscode-panel-border);
    }
    .pipeline-tab {
        padding: 5px 16px; font-size: 12px; font-weight: 500;
        background: transparent; border: none; border-bottom: 2px solid transparent;
        cursor: pointer; color: var(--vscode-descriptionForeground);
        margin-bottom: -1px; transition: color 0.12s, border-color 0.12s;
    }
    .pipeline-tab:hover { color: var(--vscode-foreground); }
    .pipeline-tab.active {
        color: var(--vscode-foreground);
        border-bottom-color: var(--vscode-focusBorder);
    }
    .pipeline-save-prefab-btn {
        background: transparent; border: none; cursor: pointer;
        font-size: 13px; padding: 0 4px; color: var(--vscode-descriptionForeground);
        line-height: 1; flex-shrink: 0;
        transition: color 0.12s;
    }
    .pipeline-save-prefab-btn:hover { color: var(--vscode-charts-yellow, #e3b341); }

    /* User-saved prefabs section */
    .prefab-user-divider {
        font-size: 10px; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.05em; color: var(--vscode-descriptionForeground);
        padding: 6px 2px 3px; margin-top: 2px;
        border-top: 1px solid var(--vscode-panel-border);
    }
    .prefab-tile-header { display: flex; align-items: flex-start; gap: 4px; }
    .prefab-tile-header .prefab-tile-label { flex: 1; }
    .prefab-delete-btn {
        background: transparent; border: none; cursor: pointer; padding: 0 2px;
        font-size: 11px; color: var(--vscode-descriptionForeground); flex-shrink: 0;
        transition: color 0.1s;
    }
    .prefab-delete-btn:hover { color: var(--vscode-errorForeground); }

    /* ── Pipeline cards (in main panel) ── */
    .pipelines-heading {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 6px; padding-left: 4px;
    }
    .pipelines-heading-label { font-size: 13px; font-weight: 600; color: var(--vscode-descriptionForeground); }
    .pipeline-card {
        border: 1px solid var(--vscode-panel-border); border-radius: 6px;
        overflow: hidden; margin-bottom: 8px;
        transition: border-color 0.12s;
    }
    .pipeline-card.selected-pipeline { border-color: rgba(88,166,255,0.5); }
    .pipeline-card.collapsed .pipeline-body { display: none; }
    .pipeline-card.pl-dragging { opacity: 0.35; }
    .pipeline-card.pl-drag-over { border-color: var(--vscode-focusBorder); background: rgba(88,166,255,0.04); }
    .pipeline-card-header {
        display: flex; align-items: center; gap: 5px;
        padding: 6px 10px;
        background: var(--vscode-sideBarSectionHeader-background);
        border-bottom: 1px solid var(--vscode-panel-border);
        user-select: none; cursor: pointer;
    }
    .pipeline-drag-handle {
        display: flex; align-items: center; gap: 3px;
        cursor: grab; color: var(--vscode-descriptionForeground);
        padding: 0 2px; flex-shrink: 0;
    }
    .pipeline-drag-handle:active { cursor: grabbing; }
    .pipeline-enable-label {
        display: flex; align-items: center; gap: 4px; flex-shrink: 0;
        font-size: 11px; color: var(--vscode-descriptionForeground);
        cursor: pointer; user-select: none; white-space: nowrap;
    }
    .pipeline-drag-handle-icon { font-size: 13px; line-height: 1; }
    .block-drag-handle {
        display: flex; align-items: center;
        cursor: grab; color: var(--vscode-descriptionForeground);
        padding: 0 2px; flex-shrink: 0;
    }
    .block-drag-handle:active { cursor: grabbing; }
    .block-drag-handle-icon { font-size: 12px; line-height: 1; }
    .blk-dragging { opacity: 0.4; }
    .blk-drag-over { border-color: var(--vscode-focusBorder) !important; background: var(--vscode-list-activeSelectionBackground) !important; }
    .pipeline-drag-label {
        font-size: 9px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.3px; color: var(--vscode-descriptionForeground);
    }
    .pipeline-name-input {
        flex: 1; min-width: 80px; max-width: 260px;
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border); border-radius: 3px;
        color: var(--vscode-foreground); font-size: 13px; font-weight: 600;
        padding: 2px 5px; outline: none; font-family: var(--vscode-font-family);
    }
    .pipeline-name-input:hover { border-color: var(--vscode-focusBorder); }
    .pipeline-name-input:focus { border-color: var(--vscode-focusBorder); box-shadow: 0 0 0 1px var(--vscode-focusBorder); }
    .pipeline-body { padding: 8px 10px; }
    .pipeline-blocks-list { display: flex; flex-direction: column; gap: 3px; margin-bottom: 6px; }

    /* Block row inside a pipeline */
    .block-row {
        display: flex; align-items: center; gap: 5px;
        padding: 3px 8px; border-radius: 4px; cursor: pointer;
        border: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background);
    }
    .block-row:hover { background: var(--vscode-list-hoverBackground); }
    .block-row.blk-expanded { border-color: var(--vscode-focusBorder); border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
    .block-type-badge {
        font-size: 9px; padding: 1px 5px; border-radius: 3px; font-weight: 700;
        flex-shrink: 0; width: 110px; text-align: center; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
        background: rgba(128,128,128,0.15);
    }
    .fb-cat-hmi    .block-type-badge, .block-type-badge.cat-hmi    { color: #39d0d8; }
    .fb-cat-input  .block-type-badge, .block-type-badge.cat-input  { color: #58a6ff; }
    .fb-cat-output .block-type-badge, .block-type-badge.cat-output { color: #3fb950; }
    .fb-cat-logic  .block-type-badge, .block-type-badge.cat-logic  { color: #d29922; }
    .fb-cat-timer  .block-type-badge, .block-type-badge.cat-timer  { color: #f97583; }
    .fb-cat-utility .block-type-badge, .block-type-badge.cat-utility { color: #a78bfa; }
    .block-alias-input {
        flex: 1; min-width: 80px; max-width: 220px; background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border); border-radius: 3px;
        color: var(--vscode-foreground); font-size: 12px; font-weight: 500;
        outline: none; padding: 2px 5px; font-family: var(--vscode-font-family); cursor: text;
    }
    .block-alias-input:focus { border-color: var(--vscode-focusBorder); }
    .block-alias-input::placeholder { color: var(--vscode-descriptionForeground); }
    .block-settings-btn {
        background: rgba(56,189,248,0.10); border: 1px solid rgba(56,189,248,0.35); color: #38bdf8;
        cursor: pointer; font-size: 10px; font-weight: 600; padding: 2px 8px;
        border-radius: 3px; flex-shrink: 0; white-space: nowrap;
    }
    .block-settings-btn:hover { background: rgba(56,189,248,0.22); }
    .block-settings-btn.active { background: rgba(56,189,248,0.28); border-color: #38bdf8; }
    .block-remove-btn {
        background: none; border: none; color: var(--vscode-descriptionForeground);
        cursor: pointer; font-size: 13px; padding: 0 2px; flex-shrink: 0;
        margin-left: auto;
    }
    .block-remove-btn:hover { color: #f85149; }
    .block-detail {
        padding: 6px 10px 4px; border: 1px solid var(--vscode-focusBorder);
        border-top: none; border-bottom-left-radius: 4px; border-bottom-right-radius: 4px;
        background: var(--vscode-editor-background); margin-bottom: 3px;
    }
    /* Add-block row */
    .add-block-row { display: flex; gap: 5px; align-items: center; margin-top: 4px; justify-content: flex-start; }
    /* Inline type selector inside Inputs tab block rows */
    .input-type-sel {
        flex: 0 0 auto; min-width: 74px; padding: 1px 4px; height: 22px;
        font-size: 10px; font-family: monospace;
        background: var(--vscode-input-background); color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border, #3c3c3c); border-radius: 3px; cursor: pointer;
    }
    .input-type-sel:focus { outline: none; border-color: var(--vscode-focusBorder); }
    .add-block-select {
        flex: 0 1 220px; max-width: 220px; padding: 3px 6px; background: var(--vscode-input-background);
        color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border);
        border-radius: 3px; font-size: 11px;
    }
    .add-block-btn {
        flex: 0 0 auto; padding: 3px 10px; border-radius: 3px; font-size: 11px; cursor: pointer; font-weight: 500;
        background: rgba(56,189,248,0.08); border: 1px solid rgba(56,189,248,0.3); color: #38bdf8;
    }
    .add-block-btn:hover { background: rgba(56,189,248,0.18); }
    /* Power group sections on Inputs tab */
    .pwr-group {
        border: 1px solid rgba(251,191,36,0.35); border-radius: 5px;
        margin-bottom: 5px; overflow: hidden;
    }
    .pwr-group-header {
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        padding: 4px 8px;
        background: rgba(251,191,36,0.07);
        border-bottom: 1px solid rgba(251,191,36,0.25);
        user-select: none;
    }
    .pwr-group-icon { font-size: 13px; flex-shrink: 0; }
    .pwr-group-label {
        font-size: 11px; font-weight: 700; color: #fbbf24;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 60px;
    }
    .pwr-group-meta {
        display: flex; align-items: center; gap: 4px;
        font-size: 10px; color: var(--vscode-descriptionForeground); white-space: nowrap; flex-shrink: 0;
    }
    .pwr-group-input {
        width: 56px; padding: 1px 4px; background: var(--vscode-input-background);
        color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border);
        border-radius: 3px; font-size: 10px; text-align: right;
    }
    .pwr-group-body { padding: 4px 6px; display: flex; flex-direction: column; gap: 3px; }
    /* Pin capability select — used in block settings for GPIO/ADC/PWM pin fields */
    .pin-cap-select {
        flex: 1; min-width: 120px; max-width: 240px; padding: 3px 6px;
        background: var(--vscode-input-background); color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-focusBorder); border-radius: 3px; font-size: 11px;
    }
    /* Fan / distribute — output block list */
    .fan-outputs-panel {
        border-left: 2px solid rgba(251,191,36,0.5); margin: 0 0 3px 8px;
        padding: 4px 0 4px 8px;
    }
    .fan-outputs-header {
        font-size: 10px; font-weight: 600; color: rgba(251,191,36,0.85);
        text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px;
        display: flex; align-items: center; gap: 6px;
    }
    .fan-output-block {
        border: 1px solid rgba(251,191,36,0.25); border-radius: 4px;
        margin-bottom: 3px; background: rgba(251,191,36,0.03);
    }
    .fan-output-row {
        display: flex; align-items: center; gap: 4px; padding: 3px 6px;
        cursor: pointer;
    }
    .fan-output-row:hover { background: rgba(251,191,36,0.06); }
    .fan-output-alias {
        flex: 1; min-width: 80px; max-width: 220px; background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border); border-radius: 3px;
        color: var(--vscode-foreground); font-size: 12px; font-weight: 500;
        outline: none; padding: 2px 5px; font-family: var(--vscode-font-family); cursor: text;
    }
    .fan-output-alias:focus { border-color: var(--vscode-focusBorder); }
    .fan-output-alias::placeholder { color: var(--vscode-descriptionForeground); }
    .fan-output-settings-btn {
        padding: 1px 6px; font-size: 10px; cursor: pointer; border-radius: 3px;
        background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.3);
        color: rgba(251,191,36,0.9); flex-shrink: 0;
    }
    .fan-output-settings-btn.active { background: rgba(251,191,36,0.2); }
    .fan-output-remove-btn {
        padding: 1px 5px; font-size: 10px; cursor: pointer; flex-shrink: 0; margin-left: auto;
        background: transparent; border: 1px solid rgba(200,80,80,0.3);
        color: rgba(220,100,100,0.9); border-radius: 3px;
    }
    .fan-output-remove-btn:hover { background: rgba(200,80,80,0.12); }
    .fan-output-detail {
        padding: 4px 8px 4px; border-top: 1px solid rgba(251,191,36,0.2);
    }
    .fan-add-row { display: flex; gap: 4px; align-items: center; margin-top: 4px; }
    .fan-add-select {
        flex: 1; padding: 2px 5px; font-size: 11px;
        background: var(--vscode-input-background); color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border); border-radius: 3px;
    }
    .fan-add-btn {
        padding: 2px 8px; font-size: 10px; cursor: pointer;
        background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.4);
        color: rgba(251,191,36,0.9); border-radius: 3px; white-space: nowrap;
    }
    .fan-add-btn:hover { background: rgba(251,191,36,0.2); }

    /* ── FLASH PARTITION LAYOUT section (left sidebar) ── */
    .part-ctrl {
        display: flex; align-items: center; gap: 6px;
        padding: 5px 10px; border-bottom: 1px solid var(--vscode-panel-border);
        font-size: 10px; background: var(--vscode-sideBarSectionHeader-background);
    }
    .part-ctrl label { font-weight: 600; color: var(--vscode-descriptionForeground); white-space: nowrap; }
    .part-ctrl select, .part-ctrl input[type="number"] {
        padding: 2px 5px; background: var(--vscode-input-background);
        color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border);
        border-radius: 3px; font-size: 10px;
    }
    .part-ctrl select { width: 72px; }
    .part-ctrl input[type="number"] { width: 64px; }
    .part-tbl { width: 100%; border-collapse: collapse; font-size: 10px; }
    .part-tbl th {
        text-align: left; font-weight: 600;
        color: var(--vscode-descriptionForeground); padding: 2px 6px;
        border-bottom: 1px solid var(--vscode-panel-border);
        background: var(--vscode-sideBar-background);
        position: sticky; top: 0;
    }
    .part-tbl td { padding: 2px 6px; border-bottom: 1px solid var(--vscode-panel-border); }
    .part-tbl tr.part-editable { background: rgba(88,166,255,0.07); }
    .part-tbl tr.part-editable td:first-child { color: var(--vscode-textLink-foreground); font-weight: 600; }
    .part-tbl tr.part-fixed td:first-child { font-family: monospace; }
    .part-size-input {
        width: 58px; padding: 1px 4px; font-size: 10px;
        background: var(--vscode-input-background); color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border); border-radius: 2px;
    }
    .part-size-input:focus { outline: 1px solid var(--vscode-focusBorder); }
    .part-footer {
        padding: 4px 10px; font-size: 10px; display: flex; justify-content: space-between;
        border-top: 1px solid var(--vscode-panel-border);
        color: var(--vscode-descriptionForeground);
        background: var(--vscode-sideBarSectionHeader-background);
    }
    .part-footer.over { color: #f85149; }
    .part-offset { font-family: monospace; font-size: 9px; color: var(--vscode-descriptionForeground); }
    .part-desc { color: var(--vscode-descriptionForeground); font-size: 9px; }
`;

