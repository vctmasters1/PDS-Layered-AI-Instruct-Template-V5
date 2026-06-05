const path   = require('path');
const fs     = require('fs');
const vscode = require('vscode');

function findWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return null;
    for (const f of folders) {
        if (fs.existsSync(path.join(f.uri.fsPath, 'PDS-Role'))) {
            return f.uri.fsPath;
        }
    }
    return folders[0]?.uri?.fsPath || null;
}

function scanTargetsFromFs(workspaceRoot) {
    const halDir = path.join(workspaceRoot, 'Device', 'pds', 'pds_hal', 'board');
    const targets = [];
    if (!fs.existsSync(halDir)) return targets;

    const targetDirs = fs.readdirSync(halDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'));

    for (const tDir of targetDirs) {
        const targetPath = path.join(halDir, tDir.name);
        const hwrevs = [];

        const hwrevDirs = fs.readdirSync(targetPath, { withFileTypes: true })
            .filter(d => d.isDirectory() && d.name.startsWith('hwrev_'));

        for (const hDir of hwrevDirs) {
            const hwrevPath = path.join(targetPath, hDir.name);
            const roles = fs.readdirSync(hwrevPath, { withFileTypes: true })
                .filter(d => d.isDirectory() && !d.name.startsWith('.'))
                .map(d => d.name);
            hwrevs.push({ id: hDir.name, roles });
        }

        targets.push({ id: tDir.name, hwrevs });
    }
    return targets;
}

/**
 * Scan commercial board specs from PDS-BoardEditor/boards/ (flat — one JSON per board).
 * Returns: [{ boardId: 'esp32-sm', processor: 'ESP32-C3', boardAlias: 'My Super Mini' }]
 */
function scanBoardsFromFs(workspaceRoot) {
    const boardsDir = path.join(workspaceRoot, 'PDS-BoardEditor', 'boards');
    if (!fs.existsSync(boardsDir)) return [];
    return fs.readdirSync(boardsDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            try {
                const spec = JSON.parse(fs.readFileSync(path.join(boardsDir, f), 'utf8'));
                // Skip old-format boards that lack a boardId field
                if (!spec.boardId) return null;
                return { boardId: spec.boardId, mcuTarget: spec.mcuTarget || '', boardAlias: spec.boardAlias || spec.boardId };
            } catch (_) { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => a.boardId.localeCompare(b.boardId));
}

/**
 * Scan PDS modules from Device/pds/.
 */
function scanModulesFromFs(workspaceRoot) {
    const pdsDir = path.join(workspaceRoot, 'Device', 'pds');
    if (!fs.existsSync(pdsDir)) return [];

    const locked = ['pds_core', 'pds_hal', 'pds_validation'];
    const modules = [];

    const dirs = fs.readdirSync(pdsDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name.startsWith('pds_'));

    for (const d of dirs) {
        const modPath = path.join(pdsDir, d.name);
        const headers = [];

        // Scan include/ for headers
        const includeDir = path.join(modPath, 'include');
        if (fs.existsSync(includeDir)) {
            fs.readdirSync(includeDir).filter(f => f.endsWith('.h')).forEach(h => headers.push(h));
        }
        // For pds_hal, scan abstract/
        const abstractDir = path.join(modPath, 'abstract');
        if (fs.existsSync(abstractDir)) {
            fs.readdirSync(abstractDir).filter(f => f.endsWith('.h')).forEach(h => headers.push(h));
        }

        modules.push({
            name: d.name,
            headers: headers.sort(),
            locked: locked.includes(d.name)
        });
    }
    return modules;
}

/**
 * Board pin capabilities — read from PDS-BoardEditor/boards/{boardId}.json (flat).
 * Keyed by boardId so pinCaps[state.board] works.
 */
function loadPinCaps(workspaceRoot) {
    const boardsDir = path.join(workspaceRoot, 'PDS-BoardEditor', 'boards');
    const result = {};
    if (!fs.existsSync(boardsDir)) return result;

    const RECOGNIZED_CAPS = new Set([
        // Generic caps (legacy boards)
        'GPIO', 'ADC', 'PWM', 'RMT', 'CAN', 'INTERRUPT',
        'SPI', 'I2C', 'UART', 'MOSI', 'MISO', 'SCK', 'SDA', 'SCL',
        // ADC bank caps (split ADC-1 / ADC-2)
        'ADC-1', 'ADC-2',
        // Compound caps (new boards — board-editor compound naming)
        'UART-RX', 'UART-TX',
        'SPI-MISO', 'SPI-MOSI', 'SPI-SCK',
        'I2C-SDA', 'I2C-SCL',
    ]);

    fs.readdirSync(boardsDir)
        .filter(f => f.endsWith('.json'))
        .forEach(f => {
            let spec;
            try { spec = JSON.parse(fs.readFileSync(path.join(boardsDir, f), 'utf8')); }
            catch (e) { return; }

            const boardId = spec.boardId || f.replace('.json', '');
            if (!Array.isArray(spec.pin_capabilities)) return;

            const pins = [];
            for (const p of spec.pin_capabilities) {
                if (!Array.isArray(p.capabilities)) continue;

                const isPower = !p.capabilities.includes('GPIO');

                if (isPower) {
                    // Power/ground pins: visible but uneditable (reserved)
                    pins.push({
                        gpio: 1000 + (parseInt(p.physical_pin, 10) || 0),
                        name: p.name || '',
                        jpin: p.header_id || '',
                        phyPin: parseInt(p.physical_pin, 10) || 0,
                        caps: [],
                        reserved: true,
                        boot: false,
                    });
                    continue;
                }

                // GPIO number: prefer the 'pin' field (actual GPIO number stored by BoardEditor),
                // fall back to var_alias 'gpioN' pattern for legacy boards, then physical_pin.
                let gpioNum;
                if (typeof p.pin === 'number' && p.pin >= 0) {
                    gpioNum = p.pin;
                } else {
                    const vaMatch = typeof p.var_alias === 'string' && p.var_alias.match(/^gpio(\d+)$/i);
                    gpioNum = vaMatch ? parseInt(vaMatch[1], 10) : parseInt(p.physical_pin, 10);
                }
                if (isNaN(gpioNum)) continue;
                pins.push({
                    gpio: gpioNum,
                    name: p.name || '',
                    jpin: p.header_id || '',
                    phyPin: parseInt(p.physical_pin, 10) || 0,
                    caps: p.capabilities.filter(c => RECOGNIZED_CAPS.has(c)),
                    reserved: false,
                    boot: false,
                });
            }
            pins.sort((a, b) => a.gpio - b.gpio);
            result[boardId] = { pins };
        });
    return result;
}

/**
 * Sync version of listing saved roles.
 */
function listSavedRolesSync(workspaceRoot) {
    const savedDir = path.join(workspaceRoot, 'PDS-Role', 'saved_roles');
    if (!fs.existsSync(savedDir)) return [];
    return fs.readdirSync(savedDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(savedDir, f), 'utf-8'));
                const fileName = f.replace('.json', '');
                return { id: data.role_id || fileName, fileName, target: data.target || data.board || '', board: data.board || '', hwrev: data.hwrev || '', display_name: data.display_name || '' };
            } catch (_) {
                const fileName = f.replace('.json', '');
                return { id: fileName, fileName, target: '', board: '', hwrev: '', display_name: '' };
            }
        });
}

/**
 * Run a Python command from PDS-Role/go.py and send result to webview.
 */

module.exports = { findWorkspaceRoot, scanTargetsFromFs, scanBoardsFromFs, scanModulesFromFs, loadPinCaps, listSavedRolesSync };
