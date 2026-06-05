const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { registerBuildPanel }    = require('./build-panel');
const { registerDeployPanel, stopBpServer } = require('./deploy-panel');
const { registerPipelinePanel } = require('./pipeline-panel');
const { registerRolePanel } = require('./role-panel');
const { registerPublishCommand } = require('./publish-panel');
const { registerSidebar } = require('./sidebar-provider');

let currentPanel = undefined;

function activate(context) {
    const cmd = vscode.commands.registerCommand('pds.openPinleafForge', () => {
        // If panel already exists, reveal it
        if (currentPanel) {
            currentPanel.reveal(vscode.ViewColumn.One);
            return;
        }

        // Locate PDS-BoardEditor directory
        const boardEditorDir = findBoardEditorDir();
        if (!boardEditorDir) {
            vscode.window.showErrorMessage(
                'Cannot find PDS-BoardEditor directory in the workspace.'
            );
            return;
        }

        // Prefer the built React version (dist/index.html); fall back to vanilla board-editor.html
        const distHtmlPath   = path.join(boardEditorDir, 'dist', 'index.html');
        const legacyHtmlPath = path.join(boardEditorDir, 'board-editor.html');
        const htmlPath = fs.existsSync(distHtmlPath) ? distHtmlPath : legacyHtmlPath;
        if (!fs.existsSync(htmlPath)) {
            vscode.window.showErrorMessage(
                'board-editor.html (or dist/index.html) not found in PDS-BoardEditor/'
            );
            return;
        }

        // Create webview panel
        currentPanel = vscode.window.createWebviewPanel(
            'pinleafForge',
            'Pinleaf Forge',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(boardEditorDir)]
            }
        );

        currentPanel.iconPath = vscode.Uri.file(
            path.join(context.extensionPath, 'icon.png')
        );

        // Load content
        currentPanel.webview.html = getWebviewContent(
            currentPanel.webview,
            boardEditorDir,
            htmlPath
        );

        // Handle messages from the webview
        currentPanel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'saveBoard':
                        await saveBoardFile(boardEditorDir, message);
                        break;
                    case 'saveMemoryMap':
                        await saveMemoryMapFile(boardEditorDir, message);
                        break;
                    case 'loadBoard':
                        await loadBoardFile(boardEditorDir, message, currentPanel);
                        break;
                    case 'loadBoardByName':
                        await loadBoardByName(boardEditorDir, message.boardId, currentPanel);
                        break;
                    case 'listBoards':
                        await listBoards(boardEditorDir, currentPanel);
                        break;
                    case 'showInfo':
                        vscode.window.showInformationMessage(message.text);
                        break;
                    case 'showError':
                        vscode.window.showErrorMessage(message.text);
                        break;
                    case 'askCopilot':
                        askCopilotForBoard(message.prompt, currentPanel);
                        break;
                    case 'sanityCheck':
                        askCopilotForSanityCheck(message.prompt, currentPanel);
                        break;
                }
            },
            undefined,
            context.subscriptions
        );

        currentPanel.onDidDispose(() => {
            currentPanel = undefined;
        }, null, context.subscriptions);
    });

    context.subscriptions.push(cmd);

    // Register Build panel
    registerBuildPanel(context);

    // Register Deploy panel
    registerDeployPanel(context);

    // Register Role Editor panel
    registerRolePanel(context);

    // Register Pipeline Push panel
    registerPipelinePanel(context);

    // Register Publish command
    registerPublishCommand(context);

    // Register sidebar
    registerSidebar(context);
}

/**
 * Find the PDS-BoardEditor directory in the workspace.
 */
function findBoardEditorDir() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return null;

    for (const folder of workspaceFolders) {
        // Directory was renamed from PDS-BoardEditor → pds-board-editor during mono-repo consolidation
        const candidate = path.join(folder.uri.fsPath, 'pds-board-editor');
        if (fs.existsSync(candidate)) return candidate;
    }

    return null;
}

/**
 * Read the HTML file and rewrite resource paths to webview URIs.
 */
