const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { findWorkspaceRoot, discoverTargets, loadLastSelection, saveLastSelection } = require('./utils');

let deployPanel = undefined;

// ---------------------------------------------------------------------------
// SM-ButtonPusher persistent server process
// ---------------------------------------------------------------------------

let _bpProc = null;       // child_process.ChildProcess
let _bpPort = null;       // port the current server was started for
let _bpReady = false;     // true once "ready" line received
let _bpQueue = [];        // [{resolve}] — one entry per in-flight command
let _bpBuf   = '';        // incomplete stdout line buffer
let _bpStartPromise = null; // pending startBpServer promise (avoid double-start)

/**
 * Start (or reuse) the buttonpusher JSON server for *bpPort*.
 * Resolves when the server prints {"status":"ready"}.
 */
function startBpServer(workspaceRoot, bpPort) {
    if (_bpProc && _bpPort === bpPort && _bpReady) return Promise.resolve();
    if (_bpStartPromise) return _bpStartPromise;

    stopBpServer();

    _bpStartPromise = new Promise((resolve, reject) => {
        const python = path.join(workspaceRoot, '.venv', 'Scripts', 'python.exe');
        const pythonExe = fs.existsSync(python) ? python : 'python';

        const proc = spawn(pythonExe, ['-m', 'buttonpusher.server', '--port', bpPort], {
            cwd: workspaceRoot,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        proc.stdout.on('data', (chunk) => {
            _bpBuf += chunk.toString();
            const lines = _bpBuf.split('\n');
            _bpBuf = lines.pop();
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                let msg;
                try { msg = JSON.parse(trimmed); } catch { continue; }
                if (msg.status === 'ready') {
                    _bpReady = true;
                    _bpStartPromise = null;
                    resolve();
                } else if (msg.status === 'bye') {
                    // server is shutting down — drain queue with error
                    const err = { status: 'error', message: 'BP server shut down' };
                    _bpQueue.splice(0).forEach(cb => cb(err));
                } else {
                    const cb = _bpQueue.shift();
                    if (cb) cb(msg);
                }
            }
        });

        proc.stderr.on('data', d => console.error('[BP]', d.toString().trimEnd()));

        proc.on('exit', (code) => {
            _bpProc = null; _bpPort = null; _bpReady = false; _bpStartPromise = null;
            const err = { status: 'error', message: `BP server exited (code ${code})` };
            _bpQueue.splice(0).forEach(cb => cb(err));
            if (!_bpReady) reject(new Error(`BP server failed to start (exit ${code})`));
        });

        const timer = setTimeout(() => {
            if (!_bpReady) {
                proc.kill();
                _bpStartPromise = null;
                reject(new Error('BP server startup timeout'));
            }
        }, 12000);
        proc.on('exit', () => clearTimeout(timer));

        _bpProc = proc;
        _bpPort = bpPort;
    });

    return _bpStartPromise;
}

/** Send one JSON command to the server and await its JSON response. */
function bpSend(cmd) {
    return new Promise((resolve, reject) => {
        if (!_bpProc || !_bpReady) { reject(new Error('BP server not running')); return; }
        _bpQueue.push(resolve);
        _bpProc.stdin.write(JSON.stringify(cmd) + '\n');
    });
}

/** Stop the server gracefully (send quit, then kill after 500ms). */
function stopBpServer() {
    if (!_bpProc) return;
    try { _bpProc.stdin.write(JSON.stringify({ action: 'quit' }) + '\n'); } catch {}
    const p = _bpProc;
    setTimeout(() => { try { p.kill(); } catch {} }, 500);
    _bpProc = null; _bpPort = null; _bpReady = false; _bpQueue = []; _bpBuf = '';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Register the Deploy command.
 * Called from the main extension activate().
 */
function registerDeployPanel(context) {
    const cmd = vscode.commands.registerCommand('pds.openDeploy', () => {
        if (deployPanel) {
            deployPanel.reveal(vscode.ViewColumn.Two);
            return;
        }

        const workspaceRoot = findWorkspaceRoot();
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }

        deployPanel = vscode.window.createWebviewPanel(
            'pdsDeploy',
            'PDS Deploy',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        const boards = discoverTargets(workspaceRoot);
        const lastSelection = loadLastSelection(workspaceRoot);

        deployPanel.webview.html = getDeployPanelHtml(boards, lastSelection);

        deployPanel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'flash':
                        await runFlash(workspaceRoot, message);
                        break;
                    case 'monitor':
                        await runMonitor(workspaceRoot, message);
                        break;
                    case 'selectionChanged':
                        saveLastSelection(workspaceRoot, message);
                        break;
                    case 'refresh':
                        const refreshed = discoverTargets(workspaceRoot);
                        deployPanel.webview.postMessage({
                            command: 'boardsUpdated',
                            boards: refreshed
                        });
                        break;
                    case 'scanPorts':
                        const ports = await scanSerialPorts();
                        deployPanel.webview.postMessage({ command: 'portsScanned', ports });
                        break;
                    case 'checkDefaults': {
                        const { role } = message;
                        const nvsBin = role
                            ? path.join(workspaceRoot, 'PDS-BuildTools', 'dist', 'defaults', role, 'nvs_defaults.bin')
                            : null;
                        const available = !!(nvsBin && fs.existsSync(nvsBin));
                        const parts = parsePartitionCsv(workspaceRoot);
                        const nvsOffset = parts['nvs'] !== undefined ? `0x${parts['nvs'].toString(16)}` : '0x9000';
                        deployPanel.webview.postMessage({ command: 'defaultsStatus', available, nvsBin, nvsOffset });
                        break;
                    }
                    case 'flashDefaults':
                        await runFlashDefaults(workspaceRoot, message);
                        break;
                    case 'flashPipelineDefaults':
                        await runFlashPipelineDefaults(workspaceRoot, message);
                        break;
                    case 'flashDevCreds':
                        await runFlashDevCreds(workspaceRoot, message);
                        break;
                    case 'bpTest':
                        await runBpTest(workspaceRoot, message);
                        break;
                    case 'bpGetConfig': {
                        const { bpPort } = message;
                        try {
                            await startBpServer(workspaceRoot, bpPort);
                            const cfg = await bpSend({ action: 'get-config' });
                            deployPanel.webview.postMessage({ command: 'bpConfig', servos: cfg.servos });
                        } catch (_) { /* non-critical — hints simply stay blank */ }
                        break;
                    }
                    case 'saveFlashConfig': {
                        // Persists current UI settings to PDS-BuildTools/.flash_config.json
                        // This file is read by pds.flashHeadless / pds.flashDefaultsHeadless
                        const cfgPath = path.join(workspaceRoot, 'PDS-BuildTools', '.flash_config.json');
                        const cfg = {
                            board:        message.board,
                            hwrev:           message.hwrev,
                            role:            message.role,
                            port:            message.port,
                            useButtonPusher: !!message.useButtonPusher,
                            bpPort:          message.bpPort  || 'COM5',
                            chBoot:          message.chBoot  || 4,
                            chEn:            message.chEn    || 3,
                        };
                        try {
                            fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
                            vscode.window.showInformationMessage(
                                `Flash config saved → PDS-BuildTools/.flash_config.json  (pds.flashHeadless is ready)`
                            );
                        } catch (e) {
                            vscode.window.showErrorMessage(`Failed to save flash config: ${e.message}`);
                        }
                        break;
                    }
                }
            },
            undefined,
            context.subscriptions
        );

        deployPanel.onDidDispose(() => {
            deployPanel = undefined;
        }, null, context.subscriptions);
    });

    context.subscriptions.push(cmd);

    // -----------------------------------------------------------------------
    // pds.flashHeadless — CLI-triggerable flash command.
    // Reads PDS-BuildTools/.flash_config.json (written by the Deploy panel UI
    // when the user clicks "Set as default flash config").
    // Invoke from any terminal: code --execute-command pds.flashHeadless
    // -----------------------------------------------------------------------
    const headlessCmd = vscode.commands.registerCommand('pds.flashHeadless', async () => {
        const workspaceRoot = findWorkspaceRoot();
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }

        const cfgPath = path.join(workspaceRoot, 'PDS-BuildTools', '.flash_config.json');
        if (!fs.existsSync(cfgPath)) {
            vscode.window.showErrorMessage(
                'No flash config found. Open the Deploy panel, configure your flash settings, then click "Save as default flash config".'
            );
            return;
        }

        let cfg;
        try {
            cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        } catch (e) {
            vscode.window.showErrorMessage(`Invalid flash config: ${e.message}`);
            return;
        }

        vscode.window.showInformationMessage(
            `[pds.flashHeadless] Flashing ${cfg.board}/${cfg.hwrev}/${cfg.role} → ${cfg.port}${cfg.useButtonPusher ? ` via BP:${cfg.bpPort} ch${cfg.chBoot}/${cfg.chEn}` : ' (auto-reset)'}`
        );

        await runFlash(workspaceRoot, {
            board:        cfg.board,
            hwrev:           cfg.hwrev,
            role:            cfg.role,
            port:            cfg.port,
            autoReset:       !cfg.useButtonPusher,
            useButtonPusher: !!cfg.useButtonPusher,
            bpPort:          cfg.bpPort  || 'COM5',
            chBoot:          cfg.chBoot  || 4,
            chEn:            cfg.chEn    || 3,
        });
    });
    context.subscriptions.push(headlessCmd);

    // pds.flashDefaultsHeadless — same but flashes NVS defaults only
    const headlessDefaultsCmd = vscode.commands.registerCommand('pds.flashDefaultsHeadless', async () => {
        const workspaceRoot = findWorkspaceRoot();
        if (!workspaceRoot) { vscode.window.showErrorMessage('No workspace folder found.'); return; }

        const cfgPath = path.join(workspaceRoot, 'PDS-BuildTools', '.flash_config.json');
        if (!fs.existsSync(cfgPath)) {
            vscode.window.showErrorMessage('No flash config found. See pds.flashHeadless for setup instructions.');
            return;
        }
        let cfg;
        try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); }
        catch (e) { vscode.window.showErrorMessage(`Invalid flash config: ${e.message}`); return; }

        await runFlashDefaults(workspaceRoot, {
            board:        cfg.board,
            hwrev:           cfg.hwrev,
            role:            cfg.role,
            port:            cfg.port,
            autoReset:       !cfg.useButtonPusher,
            useButtonPusher: !!cfg.useButtonPusher,
            bpPort:          cfg.bpPort  || 'COM5',
            chBoot:          cfg.chBoot  || 4,
            chEn:            cfg.chEn    || 3,
        });
    });
    context.subscriptions.push(headlessDefaultsCmd);

    // pds.flashDevCreds — flash nvs_devrig.bin (wifi credentials for dev rig)
    // Invoke: code --execute-command pds.flashDevCreds
    const flashDevCredsCmd = vscode.commands.registerCommand('pds.flashDevCreds', async () => {
        const workspaceRoot = findWorkspaceRoot();
        if (!workspaceRoot) { vscode.window.showErrorMessage('No workspace folder found.'); return; }

        const cfgPath = path.join(workspaceRoot, 'PDS-BuildTools', '.flash_config.json');
        if (!fs.existsSync(cfgPath)) {
            vscode.window.showErrorMessage('No flash config found. See pds.flashHeadless for setup instructions.');
            return;
        }
        let cfg;
        try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); }
        catch (e) { vscode.window.showErrorMessage(`Invalid flash config: ${e.message}`); return; }

        await runFlashDevCreds(workspaceRoot, {
            board:        cfg.board,
            hwrev:           cfg.hwrev,
            role:            cfg.role,
            port:            cfg.port,
            autoReset:       !cfg.useButtonPusher,
            useButtonPusher: !!cfg.useButtonPusher,
            bpPort:          cfg.bpPort  || 'COM5',
            chBoot:          cfg.chBoot  || 4,
            chEn:            cfg.chEn    || 3,
        });
    });
    context.subscriptions.push(flashDevCredsCmd);

    // pds.flashDefaults — flash L1/L2/L3 pipeline partition bins
    // Invoke: code --execute-command pds.flashDefaults
    const flashDefaultsCmd = vscode.commands.registerCommand('pds.flashDefaults', async () => {
        const workspaceRoot = findWorkspaceRoot();
        if (!workspaceRoot) { vscode.window.showErrorMessage('No workspace folder found.'); return; }

        const cfgPath = path.join(workspaceRoot, 'PDS-BuildTools', '.flash_config.json');
        if (!fs.existsSync(cfgPath)) {
            vscode.window.showErrorMessage('No flash config found. See pds.flashHeadless for setup instructions.');
            return;
        }
        let cfg;
        try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); }
        catch (e) { vscode.window.showErrorMessage(`Invalid flash config: ${e.message}`); return; }

        await runFlashPipelineDefaults(workspaceRoot, {
            board:        cfg.board,
            hwrev:           cfg.hwrev,
            role:            cfg.role,
            port:            cfg.port,
            autoReset:       !cfg.useButtonPusher,
            useButtonPusher: !!cfg.useButtonPusher,
            bpPort:          cfg.bpPort  || 'COM5',
            chBoot:          cfg.chBoot  || 4,
            chEn:            cfg.chEn    || 3,
        });
    });
    context.subscriptions.push(flashDefaultsCmd);
}

