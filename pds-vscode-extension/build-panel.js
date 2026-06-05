const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { findWorkspaceRoot, discoverTargets, loadLastSelection, saveLastSelection } = require('./utils');

let buildPanel = undefined;

/**
 * Register the Build command.
 * Called from the main extension activate().
 */
function registerBuildPanel(context) {
    const cmd = vscode.commands.registerCommand('pds.openBuild', () => {
        if (buildPanel) {
            buildPanel.reveal(vscode.ViewColumn.Two);
            return;
        }

        const workspaceRoot = findWorkspaceRoot();
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }

        buildPanel = vscode.window.createWebviewPanel(
            'pdsBuild',
            'PDS Build',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Discover targets and send to webview
        const boards = discoverTargets(workspaceRoot);
        const lastSelection = loadLastSelection(workspaceRoot);

        buildPanel.webview.html = getBuildPanelHtml(boards, lastSelection);

        buildPanel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'build':
                        await runBuild(workspaceRoot, message, false);
                        break;
                    case 'buildClean':
                        await runBuild(workspaceRoot, message, true);
                        break;
                    case 'selectionChanged':
                        saveLastSelection(workspaceRoot, message);
                        break;
                    case 'refresh':
                        const refreshed = discoverTargets(workspaceRoot);
                        buildPanel.webview.postMessage({
                            command: 'boardsUpdated',
                            boards: refreshed
                        });
                        break;
                }
            },
            undefined,
            context.subscriptions
        );

        buildPanel.onDidDispose(() => {
            buildPanel = undefined;
        }, null, context.subscriptions);
    });

    context.subscriptions.push(cmd);
}

/**
 * Run a build in a VS Code terminal.
 */
async function runBuild(workspaceRoot, message, clean) {
    const { board, hwrev, role } = message;

    if (!board || !hwrev || !role) {
        vscode.window.showWarningMessage('Select a board, hardware revision, and role first.');
        return;
    }

    const buildScript = path.join(workspaceRoot, 'PDS-BuildTools', 'scripts', 'build_selector.py');
    if (!fs.existsSync(buildScript)) {
        vscode.window.showErrorMessage('PDS-BuildTools/scripts/build_selector.py not found.');
        return;
    }

    const args = [
        'python', `"${buildScript}"`,
        '--board', board,
        '--hwrev', hwrev,
        '--role', role,
    ];

    if (clean) args.push('--clean');

    const terminal = vscode.window.createTerminal({
        name: `PDS Build: ${board}/${hwrev}/${role}`,
        cwd: workspaceRoot
    });

    terminal.show();
    terminal.sendText(args.join(' '));
}

/**
 * Generate the Build panel HTML.
 */