function getWebviewContent(webview, boardEditorDir, htmlPath) {
    let html = fs.readFileSync(htmlPath, 'utf8');

    const baseUri = webview.asWebviewUri(vscode.Uri.file(boardEditorDir));

    // Generate a nonce for CSP
    const nonce = getNonce();

    // Inject Content Security Policy
    // NOTE: Do NOT use nonce in script-src — it causes 'unsafe-inline' to be ignored,
    // which breaks all onclick="..." handlers in the HTML.
    // worker-src is required for VS Code's internal webview service worker.
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; connect-src ${webview.cspSource}; worker-src ${webview.cspSource};">`;
    html = html.replace('<head>', `<head>\n    ${csp}`);

    // Rewrite CSS href paths
    html = html.replace(
        /href="(css\/[^"]+)"/g,
        (_, relPath) => `href="${webview.asWebviewUri(vscode.Uri.file(path.join(boardEditorDir, relPath)))}"`
    );

    // Rewrite JS src paths and add nonce for CSP
    html = html.replace(
        /<script\s+src="(js\/[^"]+)"/g,
        (_, relPath) => `<script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.file(path.join(boardEditorDir, relPath)))}"`
    );

    // Inject the VS Code API bridge before closing </body>
    const bridge = getBridgeScript(nonce);
    html = html.replace('</body>', `${bridge}\n</body>`);

    return html;
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Inject a script that gives the webview access to VS Code messaging.
 * This overrides the browser download behavior with workspace file saves.
 */
function getBridgeScript(nonce) {
    return `
<script nonce="${nonce}">
(function() {
    const vscodeApi = acquireVsCodeApi();

    // Expose to the existing JS modules
    window.__vscodeApi = vscodeApi;
    window.__isVSCodeWebview = true;

    // Override downloadJSON to save to workspace instead of browser download
    const _origDownloadJSON = window.downloadJSON;
    window.downloadJSON = function() {
        // Refresh preview first (same as original)
        if (typeof updatePreview === 'function') updatePreview();

        // Grab the JSON from the preview textarea
        const previewEl = document.getElementById('preview');
        if (!previewEl || !previewEl.textContent.trim()) {
            alert('No JSON data to save. Fill out the form first.');
            return;
        }

        let data;
        try {
            data = JSON.parse(previewEl.textContent);
        } catch(e) {
            // Fall back to collecting form data the same way the original does
            if (typeof _origDownloadJSON === 'function') {
                _origDownloadJSON();
                return;
            }
            alert('Could not parse JSON preview');
            return;
        }

        const boardId = data.boardId || data.id || 'board';
        const filename = boardId + '.json';

        vscodeApi.postMessage({
            command: 'saveBoard',
            data: data,
            filename: boardId + '.json'
        });
    };

    // Override downloadHeaderSVG for pinout SVG saves
    const _origDownloadHeaderSVG = window.downloadHeaderSVG;
    window.downloadHeaderSVG = function(headerId) {
        // In webview, SVG blob downloads don't work — use original with fallback
        if (typeof _origDownloadHeaderSVG === 'function') {
            try { _origDownloadHeaderSVG(headerId); } catch(e) {
                vscodeApi.postMessage({
                    command: 'showError',
                    text: 'SVG download not supported in webview. Use the browser version for SVG exports.'
                });
            }
        }
    };

    // Listen for responses from the extension
    window.addEventListener('message', function(event) {
        const msg = event.data;
        if (msg.command === 'boardLoaded') {
            // If parseAndFillForm exists, use it with pasted JSON
            const pasteInput = document.getElementById('pasteJsonInput');
            if (pasteInput && typeof parseAndFillForm === 'function') {
                pasteInput.value = JSON.stringify(msg.data, null, 2);
                parseAndFillForm();
            }
        } else if (msg.command === 'boardList') {
            window.dispatchEvent(new CustomEvent('pds-board-list', {
                detail: msg.boards
            }));
        } else if (msg.command === 'copilotResult') {
            // Auto-fill the form with Copilot's JSON response
            const pasteInput = document.getElementById('pasteJsonInput');
            if (pasteInput && typeof parseAndFillForm === 'function') {
                pasteInput.value = JSON.stringify(msg.data, null, 2);
                parseAndFillForm();
            }
            // Update the Ask Copilot feedback area
            window.dispatchEvent(new CustomEvent('copilot-done', { detail: { success: true } }));
        } else if (msg.command === 'copilotError') {
            window.dispatchEvent(new CustomEvent('copilot-done', { detail: { success: false, error: msg.error } }));
        }
    });

    // Expose askCopilot for the prompt-generator.js to call
    window.askCopilot = function(prompt) {
        vscodeApi.postMessage({ command: 'askCopilot', prompt: prompt });
    };

    // ── Auto-save: wrap updatePreview to trigger a debounced file save ──
    // We wait for DOMContentLoaded so updatePreview is guaranteed to exist.
    window.addEventListener('DOMContentLoaded', function() {
        // Inject a small auto-save status badge into the page
        const badge = document.createElement('div');
        badge.id = 'autosave-badge';
        badge.style.cssText = [
            'position:fixed', 'bottom:12px', 'right:16px', 'z-index:9999',
            'font-size:11px', 'padding:3px 10px', 'border-radius:12px',
            'background:rgba(0,0,0,0.55)', 'color:#ccc',
            'pointer-events:none', 'opacity:0',
            'transition:opacity 0.3s ease'
        ].join(';');
        document.body.appendChild(badge);

        function showBadge(text, color) {
            badge.textContent = text;
            badge.style.color = color || '#ccc';
            badge.style.opacity = '1';
        }
        function hideBadge() { badge.style.opacity = '0'; }

        let _autoSaveTimer = null;

        function triggerAutoSave() {
            const previewEl = document.getElementById('preview');
            if (!previewEl) return;
            const text = previewEl.textContent.trim();
            if (!text) return;

            let data;
            try { data = JSON.parse(text); } catch(_) { return; }

            // Only auto-save if the board has an ID
            if (!data.id) return;

            showBadge('saving…');
            vscodeApi.postMessage({
                command: 'saveBoard',
                data: data,
                filename: data.id + '.json',
                silent: true
            });
        }

        // Wrap updatePreview — called on every form input/change
        const _origUpdatePreview = window.updatePreview;
        window.updatePreview = function() {
            if (typeof _origUpdatePreview === 'function') _origUpdatePreview();
            clearTimeout(_autoSaveTimer);
            _autoSaveTimer = setTimeout(triggerAutoSave, 1200);
        };

        // Acknowledge saved confirmation from extension
        window.addEventListener('message', function(event) {
            if (event.data && event.data.command === 'boardSaved') {
                showBadge('✓ saved', '#6ee06e');
                setTimeout(hideBadge, 2000);
            }
        });
    });

    console.log('[Pinleaf Forge] Running inside VS Code webview');
})();
</script>`;
}