/**
 * Parse Device/main/partitions.csv and return a map of { partitionName: offsetNumber }.
 * Falls back to an empty object if the file is missing or unparseable.
 */
function parsePartitionCsv(workspaceRoot) {
    const candidates = [
        path.join(workspaceRoot, 'PDS-BuildTools', 'dist', 'partitions.csv'),
        path.join(workspaceRoot, 'Device', 'main', 'partitions.csv'),
    ];
    for (const csvPath of candidates) {
        if (!fs.existsSync(csvPath)) continue;
        const offsets = {};
        try {
            const lines = fs.readFileSync(csvPath, 'utf8').split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const parts = trimmed.split(',').map(p => p.trim());
                if (parts.length >= 4 && parts[3].startsWith('0x')) {
                    offsets[parts[0]] = parseInt(parts[3], 16);
                }
            }
        } catch { /* ignore */ }
        return offsets;
    }
    return {};
}

/**
 * Bootloader is at 0x0 on newer chips (C3, S3, H2, C6); at 0x1000 on esp32/esp32s2.
 */
function getBootloaderOffset(chip) {
    return (chip === 'esp32' || chip === 'esp32s2') ? '0x1000' : '0x0';
}

/**
 * Read chip type from .board_config for the selected board.
 * Returns 'esp32' as a safe fallback.
 */
