'use strict';

/**
 * pipeline-panel.js
 *
 * "PDS: Pipeline Push" panel.
 *
 * Selects a board/hwrev/role → reads pre-built L1/L2/L3 blobs from
 * PDS-BuildTools/dist/defaults/<role>/ → POSTs them to the WEB-HMI API
 * for a target device.
 *
 * Connection settings (API URL, Bearer Token, Device UUID) are persisted to
 * PDS-BuildTools/.pds_pipeline_config.json so they are also readable by the
 * post_pipeline.ps1 CLI script.
 */

const vscode = require('vscode');
const path   = require('path');
const fs     = require('fs');
const http   = require('http');
const https  = require('https');
const { findWorkspaceRoot, discoverTargets, loadLastSelection, saveLastSelection } = require('./utils');

const CONFIG_FILE = '.pds_pipeline_config.json';

let pipelinePanel = undefined;

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

function registerPipelinePanel(context) {
    const cmd = vscode.commands.registerCommand('pds.openPipelinePanel', () => {
        if (pipelinePanel) {
            pipelinePanel.reveal(vscode.ViewColumn.Two);
            return;
        }

        const workspaceRoot = findWorkspaceRoot();
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }

        pipelinePanel = vscode.window.createWebviewPanel(
            'pdsPipeline',
            'PDS Pipeline Push',
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        const boards      = discoverTargets(workspaceRoot);
        const lastSelection  = loadLastSelection(workspaceRoot);
        const pipelineConfig = loadPipelineConfig(workspaceRoot);

        pipelinePanel.webview.html = getPipelinePanelHtml(boards, lastSelection, pipelineConfig);

        pipelinePanel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'selectionChanged':
                    saveLastSelection(workspaceRoot, message);
                    break;
                case 'refresh': {
                    const refreshed = discoverTargets(workspaceRoot);
                    pipelinePanel.webview.postMessage({ command: 'boardsUpdated', boards: refreshed });
                    break;
                }
                case 'saveConfig':
                    savePipelineConfig(workspaceRoot, message.config);
                    break;
                case 'checkBlobs': {
                    const status = checkBlobsExist(workspaceRoot, message.role);
                    pipelinePanel.webview.postMessage({ command: 'blobStatus', ...status });
                    break;
                }
                case 'postPipeline':
                    await runPostPipeline(workspaceRoot, message, pipelinePanel);
                    break;
                case 'checkStatus':
                    await runCheckStatus(message, pipelinePanel);
                    break;
            }
        }, undefined, context.subscriptions);

        pipelinePanel.onDidDispose(() => { pipelinePanel = undefined; }, null, context.subscriptions);
    });

    context.subscriptions.push(cmd);
}

// ─────────────────────────────────────────────────────────────────────────────
// Config persistence  (.pds_pipeline_config.json)
// ─────────────────────────────────────────────────────────────────────────────

function loadPipelineConfig(workspaceRoot) {
    const cfgPath = path.join(workspaceRoot, 'PDS-BuildTools', CONFIG_FILE);
    try {
        if (fs.existsSync(cfgPath)) return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    } catch { /* ignore */ }
    return { apiBase: 'http://192.168.1.80:3001/v1', bearerToken: '', deviceId: '' };
}