/**
 * Save a board JSON file directly to boards/[id]/[id].json.
 */
async function saveBoardFile(boardEditorDir, message) {
    const { data, filename, silent } = message;

    let parsed;
    try {
        parsed = typeof data === 'string' ? JSON.parse(data) : data;
    } catch {
        vscode.window.showErrorMessage('Invalid JSON data');
        return;
    }

    const boardId = parsed?.boardId || parsed?.id || filename?.replace('.json', '') || 'board';
    const boardsDir = path.join(boardEditorDir, 'boards');

    // Create boards/ directory if it doesn't exist
    if (!fs.existsSync(boardsDir)) {
        fs.mkdirSync(boardsDir, { recursive: true });
    }

    const savePath = path.join(boardsDir, boardId + '.json');
    const jsonStr = JSON.stringify(parsed, null, 2) + '\n';
    await vscode.workspace.fs.writeFile(
        vscode.Uri.file(savePath),
        Buffer.from(jsonStr, 'utf8')
    );

    if (!silent) {
        vscode.window.showInformationMessage(
            `Board saved: ${vscode.workspace.asRelativePath(savePath)}`
        );
    }

    // Always notify the webview so the auto-save badge can update
    if (currentPanel) {
        currentPanel.webview.postMessage({ command: 'boardSaved', id: boardId });
    }
}

/**
 * Save a memorymap.csv file to the workspace.
 */