function getChipForBoard(workspaceRoot, board) {
    try {
        const cfgPath = path.join(
            workspaceRoot, 'Device', 'pds', 'pds_hal', 'board', board, '.board_config'
        );
        if (!fs.existsSync(cfgPath)) return 'esp32';
        const lines = fs.readFileSync(cfgPath, 'utf8').split('\n');
        for (const line of lines) {
            if (line.trim().startsWith('IDF_TARGET=')) {
                return line.trim().split('=')[1].trim() || 'esp32';
            }
        }
    } catch { /* ignore */ }
    return 'esp32';
}

async function runFlash(workspaceRoot, message) {
    const { board, hwrev, role, port } = message;

    if (!board || !hwrev || !role) {
        vscode.window.showWarningMessage('Select a board, hardware revision, and role first.');
        return;
    }

    const actualPort = port || await vscode.window.showInputBox({
        prompt: 'Serial port for flashing',
        value: 'COM3',
        placeHolder: 'COM3 or /dev/ttyUSB0'
    });
    if (!actualPort) return;

    // Flash directly from dist/ using esptool on the host (COM ports not accessible inside Docker on Windows).
    // Uses --before default_reset so the board auto-resets into bootloader via RTS/DTR — no manual button needed.
    const distDir = path.join(workspaceRoot, 'PDS-BuildTools', 'dist');
    const binaries = [
        'bootloader.bin', 'partition-table.bin', 'pds-device.bin', 'ota_data_initial.bin'
    ];
    const missing = binaries.filter(b => !fs.existsSync(path.join(distDir, b)));
    if (missing.length > 0) {
        vscode.window.showErrorMessage(
            `Missing build artifacts in PDS-BuildTools/dist/: ${missing.join(', ')}. Build the firmware first.`
        );
        return;
    }

    const chip = getChipForBoard(workspaceRoot, board);
    const pythonVenv = path.join(workspaceRoot, '.venv', 'Scripts', 'python.exe');
    const pythonExe = fs.existsSync(pythonVenv) ? `"${pythonVenv}"` : (process.board === 'win32' ? 'python' : 'python3');
    const d = distDir;

    // Read partition offsets from CSV instead of hardcoding
    const partitions = parsePartitionCsv(workspaceRoot);
    const addrApp     = partitions['ota_0']   !== undefined ? `0x${partitions['ota_0'].toString(16)}`   : '0x10000';
    const addrOtadata = partitions['otadata'] !== undefined ? `0x${partitions['otadata'].toString(16)}` : '0x2d0000';
    const addrBootloader = getBootloaderOffset(chip);

    // Boards with AUTO_RESET=no (e.g. ESP32-C3 Super Mini) cannot be auto-reset via RTS/DTR.
    // Use --before no_reset so esptool expects the device is already in download mode.
    const autoReset = message.autoReset !== false;
    const useButtonPusher = !autoReset && !!message.useButtonPusher;

    const cmd = [
        '&', pythonExe, '-m', 'esptool',
        '--chip', chip,
        '--port', actualPort,
        '-b', '460800',
        '--before', autoReset ? 'default_reset' : 'no-reset',
        '--after', useButtonPusher ? 'no-reset' : 'hard-reset',
        'write-flash',
        '--flash-mode', 'dio',
        '--flash-size', '4MB',
        '--flash-freq', '40m',
        addrBootloader, `"${path.join(d, 'bootloader.bin')}"`,
        `0x8000`,        `"${path.join(d, 'partition-table.bin')}"`,
        addrApp,         `"${path.join(d, 'pds-device.bin')}"`,
        addrOtadata,     `"${path.join(d, 'ota_data_initial.bin')}"`
    ].join(' ');

    const terminal = vscode.window.createTerminal({
        name: `PDS Flash: ${actualPort}`,
        cwd: workspaceRoot
    });
    terminal.show();

    if (useButtonPusher) {
        const CH_BOOT = message.chBoot || 1;
        const CH_EN   = message.chEn   || 2;
        const BP_PORT = message.bpPort || 'COM5';

        try {
            await startBpServer(workspaceRoot, BP_PORT);
            await bpSend({ action: 'push',    channel: CH_BOOT });
            await sleep(500);
            await bpSend({ action: 'push',    channel: CH_EN   });
            await sleep(500);
            await bpSend({ action: 'release', channel: CH_EN   });
            await sleep(500);
            await bpSend({ action: 'release', channel: CH_BOOT });
            await sleep(2000); // wait for device to enter bootloader mode
            terminal.sendText(cmd);
            // esptool handles reboot via --after no-reset
        } catch (err) {
            // Best-effort release — don't leave servos in pushed position
            try { await bpSend({ action: 'release', channel: CH_BOOT }); } catch {}
            try { await bpSend({ action: 'release', channel: CH_EN   }); } catch {}
            vscode.window.showErrorMessage(`ButtonPusher error: ${err.message}`);
        }
    } else {
        terminal.sendText(cmd);
    }
}

