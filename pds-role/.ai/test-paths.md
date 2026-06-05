# Test Paths — pds-role

**Last Updated**: 2026-05-28
**System Map Reference**: PATH 1 — Board Definition → Role Generation → Firmware Source Files

Verifies the role builder CLI: module/board discovery, pin assignment, blob packing, and Jinja2 template rendering. All checkpoints run on the dev machine (no hardware required).

---

## Checkpoints

### 1. CLI help exits cleanly
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-role && python go.py --help
```
**Pass**: exits 0, usage text printed, no ImportError
**On fail**: Missing Python dependency — run `pip install jinja2` or check `requirements.txt`

---

### 2. --list-modules discovers device/pds/ components
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-role && python go.py --list-modules
```
**Pass**: exits 0, output lists at least `pds_pipeline`, `pds_network`, `pds_storage`, `pds_hal`
**On fail**: `module_scanner.py::find_workspace_root()` is not resolving to the repo root — check that `device/pds/` is present relative to the workspace root

---

### 3. --list-boards discovers hardware targets
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-role && python go.py --list-boards
```
**Pass**: exits 0, output includes at least one board with at least one hwrev and role entry
**On fail**: `device/pds/pds_hal/platform/` directory is missing or has no `hwrev_*/` subdirectories — verify the device tree is present

---

### 4. --dry-run with saved role exits 0 and writes no files
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-role && $env:PYTHONIOENCODING='utf-8'; python go.py --config saved_roles/AERO-005.json --dry-run 2>&1 | Select-Object -Last 3
```
**Pass**: Last line is `[DRY RUN] No files written.`; exit 0
**On fail**: Config file not found (check `saved_roles/` directory with `--list-boards`), or a Jinja2 template error in the traceback

> **Note**: Arg is a path to a JSON file in `saved_roles/` — not a bare role name. Use `--list-boards` to confirm available configs.

---

### 5. Full generation produces expected blob output files
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-role && $env:PYTHONIOENCODING='utf-8'; python go.py --config saved_roles/AERO-005.json 2>&1 | Select-Object -Last 3
```
**Pass**: Output ends with `Done. AERO-005 blobs written to ...PDS-BuildTools/dist/defaults/AERO-005`; exit 0
**On fail**: Inspect traceback. Common causes: missing board JSON, Jinja2 template variable missing, blob_packer BLOCK_DEFS mismatch

---

### 6. Generated blob files are non-empty
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-role && node -e "
const fs = require('fs');
const outDir = 'k:/PDS-Master-001/PDS-BuildTools/dist/defaults/AERO-005';
const bins = fs.readdirSync(outDir).filter(f => f.endsWith('.bin'));
if(bins.length === 0) { console.error('FAIL — no .bin files in output dir'); process.exit(1); }
const empty = bins.filter(f => fs.statSync(outDir+'/'+f).size === 0);
if(empty.length) { console.error('FAIL — empty blobs:', empty); process.exit(1); }
console.log('OK —', bins.length, '.bin blobs, all non-empty:', bins.join(', '));
"
```
**Pass**: Prints `OK — N .bin blobs, all non-empty` (N ≥ 3: l1, l2, l3)
**On fail**: Role builder completed but blob_packer wrote empty data — check `blob_packer.py::pack_l3()` for the failing role's block types

---

### 7. blob_packer produces importable BLOCK_DEFS
**Type**: auto
**Command**:
```shell
cd k:\PDS-Master-001\pds-role && python -c "from tools.blob_packer import BLOCK_DEFS; print('OK —', len(BLOCK_DEFS), 'block types defined')"
```
**Pass**: prints `OK — N block types defined` (N > 0)
**On fail**: Syntax error or import failure in `blob_packer.py`

---

### 8. Manual: pin assignment produces no conflicts
**Type**: manual
**Pass**: For a role with multiple modules enabled, every pin in `pds_process_action.c` appears exactly once across all `PDS_PIN_FUNC_*` assignments — no GPIO number used twice
**On fail**: `pin_assigner.PinAssigner` has a conflict detection bug — run with `--dry-run` and inspect the pin map output

---

### 9. Manual: generated files compile inside dev container
**Type**: manual-hardware
**Pass**: After running full generation, `pds-build-tools/scripts/build_selector.py` completes a containerized `idf.py build` for the target board/hwrev/role without compiler errors
**On fail**: A generated file references an undefined symbol — check that all `#ifdef PDS_PERIPH_HAS_*` guards in the template match the module capabilities declared in the board JSON
