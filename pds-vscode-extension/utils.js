const path = require('path');
const fs = require('fs');
const vscode = require('vscode');

/**
 * Find the workspace root that contains PDS-BuildTools/.
 */
function findWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return null;
    for (const f of folders) {
        if (fs.existsSync(path.join(f.uri.fsPath, 'PDS-BuildTools'))) {
            return f.uri.fsPath;
        }
    }
    return folders[0]?.uri.fsPath || null;
}

/**
 * Auto-discover targets from PDS-Role/saved_roles/.
 * Groups saved roles by target → hwrev → role_id.
 */
function discoverTargets(workspaceRoot) {
    const savedDir = path.join(workspaceRoot, 'PDS-Role', 'saved_roles');
    const targetMap = {};

    if (!fs.existsSync(savedDir)) return [];

    const roleFiles = fs.readdirSync(savedDir).filter(f => f.endsWith('.json'));

    for (const f of roleFiles) {
        let data;
        try { data = JSON.parse(fs.readFileSync(path.join(savedDir, f), 'utf-8')); }
        catch (_) { continue; }

        const target = data.target || 'unknown';
        const hwrev  = data.hwrev  || 'unknown';
        const roleId = data.role_id || f.replace('.json', '');

        if (!targetMap[target]) {
            let buildSystem = 'unknown';
            if (target.toLowerCase().includes('esp32')) buildSystem = 'esp-idf';
            else if (target.toLowerCase().includes('efr32') || target.toLowerCase().includes('silabs')) buildSystem = 'silabs';

            // Read AUTO_RESET from .board_config if it exists
            let autoReset = true;
            const cfgPath = path.join(workspaceRoot, 'Device', 'pds', 'pds_hal', 'board', target, '.board_config');
            if (fs.existsSync(cfgPath)) {
                for (const line of fs.readFileSync(cfgPath, 'utf8').split('\n')) {
                    if (line.trim().startsWith('AUTO_RESET=')) {
                        autoReset = line.trim().split('=')[1].trim().toLowerCase() !== 'no';
                        break;
                    }
                }
            }

            targetMap[target] = { id: target, buildSystem, autoReset, hwrevs: {} };
        }

        if (!targetMap[target].hwrevs[hwrev]) {
            targetMap[target].hwrevs[hwrev] = { id: hwrev, roles: [] };
        }

        if (!targetMap[target].hwrevs[hwrev].roles.includes(roleId)) {
            targetMap[target].hwrevs[hwrev].roles.push(roleId);
        }
    }

    return Object.values(targetMap).map(t => ({
        ...t,
        hwrevs: Object.values(t.hwrevs),
    }));
}

/**
 * Load last selection from cache.
 */
function loadLastSelection(workspaceRoot) {
    const cachePath = path.join(workspaceRoot, 'PDS-BuildTools', '.last_selection.json');
    try {
        if (fs.existsSync(cachePath)) {
            return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        }
    } catch { /* ignore */ }
    return null;
}

/**
 * Save selection to cache.
 */
function saveLastSelection(workspaceRoot, sel) {
    const cacheDir = path.join(workspaceRoot, 'PDS-BuildTools');
    const cachePath = path.join(cacheDir, '.last_selection.json');
    try {
        fs.writeFileSync(cachePath, JSON.stringify({
            board: sel.board,
            hwrev: sel.hwrev,
            role: sel.role
        }, null, 2));
    } catch { /* ignore */ }
}

module.exports = {
    findWorkspaceRoot,
    discoverTargets,
    discoverBoards: discoverTargets, // legacy alias
    loadLastSelection,
    saveLastSelection
};