async function runFlashDefaults(workspaceRoot, message) {
    const { role, port, board, autoReset: msgAutoReset, useButtonPusher: msgUseButtonPusher,
            bpPort: msgBpPort, chBoot: msgChBoot, chEn: msgChEn } = message;

    if (!port) {
        vscode.window.showWarningMessage('Select a serial port first.');
        return;
    }

    const nvsBin = path.join(workspaceRoot, 'PDS-BuildTools', 'dist', 'defaults', role, 'nvs_defaults.bin');
    if (!fs.existsSync(nvsBin)) {
        vscode.window.showErrorMessage(`nvs_defaults.bin not found for role ${role}. Run the Role Builder generate step first.`);
        return;
    }

    // Derive NVS partition offset from CSV
    const partitions = parsePartitionCsv(workspaceRoot);
    const nvsOffset = partitions['nvs'] !== undefined ? `0x${partitions['nvs'].toString(16)}` : '0x9000';

    const python = path.join(workspaceRoot, '.venv', 'Scripts', 'python.exe');
    const pythonFallback = process.board === 'win32' ? 'python' : 'python3';
    const pythonExe = fs.existsSync(python) ? `"${python}"` : pythonFallback;

    const chip = getChipForBoard(workspaceRoot, board || 'esp32');
    const autoReset = msgAutoReset !== false;
    const useButtonPusher = !autoReset && !!msgUseButtonPusher;

    const cmd = [
        '&', pythonExe, '-m', 'esptool',
        '--chip', chip,
        '--port', port,
        '-b', '460800',
        '--before', autoReset ? 'default_reset' : 'no-reset',
        '--after', useButtonPusher ? 'no-reset' : 'hard-reset',
        '--no-stub',
        'write-flash',
        '--flash-mode', 'dio',
        '--flash-size', '4MB',
        '--flash-freq', '40m',
        nvsOffset, `"${nvsBin}"`
    ].join(' ');

    const terminal = vscode.window.createTerminal({
        name: `PDS Flash Defaults: ${port}`,
        cwd: workspaceRoot
    });
    terminal.show();

    if (useButtonPusher) {
        const CH_BOOT = msgChBoot || 1;
        const CH_EN   = msgChEn   || 2;
        const BP_PORT = msgBpPort || 'COM5';

        try {
            await startBpServer(workspaceRoot, BP_PORT);
            await bpSend({ action: 'push',    channel: CH_BOOT });
            await sleep(500);
            await bpSend({ action: 'push',    channel: CH_EN   });
            await sleep(500);
            await bpSend({ action: 'release', channel: CH_EN   });
            await sleep(500);
            await bpSend({ action: 'release', channel: CH_BOOT });
            await sleep(2000); // wait for device to enter bootloader mode
            terminal.sendText(cmd);
            // esptool handles reboot via --after no-reset
        } catch (err) {
            // Best-effort release — don't leave servos in pushed position
            try { await bpSend({ action: 'release', channel: CH_BOOT }); } catch {}
            try { await bpSend({ action: 'release', channel: CH_EN   }); } catch {}
            vscode.window.showErrorMessage(`ButtonPusher error: ${err.message}`);
        }
    } else {
        terminal.sendText(cmd);
    }
}

async function runFlashDevCreds(workspaceRoot, message) {
    const { role, port, board, autoReset: msgAutoReset, useButtonPusher: msgUseButtonPusher,
            bpPort: msgBpPort, chBoot: msgChBoot, chEn: msgChEn } = message;

    if (!port) {
        vscode.window.showWarningMessage('Select a serial port first.');
        return;
    }

    const nvsBin = path.join(workspaceRoot, 'PDS-BuildTools', 'dist', 'defaults', role, 'nvs_devrig.bin');
    if (!fs.existsSync(nvsBin)) {
        vscode.window.showErrorMessage(`nvs_devrig.bin not found for role ${role}. Regenerate it from nvs_devrig.csv first.`);
        return;
    }

    const partitions = parsePartitionCsv(workspaceRoot);
    const nvsOffset = partitions['nvs'] !== undefined ? `0x${partitions['nvs'].toString(16)}` : '0x9000';

    const python = path.join(workspaceRoot, '.venv', 'Scripts', 'python.exe');
    const pythonFallback = process.board === 'win32' ? 'python' : 'python3';
    const pythonExe = fs.existsSync(python) ? `"${python}"` : pythonFallback;

    const chip = getChipForBoard(workspaceRoot, board || 'esp32');
    const autoReset = msgAutoReset !== false;
    const useButtonPusher = !autoReset && !!msgUseButtonPusher;

    const cmd = [
        '&', pythonExe, '-m', 'esptool',
        '--chip', chip,
        '--port', port,
        '-b', '460800',
        '--before', autoReset ? 'default_reset' : 'no-reset',
        '--after', 'hard-reset',
        '--no-stub',
        'write-flash',
        '--flash-mode', 'dio',
        '--flash-size', '4MB',
        '--flash-freq', '40m',
        nvsOffset, `"${nvsBin}"`
    ].join(' ');

    const terminal = vscode.window.createTerminal({
        name: `PDS Flash DEV-Creds: ${port}`,
        cwd: workspaceRoot
    });
    terminal.show();

    if (useButtonPusher) {
        const CH_BOOT = msgChBoot || 1;
        const CH_EN   = msgChEn   || 2;
        const BP_PORT = msgBpPort || 'COM5';

        try {
            await startBpServer(workspaceRoot, BP_PORT);
            await bpSend({ action: 'push',    channel: CH_BOOT });
            await sleep(500);
            await bpSend({ action: 'push',    channel: CH_EN   });
            await sleep(500);
            await bpSend({ action: 'release', channel: CH_EN   });
            await sleep(500);
            await bpSend({ action: 'release', channel: CH_BOOT });
            await sleep(2000);
            terminal.sendText(cmd);
        } catch (err) {
            try { await bpSend({ action: 'release', channel: CH_BOOT }); } catch {}
            try { await bpSend({ action: 'release', channel: CH_EN   }); } catch {}
            vscode.window.showErrorMessage(`ButtonPusher error: ${err.message}`);
        }
    } else {
        terminal.sendText(cmd);
    }
}