async function saveMemoryMapFile(boardEditorDir, message) {
    const { data, filename } = message;
    const boardsDir = path.join(boardEditorDir, 'boards');
    const suggestedDir = fs.existsSync(boardsDir) ? boardsDir : boardEditorDir;
    const defaultUri = vscode.Uri.file(path.join(suggestedDir, filename || 'memorymap.csv'));

    const saveUri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { 'CSV Files': ['csv'] },
        title: 'Save Memory Map (Partition Table)'
    });

    if (!saveUri) return;

    await vscode.workspace.fs.writeFile(saveUri, Buffer.from(data, 'utf8'));

    vscode.window.showInformationMessage(
        `Memory map saved: ${vscode.workspace.asRelativePath(saveUri)}`
    );
}

/**
 * Load a board JSON file from the workspace.
 */
async function loadBoardFile(boardEditorDir, message, panel) {
    const boardsDir = path.join(boardEditorDir, 'boards');
    const defaultUri = fs.existsSync(boardsDir)
        ? vscode.Uri.file(boardsDir)
        : vscode.Uri.file(hwBoardDir);

    const uris = await vscode.window.showOpenDialog({
        defaultUri,
        canSelectMany: false,
        filters: { 'JSON Files': ['json'] },
        title: 'Load board Specification'
    });

    if (!uris || uris.length === 0) return;

    const content = await vscode.workspace.fs.readFile(uris[0]);
    const jsonStr = Buffer.from(content).toString('utf8');

    try {
        const data = JSON.parse(jsonStr);
        panel.webview.postMessage({ command: 'boardLoaded', data });
    } catch {
        vscode.window.showErrorMessage('Failed to parse JSON file');
    }
}

/**
 * Load a board JSON file by board ID (from boards/{id}/{id}.json).
 */