function getBuildPanelHtml(boards, lastSelection) {
    const boardsJson = JSON.stringify(boards).replace(/<\//g, '<\\/');
    const lastJson = JSON.stringify(lastSelection || {}).replace(/<\//g, '<\\/');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PDS Build</title>
<style>
    :root {
        --bg: #1e1e2e;
        --surface: #282840;
        --surface2: #313150;
        --text: #cdd6f4;
        --subtext: #a6adc8;
        --accent: #89b4fa;
        --green: #a6e3a1;
        --yellow: #f9e2af;
        --red: #f38ba8;
        --border: #45475a;
        --radius: 8px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: var(--bg);
        color: var(--text);
        padding: 20px;
        font-size: 13px;
    }
    h1 { font-size: 1.4em; margin-bottom: 4px; }
    h1 span { color: var(--accent); }
    .subtitle { color: var(--subtext); margin-bottom: 20px; font-size: 0.9em; }

    .selector-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 12px;
        margin-bottom: 20px;
    }
    .selector-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 12px;
    }
    .selector-card.active { border-color: var(--accent); }
    .selector-card label {
        display: block;
        font-weight: 600;
        font-size: 0.85em;
        color: var(--subtext);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
    }
    .option-list {
        list-style: none;
        max-height: 180px;
        overflow-y: auto;
    }
    .option-list li {
        padding: 8px 10px;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.15s;
        font-size: 0.95em;
    }
    .option-list li:hover { background: var(--surface2); }
    .option-list li.selected {
        background: var(--accent);
        color: var(--bg);
        font-weight: 600;
    }
    .option-list li .badge {
        font-size: 0.75em;
        padding: 1px 6px;
        border-radius: 10px;
        margin-left: 6px;
        background: var(--surface2);
        color: var(--subtext);
    }
    .option-list li.selected .badge {
        background: rgba(0,0,0,0.2);
        color: var(--bg);
    }

    .empty-msg {
        color: var(--subtext);
        font-style: italic;
        padding: 12px 0;
        font-size: 0.85em;
    }

    .info-bar {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 12px 16px;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 0.9em;
    }
    .info-bar .label { color: var(--subtext); }
    .info-bar .value { color: var(--green); font-weight: 600; font-family: monospace; }
    .info-bar .chip {
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 0.8em;
        font-weight: 600;
    }
    .chip-esp { background: #34d399; color: #1e1e2e; }
    .chip-silabs { background: #f9e2af; color: #1e1e2e; }
    .chip-unknown { background: var(--surface2); color: var(--subtext); }

    .button-row {
        display: flex;
        gap: 10px;
        margin-bottom: 16px;
        flex-wrap: wrap;
    }
    button {
        padding: 10px 20px;
        border: none;
        border-radius: var(--radius);
        font-weight: 600;
        font-size: 0.95em;
        cursor: pointer;
        transition: opacity 0.15s, transform 0.1s;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    button:hover { opacity: 0.9; }
    button:active { transform: scale(0.97); }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-build { background: var(--green); color: var(--bg); }
    .btn-clean { background: var(--yellow); color: var(--bg); }
    .btn-small { padding: 6px 12px; font-size: 0.8em; }
    .btn-refresh { background: transparent; color: var(--subtext); border: 1px solid var(--border); padding: 6px 10px; font-size: 0.8em; }

    .cmd-preview {
        background: #11111b;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 12px 16px;
        font-family: 'Cascadia Code', 'Fira Code', monospace;
        font-size: 0.85em;
        color: var(--green);
        white-space: pre-wrap;
        word-break: break-all;
    }
    .cmd-preview .prompt { color: var(--accent); }
    .section-label {
        font-size: 0.8em;
        color: var(--subtext);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
        font-weight: 600;
    }
</style>
</head>
<body>
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
        <div>
            <h1>🔨 <span>PDS</span> Build</h1>
            <p class="subtitle">Select target → Build firmware</p>
        </div>
        <button class="btn-refresh" onclick="refresh()">↻ Refresh</button>
    </div>

    <div class="selector-grid">
        <div class="selector-card" id="boardCard">
            <label>Target</label>
            <ul class="option-list" id="boardList"></ul>
        </div>
        <div class="selector-card" id="hwrevCard">
            <label>Hardware Revision</label>
            <ul class="option-list" id="hwrevList">
                <li class="empty-msg">← Select a board</li>
            </ul>
        </div>
        <div class="selector-card" id="roleCard">
            <label>Device Role</label>
            <ul class="option-list" id="roleList">
                <li class="empty-msg">← Select a hwrev</li>
            </ul>
        </div>
    </div>

    <div class="info-bar" id="infoBar" style="display: none;">
        <span class="label">Target:</span>
        <span class="value" id="targetDisplay">—</span>
        <span id="buildSystemChip"></span>
    </div>

    <div class="button-row">
        <button class="btn-build" id="btnBuild" disabled onclick="doBuild()">▶ Build</button>
        <button class="btn-clean" id="btnClean" disabled onclick="doCleanBuild()">🧹 Clean Build</button>
    </div>

    <div class="section-label" style="margin-top: 16px;">Command Preview</div>
    <div class="cmd-preview" id="cmdPreview">
        <span class="prompt">$</span> <em style="color: var(--subtext);">Select a target to see the build command</em>
    </div>

<script>
const vscodeApi = acquireVsCodeApi();

let boards = ${boardsJson};
let selection = { board: null, hwrev: null, role: null };
let currentBoardData = null;

// Restore last selection
const last = ${lastJson};

// Render boards
function renderBoards() {
    const list = document.getElementById('boardList');
    if (boards.length === 0) {
        list.innerHTML = '<li class="empty-msg">No boards discovered</li>';
        return;
    }
    list.innerHTML = boards.map(p => {
        const chipClass = p.buildSystem === 'esp-idf' ? 'chip-esp'
                        : p.buildSystem === 'silabs' ? 'chip-silabs' : 'chip-unknown';
        return '<li data-id="' + p.id + '" onclick="selectBoard(this)">'
            + p.id
            + '<span class="badge ' + chipClass + '">' + p.buildSystem + '</span>'
            + '</li>';
    }).join('');
}

function selectBoard(el) {
    // Deselect all
    document.querySelectorAll('#boardList li').forEach(li => li.classList.remove('selected'));
    el.classList.add('selected');

    const id = el.dataset.id;
    selection.board = id;
    selection.hwrev = null;
    selection.role = null;

    currentBoardData = boards.find(p => p.id === id);
    renderHwrevs();
    renderRoles();
    updateUI();
}

function renderHwrevs() {
    const list = document.getElementById('hwrevList');
    if (!currentBoardData) {
        list.innerHTML = '<li class="empty-msg">← Select a board</li>';
        return;
    }
    const hwrevs = currentBoardData.hwrevs;
    list.innerHTML = hwrevs.map(h =>
        '<li data-id="' + h.id + '" onclick="selectHwrev(this)">'
        + h.id
        + '<span class="badge">' + h.roles.length + ' role' + (h.roles.length !== 1 ? 's' : '') + '</span>'
        + '</li>'
    ).join('');
}

function selectHwrev(el) {
    document.querySelectorAll('#hwrevList li').forEach(li => li.classList.remove('selected'));
    el.classList.add('selected');

    selection.hwrev = el.dataset.id;
    selection.role = null;
    renderRoles();
    updateUI();
}

function renderRoles() {
    const list = document.getElementById('roleList');
    if (!currentBoardData || !selection.hwrev) {
        list.innerHTML = '<li class="empty-msg">← Select a hwrev</li>';
        return;
    }
    const hwrev = currentBoardData.hwrevs.find(h => h.id === selection.hwrev);
    if (!hwrev) { list.innerHTML = '<li class="empty-msg">No roles</li>'; return; }

    list.innerHTML = hwrev.roles.map(r =>
        '<li data-id="' + r + '" onclick="selectRole(this)">' + r + '</li>'
    ).join('');
}

function selectRole(el) {
    document.querySelectorAll('#roleList li').forEach(li => li.classList.remove('selected'));
    el.classList.add('selected');
    selection.role = el.dataset.id;
    updateUI();
}

function updateUI() {
    const ready = selection.board && selection.hwrev && selection.role;

    document.getElementById('btnBuild').disabled = !ready;
    document.getElementById('btnClean').disabled = !ready;

    const infoBar = document.getElementById('infoBar');
    if (ready) {
        infoBar.style.display = 'flex';
        document.getElementById('targetDisplay').textContent =
            selection.board + ' / ' + selection.hwrev + ' / ' + selection.role;

        const bs = currentBoardData?.buildSystem || 'unknown';
        const chipClass = bs === 'esp-idf' ? 'chip-esp' : bs === 'silabs' ? 'chip-silabs' : 'chip-unknown';
        document.getElementById('buildSystemChip').innerHTML =
            '<span class="chip ' + chipClass + '">' + bs + '</span>';

        document.getElementById('cmdPreview').innerHTML =
            '<span class="prompt">$</span> python PDS-BuildTools/go.py'
            + ' --board ' + selection.board
            + ' --hwrev ' + selection.hwrev
            + ' --role ' + selection.role;

        // Notify extension to save selection
        vscodeApi.postMessage({
            command: 'selectionChanged',
            ...selection
        });
    } else {
        infoBar.style.display = 'none';
        document.getElementById('cmdPreview').innerHTML =
            '<span class="prompt">$</span> <em style="color: var(--subtext);">Select a target to see the build command</em>';
    }
}

function doBuild() {
    vscodeApi.postMessage({ command: 'build', ...selection });
}
function doCleanBuild() {
    vscodeApi.postMessage({ command: 'buildClean', ...selection });
}
function refresh() {
    vscodeApi.postMessage({ command: 'refresh' });
}

// Handle messages from extension
window.addEventListener('message', function(event) {
    const msg = event.data;
    if (msg.command === 'boardsUpdated') {
        boards = msg.boards;
        selection = { board: null, hwrev: null, role: null };
        currentBoardData = null;
        renderBoards();
        renderHwrevs();
        renderRoles();
        updateUI();
    }
});

// Init
renderBoards();

// Auto-restore last selection
if (last && last.board) {
    setTimeout(() => {
        const pItem = document.querySelector('#boardList li[data-id="' + last.board + '"]');
        if (pItem) {
            selectBoard(pItem);
            if (last.hwrev) {
                setTimeout(() => {
                    const hItem = document.querySelector('#hwrevList li[data-id="' + last.hwrev + '"]');
                    if (hItem) {
                        selectHwrev(hItem);
                        if (last.role) {
                            setTimeout(() => {
                                const rItem = document.querySelector('#roleList li[data-id="' + last.role + '"]');
                                if (rItem) selectRole(rItem);
                            }, 50);
                        }
                    }
                }, 50);
            }
        }
    }, 100);
}
</script>
</body>
</html>`;
}

module.exports = { registerBuildPanel };