async function runFlashPipelineDefaults(workspaceRoot, message) {
    const { role, port, board, autoReset: msgAutoReset, useButtonPusher: msgUseButtonPusher,
            bpPort: msgBpPort, chBoot: msgChBoot, chEn: msgChEn } = message;

    if (!port) {
        vscode.window.showWarningMessage('Select a serial port first.');
        return;
    }

    const distDir = path.join(workspaceRoot, 'PDS-BuildTools', 'dist', 'defaults', role);
    const l1Bin = path.join(distDir, `${role}_l1.bin`);
    const l2Bin = path.join(distDir, `${role}_l2.bin`);
    const l3Bin = path.join(distDir, `${role}_l3.bin`);

    for (const [label, bin] of [['L1', l1Bin], ['L2', l2Bin], ['L3', l3Bin]]) {
        if (!fs.existsSync(bin)) {
            vscode.window.showErrorMessage(`${label} binary not found: ${path.basename(bin)}. Run Role Builder → Generate first.`);
            return;
        }
    }

    const partitions = parsePartitionCsv(workspaceRoot);
    const l1Offset = partitions['pds_l1'] !== undefined ? `0x${partitions['pds_l1'].toString(16)}` : '0x2D2000';
    const l2Offset = partitions['pds_l2'] !== undefined ? `0x${partitions['pds_l2'].toString(16)}` : '0x2E2000';
    const l3Offset = partitions['pds_l3'] !== undefined ? `0x${partitions['pds_l3'].toString(16)}` : '0x2F2000';

    const python = path.join(workspaceRoot, '.venv', 'Scripts', 'python.exe');
    const pythonFallback = process.board === 'win32' ? 'python' : 'python3';
    const pythonExe = fs.existsSync(python) ? `"${python}"` : pythonFallback;

    const chip = getChipForBoard(workspaceRoot, board || 'esp32');
    const autoReset = msgAutoReset !== false;
    const useButtonPusher = !autoReset && !!msgUseButtonPusher;

    const cmd = [
        '&', pythonExe, '-m', 'esptool',
        '--chip', chip,
        '--port', port,
        '-b', '460800',
        '--before', autoReset ? 'default_reset' : 'no-reset',
        '--after', useButtonPusher ? 'no-reset' : 'hard-reset',
        '--no-stub',
        'write-flash',
        '--flash-mode', 'dio',
        '--flash-size', '4MB',
        '--flash-freq', '40m',
        l1Offset, `"${l1Bin}"`,
        l2Offset, `"${l2Bin}"`,
        l3Offset, `"${l3Bin}"`
    ].join(' ');

    const terminal = vscode.window.createTerminal({
        name: `PDS Flash L1/L2/L3: ${port}`,
        cwd: workspaceRoot
    });
    terminal.show();

    if (useButtonPusher) {
        const CH_BOOT = msgChBoot || 1;
        const CH_EN   = msgChEn   || 2;
        const BP_PORT = msgBpPort || 'COM5';

        try {
            await startBpServer(workspaceRoot, BP_PORT);
            await bpSend({ action: 'push',    channel: CH_BOOT });
            await sleep(500);
            await bpSend({ action: 'push',    channel: CH_EN   });
            await sleep(500);
            await bpSend({ action: 'release', channel: CH_EN   });
            await sleep(500);
            await bpSend({ action: 'release', channel: CH_BOOT });
            await sleep(2000);
            terminal.sendText(cmd);
        } catch (err) {
            try { await bpSend({ action: 'release', channel: CH_BOOT }); } catch {}
            try { await bpSend({ action: 'release', channel: CH_EN   }); } catch {}
            vscode.window.showErrorMessage(`ButtonPusher error: ${err.message}`);
        }
    } else {
        terminal.sendText(cmd);
    }
}

async function scanSerialPorts() {
    const { execSync } = require('child_process');
    // VID/PID → friendly board name (takes priority over chip name)
    const BOARD_MAP = {
        '10C4:EA60': 'ESP32 DevKit (CP2102)',
        '10C4:EA70': 'ESP32 DevKit (CP2105)',
        '1A86:7523': 'ESP32 DevKit (CH340)',
        '1A86:55D4': 'ESP32 DevKit (CH9102)',
        '1A86:5523': 'ESP32 DevKit (CH341)',
        '0403:6001': 'FTDI FT232RL',
        '0403:6010': 'FTDI FT2232',
        '0403:6015': 'FTDI FT231X',
        '303A:1001': 'ESP32-S2 (native USB)',
        '303A:4001': 'ESP32-S3 DevKitC',
        '303A:0002': 'ESP32 (native USB)',
        '2341:0043': 'Arduino Uno',
        '2341:0001': 'Arduino Uno',
        '2341:0042': 'Arduino Mega',
        '2341:0036': 'Arduino Leonardo',
        '2341:8036': 'Arduino Leonardo',
        '2341:003B': 'Arduino Micro',
        '239A:800B': 'Adafruit Feather',
        '1B4F:9206': 'SparkFun',
        '0483:5740': 'STM32 (USB CDC)',
    };

    try {
        if (process.board === 'win32') {
            const raw = execSync(
                'powershell -Command "Get-PnpDevice -Class Ports -Status OK | ForEach-Object { $hwid = ($_ | Get-PnpDeviceProperty DEVPKEY_Device_HardwareIds -EA SilentlyContinue).Data[0]; [PSCustomObject]@{Name=$_.FriendlyName;HWID=$hwid} } | ConvertTo-Json -Compress"',
                { timeout: 8000 }
            ).toString().trim();
            if (!raw) return [{ port: 'COM3', label: 'COM3' }];
            const items = raw.startsWith('[') ? JSON.parse(raw) : [JSON.parse(raw)];
            const ports = [];
            for (const item of items) {
                const m = (item.Name || '').match(/\((COM\d+)\)/);
                if (!m) continue;
                const port = m[1];
                // Try VID/PID lookup first — gives board-level info
                const vidpid = (item.HWID || '').match(/VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i);
                let label = port;
                if (vidpid) {
                    const key = vidpid[1].toUpperCase() + ':' + vidpid[2].toUpperCase();
                    label = BOARD_MAP[key] || port;
                }
                ports.push({ port, label });
            }
            return ports.length ? ports : [{ port: 'COM3', label: 'COM3' }];
        } else {
            const out = execSync(
                'ls /dev/ttyUSB* /dev/ttyACM* /dev/tty.usbserial* /dev/tty.usbmodem* 2>/dev/null || true',
                { timeout: 5000 }
            ).toString().trim();
            return out
                ? out.split('\n').filter(Boolean).map(p => ({ port: p, label: p }))
                : [{ port: '/dev/ttyUSB0', label: '/dev/ttyUSB0' }];
        }
    } catch {
        const def = process.board === 'win32' ? 'COM3' : '/dev/ttyUSB0';
        return [{ port: def, label: def }];
    }
}

