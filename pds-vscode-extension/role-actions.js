const vscode = require('vscode');
const path   = require('path');
const fs     = require('fs');
const { execFile } = require('child_process');
const { listSavedRolesSync } = require('./role-fs');

function runPythonCommand(workspaceRoot, args, panel, responseCommand) {
    return new Promise((resolve) => {
        const goScript = path.join(workspaceRoot, 'PDS-Role', 'go.py');
        execFile('python', [goScript, ...args], { cwd: workspaceRoot }, (error, stdout, stderr) => {
            if (error) {
                vscode.window.showErrorMessage(`Role tool error: ${stderr || error.message}`);
                resolve();
                return;
            }
            panel.webview.postMessage({ command: responseCommand, data: stdout });
            resolve();
        });
    });
}

/**
 * Save a role configuration JSON.
 */
async function saveRoleConfig(workspaceRoot, config, panel, skipConfirm) {
    const savedDir = path.join(workspaceRoot, 'PDS-Role', 'saved_roles');
    if (!fs.existsSync(savedDir)) {
        fs.mkdirSync(savedDir, { recursive: true });
    }
    const filePath = path.join(savedDir, `${config.role_id}.json`);
    if (!skipConfirm && fs.existsSync(filePath)) {
        const choice = await vscode.window.showWarningMessage(
            `Role "${config.role_id}" already exists. Overwrite?`,
            { modal: true },
            'Overwrite'
        );
        if (choice !== 'Overwrite') return;
    }
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
    vscode.window.showInformationMessage(`Role saved: ${config.role_id}`);
    // Notify webview so it can refresh the saved roles dropdown
    if (panel) {
        const fresh = listSavedRolesSync(workspaceRoot);
        panel.webview.postMessage({ command: 'savedRolesRefreshed', roles: fresh });
    }
}

/**
 * Resolve the venv python executable inside the workspace.
 * Falls back to 'python' if the venv doesn't exist.
 */
function resolveVenvPython(workspaceRoot) {
    const candidates = [
        path.join(workspaceRoot, '.venv', 'Scripts', 'python.exe'), // Windows
        path.join(workspaceRoot, '.venv', 'bin', 'python'),         // Linux/macOS
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return `"${p}"`;
    }
    return 'python';
}

/**
 * Generate role files (calls Python backend).
 *  dryRun=true  → validate + preview output, no files written
 *  dryRun=false → validate + write pds_pins.c / pds_process_action.c / usrset_defaults.h to Device HAL
 */
async function generateRole(workspaceRoot, config, dryRun, panel) {
    // Save config first so go.py can read it by role_id (skip overwrite confirm on generate)
    await saveRoleConfig(workspaceRoot, config, panel, true);

    const python   = resolveVenvPython(workspaceRoot);
    const goScript = path.join(workspaceRoot, 'PDS-Role', 'go.py');
    const args     = ['--config', config.role_id];
    if (dryRun) args.push('--dry-run');

    vscode.window.showInformationMessage(
        dryRun
            ? `PDS Role: dry-run for "${config.role_id}" — check the terminal for output.`
            : `PDS Role: generating "${config.role_id}" → Device/pds/pds_hal/board/${config.target}/${config.hwrev}/${config.role_id}/`
    );

    const terminal = vscode.window.createTerminal({
        name: dryRun ? 'PDS Role — Dry Run' : 'PDS Role — Generate',
        cwd: workspaceRoot,
    });
    terminal.show();
    terminal.sendText(`& ${python} "${goScript}" ${args.join(' ')}`);
}

/**
 * Load a previously saved role.
 */
async function loadSavedRole(workspaceRoot, roleId, panel) {
    const filePath = path.join(workspaceRoot, 'PDS-Role', 'saved_roles', `${roleId}.json`);
    if (!fs.existsSync(filePath)) {
        vscode.window.showErrorMessage(`Saved role not found: ${roleId}`);
        return;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    panel.webview.postMessage({ command: 'roleLoaded', config: data });
}

/**
 * List all saved role configs.
 */
async function listSavedRoles(workspaceRoot, panel) {
    const savedDir = path.join(workspaceRoot, 'PDS-Role', 'saved_roles');
    if (!fs.existsSync(savedDir)) {
        panel.webview.postMessage({ command: 'savedRolesListed', roles: [] });
        return;
    }
    const files = fs.readdirSync(savedDir).filter(f => f.endsWith('.json'));
    const roles = files.map(f => {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(savedDir, f), 'utf-8'));
            return { id: data.role_id || f.replace('.json', ''), target: data.target || data.board || '', board: data.board || '', hwrev: data.hwrev || '' };
        } catch (_) {
            return { id: f.replace('.json', ''), target: '', board: '', hwrev: '' };
        }
    });
    panel.webview.postMessage({ command: 'savedRolesListed', roles });
}

/**
 * Generate the Role Editor webview HTML.
 */

module.exports = { runPythonCommand, saveRoleConfig, generateRole, loadSavedRole, listSavedRoles };