async function loadBoardByName(boardEditorDir, boardId, panel) {
    if (!boardId) return;
    const filePath = path.join(boardEditorDir, 'boards', boardId + '.json');
    if (!fs.existsSync(filePath)) {
        vscode.window.showErrorMessage(`Board file not found: ${filePath}`);
        return;
    }
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        panel.webview.postMessage({ command: 'boardLoaded', data });
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to load board "${boardId}": ${err.message}`);
    }
}

/**
 * List available boards in PDS-BoardEditor/boards/ (flat — one JSON per board).
 */
async function listBoards(boardEditorDir, panel) {
    const boardsDir = path.join(boardEditorDir, 'boards');
    if (!fs.existsSync(boardsDir)) {
        panel.webview.postMessage({ command: 'boardList', boards: [] });
        return;
    }

    const boards = [];
    try {
        const files = fs.readdirSync(boardsDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(boardsDir, file), 'utf8');
                const parsed = JSON.parse(raw);
                const boardId = parsed.boardId || file.replace('.json', '');
                boards.push({
                    id: boardId,
                    mcuTarget: parsed.mcuTarget || '',
                    name: parsed.boardAlias || boardId
                });
            } catch {
                boards.push({ id: file.replace('.json', ''), name: file.replace('.json', '') });
            }
        }
        boards.sort((a, b) => a.id.localeCompare(b.id));
    } catch (err) {
        console.error('Error listing boards:', err);
    }

    panel.webview.postMessage({ command: 'boardList', boards });
}

/**
 * Use VS Code Language Model API (Copilot) to research a board.
 * Sends the prompt, extracts JSON from the response, and posts it back to the webview.
 */
async function askCopilotForBoard(prompt, panel) {
    try {
        // Select a chat model (Copilot) — vendor:'copilot' is required in VS Code 1.94+
        let models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
        if (!models || models.length === 0) {
            // Fallback: any Copilot model
            models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            if (!models || models.length === 0) {
                panel.webview.postMessage({
                    command: 'copilotError',
                    error: 'No Copilot language model available. Make sure GitHub Copilot is installed and signed in.'
                });
                return;
            }
        }

        const model = models[0];

        // Build chat messages
        const messages = [
            vscode.LanguageModelChatMessage.User(prompt)
        ];

        // CancellationToken is required in VS Code 1.94+
        const cts = new vscode.CancellationTokenSource();

        // Send request and accumulate streamed response
        const response = await model.sendRequest(messages, {}, cts.token);
        let fullText = '';
        try {
            for await (const chunk of response.text) {
                fullText += chunk;
            }
        } finally {
            cts.dispose();
        }

        // Extract JSON from response (may be wrapped in ```json ... ``` or plain text)
        let jsonStr = fullText.trim();

        // Try fenced code block first (greedy — take the largest block)
        const fenceMatch = fullText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (fenceMatch) {
            jsonStr = fenceMatch[1].trim();
        } else {
            // Fallback: find the outermost { ... } in the response
            const firstBrace = fullText.indexOf('{');
            const lastBrace = fullText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                jsonStr = fullText.substring(firstBrace, lastBrace + 1);
            }
        }

        // Validate it's parseable JSON
        let data;
        try {
            data = JSON.parse(jsonStr);
        } catch {
            panel.webview.postMessage({
                command: 'copilotError',
                error: 'Copilot returned a response but it was not valid JSON. Try again.'
            });
            return;
        }

        // Send back to webview for auto-fill
        panel.webview.postMessage({
            command: 'copilotResult',
            data: data
        });

        vscode.window.showInformationMessage('Copilot research complete — form auto-filled.');
    } catch (err) {
        let errMsg;
        if (err instanceof vscode.LanguageModelError) {
            // Distinguish consent, quota, and other LM-specific errors
            if (err.code === vscode.LanguageModelError.Blocked?.name) {
                errMsg = 'Copilot access was blocked. Check your Copilot subscription or consent settings.';
            } else if (err.code === vscode.LanguageModelError.NotFound?.name) {
                errMsg = 'Requested Copilot model was not found. Try again.';
            } else if (err.code === vscode.LanguageModelError.NoPermissions?.name) {
                errMsg = 'Permission denied. Make sure GitHub Copilot is signed in and has access.';
            } else {
                errMsg = `Copilot error (${err.code}): ${err.message}`;
            }
        } else {
            errMsg = 'Copilot request failed: ' + (err?.message || String(err));
        }
        console.error('[PDS] askCopilotForBoard error:', err);
        panel.webview.postMessage({
            command: 'copilotError',
            error: errMsg
        });
    }
}

/**
 * Use VS Code Language Model API (Copilot) to sanity-check a board spec.
 * Uses whatever model the user currently has active (no family preference).
 * Returns plain text — not JSON.
 */
async function askCopilotForSanityCheck(prompt, panel) {
    try {
        // No family preference — use whichever Copilot model the user has active
        const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        if (!models || models.length === 0) {
            panel.webview.postMessage({
                command: 'sanityCheckError',
                error: 'No Copilot language model available. Make sure GitHub Copilot is installed and signed in.'
            });
            return;
        }

        const model = models[0];
        const cts = new vscode.CancellationTokenSource();

        const response = await model.sendRequest(
            [vscode.LanguageModelChatMessage.User(prompt)],
            {},
            cts.token
        );

        let fullText = '';
        try {
            for await (const chunk of response.text) {
                fullText += chunk;
            }
        } finally {
            cts.dispose();
        }

        panel.webview.postMessage({
            command: 'sanityCheckResult',
            text: fullText.trim()
        });
    } catch (err) {
        let errMsg;
        if (err instanceof vscode.LanguageModelError) {
            if (err.code === vscode.LanguageModelError.Blocked?.name) {
                errMsg = 'Copilot access was blocked. Check your Copilot subscription or consent settings.';
            } else if (err.code === vscode.LanguageModelError.NotFound?.name) {
                errMsg = 'Requested Copilot model was not found. Try again.';
            } else if (err.code === vscode.LanguageModelError.NoPermissions?.name) {
                errMsg = 'Permission denied. Make sure GitHub Copilot is signed in and has access.';
            } else {
                errMsg = `Copilot error (${err.code}): ${err.message}`;
            }
        } else {
            errMsg = 'Sanity check failed: ' + (err?.message || String(err));
        }
        console.error('[PDS] askCopilotForSanityCheck error:', err);
        panel.webview.postMessage({
            command: 'sanityCheckError',
            error: errMsg
        });
    }
}

function deactivate() { stopBpServer(); }

module.exports = { activate, deactivate };