async function runBpTest(workspaceRoot, message) {
    const { bpPort, ch, action, btnId } = message;
    try {
        await startBpServer(workspaceRoot, bpPort);
        await bpSend({ action, channel: ch });
    } catch (err) {
        vscode.window.showErrorMessage(`ButtonPusher error: ${err.message}`);
    } finally {
        deployPanel.webview.postMessage({ command: 'bpTestDone', btnId });
    }
}

async function runMonitor(workspaceRoot, message) {
    const { board, hwrev, role, port } = message;

    const actualPort = port || await vscode.window.showInputBox({
        prompt: 'Serial port to monitor',
        value: 'COM3',
        placeHolder: 'COM3 or /dev/ttyUSB0'
    });

    if (!actualPort) return;

    if (!board || !hwrev || !role) {
        vscode.window.showWarningMessage('Select a board, hardware revision, and role first.');
        return;
    }

    const terminal = vscode.window.createTerminal({
        name: `PDS Monitor: ${actualPort}`,
        cwd: workspaceRoot
    });

    terminal.show();
    const scriptPath = path.join(workspaceRoot, 'PDS-BuildTools', 'scripts', 'build_selector.py');
    const pythonVenv = path.join(workspaceRoot, '.venv', 'Scripts', 'python.exe');
    const pythonExe = fs.existsSync(pythonVenv) ? `"${pythonVenv}"` : (process.board === 'win32' ? 'python' : 'python3');
    terminal.sendText(`${pythonExe} "${scriptPath}" --board ${board} --hwrev ${hwrev} --role ${role} --monitor ${actualPort}`);
}

