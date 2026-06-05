# Test Paths — pds-board-editor

**Last Updated**: 2026-05-28
**System Map Reference**: PATH 1 (board editor → role builder → firmware generation)

React SPA (Vite, single-file output via `vite-plugin-singlefile`) that runs as a VS Code webview panel or standalone in a browser. The output is a board JSON file consumed by `pds-role` as a `--config` argument. No backend — all logic is client-side JavaScript.

---

## Checkpoints

### 1. Project builds without errors
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-board-editor && npm run build 2>&1 && echo "BUILD_OK"
```
**Pass**: `BUILD_OK` printed; `dist/index.html` exists and is a single self-contained HTML file (no external script tags pointing to missing chunks)
**On fail**: Check `vite.config.js` for the `vite-plugin-singlefile` plugin registration; if the plugin is missing, install it via `npm install vite-plugin-singlefile --save-dev`

---

### 2. Reference board JSON files are valid JSON
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-board-editor && node -e "
const fs = require('fs'), path = require('path');
const boards = fs.readdirSync('boards').filter(f => f.endsWith('.json'));
let ok = true;
for (const b of boards) {
  try {
    const json = JSON.parse(fs.readFileSync(path.join('boards', b), 'utf8'));
    // Required fields per actual schema: id, name, pin_capabilities
    if (!json.id || !json.name || !json.pin_capabilities) {
      console.error('FAIL — missing required field in', b, '(got:', Object.keys(json).join(','), ')'); ok = false;
    } else {
      console.log('OK:', b, '— id:', json.id, 'pins:', Object.keys(json.pin_capabilities).length);
    }
  } catch(e) { console.error('FAIL — invalid JSON in', b, ':', e.message); ok = false; }
}
process.exit(ok ? 0 : 1);
"
```
**Pass**: All `.json` files in `boards/` parse cleanly and each has `id`, `name`, and `pin_capabilities`
**On fail**: A board JSON has a syntax error or missing required field

---

### 3. buildBoardJson utility produces required fields
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-board-editor && node -e "
// Inline smoke test of the board JSON builder
const {buildBoardJson} = require('./src/utils/buildBoardJson.js');
const sample = {
  name: 'test-board', hwrev: 'V0.1', cpu: 'esp32c3',
  pins: [{ gpio: 4, function: 'UART_TX', label: 'TX1' }]
};
const result = buildBoardJson(sample);
const required = ['name','hwrev','cpu','pins'];
const missing = required.filter(k => !(k in result));
if (missing.length) { console.error('FAIL — missing fields:', missing); process.exit(1); }
console.log('OK — board JSON has required fields:', required.join(', '));
"
```
**Pass**: `OK — board JSON has required fields: name, hwrev, cpu, pins`
**On fail**: `buildBoardJson.js` is not propagating one of the required fields — check the function's return object construction

---

### 4. Pin matrix — no duplicate GPIO numbers
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-board-editor && node -e "
const fs = require('fs');
const boards = fs.readdirSync('boards').filter(f => f.endsWith('.json'));
let ok = true;
for (const b of boards) {
  const {pins = []} = JSON.parse(fs.readFileSync('boards/' + b, 'utf8'));
  const gpios = pins.map(p => p.gpio);
  const dupes = gpios.filter((g, i) => gpios.indexOf(g) !== i);
  if (dupes.length) { console.error('FAIL —', b, 'has duplicate GPIO numbers:', dupes); ok = false; }
  else console.log('OK:', b, '— no duplicate GPIOs');
}
process.exit(ok ? 0 : 1);
"
```
**Pass**: All reference board files report `OK — no duplicate GPIOs`
**On fail**: A board definition has the same GPIO number on two pins — this will cause `pds-role` to generate conflicting pin assignments in the role `.c` file

---

### 5. Memory map generator runs without throwing
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-board-editor && node -e "
const {generateMemoryMap} = require('./js/memorymap-generator.js');
const testBoard = { name: 'test', hwrev: 'V0.1', cpu: 'esp32c3', pins: [{gpio: 4, function: 'UART_TX', label: 'TX1'}] };
const map = generateMemoryMap(testBoard);
if (!map || typeof map !== 'object') { console.error('FAIL — invalid return'); process.exit(1); }
console.log('OK — memory map generated, keys:', Object.keys(map).join(', '));
"
```
**Pass**: Memory map object returned with at least one key
**On fail**: `memorymap-generator.js` is throwing on the test board — check for required fields it expects beyond `name/hwrev/cpu/pins`

---

### 6. Board JSON save → pds-role dry-run accepts it (PATH 1 integration)
**Type**: manual
**Pass**: 
1. In the board editor (browser or VS Code webview), create a minimal board (name, hwrev, CPU type, 2–3 pins)
2. Export / save the JSON to a file (e.g. `test-export.json`)
3. Run `cd k:\PDS-Master-001\pds-role && python go.py --config test-export.json --dry-run`
4. Command exits 0 with no `KeyError` or validation errors
**On fail**: The exported JSON is missing a field that `pds-role` requires — check `go.py` argument parsing and add the missing field to `buildBoardJson.js`

---

### 7. Pinout SVG output is valid XML
**Type**: manual
**Pass**: In the board editor, after configuring a board, click "Generate Pinout"; the downloaded/previewed SVG opens in a browser without errors and shows labeled pins
**On fail**: `pinSvgGenerator.js` or `js/pinout-svg-generator.js` is producing malformed XML — run the SVG through `xmllint --noout` and fix any tag mismatch

---

### 8. VS Code webview — panel opens and renders
**Type**: manual-hardware
**Pass**: In VS Code, invoke the board editor command (via the PDS extension); a webview panel opens and displays the board editor UI without a blank white screen or console errors in the Developer Tools
**On fail**: `src/vscodeApi.js` `acquireVsCodeApi()` call is failing — check that the webview's `dist/index.html` is being served with `localResourceRoots` set correctly in the extension's `WebviewPanel` creation call
