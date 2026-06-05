// Pinleaf Forge - Edit Existing Board Loader

(function () {
    /**
     * Request the list of saved platforms from the VS Code extension.
     * Falls back gracefully when running in a plain browser.
     */
    function refreshBoardList() {
        const select = document.getElementById('existingBoardSelect');
        if (!select) return;

        if (window.__vscodeApi) {
            // VS Code webview path
            select.innerHTML = '<option value="">Loading…</option>';
            window.__vscodeApi.postMessage({ command: 'listBoards' });
        } else {
            // Browser / standalone path — no filesystem access
            select.innerHTML = '<option value="">(Only available inside VS Code)</option>';
        }
    }

    /**
     * Load the currently selected platform into the form.
     */
    function loadSelectedBoard() {
        const select = document.getElementById('existingBoardSelect');
        if (!select || !select.value) {
            alert('Select a board first.');
            return;
        }

        if (window.__vscodeApi) {
            window.__vscodeApi.postMessage({
                command: 'loadBoardByName',
                boardId: select.value
            });
        }
    }

    /**
     * Populate the dropdown when the extension responds with the platform list.
     */
    function onBoardList(platforms) {
        const select = document.getElementById('existingBoardSelect');
        if (!select) return;

        if (!platforms || platforms.length === 0) {
            select.innerHTML = '<option value="">(No saved boards found)</option>';
            return;
        }

        select.innerHTML = '<option value="">-- Select a board --</option>';
        platforms.forEach(function (p) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name ? `${p.name} (${p.mcuTarget || p.id})` : p.id;
            select.appendChild(opt);
        });
    }

    // Listen for the platform list response from the extension bridge
    window.addEventListener('pds-board-list', function (e) {
        onBoardList(e.detail);
    });

    // Expose to global scope for onclick handlers
    window.refreshBoardList = refreshBoardList;
    window.loadSelectedBoard = loadSelectedBoard;

    // Auto-refresh list on load when inside VS Code
    document.addEventListener('DOMContentLoaded', function () {
        if (window.__isVSCodeWebview) {
            refreshPlatformList();
        }
    });
})();