function getDeployPanelHtml(boards, lastSelection) {
    const boardsJson = JSON.stringify(boards).replace(/<\//g, '<\\/');
    const lastJson = JSON.stringify(lastSelection || {}).replace(/<\//g, '<\\/');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PDS Deploy</title>
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

    .deploy-section {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 16px;
        margin-bottom: 16px;
    }
    .deploy-section h2 {
        font-size: 1.1em;
        margin-bottom: 12px;
        color: var(--accent);
    }

    .port-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 16px;
    }
    .port-row label { color: var(--subtext); font-weight: 600; font-size: 0.85em; }
    .port-input {
        background: var(--surface2);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 8px 12px;
        color: var(--text);
        font-size: 0.95em;
        width: 140px;
        font-family: monospace;
    }

    .button-row {
        display: flex;
        gap: 10px;
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
    .btn-flash { background: var(--accent); color: var(--bg); }
    .btn-monitor { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
    .btn-refresh { background: transparent; color: var(--subtext); border: 1px solid var(--border); padding: 6px 10px; font-size: 0.8em; }
    .btn-scan { background: var(--surface2); color: var(--subtext); border: 1px solid var(--border); padding: 8px 12px; font-size: 0.85em; border-radius: 4px; }
    .btn-scan:hover { color: var(--text); }
    .btn-scan.scanning { opacity: 0.5; cursor: wait; }
    .btn-defaults { background: var(--yellow); color: #1e1e2e; }
    .btn-defaults:disabled { opacity: 0.35; cursor: not-allowed; }
    .btn-pipeline { background: #cba6f7; color: #1e1e2e; }
    .btn-pipeline:disabled { opacity: 0.35; cursor: not-allowed; }
    .btn-devcreds { background: var(--red); color: #1e1e2e; }
    .btn-devcreds:disabled { opacity: 0.35; cursor: not-allowed; }
    .defaults-hint { font-size: 0.8em; color: var(--subtext); margin-top: 8px; font-style: italic; }
    .port-select {
        background: var(--surface2);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 8px 12px;
        color: var(--text);
        font-size: 0.95em;
        min-width: 140px;
        font-family: monospace;
        cursor: pointer;
    }
    .connection-row {
        display: flex;
        gap: 14px;
        margin-bottom: 16px;
        align-items: flex-start;
    }
    .connection-row .deploy-section { margin-bottom: 0; }
    .bp-field {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
    }
    .bp-field > label {
        color: var(--subtext);
        font-size: 0.8em;
        font-weight: 600;
        width: 58px;
        flex-shrink: 0;
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }
    .bp-field .port-select { min-width: 0; flex: 1; }
    .btn-scan-sm {
        background: var(--surface2);
        color: var(--subtext);
        border: 1px solid var(--border);
        padding: 6px 8px;
        font-size: 0.82em;
        border-radius: 4px;
        cursor: pointer;
        flex-shrink: 0;
    }
    .btn-scan-sm:hover { color: var(--text); }
    .btn-scan-sm.scanning { opacity: 0.5; cursor: wait; }
    .btn-bp-test {
        background: var(--surface2);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 0.78em;
        cursor: pointer;
        color: var(--subtext);
        flex-shrink: 0;
    }
    .btn-bp-test:hover { color: var(--text); border-color: var(--accent); }
    .btn-bp-test.pressing { color: var(--yellow); border-color: var(--yellow); }
    .bp-hint { font-size: 10px; color: #888; padding: 1px 0 3px 6px; }
</style>
</head>
<body>
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
        <div>
            <h1>⚡ <span>PDS</span> Deploy</h1>
            <p class="subtitle">Select target → Flash → Monitor</p>
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
            <ul class="option-list" id="hwrevList">
                <li class="empty-msg">← Select a board</li>
            </ul>
        </div>
        <div class="selector-card">
            <label>Device Role</label>
            <ul class="option-list" id="roleList">
                <li class="empty-msg">← Select a hwrev</li>
            </ul>
        </div>
    </div>

    <div class="info-bar" id="infoBar" style="display: none;">
        <span class="label">Target:</span>
        <span class="value" id="targetDisplay">—</span>
    </div>

    <div class="connection-row">
        <div class="deploy-section" style="flex:1;">
            <h2>🎯 Target Connection</h2>
            <div class="port-row">
                <label>Serial Port:</label>
                <select class="port-select" id="portSelect"><option value="COM10">COM10</option></select>
                <button class="btn-scan" id="btnScan" onclick="scanPorts()">🔍 Scan</button>
            </div>
            <div class="button-row">
                <button class="btn-flash" id="btnFlash" disabled onclick="doFlash()">⚡ Flash Firmware</button>
                <button class="btn-defaults" id="btnFlashDefaults" disabled onclick="doFlashDefaults()">🗄️ Flash Defaults</button>
                <button class="btn-pipeline" id="btnFlashPipeline" disabled onclick="doFlashPipelineDefaults()">⚙️ Flash L1/L2/L3</button>
                <button class="btn-monitor" id="btnMonitor" disabled onclick="doMonitor()">📡 Serial Monitor</button>
                <button class="btn-devcreds" id="btnFlashDevCreds" disabled onclick="doFlashDevCreds()" style="margin-left: auto;">🔑 Flash DEV-Creds</button>
            </div>
            <div style="margin-top:10px;">
                <button class="btn-monitor" id="btnSaveCfg" disabled onclick="doSaveFlashConfig()" style="font-size:0.8em; padding:6px 12px; opacity:0.75;">💾 Save as default flash config</button>
            </div>
            <div class="defaults-hint" id="defaultsHint"></div>
        </div>
        <div class="deploy-section" style="flex:0 0 230px;">
            <h2>🤖 SM-ButtonPusher</h2>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
                <input type="checkbox" id="chkButtonPusher" onchange="toggleBpPanel(this.checked)" style="cursor:pointer; accent-color:var(--yellow); width:14px; height:14px;">
                <label for="chkButtonPusher" style="cursor:pointer; font-size:0.9em;">Use Button Pusher</label>
            </div>
            <div id="bpControls" style="opacity:0.35; pointer-events:none; transition:opacity 0.15s;">
                <div class="bp-field">
                    <label>BP Port</label>
                    <select class="port-select" id="bpPortSelect"><option value="COM5">COM5</option></select>
                    <button class="btn-scan-sm" id="btnBpScan" onclick="scanPorts()">🔍</button>
                </div>
                <div class="bp-field">
                    <label>BOOT ch</label>
                    <select class="port-select" id="bpChBoot" onchange="updateBpHints()">
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4" selected>4</option>
                        <option value="5">5</option>
                        <option value="6">6</option>
                    </select>
                    <button class="btn-bp-test" id="btnBootPress" onclick="bpTest('boot','push')">Press</button>
                    <button class="btn-bp-test" id="btnBootRelease" onclick="bpTest('boot','release')">Rel</button>
                </div>
                <div class="bp-hint" id="bpBootHint"></div>
                <div class="bp-field">
                    <label>EN ch</label>
                    <select class="port-select" id="bpChEn" onchange="updateBpHints()">
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3" selected>3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                        <option value="6">6</option>
                    </select>
                    <button class="btn-bp-test" id="btnEnPress" onclick="bpTest('en','push')">Press</button>
                    <button class="btn-bp-test" id="btnEnRelease" onclick="bpTest('en','release')">Rel</button>
                </div>
                <div class="bp-hint" id="bpEnHint"></div>
            </div>
        </div>
    </div>



<script>
const vscodeApi = acquireVsCodeApi();
let boards = ${boardsJson};
let selection = { board: null, hwrev: null, role: null };
let currentBoardData = null;
let defaultsAvailable = false;
let nvsPartOffset = '0x9000';
let _bpServosConfig = {};  // { '1': {push_angle, release_angle}, ... } from calibration file
const last = ${lastJson};

function renderBoards() {
    const list = document.getElementById('boardList');
    if (boards.length === 0) {
        list.innerHTML = '<li class="empty-msg">No boards discovered</li>';
        return;
    }
    list.innerHTML = boards.map(p =>
        '<li data-id="' + p.id + '" onclick="selectBoard(this)">'
        + p.id
        + '<span class="badge">' + p.buildSystem + '</span>'
        + '</li>'
    ).join('');
}

function selectBoard(el) {
    document.querySelectorAll('#boardList li').forEach(li => li.classList.remove('selected'));
    el.classList.add('selected');
    selection.board = el.dataset.id;
    selection.hwrev = null;
    selection.role = null;
    currentBoardData = boards.find(p => p.id === selection.board);
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
    list.innerHTML = currentBoardData.hwrevs.map(h =>
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
    defaultsAvailable = false;
    updateUI();
    // Ask extension if nvs_defaults.bin exists for this role
    vscodeApi.postMessage({ command: 'checkDefaults', role: selection.role });
}

function updateUI() {
    const ready = selection.board && selection.hwrev && selection.role;
    document.getElementById('btnFlash').disabled = !ready;
    document.getElementById('btnMonitor').disabled = !ready;
    document.getElementById('btnSaveCfg').disabled = !ready;
    document.getElementById('btnFlashPipeline').disabled = !ready;
    document.getElementById('btnFlashDevCreds').disabled = !ready;

    const infoBar = document.getElementById('infoBar');
    if (ready) {
        infoBar.style.display = 'flex';
        document.getElementById('targetDisplay').textContent =
            selection.board + ' / ' + selection.hwrev + ' / ' + selection.role;
        vscodeApi.postMessage({ command: 'selectionChanged', ...selection });
    } else {
        infoBar.style.display = 'none';
    }

    const btnDefaults = document.getElementById('btnFlashDefaults');
    const hint = document.getElementById('defaultsHint');
    if (defaultsAvailable) {
        btnDefaults.disabled = false;
        hint.textContent = 'nvs_defaults.bin found — ready to flash to ' + nvsPartOffset + '.';
    } else {
        btnDefaults.disabled = true;
        hint.textContent = ready
            ? 'nvs_defaults.bin not found. Run Role Builder → Generate to create it.'
            : '';
    }
}

function doFlash() {
    const port = document.getElementById('portSelect').value || 'COM10';
    const useButtonPusher = document.getElementById('chkButtonPusher').checked;
    const autoReset = !useButtonPusher;
    const bpPort = document.getElementById('bpPortSelect').value || 'COM5';
    const chBoot = parseInt(document.getElementById('bpChBoot').value, 10) || 1;
    const chEn   = parseInt(document.getElementById('bpChEn').value, 10) || 2;
    vscodeApi.postMessage({ command: 'flash', ...selection, port, autoReset, useButtonPusher, bpPort, chBoot, chEn });
}
function doMonitor() {
    const port = document.getElementById('portSelect').value || 'COM10';
    vscodeApi.postMessage({ command: 'monitor', ...selection, port });
}
function doFlashDefaults() {
    const port = document.getElementById('portSelect').value || 'COM10';
    const useButtonPusher = document.getElementById('chkButtonPusher').checked;
    const autoReset = !useButtonPusher;
    const bpPort = document.getElementById('bpPortSelect').value || 'COM5';
    const chBoot = parseInt(document.getElementById('bpChBoot').value, 10) || 1;
    const chEn   = parseInt(document.getElementById('bpChEn').value, 10) || 2;
    vscodeApi.postMessage({ command: 'flashDefaults', ...selection, port, autoReset, useButtonPusher, bpPort, chBoot, chEn });
}
function doFlashPipelineDefaults() {
    const port = document.getElementById('portSelect').value || 'COM10';
    const useButtonPusher = document.getElementById('chkButtonPusher').checked;
    const autoReset = !useButtonPusher;
    const bpPort = document.getElementById('bpPortSelect').value || 'COM5';
    const chBoot = parseInt(document.getElementById('bpChBoot').value, 10) || 1;
    const chEn   = parseInt(document.getElementById('bpChEn').value, 10) || 2;
    vscodeApi.postMessage({ command: 'flashPipelineDefaults', ...selection, port, autoReset, useButtonPusher, bpPort, chBoot, chEn });
}
function doFlashDevCreds() {
    const port = document.getElementById('portSelect').value || 'COM10';
    const useButtonPusher = document.getElementById('chkButtonPusher').checked;
    const autoReset = !useButtonPusher;
    const bpPort = document.getElementById('bpPortSelect').value || 'COM5';
    const chBoot = parseInt(document.getElementById('bpChBoot').value, 10) || 1;
    const chEn   = parseInt(document.getElementById('bpChEn').value, 10) || 2;
    vscodeApi.postMessage({ command: 'flashDevCreds', ...selection, port, autoReset, useButtonPusher, bpPort, chBoot, chEn });
}
function doSaveFlashConfig() {
    const port = document.getElementById('portSelect').value || 'COM10';
    const useButtonPusher = document.getElementById('chkButtonPusher').checked;
    const bpPort = document.getElementById('bpPortSelect').value || 'COM5';
    const chBoot = parseInt(document.getElementById('bpChBoot').value, 10) || 4;
    const chEn   = parseInt(document.getElementById('bpChEn').value, 10) || 3;
    vscodeApi.postMessage({ command: 'saveFlashConfig', ...selection, port, useButtonPusher, bpPort, chBoot, chEn });
}
function refresh() {
    vscodeApi.postMessage({ command: 'refresh' });
}
function scanPorts() {
    ['btnScan', 'btnBpScan'].forEach(id => {
        const b = document.getElementById(id);
        if (b) { b.classList.add('scanning'); b.disabled = true; b.textContent = '⏳'; }
    });
    vscodeApi.postMessage({ command: 'scanPorts' });
}
function toggleBpPanel(enabled) {
    const controls = document.getElementById('bpControls');
    controls.style.opacity = enabled ? '1' : '0.35';
    controls.style.pointerEvents = enabled ? 'auto' : 'none';
    if (enabled) {
        const bpPort = document.getElementById('bpPortSelect').value || 'COM5';
        vscodeApi.postMessage({ command: 'bpGetConfig', bpPort });
    }
}
function updateBpHints() {
    const chBoot = document.getElementById('bpChBoot').value;
    const chEn   = document.getElementById('bpChEn').value;
    const bCfg   = _bpServosConfig[chBoot];
    const eCfg   = _bpServosConfig[chEn];
    const bHint  = document.getElementById('bpBootHint');
    const eHint  = document.getElementById('bpEnHint');
    if (bHint) bHint.textContent = bCfg ? '\u25b8 push: ' + bCfg.push_angle + '\xb0  rel: ' + bCfg.release_angle + '\xb0' : '';
    if (eHint) eHint.textContent = eCfg ? '\u25b8 push: ' + eCfg.push_angle + '\xb0  rel: ' + eCfg.release_angle + '\xb0' : '';
}
function bpTest(which, action) {
    const bpPort = document.getElementById('bpPortSelect').value || 'COM5';
    const ch = parseInt(document.getElementById(which === 'boot' ? 'bpChBoot' : 'bpChEn').value, 10);
    const btnId = which === 'boot'
        ? (action === 'push' ? 'btnBootPress' : 'btnBootRelease')
        : (action === 'push' ? 'btnEnPress'  : 'btnEnRelease');
    const btn = document.getElementById(btnId);
    btn.classList.add('pressing');
    btn.disabled = true;
    vscodeApi.postMessage({ command: 'bpTest', bpPort, ch, action, btnId });
}

window.addEventListener('message', function(event) {
    const msg = event.data;
    if (msg.command === 'portsScanned') {
        const optHtml = msg.ports.map(p => {
            const text = p.label !== p.port ? p.port + '  \u2014  ' + p.label : p.port;
            return '<option value="' + p.port + '">' + text + '</option>';
        }).join('');
        ['portSelect', 'bpPortSelect'].forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const prev = sel.value;
            sel.innerHTML = optHtml;
            if (msg.ports.some(p => p.port === prev)) sel.value = prev;
        });
        const btn = document.getElementById('btnScan');
        btn.classList.remove('scanning'); btn.disabled = false; btn.textContent = '🔍 Scan';
        const btnBp = document.getElementById('btnBpScan');
        if (btnBp) { btnBp.classList.remove('scanning'); btnBp.disabled = false; btnBp.textContent = '🔍'; }
    } else if (msg.command === 'boardsUpdated') {
        boards = msg.boards;
        selection = { board: null, hwrev: null, role: null };
        currentBoardData = null;
        defaultsAvailable = false;
        renderBoards();
        renderHwrevs();
        renderRoles();
        updateUI();
    } else if (msg.command === 'defaultsStatus') {
        defaultsAvailable = msg.available;
        if (msg.nvsOffset) nvsPartOffset = msg.nvsOffset;
        updateUI();
    } else if (msg.command === 'bpTestDone') {
        const btn = document.getElementById(msg.btnId);
        if (btn) { btn.classList.remove('pressing'); btn.disabled = false; }
    } else if (msg.command === 'bpConfig') {
        _bpServosConfig = msg.servos || {};
        updateBpHints();
    }
});

renderBoards();

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

module.exports = { registerDeployPanel, stopBpServer };
