const vscode = require('vscode');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const { findWorkspaceRoot, scanTargetsFromFs, scanBoardsFromFs,
        scanModulesFromFs, loadPinCaps, listSavedRolesSync } = require('./role-fs');
const { runPythonCommand, saveRoleConfig,
        generateRole, loadSavedRole, listSavedRoles } = require('./role-actions');
const { getRolePanelHtml } = require('./role-webview');

let rolePanel = undefined;

/**
 * Register the Role Editor command.
 * Called from the main extension activate().
 */
function registerRolePanel(context) {
    const cmd = vscode.commands.registerCommand('pds.openRoleEditor', () => {
        const workspaceRoot = findWorkspaceRoot();
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }

        if (rolePanel) {
            rolePanel.reveal(vscode.ViewColumn.One);
            // Refresh saved-roles data in the already-open webview
            const freshRoles = listSavedRolesSync(workspaceRoot);
            rolePanel.webview.postMessage({ command: 'savedRolesRefreshed', roles: freshRoles });
            return;
        }

        rolePanel = vscode.window.createWebviewPanel(
            'pdsRoleEditor',
            'PDS Role Editor',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        loadRoleData(workspaceRoot, rolePanel);

        rolePanel.webview.onDidReceiveMessage(
            async (message) => {
                try {
                    switch (message.command) {
                        case 'scanModules':
                            await runPythonCommand(workspaceRoot, ['--list-modules'], rolePanel, 'modulesLoaded');
                            break;
                        case 'scanBoards':
                            await runPythonCommand(workspaceRoot, ['--list-boards'], rolePanel, 'boardsLoaded');
                            break;
                        case 'saveRole':
                            await saveRoleConfig(workspaceRoot, message.config, rolePanel);
                            break;
                        case 'generateRole':
                            await generateRole(workspaceRoot, message.config, message.dryRun, rolePanel);
                            break;
                        case 'loadRole':
                            await loadSavedRole(workspaceRoot, message.roleId, rolePanel);
                            break;
                        case 'listSavedRoles':
                            await listSavedRoles(workspaceRoot, rolePanel);
                            break;
                        case 'showWarning':
                            vscode.window.showWarningMessage(message.text);
                            break;
                        case 'printPinMap': {
                            // window.print() is blocked in VS Code webviews.
                            // Write a self-contained HTML file to %TEMP% and open it in the
                            // default browser so the user can Ctrl+P from there.
                            const tmpFile = path.join(os.tmpdir(), 'pds-pinmap-' + Date.now() + '.html');
                            fs.writeFileSync(tmpFile, message.html, 'utf8');
                            vscode.env.openExternal(vscode.Uri.file(tmpFile));
                            break;
                        }
                    }
                } catch (err) {
                    vscode.window.showErrorMessage(`PDS Role Editor error: ${err.message || err}`);
                }
            },
            undefined,
            context.subscriptions
        );

        rolePanel.onDidDispose(() => { rolePanel = undefined; }, null, context.subscriptions);
    });

    context.subscriptions.push(cmd);
}

/**
 * Load initial data (targets, boards, modules) and render the webview HTML.
 */
async function loadRoleData(workspaceRoot, panel) {
    const targets    = scanTargetsFromFs(workspaceRoot);
    const boards     = scanBoardsFromFs(workspaceRoot);
    const savedRoles = listSavedRolesSync(workspaceRoot);
    const modules    = scanModulesFromFs(workspaceRoot);
    const pinCaps    = loadPinCaps(workspaceRoot);

    console.log('[PDS RoleEditor] workspaceRoot:', workspaceRoot);
    console.log('[PDS RoleEditor] boards:', JSON.stringify(boards));
    console.log('[PDS RoleEditor] targets:', JSON.stringify(targets.map(t => t.id)));

    // Generate a nonce so we can set a proper Content-Security-Policy
    const nonce = [...Array(32)].map(() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        [Math.floor(Math.random() * 62)]).join('');
    const cspSource = panel.webview.cspSource;

    const html = getRolePanelHtml(targets, boards, savedRoles, modules, pinCaps, nonce, cspSource);
    panel.webview.html = html;
}

module.exports = { registerRolePanel };
