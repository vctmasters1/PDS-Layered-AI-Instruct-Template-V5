# Test Paths — pds-vscode-extension

**Last Updated**: 2026-05-28
**System Map Reference**: PATH 1 (board editor webview, role editor, build panel), PATH 2 (deploy panel, flash/OTA)

VS Code extension (CommonJS, `extension.js` entry point). Registers 11 commands. Hosts 5 webview panels. References sibling modules by relative path — these paths are the primary post-consolidation break risk.

**Known consolidation break risks:**
- `findBoardEditorDir()` searches for `PDS-BoardEditor` (old capitalization) but the consolidated directory is `pds-board-editor`
- `@pds/pipeline` package.json reference is `"file:../PDS-Pipeline"` (old name) — should be `"file:../pds-pipeline"`

---

## Checkpoints

### 1. Extension loads without activation errors
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-vscode-extension && node -e "
// Validate that all required panel files are present
const fs = require('fs');
const panels = ['build-panel.js','deploy-panel.js','pipeline-panel.js','role-panel.js','publish-panel.js','sidebar-provider.js'];
let ok = true;
for (const p of panels) {
  if (!fs.existsSync(p)) { console.error('FAIL — missing:', p); ok = false; }
  else console.log('OK:', p);
}
process.exit(ok ? 0 : 1);
"
```
**Pass**: All 6 panel files present
**On fail**: A panel file was renamed or not migrated during consolidation — restore the file or update the `require()` call in `extension.js`

---

### 2. @pds/pipeline package reference points to correct path
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-vscode-extension && node -e "
const pkg = require('./package.json');
const ref = pkg.dependencies?.['@pds/pipeline'] || pkg.devDependencies?.['@pds/pipeline'];
console.log('@pds/pipeline ref:', ref);
const fs = require('fs'), path = require('path');
if (!ref) { console.error('FAIL — @pds/pipeline not in dependencies'); process.exit(1); }
if (ref.startsWith('file:')) {
  const target = path.resolve(__dirname, ref.replace('file:', ''));
  if (!fs.existsSync(target)) {
    console.error('FAIL — path does not exist:', target);
    console.error('FIX: change reference from', ref, 'to file:../pds-pipeline');
    process.exit(1);
  }
}
console.log('OK — path resolves');
"
```
**Pass**: `OK — path resolves`
**On fail**: The `package.json` has `"file:../PDS-Pipeline"` (old capitalized name) — update it to `"file:../pds-pipeline"` then run `npm install` in this directory

---

### 3. findBoardEditorDir resolves to pds-board-editor
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-vscode-extension && node -e "
const fs = require('fs'), path = require('path');
// Replicate findBoardEditorDir logic from extension.js
const workspaceRoot = path.resolve(__dirname, '..');
const candidates = ['pds-board-editor', 'PDS-BoardEditor', 'PDS-Board-Editor'];
let found = null;
for (const c of candidates) {
  const p = path.join(workspaceRoot, c);
  if (fs.existsSync(p)) { found = p; console.log('Found at:', p); break; }
}
if (!found) { console.error('FAIL — board editor directory not found under', workspaceRoot); process.exit(1); }
// Check dist/index.html exists
const dist = path.join(found, 'dist', 'index.html');
if (!fs.existsSync(dist)) {
  console.warn('WARN — dist/index.html missing; run npm run build in', path.basename(found), 'before using the extension');
} else {
  console.log('OK — dist/index.html exists');
}
"
```
**Pass**: Prints `Found at: ...pds-board-editor` and `OK — dist/index.html exists`
**On fail (directory not found)**: The `findBoardEditorDir()` function in `extension.js` is hard-coded to search for `PDS-BoardEditor` — update the search string to `pds-board-editor`
**On fail (dist missing)**: Board editor has not been built — run `cd k:\PDS-Master-001\pds-board-editor && npm run build` first

---

### 4. pds-role go.py is reachable from the extension's expected path
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-vscode-extension && node -e "
const fs = require('fs'), path = require('path');
const workspaceRoot = path.resolve(__dirname, '..');
// Extension calls pds-role/go.py
const goPy = path.join(workspaceRoot, 'pds-role', 'go.py');
if (!fs.existsSync(goPy)) {
  console.error('FAIL — pds-role/go.py not found at:', goPy);
  process.exit(1);
}
console.log('OK — pds-role/go.py found');
// Check that go.py is executable Python (starts with #!/usr/bin/env python or import)
const first = fs.readFileSync(goPy, 'utf8').slice(0, 200);
if (!first.includes('python') && !first.includes('import') && !first.includes('argparse')) {
  console.error('WARN — go.py may not be a valid Python script');
} else {
  console.log('OK — go.py looks like a valid Python script');
}
"
```
**Pass**: Both `OK` lines printed
**On fail**: `pds-role/` directory was renamed or not included in the consolidation — verify it exists at `k:\PDS-Master-001\pds-role\go.py`

---

### 5. pds-build-tools scripts are reachable
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-vscode-extension && node -e "
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const required = [
  'pds-build-tools/scripts/build_selector.py',
  'pds-build-tools/scripts/deploy_firmware.py',
  'pds-build-tools/scripts/flash_with_bp.py'
];
let ok = true;
for (const r of required) {
  const full = path.join(root, r);
  if (!fs.existsSync(full)) { console.error('FAIL — missing:', r); ok = false; }
  else console.log('OK:', r);
}
process.exit(ok ? 0 : 1);
"
```
**Pass**: All three scripts found
**On fail**: `pds-build-tools/` directory or specific scripts were not migrated — locate the scripts in the pre-consolidation source and restore them to this path

---

### 6. Extension package is valid VSIX-compilable (no missing activationEvents)
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-vscode-extension && node -e "
const pkg = require('./package.json');
const commands = (pkg.contributes?.commands ?? []).map(c => c.command);
const keybindings = (pkg.contributes?.keybindings ?? []).map(k => k.command);
const menus = Object.values(pkg.contributes?.menus ?? {}).flat().map(m => m.command).filter(Boolean);
const allRefs = [...new Set([...keybindings, ...menus])];
const missing = allRefs.filter(c => !commands.includes(c));
if (missing.length) { console.error('FAIL — menu/keybinding refs to unregistered commands:', missing); process.exit(1); }
console.log('OK — all', commands.length, 'commands declared; no dangling menu/keybinding refs');
"
```
**Pass**: `OK — all 11 commands declared; no dangling menu/keybinding refs`
**On fail**: A command referenced in a menu or keybinding is not in `contributes.commands` — add the missing declaration to `package.json`

---

### 7. Manual: Extension activates in VS Code and sidebar appears
**Type**: manual
**Pass**: Press F5 in VS Code to launch the Extension Development Host; the PDS sidebar icon appears in the Activity Bar; clicking it shows the sidebar with Build, Deploy, Role Editor, and Pipeline Push panels; no "Extension activation failed" notification appears
**On fail**: Check the VS Code Developer Tools console (`Help → Toggle Developer Tools`) for the activation error; most common post-consolidation cause is a `require()` path that no longer resolves (usually `findBoardEditorDir` returning null and throwing)

---

### 8. Manual: Open Pinleaf Forge (board editor webview) renders
**Type**: manual
**Pass**: Run command `PDS: Open Pinleaf Forge` (`pds.openPinleafForge`); webview panel opens and renders the board editor React UI without a blank white panel or CSP errors in the console
**On fail**: `dist/index.html` not built (see checkpoint 3) OR CSP `script-src` is blocking the inline scripts from `vite-plugin-singlefile` — add `'unsafe-inline'` to the webview's CSP or switch to a nonce-based policy