function savePipelineConfig(workspaceRoot, config) {
    const cfgPath = path.join(workspaceRoot, 'PDS-BuildTools', CONFIG_FILE);
    try {
        fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (e) {
        vscode.window.showErrorMessage(`Failed to save pipeline config: ${e.message}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Blob status
// ─────────────────────────────────────────────────────────────────────────────

function checkBlobsExist(workspaceRoot, role) {
    if (!role) return { ready: false, l1: false, l2: false, l3: false, l1Size: 0, l2Size: 0, l3Size: 0 };
    const dir   = path.join(workspaceRoot, 'PDS-BuildTools', 'dist', 'defaults', role);
    const p1    = path.join(dir, `${role}_l1.bin`);
    const p2    = path.join(dir, `${role}_l2.bin`);
    const p3    = path.join(dir, `${role}_l3.bin`);
    const l1    = fs.existsSync(p1);
    const l2    = fs.existsSync(p2);
    const l3    = fs.existsSync(p3);
    return {
        ready: l1 && l2 && l3,
        l1, l2, l3,
        l1Size: l1 ? fs.statSync(p1).size : 0,
        l2Size: l2 ? fs.statSync(p2).size : 0,
        l3Size: l3 ? fs.statSync(p3).size : 0,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helper
// ─────────────────────────────────────────────────────────────────────────────

function httpRequest(method, urlStr, headers, body) {
    return new Promise((resolve, reject) => {
        const url  = new URL(urlStr);
        const lib  = url.protocol === 'https:' ? https : http;
        const opts = {
            hostname: url.hostname,
            port:     url.port || (url.protocol === 'https:' ? 443 : 80),
            path:     url.pathname + url.search,
            method,
            headers,
            timeout: 10000,
        };
        const req = lib.request(opts, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end',  ()      => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error',   reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
        if (body) req.write(body);
        req.end();
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Post pipeline
// ─────────────────────────────────────────────────────────────────────────────

async function runPostPipeline(workspaceRoot, message, panel) {
    const { role, apiBase, bearerToken, deviceId } = message;

    if (!role || !apiBase || !bearerToken || !deviceId) {
        panel.webview.postMessage({ command: 'postResult', error: 'Missing role, API URL, token, or device ID.' });
        return;
    }

    const dir = path.join(workspaceRoot, 'PDS-BuildTools', 'dist', 'defaults', role);
    let l1, l2, l3;
    try {
        l1 = fs.readFileSync(path.join(dir, `${role}_l1.bin`));
        l2 = fs.readFileSync(path.join(dir, `${role}_l2.bin`));
        l3 = fs.readFileSync(path.join(dir, `${role}_l3.bin`));
    } catch (e) {
        panel.webview.postMessage({ command: 'postResult', error: `Failed to read blobs: ${e.message}` });
        return;
    }

    // Read role JSON for pipeline/block aliases (meta overlay)
    // Flatten nested blocks (fan_float.fan_outputs etc.) to match L1 flat order
    let meta = undefined;
    const roleJsonPath = path.join(workspaceRoot, 'PDS-Role', 'saved_roles', `${role}.json`);
    if (fs.existsSync(roleJsonPath)) {
        try {
            const roleConfig = JSON.parse(fs.readFileSync(roleJsonPath, 'utf8'));
            if (Array.isArray(roleConfig.pipelines)) {
                meta = {
                    pipelines: roleConfig.pipelines.map(pl => ({
                        name: pl.name || '',
                        blocks: pl.blocks.reduce((acc, blk) => {
                            acc.push({ alias: blk.alias || '' });
                            if (Array.isArray(blk.fan_outputs)) {
                                blk.fan_outputs.forEach(fo => acc.push({ alias: fo.alias || '' }));
                            }
                            return acc;
                        }, []),
                    })),
                };
            }
        } catch (e) { /* role JSON not critical — proceed without meta */ }
    }

    const body = JSON.stringify({
        l1: l1.toString('base64'),
        l2: l2.toString('base64'),
        l3: l3.toString('base64'),
        ...(meta ? { meta } : {}),
    });

    const url = `${apiBase.replace(/\/$/, '')}/devices/${deviceId}/pipeline`;
    panel.webview.postMessage({
        command: 'postResult',
        info: `POST ${url}  (L1=${l1.length}B  L2=${l2.length}B  L3=${l3.length}B)`,
    });

    try {
        const res = await httpRequest('POST', url, {
            'Authorization':  `Bearer ${bearerToken}`,
            'Content-Type':   'application/json',
            'Content-Length': Buffer.byteLength(body),
        }, body);
        panel.webview.postMessage({ command: 'postResult', status: res.status, body: res.body });
    } catch (e) {
        panel.webview.postMessage({ command: 'postResult', error: e.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Check device status
// ─────────────────────────────────────────────────────────────────────────────

async function runCheckStatus(message, panel) {
    const { apiBase, bearerToken, deviceId } = message;

    if (!apiBase || !bearerToken || !deviceId) {
        panel.webview.postMessage({ command: 'statusResult', error: 'Missing API URL, token, or device ID.' });
        return;
    }

    const url = `${apiBase.replace(/\/$/, '')}/devices/${deviceId}`;
    try {
        const res = await httpRequest('GET', url, { 'Authorization': `Bearer ${bearerToken}` });
        panel.webview.postMessage({ command: 'statusResult', status: res.status, body: res.body });
    } catch (e) {
        panel.webview.postMessage({ command: 'statusResult', error: e.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Webview HTML
// ─────────────────────────────────────────────────────────────────────────────

function getPipelinePanelHtml(boards, lastSelection, pipelineConfig) {
    const boardsJson = JSON.stringify(boards).replace(/<\//g, '<\\/');
    const lastJson      = JSON.stringify(lastSelection  || {}).replace(/<\//g, '<\\/');
    const configJson    = JSON.stringify(pipelineConfig || {}).replace(/<\//g, '<\\/');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PDS Pipeline Push</title>
<style>
    :root {
        --bg: #1e1e2e; --surface: #282840; --surface2: #313150;
        --text: #cdd6f4; --subtext: #a6adc8; --accent: #89b4fa;
        --green: #a6e3a1; --yellow: #f9e2af; --red: #f38ba8;
        --border: #45475a; --radius: 8px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: var(--bg); color: var(--text);
        padding: 20px; font-size: 13px;
    }
    h1 { font-size: 1.4em; margin-bottom: 4px; }
    h1 span { color: var(--accent); }
    .subtitle { color: var(--subtext); margin-bottom: 20px; font-size: 0.9em; }

    .selector-grid {
        display: grid; grid-template-columns: 1fr 1fr 1fr;
        gap: 12px; margin-bottom: 20px;
    }
    .selector-card {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: var(--radius); padding: 12px;
    }
    .selector-card label {
        display: block; font-weight: 600; font-size: 0.85em;
        color: var(--subtext); text-transform: uppercase;
        letter-spacing: 0.5px; margin-bottom: 8px;
    }
    .option-list { list-style: none; max-height: 160px; overflow-y: auto; }
    .option-list li {
        padding: 8px 10px; border-radius: 4px;
        cursor: pointer; transition: background 0.15s; font-size: 0.95em;
    }
    .option-list li:hover { background: var(--surface2); }
    .option-list li.selected { background: var(--accent); color: var(--bg); font-weight: 600; }
    .option-list li .badge {
        font-size: 0.75em; padding: 1px 6px; border-radius: 10px;
        margin-left: 6px; background: var(--surface2); color: var(--subtext);
    }
    .option-list li.selected .badge { background: rgba(0,0,0,0.2); color: var(--bg); }
    .empty-msg { color: var(--subtext); font-style: italic; padding: 12px 0; font-size: 0.85em; }

    .section {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: var(--radius); padding: 16px; margin-bottom: 16px;
    }
    .section h2 { font-size: 1.1em; margin-bottom: 12px; color: var(--accent); }

    .field-row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
    .field-row label { font-weight: 600; font-size: 0.85em; color: var(--subtext); }
    .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
    input[type="text"], input[type="password"] {
        background: var(--surface2); border: 1px solid var(--border);
        border-radius: 4px; padding: 8px 12px; color: var(--text);
        font-size: 0.95em; font-family: monospace; width: 100%;
    }
    input:focus { outline: 1px solid var(--accent); }

    .blob-status { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
    .blob-chip {
        padding: 4px 10px; border-radius: 12px;
        font-family: monospace; font-size: 0.82em; font-weight: 600;
    }
    .blob-chip.ok     { background: rgba(166,227,161,0.12); color: var(--green); border: 1px solid var(--green); }
    .blob-chip.miss   { background: rgba(243,139,168,0.12); color: var(--red);   border: 1px solid var(--red); }
    .blob-chip.none   { color: var(--subtext); font-style: italic; font-weight: 400; border: none; }

    .button-row { display: flex; gap: 10px; flex-wrap: wrap; }
    button {
        padding: 10px 20px; border: none; border-radius: var(--radius);
        font-weight: 600; font-size: 0.95em; cursor: pointer;
        transition: opacity 0.15s, transform 0.1s;
        display: flex; align-items: center; gap: 6px;
    }
    button:hover   { opacity: 0.9; }
    button:active  { transform: scale(0.97); }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-push    { background: var(--accent); color: var(--bg); }
    .btn-status  { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
    .btn-save    { background: var(--green); color: #1e1e2e; }
    .btn-refresh { background: transparent; color: var(--subtext); border: 1px solid var(--border); padding: 6px 10px; font-size: 0.8em; }

    .log {
        background: #12121e; border: 1px solid var(--border); border-radius: 4px;
        padding: 12px; font-family: monospace; font-size: 0.82em;
        max-height: 200px; overflow-y: auto;
        white-space: pre-wrap; word-break: break-all; line-height: 1.6;
    }
    .log-info { color: var(--subtext); }
    .log-ok   { color: var(--green); }
    .log-err  { color: var(--red); }
    .log-warn { color: var(--yellow); }
</style>
</head>
<body>

<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
    <div>
        <h1>🌐 <span>PDS</span> Pipeline Push</h1>
        <p class="subtitle">Select role → configure API connection → push L1/L2/L3 blobs to device</p>
    </div>
    <button class="btn-refresh" onclick="refresh()">↻ Refresh</button>
</div>

<div class="selector-grid">
    <div class="selector-card">
        <label>board</label>
        <ul class="option-list" id="boardList"></ul>
    </div>
    <div class="selector-card">
        <label>Hardware Revision</label>
        <ul class="option-list" id="hwrevList"><li class="empty-msg">← Select a board</li></ul>
    </div>
    <div class="selector-card">
        <label>Device Role</label>
        <ul class="option-list" id="roleList"><li class="empty-msg">← Select a hwrev</li></ul>
    </div>
</div>

<div class="section">
    <h2>🔌 API Connection</h2>
    <div class="field-row">
        <label>API Base URL</label>
        <input type="text" id="apiBase" placeholder="http://192.168.1.80:3001/v1" />
    </div>
    <div class="field-grid">
        <div>
            <div class="field-row">
                <label>Device UUID</label>
                <input type="text" id="deviceId" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </div>
        </div>
        <div>
            <div class="field-row">
                <label>Bearer Token</label>
                <input type="password" id="bearerToken" placeholder="eyJ..." />
            </div>
        </div>
    </div>
    <div class="button-row">
        <button class="btn-save" onclick="saveConfig()">💾 Save Connection</button>
    </div>
</div>

<div class="section">
    <h2>📦 Blobs</h2>
    <div class="blob-status" id="blobStatus">
        <span class="blob-chip none">Select a role to check blob status</span>
    </div>
    <div class="button-row">
        <button class="btn-push"   id="btnPush"   disabled onclick="doPush()">🚀 Post Pipeline</button>
        <button class="btn-status" id="btnStatus"          onclick="doStatus()">📊 Check Status</button>
    </div>
</div>

<div class="section">
    <h2>📋 Log</h2>
    <div class="log" id="logEl"><span class="log-info">Ready.</span></div>
</div>

<script>
const vscodeApi = acquireVsCodeApi();
let boards = ${boardsJson};
let selection = { board: null, hwrev: null, role: null };
let currentBoardData = null;
let blobsReady = false;
const last        = ${lastJson};
const savedConfig = ${configJson};

// ── Init ─────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
    document.getElementById('apiBase').value     = savedConfig.apiBase     || '';
    document.getElementById('bearerToken').value = savedConfig.bearerToken || '';
    document.getElementById('deviceId').value    = savedConfig.deviceId    || '';
    renderBoards();
    if (last && last.board) restoreSelection();
});

window.addEventListener('message', (ev) => {
    const msg = ev.data;
    if (msg.command === 'boardsUpdated') { boards = msg.boards; renderBoards(); return; }
    if (msg.command === 'blobStatus')       { updateBlobStatus(msg); return; }
    if (msg.command === 'postResult')       { handlePostResult(msg); return; }
    if (msg.command === 'statusResult')     { handleStatusResult(msg); return; }
});

// ── Selectors ─────────────────────────────────────────────────────────────
function renderBoards() {
    const list = document.getElementById('boardList');
    if (!boards.length) { list.innerHTML = '<li class="empty-msg">No boards discovered</li>'; return; }
    list.innerHTML = boards.map(p =>
        '<li data-id="' + p.id + '" onclick="selectBoard(this)">'
        + p.id + '<span class="badge">' + p.buildSystem + '</span></li>'
    ).join('');
}

function selectBoard(el) {
    document.querySelectorAll('#boardList li').forEach(li => li.classList.remove('selected'));
    el.classList.add('selected');
    selection.board = el.dataset.id;
    selection.hwrev = null; selection.role = null;
    currentBoardData = boards.find(p => p.id === selection.board);
    renderHwrevs(); renderRoles(); updateUI();
}

function renderHwrevs() {
    const list = document.getElementById('hwrevList');
    if (!currentBoardData) { list.innerHTML = '<li class="empty-msg">← Select a board</li>'; return; }
    list.innerHTML = currentBoardData.hwrevs.map(h =>
        '<li data-id="' + h.id + '" onclick="selectHwrev(this)">'
        + 'hwrev_' + h.id
        + '<span class="badge">' + h.roles.length + ' role' + (h.roles.length !== 1 ? 's' : '') + '</span></li>'
    ).join('');
}

function selectHwrev(el) {
    document.querySelectorAll('#hwrevList li').forEach(li => li.classList.remove('selected'));
    el.classList.add('selected');
    selection.hwrev = el.dataset.id; selection.role = null;
    renderRoles(); updateUI();
}

function renderRoles() {
    const list = document.getElementById('roleList');
    if (!currentBoardData || !selection.hwrev) { list.innerHTML = '<li class="empty-msg">← Select a hwrev</li>'; return; }
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
    blobsReady = false;
    updateUI();
    vscodeApi.postMessage({ command: 'checkBlobs', role: selection.role });
    vscodeApi.postMessage({ command: 'selectionChanged', ...selection });
}

function restoreSelection() {
    const pEl = document.querySelector('#boardList li[data-id="' + last.board + '"]');
    if (pEl) { selectBoard(pEl); }
    setTimeout(() => {
        const hEl = document.querySelector('#hwrevList li[data-id="' + last.hwrev + '"]');
        if (hEl) { selectHwrev(hEl); }
        setTimeout(() => {
            const rEl = document.querySelector('#roleList li[data-id="' + last.role + '"]');
            if (rEl) { selectRole(rEl); }
        }, 0);
    }, 0);
}

function updateUI() {
    document.getElementById('btnPush').disabled = !(selection.role && blobsReady);
}

// ── Blob status ───────────────────────────────────────────────────────────
function updateBlobStatus(msg) {
    blobsReady = msg.ready;
    const el = document.getElementById('blobStatus');
    if (!msg.l1 && !msg.l2 && !msg.l3) {
        el.innerHTML = '<span class="blob-chip miss">Blobs not found — run Role Builder → Generate first</span>';
    } else {
        el.innerHTML = [
            blobChip('L1', msg.l1, msg.l1Size),
            blobChip('L2', msg.l2, msg.l2Size),
            blobChip('L3', msg.l3, msg.l3Size),
        ].join('');
    }
    updateUI();
}

function blobChip(label, ok, size) {
    return '<span class="blob-chip ' + (ok ? 'ok' : 'miss') + '">'
         + label + (ok ? ' ' + size + 'B' : ' ✗') + '</span>';
}

// ── Config ────────────────────────────────────────────────────────────────
function saveConfig() {
    const config = {
        apiBase:     document.getElementById('apiBase').value.trim(),
        bearerToken: document.getElementById('bearerToken').value.trim(),
        deviceId:    document.getElementById('deviceId').value.trim(),
    };
    vscodeApi.postMessage({ command: 'saveConfig', config });
    log('Connection settings saved to .pds_pipeline_config.json', 'ok');
}

// ── Actions ───────────────────────────────────────────────────────────────
function doPush() {
    const apiBase     = document.getElementById('apiBase').value.trim();
    const bearerToken = document.getElementById('bearerToken').value.trim();
    const deviceId    = document.getElementById('deviceId').value.trim();
    if (!apiBase || !bearerToken || !deviceId) {
        log('Fill in API URL, Bearer Token, and Device UUID first.', 'err');
        return;
    }
    log('Posting pipeline blobs...', 'info');
    document.getElementById('btnPush').disabled = true;
    vscodeApi.postMessage({ command: 'postPipeline', role: selection.role, apiBase, bearerToken, deviceId });
}

function doStatus() {
    const apiBase     = document.getElementById('apiBase').value.trim();
    const bearerToken = document.getElementById('bearerToken').value.trim();
    const deviceId    = document.getElementById('deviceId').value.trim();
    if (!apiBase || !bearerToken || !deviceId) {
        log('Fill in API URL, Bearer Token, and Device UUID first.', 'err');
        return;
    }
    log('Checking device status...', 'info');
    vscodeApi.postMessage({ command: 'checkStatus', apiBase, bearerToken, deviceId });
}

function refresh() {
    vscodeApi.postMessage({ command: 'refresh' });
}

// ── Log ───────────────────────────────────────────────────────────────────
function log(text, cls) {
    cls = cls || 'info';
    const el   = document.getElementById('logEl');
    const line = document.createElement('div');
    line.className = 'log-' + cls;
    const ts = new Date().toTimeString().slice(0, 8);
    line.textContent = '[' + ts + '] ' + text;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
}

function handlePostResult(msg) {
    document.getElementById('btnPush').disabled = !blobsReady;
    if (msg.error) { log('ERROR: ' + msg.error, 'err'); return; }
    if (msg.info)  { log(msg.info, 'info'); return; }
    const cls = (msg.status >= 200 && msg.status < 300) ? 'ok' : 'err';
    log('HTTP ' + msg.status + '  ' + msg.body, cls);
}

function handleStatusResult(msg) {
    if (msg.error) { log('ERROR: ' + msg.error, 'err'); return; }
    const cls = (msg.status >= 200 && msg.status < 300) ? 'ok' : 'warn';
    try {
        const data = JSON.parse(msg.body);
        log('HTTP ' + msg.status, cls);
        if (data.lastSeenAt) {
            const age = Math.round((Date.now() - new Date(data.lastSeenAt)) / 1000);
            log('Last seen: ' + age + 's ago  |  pending: ' + (data.pendingPipelineAt || 'none'), 'ok');
        }
        log(JSON.stringify(data, null, 2).slice(0, 800), 'info');
    } catch {
        log('HTTP ' + msg.status + '  ' + msg.body.slice(0, 600), cls);
    }
}
</script>
</body>
</html>`;
}

module.exports = { registerPipelinePanel };
