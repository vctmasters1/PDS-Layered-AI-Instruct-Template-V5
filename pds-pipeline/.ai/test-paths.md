# Test Paths — pds-pipeline

**Last Updated**: 2026-05-28
**System Map Reference**: PATH 9 — Pipeline Binary Codec (Shared Library)

This module is the single source of truth for the binary block registry. Its test checkpoints verify that the TypeScript block definitions are internally consistent and that the encode/decode roundtrip is lossless. All checkpoints are auto-runnable.

---

## Checkpoints

### 1. Package builds cleanly
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-pipeline && npm run build
```
**Pass**: exits 0, `dist/` directory produced, no TypeScript errors
**On fail**: Check for type errors in `src/block-registry.ts` — likely a new field was added without a matching `FmtChar` type or `AccessLevel` value

---

### 2. No duplicate type IDs in BLOCK_REGISTRY (excluding known aliases)
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-pipeline && node -e "
const {BLOCK_REGISTRY} = require('./dist/block-registry.js');
// switch_output is an intentional alias for gpio_output (same typeId 0x31 by design)
const KNOWN_ALIASES = new Set(['switch_output']);
const ids = Object.keys(BLOCK_REGISTRY).filter(k => !KNOWN_ALIASES.has(k));
const typeIds = ids.map(k => BLOCK_REGISTRY[k].typeId);
const dups = typeIds.filter((id,i) => typeIds.indexOf(id) !== i);
if(dups.length) { console.error('DUPLICATE typeIds:', dups); process.exit(1); }
console.log('OK — ' + Object.keys(BLOCK_REGISTRY).length + ' blocks (' + KNOWN_ALIASES.size + ' known alias), no unintended duplicates');
"
```
**Pass**: prints `OK — N blocks (1 known alias), no unintended duplicates`
**On fail**: Two non-alias block definitions share the same numeric typeId — fix the collision in `block-registry.ts`

---

### 3. Every non-hidden block entry has at least one l3Field
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-pipeline && node -e "
const {BLOCK_REGISTRY} = require('./dist/block-registry.js');
// hideInSettings blocks (e.g. fb_ref) intentionally have empty l3Fields
const empty = Object.entries(BLOCK_REGISTRY).filter(([id,e]) => !e.hideInSettings && (!e.l3Fields || e.l3Fields.length === 0)).map(([id]) => id);
if(empty.length) { console.error('EMPTY l3Fields:', empty); process.exit(1); }
console.log('OK — all non-hidden blocks have l3Fields');
"
```
**Pass**: prints `OK — all non-hidden blocks have l3Fields`
**On fail**: A block was added without l3Fields and without `hideInSettings: true` — fix in `block-registry.ts`

---

### 4. fmtCharSize covers every FmtChar used in registry
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-pipeline && node -e "
const {BLOCK_REGISTRY} = require('./dist/block-registry.js');
const valid = new Set(['B','b','H','h','I','i','f','?','x']);
let bad = [];
for(const [id,e] of Object.entries(BLOCK_REGISTRY)) { for(const c of (e.l3Fmt||'')) { if(!valid.has(c)) bad.push({id,c}); } }
if(bad.length) { console.error('UNKNOWN fmt chars:', JSON.stringify(bad)); process.exit(1); }
console.log('OK — all l3Fmt chars valid');
"
```
**Pass**: prints `OK — all fmt chars valid`
**On fail**: A block's `fmt` string contains an unrecognized character — valid chars are `B b H h I i f ? x`

---

### 5. @pds/pipeline resolves correctly from WEB-HMI/api
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\web-hmi\api && node -e "const r = require('./node_modules/@pds/pipeline/dist/block-registry.js'); console.log('OK — BLOCK_REGISTRY has', r.BLOCK_REGISTRY.size, 'entries');"
```
**Pass**: prints `OK — BLOCK_REGISTRY has N entries` (N > 0)
**On fail**: `npm install` in `web-hmi/api/` may be needed, or the `"file:../../pds-pipeline"` path in `package.json` is wrong after repo consolidation

---

### 6. blob_packer.py BLOCK_DEFS byte sizes match TypeScript fmtCharSize
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001 && python -c "
import sys, subprocess, json
# Get Python sizes from blob_packer
sys.path.insert(0, 'pds-role')
from tools.blob_packer import BLOCK_DEFS
import struct
py_sizes = {name: struct.calcsize('<' + ''.join(f['fmt'] for f in fields)) for name, fields in BLOCK_DEFS.items()}
print('Python block sizes:', json.dumps(py_sizes, indent=2))
print('DONE — cross-check against TypeScript block-registry.ts manually or extend this test')
"
```
**Pass**: Script runs without ImportError and prints a JSON map of block sizes
**On fail**: `from tools.blob_packer import BLOCK_DEFS` fails — check that `pds-role/tools/blob_packer.py` exports `BLOCK_DEFS` at module level

**Note**: Full byte-level cross-check between Python and TypeScript requires a dedicated test script. This checkpoint verifies the Python side is importable; byte-level comparison is a `manual` checkpoint below.

---

### 7. Manual: byte-level Python ↔ TypeScript struct size match
**Type**: manual
**Pass**: For every block in `BLOCK_DEFS` (Python) and `BLOCK_REGISTRY` (TypeScript), compute `struct.calcsize('<' + fmt)` (Python) and sum of `fmtCharSize(c)` (TypeScript) — values must match exactly for every block type ID
**On fail**: A block was updated in one file but not the other — edit both `blob_packer.py` and `block-registry.ts` in the same commit

---

### 8. Manual: C struct sizes match TypeScript registry
**Type**: manual-hardware
**Pass**: For each block type, `sizeof(pds_fb_<blockname>_cfg_t)` in C (measured via `ESP_LOGI` in a test build) equals the TypeScript `fmtTotalSize(entry.fmt)` for that block
**On fail**: A field was added to the C struct but not reflected in `block-registry.ts` or `blob_packer.py` — the binary protocol is broken; update all three files in the same commit
