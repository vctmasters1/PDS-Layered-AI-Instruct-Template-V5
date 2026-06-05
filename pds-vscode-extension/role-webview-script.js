// Webview-side JavaScript for the PDS Role Editor.
// Runs inside the VS Code webview iframe — no Node.js APIs available here.
//
// !! CRITICAL — DO NOT add module.exports = `...` wrapper to this file !!
//
// This file is loaded by role-webview.js using fs.readFileSync() as raw text.
// If you wrap this in a template literal (module.exports = `...`), Node.js will
// evaluate \n escape sequences as real newlines at require() time, breaking every
// single-quoted string that contains \n (e.g. confirm dialog messages). The entire
// <script> block will fail with a silent SyntaxError — the UI renders but nothing
// works. FIX HISTORY: This caused two separate multi-hour debugging sessions.
//
// Data constants (targets, boards, pinCaps, etc.) are injected by role-webview.js BEFORE this block.

    // ── State ──
    let state = {
        target: '',
        board:  '',
        hwrev: '',
        roleId: '',
        displayName: '',
        modules: {},
        components: {},
        pinAssignments: {},
        variables: {},
        pipelines: [],     // ordered array of { id, name, kind, enabled, collapsed, blocks[] }
        peripherals: [],   // array of { id, type, alias, config:{}, pins:{}, mutex_group: null }
        mutex_groups: [],   // user-defined mutex groups: [{ id, name }]
        userPrefabs: [],    // user-saved prefabs: { id, label, description, blocks[] }
        output_groups: [],  // array of { id, name, peripheral_id, pins[] } — each pin: { id, type, gpio, label, frequency, func_min, func_max, count_rate_at_full, type_locked }
        timer_defs: [],     // derived at build time: scan of all timer-category blocks across pipelines/routines
        flash_size_kb: 4096,
        app_size_kb: 1408,
        system_prefs: {
            tz_offset_min: 0,   // UTC offset in integer minutes (e.g. -300 = UTC-5)
        },
    };

    let pipelineSeq = 0;
    let selectedPipelineIdx = -1;
    let activePipelineTab = 'pipeline'; // 'pipeline' | 'routine' | 'input' | 'output' | 'timer'

    function escapeHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── PPM ↔ EC (µS/cm) conversion — 500 scale (1 mS/cm = 500 PPM) ──
    // UI always works in PPM; firmware/config always stores EC µS/cm.
    function ppmToEc(ppm) { return (parseFloat(ppm) || 0) * 2; }
    function ecToPpm(ec)  { return (parseFloat(ec)  || 0) / 2; }
    // Fields on sensor_ec component that are concentration values (stored as EC in config)
    var EC_COMPONENT_CONC_FIELDS = ['scale_min', 'scale_max', 'alarm_low', 'alarm_high', 'n_deadband', 'p_deadband', 'k_deadband', 'water_deadband'];
    function sensorEcSettingsToBinary(s) {
        var out = Object.assign({}, s);
        EC_COMPONENT_CONC_FIELDS.forEach(function(f) { if (out[f] !== undefined) out[f] = ppmToEc(out[f]); });
        if (out.ppm_setpoint !== undefined) { out.ec_setpoint = ppmToEc(out.ppm_setpoint); delete out.ppm_setpoint; }
        return out;
    }
    function sensorEcSettingsFromBinary(s) {
        var out = Object.assign({}, s);
        EC_COMPONENT_CONC_FIELDS.forEach(function(f) { if (out[f] !== undefined) out[f] = ecToPpm(out[f]); });
        // Accept ec_setpoint from old saved configs and present as ppm_setpoint
        if (out.ec_setpoint !== undefined) { out.ppm_setpoint = ecToPpm(out.ec_setpoint); delete out.ec_setpoint; }
        return out;
    }

    // ── Init ──
    (function init() {
        // Populate board dropdown
        const selB = document.getElementById('sel-board');
        boards.forEach(b => {
            const o = document.createElement('option');
            o.value = b.boardId; o.textContent = (b.boardAlias || b.boardId);
            selB.appendChild(o);
        });

        // Wire cascade event listeners
        selB.addEventListener('change', onBoardChange);
        document.getElementById('sel-hwrev').addEventListener('change', onHwrevChange);
        document.getElementById('inp-new-hwrev').addEventListener('input', onNewHwrevInput);
        document.getElementById('sel-role').addEventListener('change', onRoleChange);
        document.getElementById('sel-display-name').addEventListener('change', onNameChange);

        // Wire top-bar buttons
        document.getElementById('btn-save').addEventListener('click', onSave);
        document.getElementById('btn-generate').addEventListener('click', () => onGenerate(false));
        document.getElementById('btn-dryrun').addEventListener('click', () => onGenerate(true));
        document.getElementById('btn-add-pipeline').addEventListener('click', addPipeline);

        // Wire right-sidebar section toggles
        document.getElementById('right-sidebar').querySelectorAll('.section-header[data-toggle]').forEach(h => {
            h.addEventListener('click', function() {
                toggleSection(this, this.dataset.toggle);
            });
        });

        // Render initial partition layout
        renderPartitionLayout();

        // Render peripherals (shows empty state placeholder initially)
        renderPeripherals();

        // Wire pin map drag-and-drop via persistent event delegation
        initPinDragDrop();
        initSignalDragDrop();
    })();

    // ── Board → HwRev → Role Cascading ──
    // Board is the single cascade driver. MCU target is derived from board JSON (readonly label).
    function onBoardChange() {
        state.board = document.getElementById('sel-board').value;
        const bData = boards.find(b => b.boardId === state.board);
        state.target = bData ? (bData.mcuTarget || '') : '';

        const lbl = document.getElementById('lbl-target');
        if (lbl) lbl.textContent = state.target || '';

        const selH = document.getElementById('sel-hwrev');
        const selR = document.getElementById('sel-role');
        selH.innerHTML = '<option value="">—</option>';
        selR.innerHTML = '<option value="">—</option>';
        selR.disabled = true;
        document.getElementById('inp-new-hwrev').style.display = 'none';
        document.getElementById('inp-new-hwrev').value = '';
        document.getElementById('div-role-id').style.display = 'none';
        document.getElementById('inp-role-id').value = '';
        resetNameDropdown();
        state.hwrev = '';

        if (!state.board) {
            selH.disabled = true;
            renderPinMap(); renderModuleCards(); renderPipelineCards();
            return;
        }

        // Collect hwrevs from saved roles for this board
        const hwrevSet = new Set();
        savedRoles.filter(sr => sr.board === state.board && sr.hwrev).forEach(sr => hwrevSet.add(sr.hwrev));
        const hwrevs = [...hwrevSet].sort();

        // Always enable hwrev dropdown and always include + New HwRev... once a board is selected
        selH.disabled = false;
        hwrevs.forEach(h => { const o = document.createElement('option'); o.value = h; o.textContent = h; selH.appendChild(o); });
        const newHO = document.createElement('option'); newHO.value = '__new__'; newHO.textContent = '+ New HwRev...';
        selH.appendChild(newHO);

        // Auto-select when there's exactly one hwrev (common case during active development)
        if (hwrevs.length === 1) {
            selH.value = hwrevs[0];
            state.hwrev = hwrevs[0];
            onHwrevChange();
        }

        // Seed a default Inputs-Mainboard group on a fresh (empty) project
        if (state.pipelines.length === 0) {
            pipelineSeq++;
            state.pipelines.push({
                id: genPipelineId(),
                name: 'Inputs-Mainboard',
                kind: 'sensor',
                enabled: true,
                collapsed: false,
                blocks: [],
            });
            selectedPipelineIdx = 0;
        }

        renderPinMap();
        renderModuleCards();
        renderPipelineCards();
    }

    function onNewHwrevInput() {
        const val = document.getElementById('inp-new-hwrev').value.trim();
        state.hwrev = val;
        const selR = document.getElementById('sel-role');
        selR.innerHTML = '<option value="">—</option>';
        document.getElementById('div-role-id').style.display = 'none';
        document.getElementById('inp-role-id').value = '';
        resetNameDropdown();
        if (val) {
            selR.disabled = false;
            const newO = document.createElement('option'); newO.value = '__new__'; newO.textContent = '+ New Role...';
            selR.appendChild(newO);
        } else {
            selR.disabled = true;
        }
    }

    function onHwrevChange() {
        const rawVal = document.getElementById('sel-hwrev').value;
        const inp = document.getElementById('inp-new-hwrev');
        if (rawVal === '__new__') {
            inp.style.display = '';
            inp.value = '';
            inp.focus();
            state.hwrev = '';
            const selR = document.getElementById('sel-role');
            selR.innerHTML = '<option value="">—</option>';
            selR.disabled = true;
            return;
        }
        inp.style.display = 'none';
        inp.value = '';
        state.hwrev = rawVal;
        const selR = document.getElementById('sel-role');
        selR.innerHTML = '<option value="">— select or new —</option>';
        document.getElementById('div-role-id').style.display = 'none';
        document.getElementById('inp-role-id').value = '';
        resetNameDropdown();
        if (!state.hwrev) { selR.disabled = true; return; }
        selR.disabled = false;

        // Roles from the HAL directory structure (if dirs exist for this target+hwrev)
        const tData = targets.find(t => t.id === state.target);
        const hData = tData && tData.hwrevs.find(h => h.id === state.hwrev);
        const dirRoles = new Set(hData ? (hData.roles || []) : []);
        if (hData && hData.roles.length > 0) {
            hData.roles.forEach(r => { const o = document.createElement('option'); o.value = r; o.textContent = r; selR.appendChild(o); });
        }

        // Saved roles: filter by board + hwrev; show each unique role_id once
        const savedRoleIds = [...new Set(savedRoles
            .filter(sr => sr.board === state.board && sr.hwrev === state.hwrev && !dirRoles.has(sr.id))
            .map(sr => sr.id))];
        if (savedRoleIds.length > 0) {
            const sep = document.createElement('option');
            sep.disabled = true; sep.textContent = '── saved roles ──';
            selR.appendChild(sep);
            savedRoleIds.forEach(roleId => {
                const o = document.createElement('option');
                o.value = roleId; o.textContent = roleId;
                selR.appendChild(o);
            });
        }

        const newO = document.createElement('option'); newO.value = '__new__'; newO.textContent = '+ New Role...';
        selR.appendChild(newO);
    }

    function onRoleChange() {
        const val = document.getElementById('sel-role').value;
        const divRoleId = document.getElementById('div-role-id');
        if (val === '__new__') {
            // Show the ID text input for new role, reset name dropdown
            divRoleId.style.display = '';
            document.getElementById('inp-role-id').value = '';
            document.getElementById('inp-role-id').focus();
            resetNameDropdown(true); // enable with only + Add new name
            return;
        }
        divRoleId.style.display = 'none';
        document.getElementById('inp-role-id').value = '';
        if (val) {
            state.roleId = val;
            const autoFileName = populateNameDropdown(val);
            // Auto-load when only one named instance exists (user picked the role ID)
            if (autoFileName) {
                vscode.postMessage({ command: 'loadRole', roleId: autoFileName });
            }
        } else {
            resetNameDropdown();
        }
    }

    // Populate the Name dropdown with all saved display_name values for board+hwrev+roleId.
    // Sets UI only — never triggers a load. Returns the auto-selected fileName if exactly one
    // name exists (caller decides whether to load), otherwise returns null.
    function populateNameDropdown(roleId) {
        const selN = document.getElementById('sel-display-name');
        selN.innerHTML = '';
        selN.disabled = false;
        // Gather unique (display_name, fileName) pairs for this board+hwrev+roleId
        const matches = savedRoles.filter(sr => sr.board === state.board && sr.hwrev === state.hwrev && sr.id === roleId && sr.display_name);
        // De-dup by display_name (keep first occurrence per name)
        const seen = new Set();
        const items = [];
        matches.forEach(sr => {
            if (!seen.has(sr.display_name)) { seen.add(sr.display_name); items.push(sr); }
        });
        const placeholder = document.createElement('option');
        placeholder.value = ''; placeholder.textContent = items.length ? '— select name —' : '— no saved names —';
        selN.appendChild(placeholder);
        items.forEach(sr => {
            const o = document.createElement('option');
            o.value = sr.fileName; o.textContent = sr.display_name;
            selN.appendChild(o);
        });
        const addO = document.createElement('option');
        addO.value = '__add_new__'; addO.textContent = '+ Add new name...';
        selN.appendChild(addO);
        document.getElementById('inp-display-name-new').style.display = 'none';
        document.getElementById('inp-display-name-new').value = '';
        // Auto-select when there's exactly one saved name — caller decides whether to load
        if (items.length === 1) {
            selN.value = items[0].fileName;
            return items[0].fileName;
        }
        return null;
    }

    // Reset the Name dropdown to disabled/empty (called when board/hwrev/role changes upstream).
    // If enableNew=true, enable the dropdown with just the "+ Add new name..." option.
    function resetNameDropdown(enableNew) {
        const selN = document.getElementById('sel-display-name');
        selN.innerHTML = '';
        document.getElementById('inp-display-name-new').style.display = 'none';
        document.getElementById('inp-display-name-new').value = '';
        if (enableNew) {
            selN.disabled = false;
            const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '— select name —';
            selN.appendChild(placeholder);
            const addO = document.createElement('option'); addO.value = '__add_new__'; addO.textContent = '+ Add new name...';
            selN.appendChild(addO);
        } else {
            selN.disabled = true;
            const o = document.createElement('option'); o.value = ''; o.textContent = '—';
            selN.appendChild(o);
        }
    }

    function onNameChange() {
        const selN = document.getElementById('sel-display-name');
        const val = selN.value;
        const inpNew = document.getElementById('inp-display-name-new');
        if (val === '__add_new__') {
            inpNew.style.display = '';
            inpNew.value = '';
            inpNew.focus();
            return;
        }
        inpNew.style.display = 'none';
        inpNew.value = '';
        if (val) {
            // Load the saved role file identified by fileName (=val)
            vscode.postMessage({ command: 'loadRole', roleId: val });
        }
    }

    // ── Pin Map Rendering ──
    // ── Pin Map Sort State ──
    let pinSortCol = 'jpin';
    let pinSortAsc = true;

    function sortPinMap(col) {
        if (pinSortCol === col) { pinSortAsc = !pinSortAsc; }
        else { pinSortCol = col; pinSortAsc = true; }
        // Update header classes
        ['gpio','physical','jpin','caps','assigned'].forEach(c => {
            const th = document.getElementById('th-' + c);
            th.classList.toggle('sorted', c === col);
            th.querySelector('.sort-arrow').textContent = (c === col && !pinSortAsc) ? '▴' : '▾';
        });
        renderPinMap();
    }

    // ── Auto Assign Pins ──────────────────────────────────────────────────────
    // Collects every pin_cap slot across all pipeline blocks (and fan_outputs),
    // deduplicates by (alias + cap) so identically-named aliases sharing a pin
    // type are treated as the same physical wire, then assigns GPIO numbers in
    // capability-priority order: I2C → SPI → ADC-1 → ADC-2 → PWM → GPIO.
    // Already-assigned slots are skipped. Reserved board pins are never used.
    function toggleAutoAssignMenu(btn) {
        const menu = document.getElementById('auto-assign-menu');
        if (!menu) return;
        const showing = menu.style.display !== 'none';
        menu.style.display = showing ? 'none' : 'block';
        if (!showing) {
            // Close on next outside click
            const close = (e) => { menu.style.display = 'none'; document.removeEventListener('click', close); };
            setTimeout(() => document.addEventListener('click', close), 0);
        }
    }

    function autoAssignPins(force = false) {
        const capData = pinCaps[state.board];
        if (!capData) return;

        // Build set of reserved GPIO numbers
        const reserved = new Set(capData.pins.filter(p => p.reserved).map(p => p.gpio));

        // Gather all slots: { settingPath, alias, cap, pi, bi, fi (opt), sName, device_group, device_id }
        // settingPath is the key into state.pipelines to write back.
        // device_group: from fbDef.device_group (marks blocks that share a physical chip)
        // device_id: from blk.settings.device_id (distinguishes multiple physical devices of the same type)
        const slots = [];
        state.pipelines.forEach((pl, pi) => {
            pl.blocks.forEach((blk, bi) => {
                const fbDef = fbBlocks.find(f => f.id === blk.blockType);
                if (!fbDef) return;
                fbDef.settings.forEach(sdef => {
                    if (!sdef.pin_cap) return;
                    const device_id = (blk.settings && blk.settings.device_id) || '';
                    slots.push({ pi, bi, fi: null, sName: sdef.name, cap: sdef.pin_cap.toUpperCase(),
                        alias: (blk.alias || fbDef.label).toLowerCase(),
                        device_group: fbDef.device_group || null,
                        device_id });
                });
                (blk.fan_outputs || []).forEach((fo, fi) => {
                    const foDef = fbBlocks.find(f => f.id === fo.blockType);
                    if (!foDef) return;
                    foDef.settings.forEach(sdef => {
                        if (!sdef.pin_cap) return;
                        slots.push({ pi, bi, fi, sName: sdef.name, cap: sdef.pin_cap.toUpperCase(),
                            alias: (fo.alias || foDef.label).toLowerCase(),
                            device_group: null, device_id: '' });
                    });
                });
            });
        });

        // Peripheral pin slots — gathered separately because they write back to state.peripherals[].pins
        // Shape: { periphId, slotName, cap }
        const periphSlots = [];
        state.peripherals.forEach(periph => {
            const ptype = peripheralTypes.find(pt => pt.id === periph.type);
            if (!ptype) return;
            (ptype.pin_slots || []).forEach(slot => {
                periphSlots.push({
                    periphId: periph.id,
                    slotName: slot.name,
                    cap:      slot.cap.toUpperCase(),
                    periphKey: 'periph:' + periph.id + ':' + slot.name,
                });
            });
        });

        // Compute the dedup key for a slot:
        //   - device_group blocks → "group:<group>:<device_id>:<sName>" (globally shared by device type+id)
        //   - normal blocks      → "<alias>:<cap>" (current alias-based dedup)
        const slotKey = (slot) => slot.device_group
            ? 'group:' + slot.device_group + ':' + slot.device_id + ':' + slot.sName
            : slot.alias + ':' + slot.cap;

        // Deduplicate: same key → same GPIO. Build a map key → gpio.
        // In normal mode, seed from existing assignments so manual choices are preserved.
        // In force mode, ignore all existing values and reassign everything from scratch.
        const aliasCapToGpio = {};
        if (!force) {
            slots.forEach(slot => {
                const key = slotKey(slot);
                const cur = slot.fi === null
                    ? parseInt(state.pipelines[slot.pi].blocks[slot.bi].settings[slot.sName], 10)
                    : parseInt(state.pipelines[slot.pi].blocks[slot.bi].fan_outputs[slot.fi].settings[slot.sName], 10);
                if (!isNaN(cur) && cur >= 0 && !(key in aliasCapToGpio)) {
                    aliasCapToGpio[key] = cur;
                }
            });
        }

        // Build per-cap ordered lists of available pins (not reserved)
        // Priority order for assignment: I2C → SPI → ADC-1 → ADC-2 → PWM → GPIO (catch-all)
        const CAP_ORDER = ['I2C', 'SPI', 'ADC-1', 'ADC-2', 'PWM', 'GPIO'];
        const availByCapRaw = {};
        capData.pins.forEach(p => {
            if (p.reserved) return;
            p.caps.forEach(c => {
                const cu = c.toUpperCase();
                if (!availByCapRaw[cu]) availByCapRaw[cu] = [];
                availByCapRaw[cu].push(p.gpio);
            });
        });
        // Sort each cap list numerically
        Object.keys(availByCapRaw).forEach(c => availByCapRaw[c].sort((a, b) => a - b));
        // Merge ADC-1 and ADC-2 into a common 'ADC' pool for backward compat
        // so blocks using pin_cap:'ADC' are still auto-assigned correctly.
        const adcPool = [...new Set([...(availByCapRaw['ADC-1'] || []), ...(availByCapRaw['ADC-2'] || [])])].sort((a, b) => a - b);
        if (adcPool.length) availByCapRaw['ADC'] = adcPool;

        // Track which GPIOs are already committed this run (to avoid double-assign).
        // In force mode, start empty — nothing is pre-committed.
        const committed = force
            ? new Set()
            : new Set(
                Object.values(state.pinAssignments)
                    .filter(a => !reserved.has(a.gpio))
                    .map(a => a.gpio)
            );

        // Assign: iterate slots grouped by CAP_ORDER priority
        const assignGroup = (capName) => {
            const available = (availByCapRaw[capName] || []);
            slots
                .filter(s => s.cap === capName)
                .forEach(slot => {
                    const key = slotKey(slot);
                    if (key in aliasCapToGpio) {
                        // Already decided (either pre-existing or earlier dedup hit) — just write it back
                        const gpio = aliasCapToGpio[key];
                        writeSlot(slot, gpio);
                        return;
                    }
                    // Find next free pin for this cap
                    const gpio = available.find(g => !committed.has(g) && !reserved.has(g));
                    if (gpio === undefined) return; // No pins left for this cap
                    aliasCapToGpio[key] = gpio;
                    committed.add(gpio);
                    writeSlot(slot, gpio);
                });
        };

        CAP_ORDER.forEach(assignGroup);
        // Also handle any cap not in CAP_ORDER (e.g. custom caps on specialty boards)
        const handledCaps = new Set(CAP_ORDER);
        slots.forEach(s => {
            if (!handledCaps.has(s.cap)) {
                handledCaps.add(s.cap);
                assignGroup(s.cap);
            }
        });

        // Assign peripheral pin slots (same priority logic)
        const assignPeriphGroup = (capName) => {
            const available = (availByCapRaw[capName] || []);
            periphSlots
                .filter(ps => ps.cap === capName)
                .forEach(ps => {
                    const periph = state.peripherals.find(p => p.id === ps.periphId);
                    if (!periph) return;
                    if (!force) {
                        const cur = parseInt(periph.pins[ps.slotName], 10);
                        if (!isNaN(cur) && cur >= 0) {
                            committed.add(cur);
                            return; // preserve existing
                        }
                    }
                    const gpio = available.find(g => !committed.has(g) && !reserved.has(g));
                    if (gpio === undefined) return;
                    periph.pins[ps.slotName] = gpio;
                    committed.add(gpio);
                });
        };
        const handledPeriphCaps = new Set(CAP_ORDER);
        periphSlots.forEach(ps => { if (!handledPeriphCaps.has(ps.cap)) handledPeriphCaps.add(ps.cap); });
        // Use priority order for peripherals too
        CAP_ORDER.forEach(c => { if (periphSlots.some(ps => ps.cap === c)) assignPeriphGroup(c); });
        handledPeriphCaps.forEach(c => { if (!CAP_ORDER.includes(c)) assignPeriphGroup(c); });

        rebuildPipelinePinAssignments();
        renderPipelineCards();
        renderPeripherals();
        // Snap to gpio sort so result is in stable numeric order.
        // Route through sortPinMap so header arrows update correctly.
        pinSortCol = ''; // clear so sortPinMap treats gpio as a fresh activation
        sortPinMap('gpio');
    }

    function writeSlot(slot, gpio) {
        if (slot.fi === null) {
            state.pipelines[slot.pi].blocks[slot.bi].settings[slot.sName] = gpio;
        } else {
            state.pipelines[slot.pi].blocks[slot.bi].fan_outputs[slot.fi].settings[slot.sName] = gpio;
        }
    }

    function renderPinMap() {
        const tbody = document.getElementById('pin-table-body');
        const capData = pinCaps[state.board];
        if (!capData) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding:12px; color:var(--vscode-descriptionForeground); font-size:11px; text-align:center;">Select a board</td></tr>';
            return;
        }

        const usedGpios = {};
        Object.entries(state.pinAssignments).forEach(([id, a]) => { usedGpios[a.gpio] = id; });

        // Build sortable rows
        let rows = capData.pins.map(pin => {
            const assignedId = usedGpios[pin.gpio];
            const assignedLabel = pin.reserved ? '' : (assignedId ? state.pinAssignments[assignedId].label : '');
            return { pin, assignedId, assignedLabel, capsCount: pin.caps.length };
        });

        // Sort
        const dir = pinSortAsc ? 1 : -1;
        if (pinSortCol === 'gpio') {
            rows.sort((a, b) => dir * (a.pin.gpio - b.pin.gpio));
        } else if (pinSortCol === 'physical') {
            rows.sort((a, b) => dir * ((a.pin.phyPin || 0) - (b.pin.phyPin || 0)));
        } else if (pinSortCol === 'jpin') {
            rows.sort((a, b) => {
                const aJ = a.pin.jpin || '';
                const bJ = b.pin.jpin || '';
                return dir * aJ.localeCompare(bJ) || (a.pin.gpio - b.pin.gpio);
            });
        } else if (pinSortCol === 'caps') {
            rows.sort((a, b) => dir * (b.capsCount - a.capsCount) || (a.pin.gpio - b.pin.gpio));
        } else if (pinSortCol === 'assigned') {
            rows.sort((a, b) => {
                const aA = a.assignedLabel ? 1 : 0;
                const bA = b.assignedLabel ? 1 : 0;
                return dir * (bA - aA) || (a.pin.gpio - b.pin.gpio);
            });
        }

        tbody.innerHTML = '';
        rows.forEach(({ pin, assignedId, assignedLabel }) => {
            const tr = document.createElement('tr');
            if (pin.reserved) tr.className = 'reserved';
            else if (assignedId) tr.className = 'assigned';
            const gpioUsers = Object.entries(state.pinAssignments).filter(([_, a]) => a.gpio === pin.gpio);
            // Conflict detection:
            // 1. 2+ outputs on same GPIO — always a conflict.
            // 2. Any output + any ADC/analog input on same GPIO — can't drive a pin high/low
            //    while also using it as an ADC channel.
            // (Multiple digital inputs sharing the same GPIO is valid — e.g. gpio_input
            // used in both a sensor pipeline and a routine.)
            const outputUsers = gpioUsers.filter(([_, a]) => a.dir !== 'in');
            const adcUsers    = gpioUsers.filter(([_, a]) => a.dir === 'in' && /adc|analog/i.test(a.label || ''));
            if (outputUsers.length > 1 || (outputUsers.length >= 1 && adcUsers.length >= 1)) tr.className = 'conflict';

            // Build assigned cell — draggable if assigned
            let assignedHtml;
            if (pin.reserved) {
                assignedHtml = '<em>reserved</em>';
            } else if (assignedLabel && assignedId) {
                assignedHtml = '<span draggable="true" class="pin-assigned"' +
                    ' data-assign-id="' + assignedId + '"' +
                    ' data-gpio="' + pin.gpio + '"' +
                    ' title="Drag to reassign">' + assignedLabel + '</span>';
            } else {
                assignedHtml = '<span class="pin-assigned">—</span>';
            }

            // Drop target attrs for non-reserved rows
            const dropAttrs = pin.reserved ? '' :
                ' data-drop-gpio="' + pin.gpio + '"' +
                ' data-drop-caps="' + pin.caps.join(',') + '"';

            const pinLabel = pin.reserved ? pin.name : ('GPIO' + pin.gpio);
            const phyLabel = (pin.phyPin && pin.phyPin > 0) ? pin.phyPin : '—';
            tr.innerHTML =
                '<td class="pin-name">' + pinLabel + '</td>' +
                '<td class="pin-jpin">' + phyLabel + '</td>' +
                '<td class="pin-jpin">' + (pin.jpin || '—') + '</td>' +
                '<td><div class="pin-caps">' + pin.caps.map(c => '<span class="cap-badge cap-' + c + '">' + c + '</span>').join('') + '</div></td>' +
                '<td' + dropAttrs + '>' + assignedHtml + '</td>';
            tbody.appendChild(tr);
        });

        // Wire once — guard inside ensures it's a no-op on subsequent renders
        initPinDragDrop();
    }

    function printPinMap() {
        const table = document.getElementById('pin-table');
        if (!table) return;

        const boardLabel = state.board || 'Unknown Board';
        const roleLabel  = state.roleId || 'Unsaved Role';
        const titleText  = boardLabel + (roleLabel ? '  \u00b7  ' + roleLabel : '') + '  \u2014  GPIO Pin Map';

        // Clone the rendered table so we get the current sort order as-is
        const tableClone = table.cloneNode(true);
        tableClone.querySelectorAll('[onclick],[draggable],[data-drop-gpio],[data-assign-id],[data-gpio],[data-drop-caps]')
            .forEach(el => {
                el.removeAttribute('onclick');
                el.removeAttribute('draggable');
                el.removeAttribute('data-drop-gpio');
                el.removeAttribute('data-drop-caps');
                el.removeAttribute('data-assign-id');
                el.removeAttribute('data-gpio');
            });
        // Remove sort arrows from the clone
        tableClone.querySelectorAll('.sort-arrow').forEach(el => el.remove());

        // VS Code webviews block window.print(). Instead, post a complete standalone HTML
        // document to the extension host, which writes it to a temp file and opens it in
        // the default browser — where the user can Ctrl+P to print normally.
        const html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
            + '<title>' + titleText + '</title>'
            + '<style>'
            + 'body { font-family: system-ui, sans-serif; font-size: 12px; color: #000; background: #fff; padding: 16px; }'
            + 'h2 { font-size: 14px; margin: 0 0 12px; }'
            + 'table { width: 100%; border-collapse: collapse; }'
            + 'th { text-align: left; font-size: 11px; font-weight: 700; padding: 4px 8px; border-bottom: 2px solid #333; }'
            + 'td { padding: 3px 8px; border-bottom: 1px solid #ddd; font-size: 11px; }'
            + 'tr.reserved td { color: #888; font-style: italic; }'
            + 'tr.assigned td:last-child { font-weight: 600; }'
            + 'tr.conflict td { background: #ffe0e0; }'
            + '.cap-badge { display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 2px; margin-right: 2px; background: #e2e8f0; color: #333; }'
            + '.cap-ADC-1 { background: #d4f7e5; color: #1a6b3c; }'
            + '.cap-ADC-2 { background: #fdebd0; color: #884800; }'
            + '.cap-GPIO { background: #dbeafe; color: #1e3a8a; }'
            + '.cap-PWM  { background: #ede9fe; color: #4c1d95; }'
            + '.cap-I2C-SDA,.cap-I2C-SCL { background: #fef9c3; color: #713f12; }'
            + '.cap-SPI-MOSI,.cap-SPI-MISO,.cap-SPI-SCK { background: #fce7f3; color: #831843; }'
            + '.cap-UART-RX,.cap-UART-TX { background: #f0fdf4; color: #14532d; }'
            + '.pin-assigned { font-weight: inherit; }'
            + '@media print { @page { margin: 1cm; } }'
            + '</style></head><body>'
            + '<h2>' + titleText + '</h2>'
            + tableClone.outerHTML
            + '<script>window.onload = function() { window.print(); };<\/script>'
            + '</body></html>';

        vscode.postMessage({ command: 'printPinMap', html: html });
    }

    // ── Pin Map Drag-and-Drop — event delegation on persistent tbody ──────────
    // Listeners live on the tbody element itself so they survive innerHTML re-renders.
    let pinDragData = null;

    // Returns true if a required capability is satisfied by any cap in the target pin.
    // ADC backward-compat: blocks using pin_cap:'ADC' can land on ADC-1 or ADC-2 pins.
    function capAccepted(required, targetCaps) {
        const r = (required || '').toUpperCase();
        if (targetCaps.includes(required) || targetCaps.includes('GPIO')) return true;
        if (r === 'ADC') return targetCaps.includes('ADC-1') || targetCaps.includes('ADC-2');
        return false;
    }

    function initPinDragDrop() {
        const tbody = document.getElementById('pin-table-body');
        if (!tbody || tbody._pinDragReady) return;
        tbody._pinDragReady = true;

        // dragstart — fires on the draggable <span>, bubbles up to tbody
        tbody.addEventListener('dragstart', e => {
            const el = e.target.closest('[data-assign-id]');
            if (!el) return;

            const assignId = el.getAttribute('data-assign-id');
            const fromGpio = parseInt(el.getAttribute('data-gpio'), 10);
            if (!assignId) return;

            const assignment = state.pinAssignments[assignId];
            let requiredCap = 'GPIO';

            if (assignId.startsWith('pl_')) {
                const foM = assignId.match(/^pl_(\d+)_bl_(\d+)_fo_(\d+)_(.+)$/);
                const blkM = !foM && assignId.match(/^pl_(\d+)_bl_(\d+)_(.+)$/);
                if (foM) {
                    const pi = parseInt(foM[1], 10), bi = parseInt(foM[2], 10);
                    const fi = parseInt(foM[3], 10), sName = foM[4];
                    const blk = state.pipelines[pi] && state.pipelines[pi].blocks[bi];
                    const fo = blk && blk.fan_outputs && blk.fan_outputs[fi];
                    const foDef = fo && fbBlocks.find(f => f.id === fo.blockType);
                    const sdef = foDef && foDef.settings.find(s => s.name === sName);
                    if (sdef && sdef.pin_cap) requiredCap = sdef.pin_cap;
                } else if (blkM) {
                    const pi = parseInt(blkM[1], 10), bi = parseInt(blkM[2], 10), sName = blkM[3];
                    const blk = state.pipelines[pi] && state.pipelines[pi].blocks[bi];
                    const fbDef = blk && fbBlocks.find(f => f.id === blk.blockType);
                    const sdef = fbDef && fbDef.settings.find(s => s.name === sName);
                    if (sdef && sdef.pin_cap) requiredCap = sdef.pin_cap;
                }
            } else if (assignment && assignment.peripheral) {
                // periph:<periphId>:<slotName>
                const parts = assignId.split(':');
                if (parts.length === 3) {
                    const periphId = parts[1], slotName = parts[2];
                    const periph = state.peripherals.find(p => p.id === periphId);
                    const ptype = periph && peripheralTypes.find(pt => pt.id === periph.type);
                    const slot = ptype && ptype.pin_slots.find(s => s.name === slotName);
                    if (slot) requiredCap = slot.cap.toUpperCase();
                }
            } else if (assignId.startsWith('sig:')) {
                // sig:<periphId>:<sigName> — signal assignment badge from peripheral card
                const parts = assignId.split(':');
                if (parts.length === 3) {
                    const periphId = parts[1], sigName = parts[2];
                    const periph = state.peripherals.find(p => p.id === periphId);
                    const ptype = periph && peripheralTypes.find(pt => pt.id === periph.type);
                    const sigDef = ptype && ptype.signals.find(s => s.name === sigName);
                    requiredCap = sigDef && sigDef.provides_cap ? sigDef.provides_cap.toUpperCase() : 'ADC';
                    // Store the assignment lookup in pinDragData for use in drop handler
                    pinDragData = { assignId, fromGpio: -1, requiredCap,
                        sigAssignment: getSignalAssignment(periphId, sigName) };
                    el.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', assignId);
                    return;
                }
            } else if (assignment && assignment.component) {
                const compId = assignment.component;
                const comp = components[compId];
                if (comp) {
                    const suffix = assignId.slice(compId.length + 1);
                    const sepIdx = suffix.indexOf('_');
                    const pinId = sepIdx >= 0 ? suffix.slice(sepIdx + 1) : suffix;
                    const allPins = getAllCompPins(comp);
                    const pdef = allPins.find(p => p.pin_id === pinId);
                    if (pdef) requiredCap = pdef.func.toUpperCase();
                }
            }

            pinDragData = { assignId, fromGpio, requiredCap };
            el.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', assignId);
        });

        // dragend — fires on the original source element, bubbles to tbody
        tbody.addEventListener('dragend', e => {
            const el = e.target.closest('[data-assign-id]');
            if (el) el.classList.remove('dragging');
            pinDragData = null;
            tbody.querySelectorAll('.drop-target, .drop-target-invalid').forEach(r => {
                r.classList.remove('drop-target', 'drop-target-invalid');
            });
        });

        // dragover — must preventDefault to allow drop
        tbody.addEventListener('dragover', e => {
            if (!pinDragData) return;
            const tr = e.target.closest('tr');
            if (!tr) return;
            e.preventDefault();

            const dropCell = tr.querySelector('[data-drop-gpio]');
            if (!dropCell) { tr.classList.add('drop-target-invalid'); return; }

            const targetCaps = (dropCell.getAttribute('data-drop-caps') || '').split(',');
            if (capAccepted(pinDragData.requiredCap, targetCaps)) {
                tr.classList.remove('drop-target-invalid');
                tr.classList.add('drop-target');
                e.dataTransfer.dropEffect = 'move';
            } else {
                tr.classList.remove('drop-target');
                tr.classList.add('drop-target-invalid');
                e.dataTransfer.dropEffect = 'none';
            }
        });

        // dragleave — only clear highlight when leaving the <tr> entirely
        tbody.addEventListener('dragleave', e => {
            const tr = e.target.closest('tr');
            if (tr && !tr.contains(e.relatedTarget)) {
                tr.classList.remove('drop-target', 'drop-target-invalid');
            }
        });

        // drop
        tbody.addEventListener('drop', e => {
            e.preventDefault();
            const tr = e.target.closest('tr');
            if (!tr || !pinDragData) return;
            tr.classList.remove('drop-target', 'drop-target-invalid');

            const dropCell = tr.querySelector('[data-drop-gpio]');
            if (!dropCell) return;

            const targetGpio = parseInt(dropCell.getAttribute('data-drop-gpio'), 10);
            const targetCaps = (dropCell.getAttribute('data-drop-caps') || '').split(',');
            if (!capAccepted(pinDragData.requiredCap, targetCaps)) return;

            const assignId = pinDragData.assignId;
            const assignment = state.pinAssignments[assignId];
            if (!assignment || targetGpio === assignment.gpio) return;

            if (assignId.startsWith('pl_')) {
                const foM = assignId.match(/^pl_(\d+)_bl_(\d+)_fo_(\d+)_(.+)$/);
                const blkM = !foM && assignId.match(/^pl_(\d+)_bl_(\d+)_(.+)$/);
                if (foM) {
                    const pi = parseInt(foM[1], 10), bi = parseInt(foM[2], 10);
                    const fi = parseInt(foM[3], 10), sName = foM[4];
                    const pl = state.pipelines[pi];
                    if (!pl || !pl.blocks[bi]) return;
                    const fo = pl.blocks[bi].fan_outputs && pl.blocks[bi].fan_outputs[fi];
                    if (!fo) return;
                    fo.settings[sName] = targetGpio;
                    assignment.gpio = targetGpio;
                } else if (blkM) {
                    const pi = parseInt(blkM[1], 10), bi = parseInt(blkM[2], 10), sName = blkM[3];
                    const pl = state.pipelines[pi];
                    if (!pl || !pl.blocks[bi]) return;
                    pl.blocks[bi].settings[sName] = targetGpio;
                    assignment.gpio = targetGpio;
                } else { return; }
            } else if (assignId.startsWith('sig:')) {
                // Signal assignment badge dropped on a GPIO row — convert to raw GPIO source
                const asgn = pinDragData.sigAssignment;
                if (!asgn) return;
                const blk = state.pipelines[asgn.pi] && state.pipelines[asgn.pi].blocks[asgn.bi];
                if (!blk) return;
                blk.settings[asgn.sName] = targetGpio;
                const assignKey = 'pl_' + asgn.pi + '_bl_' + asgn.bi + '_' + asgn.sName;
                const blockLabel = blk.alias ? blk.alias + ' - ' + blk.blockType : blk.blockType;
                state.pinAssignments[assignKey] = { gpio: targetGpio, label: blockLabel };
                renderPeripherals();
                renderPipelineCards();
            } else if (assignId.startsWith('periph:')) {
                const parts = assignId.split(':');
                if (parts.length === 3) {
                    const periphId = parts[1], slotName = parts[2];
                    const periph = state.peripherals.find(p => p.id === periphId);
                    if (!periph) return;
                    periph.pins[slotName] = targetGpio;
                    assignment.gpio = targetGpio;
                    syncPeripheralPinToOutputs(periph, slotName, targetGpio);
                    renderPeripherals();
                    renderOutputGroups();
                } else { return; }
            } else if (assignId.startsWith('op_')) {
                // Anonymous output pin dragged to a new GPIO row
                const pinId = assignId.slice(3);
                let found = false;
                (state.output_groups || []).forEach(g => {
                    const op = g.pins.find(p => p.id === pinId);
                    if (op) { op.gpio = targetGpio; assignment.gpio = targetGpio; found = true; }
                });
                if (!found) return;
                renderOutputGroups();
            } else {
                const compId = assignment.component;
                if (!compId) return;
                const suffix = assignId.slice(compId.length + 1);
                const sepIdx = suffix.indexOf('_');
                const instIdx = parseInt(sepIdx >= 0 ? suffix.slice(0, sepIdx) : suffix, 10);
                const pinId = sepIdx >= 0 ? suffix.slice(sepIdx + 1) : '';
                const cs = state.components[compId];
                if (cs && cs.instances[instIdx] && pinId) {
                    cs.instances[instIdx].pins[pinId] = targetGpio;
                    assignment.gpio = targetGpio;
                }
            }

            pinDragData = null;
            renderPinMap();
            renderPipelineCards();
        });
    }

    // ── Signal drag-drop (peripheral card signal rows ↔ peripheral cards ↔ GPIO pin map) ──
    // Signal badges have data-assign-id="sig:periphId:sigName".
    // Signal rows have data-drop-signal="periph:periphId:sigName" (the ref format stored in block settings).
    function initSignalDragDrop() {
        const list = document.getElementById('peripherals-list');
        if (!list || list._sigDragReady) return;
        list._sigDragReady = true;

        list.addEventListener('dragstart', e => {
            const el = e.target.closest('[data-assign-id]');
            if (!el) return;
            const assignId = el.getAttribute('data-assign-id');
            if (!assignId || !assignId.startsWith('sig:')) return;
            const parts = assignId.split(':');
            const periphId = parts[1], sigName = parts[2];
            const periph = state.peripherals.find(p => p.id === periphId);
            const ptype = periph && peripheralTypes.find(pt => pt.id === periph.type);
            const sigDef = ptype && ptype.signals.find(s => s.name === sigName);
            const requiredCap = sigDef && sigDef.provides_cap ? sigDef.provides_cap.toUpperCase() : 'ADC';
            pinDragData = { assignId, fromGpio: -1, requiredCap, sigAssignment: getSignalAssignment(periphId, sigName) };
            el.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', assignId);
        });

        list.addEventListener('dragend', e => {
            const el = e.target.closest('[data-assign-id]');
            if (el) el.classList.remove('dragging');
            list.querySelectorAll('.sig-drop-target, .sig-drop-invalid').forEach(r =>
                r.classList.remove('sig-drop-target', 'sig-drop-invalid'));
            pinDragData = null;
        });

        list.addEventListener('dragover', e => {
            if (!pinDragData) return;
            const row = e.target.closest('[data-drop-signal]');
            if (!row) return;
            e.preventDefault();
            const dropRef = row.getAttribute('data-drop-signal'); // 'periph:p2:s2'
            const dParts = dropRef.split(':');
            const p2 = dParts[1], s2 = dParts[2];
            const periph2 = state.peripherals.find(p => p.id === p2);
            const ptype2 = periph2 && peripheralTypes.find(pt => pt.id === periph2.type);
            const sig2 = ptype2 && ptype2.signals.find(s => s.name === s2);
            const compatible = sig2 && sig2.provides_cap &&
                sig2.provides_cap.toUpperCase() === pinDragData.requiredCap;
            if (compatible) {
                row.classList.remove('sig-drop-invalid');
                row.classList.add('sig-drop-target');
                e.dataTransfer.dropEffect = 'move';
            } else {
                row.classList.remove('sig-drop-target');
                row.classList.add('sig-drop-invalid');
                e.dataTransfer.dropEffect = 'none';
            }
        });

        list.addEventListener('dragleave', e => {
            const row = e.target.closest('[data-drop-signal]');
            if (row && !row.contains(e.relatedTarget))
                row.classList.remove('sig-drop-target', 'sig-drop-invalid');
        });

        list.addEventListener('drop', e => {
            e.preventDefault();
            const row = e.target.closest('[data-drop-signal]');
            if (!row || !pinDragData) return;
            row.classList.remove('sig-drop-target', 'sig-drop-invalid');
            const dropRef = row.getAttribute('data-drop-signal'); // 'periph:p2:s2'

            let pi, bi, sName;
            if (pinDragData.sigAssignment) {
                // sig → sig: move a block's source from one signal to another
                ({ pi, bi, sName } = pinDragData.sigAssignment);
            } else if (pinDragData.assignId && pinDragData.assignId.startsWith('pl_')) {
                // GPIO badge → signal: reassign a block's pin source to a peripheral signal
                const blkM = pinDragData.assignId.match(/^pl_(\d+)_bl_(\d+)_(.+)$/);
                if (!blkM) { pinDragData = null; return; }
                pi = parseInt(blkM[1], 10); bi = parseInt(blkM[2], 10); sName = blkM[3];
            } else { pinDragData = null; return; }

            const blk = state.pipelines[pi] && state.pipelines[pi].blocks[bi];
            if (!blk) { pinDragData = null; return; }
            blk.settings[sName] = dropRef;
            // Remove any raw GPIO pin map entry for this setting
            const assignKey = 'pl_' + pi + '_bl_' + bi + '_' + sName;
            delete state.pinAssignments[assignKey];
            pinDragData = null;
            renderPeripherals();
            renderPipelineCards();
            renderPinMap();
        });
    }

    // ── Flash Partition Layout (left sidebar) ──
    //
    // Fixed overhead (not editable):
    //   nvs 24K | phy_init 4K | otadata 8K | pds_l1 64K | pds_l2 64K | pds_l3 64K = 228K
    //   pds_log: uses ALL remaining flash (0 free space)
    // Editable: app/OTA slot size — must be a multiple of 64K (ESP32 flash block size)
    // Both OTA slots are the same size (ota_0 = ota_1).
    //
    function _snapTo64(kb) {
        return Math.max(256, Math.round(kb / 64) * 64);
    }

    function _maxAppSizeKb(flash_kb) {
        const fixedKb = 228;  // nvs+phy_init+otadata+pds_l1+pds_l2+pds_l3 (pds_log uses remainder)
        return Math.floor((flash_kb - fixedKb) / 2 / 64) * 64;
    }

    function _fmtOffset(byteOffset) {
        return '0x' + byteOffset.toString(16).toUpperCase().padStart(5, '0');
    }

    function _fmtSize(kb) {
        return kb >= 1024 ? (kb / 1024) + ' MB' : kb + ' KB';
    }

    function renderPartitionLayout() {
        const flash_kb = state.flash_size_kb;
        const app_kb   = state.app_size_kb;
        const maxApp   = _maxAppSizeKb(flash_kb);
        const valid    = app_kb >= 256 && app_kb <= maxApp && app_kb % 64 === 0;

        // Compute offsets
        const nvs_off     = 0x9000;
        const phy_off     = 0xF000;
        const ota0_off    = 0x10000;
        const ota1_off    = ota0_off + app_kb * 1024;
        const otadata_off = ota1_off + app_kb * 1024;
        const l1_off      = otadata_off + 8 * 1024;
        const l2_off      = l1_off + 64 * 1024;
        const l3_off      = l2_off + 64 * 1024;
        const log_off     = l3_off + 64 * 1024;
        const log_kb      = flash_kb - Math.round(log_off / 1024);  // uses all remaining flash
        const end_off     = flash_kb * 1024;  // pds_log fills to end of flash
        const used_kb     = flash_kb;         // 0 free
        const free_kb     = 0;

        const rows = [
            { name: 'nvs',      off: nvs_off,     kb: 24,    desc: 'WiFi creds / usrset',  editable: false },
            { name: 'phy_init', off: phy_off,     kb: 4,     desc: 'RF calibration',       editable: false },
            { name: 'ota_0',    off: ota0_off,    kb: app_kb, desc: 'App slot A',          editable: true  },
            { name: 'ota_1',    off: ota1_off,    kb: app_kb, desc: 'App slot B',          editable: false },
            { name: 'otadata',  off: otadata_off, kb: 8,     desc: 'Boot slot selector',   editable: false },
            { name: 'pds_l1',   off: l1_off,      kb: 64,    desc: 'L1 pipeline stream',   editable: false },
            { name: 'pds_l2',   off: l2_off,      kb: 64,    desc: 'L2 hw_vars blobs',     editable: false },
            { name: 'pds_l3',   off: l3_off,      kb: 64,    desc: 'L3 settings blobs',    editable: false },
            { name: 'pds_log',  off: log_off,      kb: log_kb, desc: 'Diagnostic log ring (remainder)', editable: false },
        ];

        const flashOptions = [1024, 2048, 4096, 8192, 16384];
        let selHtml = '<select id="part-flash-sel" onchange="onFlashSizeChange(this.value)">';
        flashOptions.forEach(f => {
            const sel = f === flash_kb ? ' selected' : '';
            selHtml += '<option value="' + f + '"' + sel + '>' + _fmtSize(f) + '</option>';
        });
        selHtml += '</select>';

        let tbl = '<div class="part-ctrl">' +
            '<label>Flash</label>' + selHtml +
            '</div>';

        tbl += '<table class="part-tbl"><thead><tr>' +
            '<th>Partition</th><th>Offset</th><th>Size</th><th>Purpose</th>' +
            '</tr></thead><tbody>';

        rows.forEach(r => {
            const rowClass = r.editable ? 'part-editable' : 'part-fixed';
            const sizeCell = r.editable
                ? '<input class="part-size-input" type="number" id="part-app-size" ' +
                  'min="256" max="' + maxApp + '" step="64" value="' + r.kb + '" ' +
                  'onchange="onAppSizeChange(this.value)" ' +
                  'title="Must be a multiple of 64 KB (min 256 KB, max ' + maxApp + ' KB)"> KB'
                : '<span class="part-offset">' + _fmtSize(r.kb) + '</span>';
            tbl += '<tr class="' + rowClass + '">' +
                '<td>' + r.name + '</td>' +
                '<td class="part-offset">' + _fmtOffset(r.off) + '</td>' +
                '<td>' + sizeCell + '</td>' +
                '<td class="part-desc">' + r.desc + '</td>' +
                '</tr>';
        });

        tbl += '</tbody></table>';
        const overClass = free_kb < 0 ? ' over' : '';
        tbl += '<div class="part-footer' + overClass + '">' +
            '<span>Used: ' + used_kb + ' KB / ' + flash_kb + ' KB</span>' +
            '<span>' + (free_kb >= 0 ? free_kb + ' KB free' : Math.abs(free_kb) + ' KB OVER') + '</span>' +
            '</div>';

        // System preferences row
        tbl += '<div class="part-ctrl" style="margin-top:8px; border-top:1px solid var(--vscode-panel-border); padding-top:6px;">' +
            '<label style="font-weight:600; color:var(--vscode-foreground);">System Prefs</label>' +
            '</div>';
        tbl += '<div class="part-ctrl">' +
            '<label title="UTC offset in minutes. e.g. -300 = UTC-5, 330 = UTC+5:30">UTC Offset (min)</label>' +
            '<input type="number" id="sys-tz-offset" min="-840" max="840" step="1" ' +
            'value="' + state.system_prefs.tz_offset_min + '" ' +
            'style="width:70px;" ' +
            'onchange="onTzOffsetChange(this.value)" ' +
            'title="UTC offset in minutes (e.g. -300 = UTC-5, 330 = UTC+5:30)"> min' +
            '</div>';

        document.getElementById('partition-layout-content').innerHTML = tbl;
    }

    function onTzOffsetChange(val) {
        state.system_prefs.tz_offset_min = parseInt(val, 10) || 0;
    }

    function onFlashSizeChange(val) {
        state.flash_size_kb = parseInt(val, 10);
        // Clamp app size to new max
        const max = _maxAppSizeKb(state.flash_size_kb);
        if (state.app_size_kb > max) state.app_size_kb = max;
        renderPartitionLayout();
    }

    function onAppSizeChange(val) {
        let kb = parseInt(val, 10) || 256;
        kb = _snapTo64(kb);
        const max = _maxAppSizeKb(state.flash_size_kb);
        kb = Math.min(kb, max);
        state.app_size_kb = kb;
        // Update the input to reflect snapped value
        const inp = document.getElementById('part-app-size');
        if (inp) inp.value = kb;
        renderPartitionLayout();
    }

    // ── Variable Registry Rendering (left sidebar) ──
    const userVisibleModules = [];  // All modules are infrastructure — none are user-toggleable
    function renderVariableRegistry() {
        const wrapper = document.getElementById('var-registry-wrapper');
        const enabledMods = Object.entries(state.modules).filter(([name, m]) => m.enabled && userVisibleModules.includes(name));

        if (enabledMods.length === 0) {
            wrapper.innerHTML = '<div style="padding:12px; color:var(--vscode-descriptionForeground); font-size:11px; text-align:center;">Enable modules to see variables</div>';
            return;
        }

        let html = '';
        enabledMods.forEach(([modName, modState]) => {
            const vars = state.variables[modName] || [];
            if (vars.length === 0) return;

            html += '<div class="var-group-title">' + modName.replace('pds_', '') + '</div>';
            vars.forEach((v, vi) => {
                const isRemote = !v.name.startsWith('_');
                const badge = isRemote
                    ? '<span class="var-remote-badge">BLE/WiFi</span>'
                    : '<span class="var-const-badge">CONST</span>';
                html += '<div class="var-row">' +
                    '<span class="var-name" title="' + (v.description || v.name) + '">' + v.name + '</span>' +
                    '<span class="var-type">' + v.type + '</span>' +
                    badge + '</div>';
            });
        });
        wrapper.innerHTML = html || '<div style="padding:12px; color:var(--vscode-descriptionForeground); font-size:11px; text-align:center;">No variables</div>';
    }

    // toggleVarRemote removed — remote access is now derived from the _ prefix
    // convention in role-data.js. No runtime toggle needed.

    // ── Module Cards Rendering (main panel) ──
    function renderModuleCards() {
        const container = document.getElementById('modules-container');
        if (!state.target) {
            container.innerHTML = '<div class="placeholder">Select a target to begin adding function modules.</div>';
            return;
        }

        // All PDS modules are infrastructure (always compiled) — none are user-toggleable.
        // pds_storage is required by the template (pds_usrset_init, pds_usrset_load_nvs).
        // pds_telemetry and pds_control no longer exist; see pds_network and pds_pipeline.
        const visibleModules = [];

        // Initialize module state from allModules if not already
        allModules.forEach(m => {
            if (!state.modules[m.name]) {
                state.modules[m.name] = {
                    enabled: m.locked || !visibleModules.includes(m.name),
                    locked: m.locked || !visibleModules.includes(m.name),
                    headers: {},
                };
                // Init default vars
                if (defaultVars[m.name]) {
                    state.variables[m.name] = JSON.parse(JSON.stringify(defaultVars[m.name]));
                }
            }
        });

        let html = '';
        allModules.filter(m => visibleModules.includes(m.name)).forEach(m => {
            const ms = state.modules[m.name];
            const isCollapsed = !ms.enabled && !ms.locked;
            const disabledClass = (!ms.enabled && !ms.locked) ? ' disabled' : '';
            const collapsedClass = isCollapsed ? ' collapsed' : '';

            html += '<div class="func-card' + disabledClass + collapsedClass + '" id="card-' + m.name + '">';

            // Header
            html += '<div class="func-card-header" onclick="toggleCard(\'' + m.name + '\')">';
            html += '<input type="checkbox" ' + (ms.enabled ? 'checked' : '') + (ms.locked ? ' disabled' : '') +
                ' onclick="event.stopPropagation(); toggleModule(\'' + m.name + '\', this.checked)" />';
            html += '<span class="func-card-title">' + m.name + '</span>';
            if (ms.locked) html += '<span class="func-card-locked">REQUIRED</span>';
            html += '<span class="func-card-chevron">▾</span>';
            html += '</div>';

            // Body
            html += '<div class="func-card-body">';

            if (ms.enabled && m.headers.length > 0) {
                m.headers.forEach((h, hi) => {
                    const hState = ms.headers[h] || [];
                    const hReqs = [];
                    const hasInstances = false;

                    // Header checkbox
                    html += '<div class="header-block" data-hue="' + (hi % 8) + '">';
                    html += '<label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:500; cursor:pointer;">';
                    html += '<input type="checkbox" ' + (hState.length > 0 ? 'checked' : '') +
                        ' onchange="toggleHeader(\'' + m.name + '\', \'' + h + '\', this.checked)" />';
                    html += h;
                    html += '</label>';

                    // Instances for this header
                    if (hState.length > 0 && hasInstances) {
                        hState.forEach((inst, ii) => {
                            html += '<div class="instance-group">';
                            html += '<div class="instance-header">';
                            html += '<span class="instance-label">' + h.replace('.h','') + ' #' + (ii+1) + '</span>';
                            if (hState.length > 1) {
                                html += '<button class="instance-remove" onclick="removeInstance(\'' + m.name + '\', \'' + h + '\', ' + ii + ')" title="Remove instance">✕</button>';
                            }
                            html += '</div>';

                            // Pin slots for this instance
                            inst.pins.forEach((p, pi) => {
                                html += renderPinSlot(m.name, h, ii, pi, p);
                                // ADC scaling fields
                                if (p.scaling) {
                                    html += renderAdcScaling(m.name, h, ii, pi, p);
                                }
                            });

                            html += '</div>';  // instance-group
                        });

                        // Add instance button
                        html += '<button class="add-instance-btn" onclick="addInstance(\'' + m.name + '\', \'' + h + '\')">+ Add ' + h.replace('.h','') + ' instance</button>';
                    }

                    html += '</div>';
                });

                // Module-level variables
                const vars = state.variables[m.name] || [];
                if (vars.length > 0) {
                    html += '<div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--vscode-panel-border);">';
                    html += '<div style="font-size:11px; font-weight:600; color:var(--vscode-descriptionForeground); margin-bottom:4px;">Variables</div>';
                    vars.forEach((v, vi) => {
                        html += '<div class="instance-var">';
                        html += '<label>' + v.name + '</label>';
                        html += '<input type="' + (v.type.startsWith('string') ? 'text' : 'number') + '" value="' + v.default + '"' +
                            ' onchange="updateVarDefault(\'' + m.name + '\', ' + vi + ', this.value)" />';
                        html += '<span class="var-type-badge">' + v.type + '</span>';
                        html += '</div>';
                    });
                    html += '</div>';
                }
            } else if (ms.enabled) {
                html += '<div style="font-size:11px; color:var(--vscode-descriptionForeground);">No configurable headers</div>';
            }

            html += '</div>';  // func-card-body
            html += '</div>';  // func-card
        });

        container.innerHTML = html;
    }

    // (old renderComponentCards removed — replaced by renderPipelineCards below)

    function _legacyRenderCompCards_unused() {
        const container = document.getElementById('components-container');
        if (!state.target) {
            container.innerHTML = '';
            return;
        }

        // Initialize component state
        Object.keys(components).forEach(cid => {
            if (!state.components[cid]) {
                state.components[cid] = { enabled: false, instances: [] };
            }
        });

        let html = '';
        let hueIdx = 0;
        Object.entries(components).forEach(([cid, comp]) => {
            const cs = state.components[cid];
            const disabledClass = !cs.enabled ? ' disabled' : '';
            const collapsedClass = (cs.collapsed !== false) ? ' collapsed' : '';

            html += '<div class="func-card' + disabledClass + collapsedClass + '" id="comp-' + cid + '">';

            // Component header
            html += '<div class="func-card-header" data-hue="' + (hueIdx % 8) + '" onclick="toggleCompCard(\'' + cid + '\')">';
            html += '<input type="checkbox" ' + (cs.enabled ? 'checked' : '') +
                ' onclick="event.stopPropagation(); toggleComponent(\'' + cid + '\', this.checked)" />';
            html += '<span class="func-card-title">' + comp.label + '</span>';
            html += '<span style="font-size:10px; color:var(--vscode-descriptionForeground); margin-left:auto;">' + comp.hal_deps.join(', ') + '</span>';
            html += '<span class="func-card-chevron">▾</span>';
            html += '</div>';

            // Component body
            html += '<div class="func-card-body">';
            if (cs.enabled) {
                html += '<div style="font-size:11px; color:var(--vscode-descriptionForeground); margin-bottom:6px;">' + comp.description + '</div>';

                // Instances
                if (cs.instances.length > 0) {
                    cs.instances.forEach((inst, ii) => {
                        const displayName = inst.alias || (comp.label + ' #' + (ii + 1));
                        html += '<div class="instance-group" data-hue="' + (hueIdx % 8) + '">';
                        html += '<div class="instance-header">';
                        html += '<input type="text" class="instance-alias" value="' + (inst.alias || '') + '"' +
                            ' placeholder="' + comp.label + ' #' + (ii + 1) + '"' +
                            ' onchange="updateCompAlias(\'' + cid + '\', ' + ii + ', this.value)"' +
                            ' title="Custom alias for this instance" />';
                        if (cs.instances.length > 1) {
                            html += '<button class="instance-remove" onclick="removeCompInstance(\'' + cid + '\', ' + ii + ')" title="Remove instance">✕</button>';
                        }
                        html += '</div>';

                        // Pin slots
                        comp.pins.forEach((pdef, pi) => {
                            html += renderCompPinSlot(cid, ii, pi, pdef, inst.pins[pdef.pin_id]);
                        });

                        // Settings fields
                        html += '<div style="margin-top:6px; border-top:1px solid var(--vscode-panel-border); padding-top:6px;">';
                        html += '<div style="font-size:10px; font-weight:600; color:var(--vscode-descriptionForeground); margin-bottom:4px;">SETTINGS</div>';
                        comp.settings.forEach(sdef => {
                            const val = inst.settings[sdef.name] !== undefined ? inst.settings[sdef.name] : sdef.default;
                            html += '<div class="instance-var">';
                            html += '<label title="' + sdef.description + '">' + sdef.name + '</label>';

                            if (sdef.type.startsWith('enum:')) {
                                const opts = sdef.type.substring(5).split(',');
                                html += '<select onchange="updateCompSetting(\'' + cid + '\', ' + ii + ', \'' + sdef.name + '\', this.value)">';
                                opts.forEach(o => {
                                    const sep = o.indexOf('=');
                                    const optVal   = sep >= 0 ? o.substring(0, sep) : o;
                                    const optLabel = sep >= 0 ? o.substring(sep + 1) : o;
                                    const selected = String(val) === optVal ? ' selected' : '';
                                    html += '<option value="' + optVal + '"' + selected + '>' + optLabel + '</option>';
                                });
                                html += '</select>';
                            } else if (sdef.type === 'bool') {
                                html += '<input type="checkbox" ' + (val ? 'checked' : '') +
                                    ' onchange="updateCompSetting(\'' + cid + '\', ' + ii + ', \'' + sdef.name + '\', this.checked)" />';
                            } else {
                                html += '<input type="number" value="' + val + '"' +
                                    (sdef.type === 'float' ? ' step="0.01"' : '') +
                                    ' onchange="updateCompSetting(\'' + cid + '\', ' + ii + ', \'' + sdef.name + '\', this.value)" />';
                            }

                            html += '<span class="var-type-badge">' + sdef.type + '</span>';
                            if (!sdef.name.startsWith('_')) {
                                html += '<span title="BLE/WiFi accessible" style="font-size:9px; color:var(--vscode-charts-green);">📡</span>';
                            }
                            html += '</div>';
                        });
                        html += '</div>';

                        // Sub-components (e.g. dosing pumps inside a sensor)
                        if (comp.subcomponents) {
                            comp.subcomponents.forEach(sub => {
                                html += '<div class="subcomp-group" id="subcomp-' + cid + '-' + ii + '-' + sub.id + '">';
                                html += '<div class="subcomp-header" onclick="toggleSubcomp(\'' + cid + '\', ' + ii + ', \'' + sub.id + '\')">';
                                html += '<span class="subcomp-label">' + sub.label + '</span>';
                                html += '<span class="subcomp-chevron">▾</span>';
                                html += '</div>';
                                html += '<div class="subcomp-body">';

                                // Sub-component pin slots
                                const subShort = sub.short || sub.id;
                                sub.pins.forEach((pdef, pi) => {
                                    const labeledPdef = Object.assign({}, pdef, { label: displayName + ' \u2014 ' + subShort + ' \u2014 ' + pdef.label });
                                    html += renderCompPinSlot(cid, ii, pi, labeledPdef, inst.pins[pdef.pin_id]);
                                });

                                // Sub-component settings
                                if (sub.settings.length > 0) {
                                    html += '<div style="margin-top:6px; border-top:1px solid var(--vscode-panel-border); padding-top:6px;">';
                                    html += '<div style="font-size:10px; font-weight:600; color:var(--vscode-descriptionForeground); margin-bottom:4px;">SETTINGS</div>';
                                    sub.settings.forEach(sdef => {
                                        const val = inst.settings[sdef.name] !== undefined ? inst.settings[sdef.name] : sdef.default;
                                        html += '<div class="instance-var">';
                                        html += '<label title="' + sdef.description + '">' + sdef.name + '</label>';

                                        if (sdef.type.startsWith('enum:')) {
                                            const opts = sdef.type.substring(5).split(',');
                                            html += '<select onchange="updateCompSetting(\'' + cid + '\', ' + ii + ', \'' + sdef.name + '\', this.value)">';
                                            opts.forEach(o => {
                                                const sep = o.indexOf('=');
                                                const optVal   = sep >= 0 ? o.substring(0, sep) : o;
                                                const optLabel = sep >= 0 ? o.substring(sep + 1) : o;
                                                const selected = String(val) === optVal ? ' selected' : '';
                                                html += '<option value="' + optVal + '"' + selected + '>' + optLabel + '</option>';
                                            });
                                            html += '</select>';
                                        } else if (sdef.type === 'bool') {
                                            html += '<input type="checkbox" ' + (val ? 'checked' : '') +
                                                ' onchange="updateCompSetting(\'' + cid + '\', ' + ii + ', \'' + sdef.name + '\', this.checked)" />';
                                        } else {
                                            html += '<input type="number" value="' + val + '"' +
                                                (sdef.type === 'float' ? ' step="0.01"' : '') +
                                                ' onchange="updateCompSetting(\'' + cid + '\', ' + ii + ', \'' + sdef.name + '\', this.value)" />';
                                        }

                                        html += '<span class="var-type-badge">' + sdef.type + '</span>';
                                        if (!sdef.name.startsWith('_')) {
                                            html += '<span title="BLE/WiFi accessible" style="font-size:9px; color:var(--vscode-charts-green);">📡</span>';
                                        }
                                        html += '</div>';
                                    });
                                    html += '</div>';
                                }

                                html += '</div>';  // subcomp-body
                                html += '</div>';  // subcomp-group
                            });
                        }

                        html += '</div>';  // instance-group
                    });
                } else {
                    html += '<div style="font-size:11px; color:var(--vscode-descriptionForeground);">No instances — click "Add" to create one.</div>';
                }

                // Add instance button
                html += '<button class="add-instance-btn" onclick="addCompInstance(\'' + cid + '\')">+ Add ' + comp.label + '</button>';
            }
            html += '</div>';  // func-card-body
            html += '</div>';  // func-card
            hueIdx++;
        });

        container.innerHTML = html;
    }

    // ── Pipeline Cards Rendering ─────────────────────────────────────────────
    // Build a <select> of GPIO pins filtered by capability, for use in block settings.
    function renderPinSelectHtml(pi, bi, sdefName, pinCap, val, onchangeExpr) {
        const capData = pinCaps[state.board];
        const isPeriphRef = typeof val === 'string' && val.startsWith('periph:');
        const numVal = isPeriphRef ? -1 : parseInt(val);
        // onChange passes this.value raw — updateBlockSetting handles periph: strings vs integers
        const onChange = onchangeExpr || ('updateBlockSetting(' + pi + ',' + bi + ',\'' + sdefName + '\',this.value)');
        if (!capData) {
            return '<input type="text" value="' + escapeHtml(String(val)) + '" style="min-width:60px;max-width:120px;"' +
                ' onchange="' + onChange + '" />';
        }
        const capUpper = pinCap.toUpperCase();
        const filtered = capData.pins.filter(p => !p.reserved && p.caps.some(c => {
            const cu = c.toUpperCase();
            return cu === capUpper || (capUpper === 'ADC' && (cu === 'ADC-1' || cu === 'ADC-2'));
        }));
        let s = '<select class="pin-cap-select" onchange="' + onChange + '">';
        s += '<option value="-1"' + (!isPeriphRef && numVal === -1 ? ' selected' : '') + '>— none —</option>';
        filtered.forEach(p => {
            const label = 'GPIO' + p.gpio +
                (p.jpin ? ' \xb7 ' + p.jpin : '') +
                (p.name ? ' \xb7 ' + p.name : '');
            s += '<option value="' + p.gpio + '"' + (!isPeriphRef && numVal === p.gpio ? ' selected' : '') + '>' + label + '</option>';
        });
        // Peripheral signal options — signals from peripherals whose provides_cap matches this pin_cap
        let periphOpts = '';
        state.peripherals.forEach(periph => {
            const ptype = peripheralTypes.find(pt => pt.id === periph.type);
            if (!ptype) return;
            (ptype.signals || []).forEach(sig => {
                if (!sig.provides_cap || sig.provides_cap.toUpperCase() !== capUpper) return;
                const ref = 'periph:' + periph.id + ':' + sig.name;
                const optLabel = (periph.alias || ptype.label) + ' \xb7 ' + sig.name;
                periphOpts += '<option value="' + escapeHtml(ref) + '"' + (isPeriphRef && val === ref ? ' selected' : '') + '>' +
                    escapeHtml(optLabel) + '</option>';
            });
        });
        if (periphOpts) {
            s += '<optgroup label="\u2500 Peripheral Signals \u2500">' + periphOpts + '</optgroup>';
        }
        s += '</select>';
        return s;
    }

    function renderPipelineCards() {
        const container = document.getElementById('pipelines-container');
        if (!state.target) { container.innerHTML = ''; return; }
        // Delegate specialised tabs to their own renderers
        if (activePipelineTab === 'output') { renderOutputGroups(); return; }
        if (activePipelineTab === 'input')  { renderInputCards();   return; }
        if (activePipelineTab === 'timer')  { renderTimerDefs();    return; }
        // Update add button label to match active tab
        const addBtn = document.getElementById('btn-add-pipeline');
        if (addBtn) {
            if (activePipelineTab === 'routine') addBtn.textContent = '+ Add Routine';
            else addBtn.textContent = '+ Add Pipeline';
        }
        // Filter to current tab (keep real state index pi for onclick handlers)
        const visible = state.pipelines
            .map((pl, pi) => ({ pl, pi }))
            .filter(({ pl }) => (pl.kind || 'pipeline') === activePipelineTab);
        if (visible.length === 0) {
            const thing = activePipelineTab === 'routine' ? 'routines' : 'pipelines';
            container.innerHTML = '<div class="placeholder" style="padding:20px; margin-bottom:0;">No ' + thing + ' yet \u2014 click the button below to create one, or drag a Prefab from the right panel.</div>';
            return;
        }
        let html = '';
        visible.forEach(({ pl, pi }, visIdx) => {
            const isSelected = selectedPipelineIdx === pi;
            html += '<div class="pipeline-card' + (pl.collapsed ? ' collapsed' : '') + (isSelected ? ' selected-pipeline' : '') + '" id="pipeline-' + pi + '" draggable="true" data-pipeline-idx="' + pi + '">';
            // Header — blank area click selects + toggles collapse; each interactive child stops propagation
            html += '<div class="pipeline-card-header" onclick="selectPipeline(' + pi + '); togglePipelineCollapse(' + pi + ');">';
            html += '<span class="pipeline-drag-handle" title="Drag to reorder" onclick="event.stopPropagation()" onmousedown="event.stopPropagation(); _pipelineDragAllowed=true;" onmouseup="_pipelineDragAllowed=false;">' +
                '<span class="pipeline-drag-handle-icon">⠿</span>' +
                '<span class="pipeline-drag-label">' + (visIdx + 1) + '</span>' +
                '</span>';
            html += '<input type="text" class="pipeline-name-input" value="' + escapeHtml(pl.name) + '" ' +
                'placeholder="Pipeline ' + (visIdx + 1) + '" ' +
                'maxlength="32" ' +
                'onclick="event.stopPropagation()" ' +
                'onchange="renamePipeline(' + pi + ', this.value)" />';
            html += '<label class="pipeline-enable-label" onclick="event.stopPropagation()">' +
                '<input type="checkbox" ' + (pl.enabled ? 'checked' : '') + ' title="Enable pipeline" ' +
                'onclick="event.stopPropagation(); togglePipelineEnabled(' + pi + ', this.checked)" />' +
                'Enable</label>';
            html += '<span style="flex:1"></span>';
            html += '<button class="pipeline-save-prefab-btn" onclick="event.stopPropagation(); saveAsPrefab(' + pi + ')" title="Save as prefab">☆</button>';
            html += '<button class="instance-remove" onclick="event.stopPropagation(); removePipeline(' + pi + ')" title="Remove" style="margin-left:2px;">✕</button>';
            html += '</div>'; // pipeline-card-header

            // Body
            html += '<div class="pipeline-body">';
            if (pl.blocks.length === 0) {
                html += '<div style="font-size:11px; color:var(--vscode-descriptionForeground); padding:4px 0 6px;">No blocks — add from the palette →</div>';
            } else {
                html += '<div class="pipeline-blocks-list">';
                pl.blocks.forEach((blk, bi) => {
                    const fbDef = fbBlocks.find(f => f.id === blk.blockType);
                    const cat   = fbDef ? fbDef.category : 'utility';
                    const label = fbDef ? fbDef.label : blk.blockType;
                    // block-row — badge / blank area click toggles detail; alias input and buttons stop propagation
                    html += '<div class="block-row' + (blk.expanded ? ' blk-expanded' : '') + '" draggable="true" data-pipeline-idx="' + pi + '" data-block-idx="' + bi + '" onclick="toggleBlockDetail(' + pi + ', ' + bi + ')" style="cursor:pointer;">';
                    html += '<span class="block-drag-handle" title="Drag to reorder" onclick="event.stopPropagation()" onmousedown="event.stopPropagation(); _blockDragAllowed=true;" onmouseup="_blockDragAllowed=false;"><span class="block-drag-handle-icon">&#x2807;</span></span>';
                    html += '<span class="block-type-badge cat-' + cat + '">' + label + '</span>';
                    // pipeline_suspend / pipeline_resume: alias is auto-derived from the target pipeline name
                    const isPipelineCtrl = (blk.blockType === 'pipeline_suspend' || blk.blockType === 'pipeline_resume');
                    const isDht22Block   = (blk.blockType === 'sensor_dht22_temp' || blk.blockType === 'sensor_dht22_humid');
                    if (isPipelineCtrl) {
                        const pid   = blk.settings && blk.settings.pipeline_id;
                        const tPl   = pid ? state.pipelines.find(p => p.id === pid) : state.pipelines[0];
                        const tName = tPl ? tPl.name : (pid ? 'Unknown' : 'None');
                        const prefix = blk.blockType === 'pipeline_suspend' ? 'Suspend: ' : 'Resume: ';
                        const autoAlias = prefix + tName;
                        if (blk.alias !== autoAlias) { blk.alias = autoAlias; }
                        html += '<input type="text" class="block-alias-input" value="' + escapeHtml(autoAlias) + '" ' +
                            'readonly style="opacity:0.65;cursor:default;" ' +
                            'onclick="event.stopPropagation()" />';
                    } else if (isDht22Block) {
                        const pid = blk.settings && blk.settings.peripheral_id;
                        const periph = pid ? state.peripherals.find(p => p.id === pid) : null;
                        const periphAlias = periph ? (periph.alias || 'DHT22') : null;
                        const sigLabel = blk.blockType === 'sensor_dht22_temp' ? 'Temp' : 'Humid';
                        const autoAlias = periphAlias ? periphAlias + ' ' + sigLabel : label;
                        if (periphAlias && blk.alias !== autoAlias) { blk.alias = autoAlias; }
                        html += '<input type="text" class="block-alias-input" value="' + escapeHtml(blk.alias || '') + '" ' +
                            'placeholder="' + escapeHtml(label + ' ' + (bi + 1)) + '" ' +
                            'onclick="event.stopPropagation()" ' +
                            'oninput="renameBlock(' + pi + ', ' + bi + ', this.value)" />';
                    } else {
                        html += '<input type="text" class="block-alias-input" value="' + escapeHtml(blk.alias) + '" ' +
                            'placeholder="' + escapeHtml(label + ' ' + (bi + 1)) + '" ' +
                            'onclick="event.stopPropagation()" ' +
                            'oninput="renameBlock(' + pi + ', ' + bi + ', this.value)" />';
                    }
                    html += '<button class="block-settings-btn' + (blk.expanded ? ' active' : '') + '" onclick="event.stopPropagation(); toggleBlockDetail(' + pi + ', ' + bi + ')" title="Toggle settings">Settings</button>';
                    html += '<button class="block-remove-btn" onclick="event.stopPropagation(); removeBlockFromPipeline(' + pi + ', ' + bi + ')" title="Remove">✕</button>';
                    html += '</div>'; // block-row
                    if (blk.expanded && fbDef) {
                        html += '<div class="block-detail">';
                        fbDef.settings.forEach(sdef => {
                            if (/active_low|active_high/.test(sdef.name)) return; // polarity set on inputs/outputs tab
                            if (blk.blockType === 'gpio_input' && sdef.name === 'debounce_ms') return; // debounce set on Inputs tab
                            const val = blk.settings[sdef.name] !== undefined ? blk.settings[sdef.name] : sdef.default;
                            html += '<div class="instance-var">';
                            html += '<label title="' + escapeHtml(sdef.description) + '">' + (blk.blockType === 'gpio_input' && sdef.pin_cap ? 'input_ref' : sdef.name) + '</label>';
                            if (blk.blockType === 'gpio_input' && sdef.pin_cap) {
                                const giCurRef = blk.settings['input_ref'] || '';
                                const giInputs = [];
                                (state.pipelines || []).forEach(function(pl) {
                                    if ((pl.kind || 'pipeline') !== 'sensor') return;
                                    (pl.blocks || []).forEach(function(b, bIdx) {
                                        if (b.blockType === 'gpio_input') giInputs.push({ pl: pl, b: b, bIdx: bIdx });
                                    });
                                });
                                html += '<select onchange="updateBlockSetting(' + pi + ',' + bi + ',\'input_ref\',this.value)">';
                                html += '<option value="">— none —</option>';
                                giInputs.forEach(function(item) {
                                    const id = item.pl.id + ':' + item.bIdx;
                                    const lbl = escapeHtml(item.pl.name + ' › ' + (item.b.alias || 'GPIO Input'));
                                    html += '<option value="' + escapeHtml(id) + '"' + (giCurRef === id ? ' selected' : '') + '>' + lbl + '</option>';
                                });
                                if (!giInputs.length) html += '<option value="" disabled style="color:var(--vscode-errorForeground);">No GPIO Input blocks — add gpio_input blocks in Inputs tab</option>';
                                html += '</select>';
                            } else if (sdef.pin_cap) {
                                html += renderPinSelectHtml(pi, bi, sdef.name, sdef.pin_cap, val);
                            } else if (sdef.type.startsWith('enum:')) {
                                const opts = sdef.type.substring(5).split(',');
                                html += '<select onchange="updateBlockSetting(' + pi + ',' + bi + ',\'' + sdef.name + '\',this.value)">';
                                opts.forEach(o => { html += '<option value="' + o + '"' + (val === o ? ' selected' : '') + '>' + o + '</option>'; });
                                html += '</select>';
                            } else if (sdef.type === 'bool') {
                                html += '<input type="checkbox" ' + (val ? 'checked' : '') +
                                    ' onchange="updateBlockSetting(' + pi + ',' + bi + ',\'' + sdef.name + '\',this.checked)" />';
                            } else if (sdef.name === 'pipeline_index') {
                                // pipeline_index is resolved at encode time; editor uses pipeline_id for stable reference
                                const curId = blk.settings.pipeline_id || '';
                                html += '<select onchange="updateBlockSetting(' + pi + ',' + bi + ',\'pipeline_id\',this.value)">';
                                if (state.pipelines.length) {
                                    state.pipelines.forEach((pl, pIdx) => {
                                        html += '<option value="' + escapeHtml(pl.id || '') + '"' + (curId === (pl.id || '') ? ' selected' : '') + '>[' + pIdx + '] ' + escapeHtml(pl.name) + '</option>';
                                    });
                                } else {
                                    html += '<option value="">— no pipelines —</option>';
                                }
                                html += '</select>';
                            } else if (sdef.type.startsWith('periph_ref:')) {
                                const reqType = sdef.type.slice(11); // e.g. 'dht22'
                                const curPid  = blk.settings[sdef.name] || '';
                                const matching = state.peripherals.filter(p => p.type === reqType);
                                html += '<select onchange="updateBlockSetting(' + pi + ',' + bi + ',\'' + sdef.name + '\',this.value)">';
                                html += '<option value="">— none —</option>';
                                matching.forEach(p => {
                                    const lbl = escapeHtml(p.alias || p.type);
                                    html += '<option value="' + escapeHtml(p.id) + '"' + (curPid === p.id ? ' selected' : '') + '>' + lbl + '</option>';
                                });
                                if (!matching.length) {
                                    html += '<option value="" disabled style="color:var(--vscode-errorForeground);">No ' + reqType + ' peripherals defined</option>';
                                }
                                html += '</select>';
                            } else if (sdef.type === 'sensor_ref') {
                                const curRef = blk.settings[sdef.name] || '';
                                const sensorPls = state.pipelines.filter(p => (p.kind || 'pipeline') === 'sensor');
                                html += '<select onchange="updateBlockSetting(' + pi + ',' + bi + ',\'' + sdef.name + '\',this.value)">';
                                html += '<option value="">— none —</option>';
                                sensorPls.forEach(sp => {
                                    sp.blocks.forEach((sb, sbi) => {
                                        const sbDef = fbBlocks.find(f => f.id === sb.blockType);
                                        if (!sbDef || !sbDef.ports_out || !sbDef.ports_out.length) return;
                                        sbDef.ports_out.forEach((outDef, outIdx) => {
                                            const v = sp.id + ':' + sbi + ':' + outIdx;
                                            const lbl = escapeHtml('[' + sp.name + '] ' + (sb.alias || sbDef.label) + ' \u2192 ' + outDef.name);
                                            html += '<option value="' + v + '"' + (curRef === v ? ' selected' : '') + '>' + lbl + '</option>';
                                        });
                                    });
                                });
                                if (!sensorPls.length) html += '<option value="" disabled style="color:var(--vscode-errorForeground);">No Sensor pipelines defined</option>';
                                html += '</select>';
                            } else if (sdef.type === 'control_point') {
                                const curRef = blk.settings[sdef.name] || '';
                                html += '<select onchange="updateBlockSetting(' + pi + ',' + bi + ',\'' + sdef.name + '\',this.value)">';
                                html += '<option value="">— none —</option>';
                                let cpCount = 0;
                                state.pipelines.forEach((tpl, tpIdx) => {
                                    (tpl.blocks || []).forEach((tb, tbi) => {
                                        if (tpIdx === pi && tbi === bi) return; // skip self
                                        const tbDef = fbBlocks.find(f => f.id === tb.blockType);
                                        if (!tbDef || !tbDef.settings) return;
                                        tbDef.settings.forEach(fdef => {
                                            if (fdef.type !== 'float') return;
                                            const v = tpl.id + ':' + tbi + ':' + fdef.name;
                                            const lbl = escapeHtml('[' + tpl.name + '] ' + (tb.alias || tbDef.label) + ' \u2192 ' + fdef.name);
                                            html += '<option value="' + escapeHtml(v) + '"' + (curRef === v ? ' selected' : '') + '>' + lbl + '</option>';
                                            cpCount++;
                                        });
                                    });
                                });
                                if (!cpCount) html += '<option value="" disabled style="color:var(--vscode-errorForeground);">No settable float fields found</option>';
                                html += '</select>';
                            } else if (sdef.type === 'output_ref') {
                                const curRef = blk.settings[sdef.name] || '';
                                const allOutPins = (state.output_groups || []).flatMap(g => g.pins || []);
                                html += '<select onchange="updateBlockSetting(' + pi + ',' + bi + ',\'' + sdef.name + '\',this.value)">';
                                html += '<option value="">— select output pin —</option>';
                                allOutPins.forEach(op => {
                                    const lbl = escapeHtml((op.label || op.id) + ' (GPIO' + op.gpio + ')');
                                    html += '<option value="' + escapeHtml(op.id) + '"' + (curRef === op.id ? ' selected' : '') + '>' + lbl + '</option>';
                                });
                                if (!allOutPins.length) html += '<option value="" disabled style="color:var(--vscode-errorForeground);">No Output Pins defined \u2014 add in Outputs tab</option>';
                                html += '</select>';
                            } else if (sdef.type === 'gpio_output_ref') {
                                const curRef = blk.settings[sdef.name] || '';
                                const gpioPins = [];
                                (state.output_groups || []).forEach(g => { (g.pins || []).filter(p => p.type === 'gpio').forEach(p => gpioPins.push({ op: p, gName: g.name })); });
                                html += '<select onchange="updateBlockSetting(' + pi + ',' + bi + ',\'' + sdef.name + '\',this.value)">';
                                html += '<option value="">\u2014 select GPIO output \u2014</option>';
                                gpioPins.forEach(({ op, gName }) => {
                                    const lbl = escapeHtml(gName + ' \u203a ' + (op.label || op.id) + ' (GPIO' + op.gpio + ')');
                                    html += '<option value="' + escapeHtml(op.id) + '"' + (curRef === op.id ? ' selected' : '') + '>' + lbl + '</option>';
                                });
                                if (!gpioPins.length) html += '<option value="" disabled style="color:var(--vscode-errorForeground);">No GPIO output pins \u2014 add gpio type pins in Outputs tab</option>';
                                html += '</select>';
                            } else if (sdef.type === 'gpio_input_ref') {
                                const curRef = blk.settings[sdef.name] || '';
                                const gpioInputs = [];
                                (state.pipelines || []).forEach(function(pl) {
                                    if ((pl.kind || 'pipeline') !== 'sensor') return;
                                    (pl.blocks || []).forEach(function(b, bIdx) {
                                        if (b.blockType === 'gpio_input') gpioInputs.push({ pl: pl, b: b, bIdx: bIdx });
                                    });
                                });
                                html += '<select onchange="updateBlockSetting(' + pi + ',' + bi + ',\'' + sdef.name + '\',this.value)">';
                                html += '<option value="">\u2014 none (pipeline trigger only) \u2014</option>';
                                gpioInputs.forEach(function(item) {
                                    const id = item.pl.id + ':' + item.bIdx;
                                    const lbl = escapeHtml(item.pl.name + ' \u203a ' + (item.b.alias || 'GPIO Input'));
                                    html += '<option value="' + escapeHtml(id) + '"' + (curRef === id ? ' selected' : '') + '>' + lbl + '</option>';
                                });
                                if (!gpioInputs.length) html += '<option value="" disabled style="color:var(--vscode-errorForeground);">No GPIO Input blocks \u2014 add gpio_input blocks in Inputs tab</option>';
                                html += '</select>';
                            } else {
                                html += '<input type="' + (sdef.type === 'float' || sdef.type.startsWith('uint') || sdef.type.startsWith('int') ? 'number' : 'text') + '" value="' + escapeHtml(String(val)) + '"' +
                                    (sdef.type === 'float' ? ' step="0.01"' : '') +
                                    ' onchange="updateBlockSetting(' + pi + ',' + bi + ',\'' + sdef.name + '\',this.value)" />';
                            }
                            html += '<span class="var-type-badge">' + (blk.blockType === 'gpio_input' && sdef.pin_cap ? 'gpio_input_ref' : sdef.pin_cap ? 'gpio:' + sdef.pin_cap.toLowerCase() : sdef.type) + '</span>';
                            html += '</div>';
                        });
                        html += '</div>'; // block-detail
                    }
                    // ── Inner pipeline + exit conditions (abortable_sub_pipeline only) ──
                    if (blk.blockType === 'abortable_sub_pipeline') {
                        const innerBlocks = blk.blocks || [];
                        const exitConds   = blk.exit_conditions || [];
                        html += '<div class="run-until-panel" onclick="event.stopPropagation()">';
                        html += '<div class="run-until-header">↺ Run Until — Inner Pipeline</div>';

                        // ── Inner blocks ──────────────────────────────────────────────────────────
                        if (innerBlocks.length > 0) {
                            html += '<div class="pipeline-blocks-list" style="margin-bottom:4px;">';
                            innerBlocks.forEach((iblk, ibi) => {
                                const ibDef   = fbBlocks.find(f => f.id === iblk.blockType);
                                const ibCat   = ibDef ? ibDef.category : 'utility';
                                const ibLabel = ibDef ? ibDef.label : iblk.blockType;
                                html += '<div class="block-row' + (iblk.expanded ? ' blk-expanded' : '') + '" ' +
                                    'onclick="toggleInnerBlockDetail(' + pi + ',' + bi + ',' + ibi + ')" style="cursor:pointer;">';
                                html += '<span class="block-type-badge cat-' + ibCat + '">' + ibLabel + '</span>';
                                html += '<input type="text" class="block-alias-input" value="' + escapeHtml(iblk.alias || '') + '" ' +
                                    'placeholder="' + escapeHtml(ibLabel + ' ' + (ibi + 1)) + '" ' +
                                    'onclick="event.stopPropagation()" ' +
                                    'oninput="renameInnerBlock(' + pi + ',' + bi + ',' + ibi + ',this.value)" />';
                                html += '<button class="block-settings-btn' + (iblk.expanded ? ' active' : '') + '" ' +
                                    'onclick="event.stopPropagation(); toggleInnerBlockDetail(' + pi + ',' + bi + ',' + ibi + ')">Settings</button>';
                                html += '<button class="block-remove-btn" ' +
                                    'onclick="event.stopPropagation(); removeInnerBlock(' + pi + ',' + bi + ',' + ibi + ')">✕</button>';
                                html += '</div>'; // block-row
                                if (iblk.expanded && ibDef) {
                                    html += '<div class="block-detail">';
                                    ibDef.settings.forEach(sdef => {
                                        if (sdef.name === 'active_low') return; // polarity set on inputs/outputs tab
                                        if (iblk.blockType === 'gpio_input' && sdef.name === 'debounce_ms') return; // debounce set on Inputs tab
                                        const sv = iblk.settings[sdef.name] !== undefined ? iblk.settings[sdef.name] : sdef.default;
                                        html += '<div class="instance-var">';
                                        html += '<label title="' + escapeHtml(sdef.description) + '">' + (iblk.blockType === 'gpio_input' && sdef.pin_cap ? 'input_ref' : sdef.name) + '</label>';
                                        if (iblk.blockType === 'gpio_input' && sdef.pin_cap) {
                                            const giCurRef2 = iblk.settings['input_ref'] || '';
                                            const giInputs2 = [];
                                            (state.pipelines || []).forEach(function(pl) {
                                                if ((pl.kind || 'pipeline') !== 'sensor') return;
                                                (pl.blocks || []).forEach(function(b, bIdx) {
                                                    if (b.blockType === 'gpio_input') giInputs2.push({ pl: pl, b: b, bIdx: bIdx });
                                                });
                                            });
                                            html += '<select onchange="updateInnerBlockSetting(' + pi + ',' + bi + ',' + ibi + ',\'input_ref\',this.value)">';
                                            html += '<option value="">— none —</option>';
                                            giInputs2.forEach(function(item) {
                                                const id = item.pl.id + ':' + item.bIdx;
                                                const lbl = escapeHtml(item.pl.name + ' › ' + (item.b.alias || 'GPIO Input'));
                                                html += '<option value="' + escapeHtml(id) + '"' + (giCurRef2 === id ? ' selected' : '') + '>' + lbl + '</option>';
                                            });
                                            if (!giInputs2.length) html += '<option value="" disabled>No GPIO Input blocks — add gpio_input blocks in Inputs tab</option>';
                                            html += '</select>';
                                        } else if (sdef.pin_cap) {
                                            const ibOnChange = 'updateInnerBlockSetting(' + pi + ',' + bi + ',' + ibi + ',\'' + sdef.name + '\',this.value)';
                                            html += renderPinSelectHtml(pi, bi, sdef.name, sdef.pin_cap, sv, ibOnChange);
                                        } else if (sdef.type.startsWith('enum:')) {
                                            const opts = sdef.type.substring(5).split(',');
                                            html += '<select onchange="updateInnerBlockSetting(' + pi + ',' + bi + ',' + ibi + ',\'' + sdef.name + '\',this.value)">';
                                            opts.forEach(o => { html += '<option value="' + o + '"' + (sv === o ? ' selected' : '') + '>' + o + '</option>'; });
                                            html += '</select>';
                                        } else if (sdef.type === 'bool') {
                                            html += '<input type="checkbox" ' + (sv ? 'checked' : '') +
                                                ' onchange="updateInnerBlockSetting(' + pi + ',' + bi + ',' + ibi + ',\'' + sdef.name + '\',this.checked)" />';
                                        } else if (sdef.type === 'sensor_ref') {
                                            const curRef = iblk.settings[sdef.name] || '';
                                            const sensorPls = state.pipelines.filter(p => (p.kind || 'pipeline') === 'sensor');
                                            html += '<select onchange="updateInnerBlockSetting(' + pi + ',' + bi + ',' + ibi + ',\'' + sdef.name + '\',this.value)">';
                                            html += '<option value="">— none —</option>';
                                            sensorPls.forEach(sp => {
                                                sp.blocks.forEach((sb, sbi) => {
                                                    const sbDef = fbBlocks.find(f => f.id === sb.blockType);
                                                    if (!sbDef || !sbDef.ports_out || !sbDef.ports_out.length) return;
                                                    sbDef.ports_out.forEach((outDef, outIdx) => {
                                                        const v = sp.id + ':' + sbi + ':' + outIdx;
                                                        const lbl = escapeHtml('[' + sp.name + '] ' + (sb.alias || sbDef.label) + ' \u2192 ' + outDef.name);
                                                        html += '<option value="' + v + '"' + (curRef === v ? ' selected' : '') + '>' + lbl + '</option>';
                                                    });
                                                });
                                            });
                                            if (!sensorPls.length) html += '<option value="" disabled>No Sensor pipelines defined</option>';
                                            html += '</select>';
                                        } else if (sdef.type === 'control_point') {
                                            const curRef = iblk.settings[sdef.name] || '';
                                            html += '<select onchange="updateInnerBlockSetting(' + pi + ',' + bi + ',' + ibi + ',\'' + sdef.name + '\',this.value)">';
                                            html += '<option value="">— none —</option>';
                                            let cpCount2 = 0;
                                            state.pipelines.forEach((tpl, tpIdx) => {
                                                (tpl.blocks || []).forEach((tb, tbi) => {
                                                    const tbDef = fbBlocks.find(f => f.id === tb.blockType);
                                                    if (!tbDef || !tbDef.settings) return;
                                                    tbDef.settings.forEach(fdef => {
                                                        if (fdef.type !== 'float') return;
                                                        const v = tpl.id + ':' + tbi + ':' + fdef.name;
                                                        const lbl = escapeHtml('[' + tpl.name + '] ' + (tb.alias || tbDef.label) + ' \u2192 ' + fdef.name);
                                                        html += '<option value="' + escapeHtml(v) + '"' + (curRef === v ? ' selected' : '') + '>' + lbl + '</option>';
                                                        cpCount2++;
                                                    });
                                                });
                                            });
                                            if (!cpCount2) html += '<option value="" disabled>No settable float fields found</option>';
                                            html += '</select>';
                                        } else if (sdef.type === 'output_ref') {
                                            const curRef = iblk.settings[sdef.name] || '';
                                            const allOutPins = (state.output_groups || []).flatMap(g => g.pins || []);
                                            html += '<select onchange="updateInnerBlockSetting(' + pi + ',' + bi + ',' + ibi + ',\'' + sdef.name + '\',this.value)">';
                                            html += '<option value="">— select output pin —</option>';
                                            allOutPins.forEach(op => {
                                                const lbl = escapeHtml((op.label || op.id) + ' (GPIO' + op.gpio + ')');
                                                html += '<option value="' + escapeHtml(op.id) + '"' + (curRef === op.id ? ' selected' : '') + '>' + lbl + '</option>';
                                            });
                                            if (!allOutPins.length) html += '<option value="" disabled>No Output Pins defined \u2014 add in Outputs tab</option>';
                                            html += '</select>';
                                        } else if (sdef.type === 'gpio_output_ref') {
                                            const curRef2 = iblk.settings[sdef.name] || '';
                                            const gpioPins2 = [];
                                            (state.output_groups || []).forEach(g => { (g.pins || []).filter(p => p.type === 'gpio').forEach(p => gpioPins2.push({ op: p, gName: g.name })); });
                                            html += '<select onchange="updateInnerBlockSetting(' + pi + ',' + bi + ',' + ibi + ',\'' + sdef.name + '\',this.value)">';
                                            html += '<option value="">\u2014 select GPIO output \u2014</option>';
                                            gpioPins2.forEach(({ op, gName }) => {
                                                const lbl = escapeHtml(gName + ' \u203a ' + (op.label || op.id) + ' (GPIO' + op.gpio + ')');
                                                html += '<option value="' + escapeHtml(op.id) + '"' + (curRef2 === op.id ? ' selected' : '') + '>' + lbl + '</option>';
                                            });
                                            if (!gpioPins2.length) html += '<option value="" disabled>No GPIO output pins \u2014 add gpio type pins in Outputs tab</option>';
                                            html += '</select>';
                                        } else if (sdef.type === 'gpio_input_ref') {
                                            const curRef2 = iblk.settings[sdef.name] || '';
                                            const gpioInputs2 = [];
                                            (state.pipelines || []).forEach(function(pl) {
                                                if ((pl.kind || 'pipeline') !== 'sensor') return;
                                                (pl.blocks || []).forEach(function(b, bIdx) {
                                                    if (b.blockType === 'gpio_input') gpioInputs2.push({ pl: pl, b: b, bIdx: bIdx });
                                                });
                                            });
                                            html += '<select onchange="updateInnerBlockSetting(' + pi + ',' + bi + ',' + ibi + ',\'' + sdef.name + '\',this.value)">';
                                            html += '<option value="">\u2014 none (pipeline trigger only) \u2014</option>';
                                            gpioInputs2.forEach(function(item) {
                                                const id = item.pl.id + ':' + item.bIdx;
                                                const lbl = escapeHtml(item.pl.name + ' \u203a ' + (item.b.alias || 'GPIO Input'));
                                                html += '<option value="' + escapeHtml(id) + '"' + (curRef2 === id ? ' selected' : '') + '>' + lbl + '</option>';
                                            });
                                            if (!gpioInputs2.length) html += '<option value="" disabled>No GPIO Input blocks \u2014 add gpio_input blocks in Inputs tab</option>';
                                            html += '</select>';
                                        } else if (sdef.type.startsWith('periph_ref:')) {
                                            const reqType = sdef.type.slice(11);
                                            const curPid  = iblk.settings[sdef.name] || '';
                                            const matching = state.peripherals.filter(p => p.type === reqType);
                                            html += '<select onchange="updateInnerBlockSetting(' + pi + ',' + bi + ',' + ibi + ',\'' + sdef.name + '\',this.value)">';
                                            html += '<option value="">— none —</option>';
                                            matching.forEach(p => {
                                                html += '<option value="' + escapeHtml(p.id) + '"' + (curPid === p.id ? ' selected' : '') + '>' + escapeHtml(p.alias || p.type) + '</option>';
                                            });
                                            html += '</select>';
                                        } else {
                                            html += '<input type="' + (sdef.type === 'float' || sdef.type.startsWith('uint') || sdef.type.startsWith('int') ? 'number' : 'text') + '" value="' + escapeHtml(String(sv)) + '"' +
                                                (sdef.type === 'float' ? ' step="0.01"' : '') +
                                                ' onchange="updateInnerBlockSetting(' + pi + ',' + bi + ',' + ibi + ',\'' + sdef.name + '\',this.value)" />';
                                        }
                                        html += '<span class="var-type-badge">' + (iblk.blockType === 'gpio_input' && sdef.pin_cap ? 'gpio_input_ref' : sdef.pin_cap ? 'gpio:' + sdef.pin_cap.toLowerCase() : sdef.type) + '</span>';
                                        html += '</div>';
                                    });
                                    html += '</div>'; // block-detail
                                }
                            });
                            html += '</div>'; // pipeline-blocks-list
                        }

                        // Add inner block row
                        html += '<div class="fan-add-row">';
                        html += '<select class="fan-add-select" id="inner-add-sel-' + pi + '-' + bi + '"><option value="">— add block —</option>';
                        ['hmi','input','output','logic','timer','utility','system'].forEach(cat => {
                            const catBlocks = fbBlocks.filter(f => f.category === cat && f.id !== 'abortable_sub_pipeline');
                            if (!catBlocks.length) return;
                            html += '<optgroup label="' + cat.charAt(0).toUpperCase() + cat.slice(1) + '">';
                            catBlocks.forEach(f => { html += '<option value="' + f.id + '">' + f.label + '</option>'; });
                            html += '</optgroup>';
                        });
                        html += '</select>';
                        html += '<button class="fan-add-btn" onclick="event.stopPropagation(); addInnerBlockFromDropdown(' + pi + ',' + bi + ')">Add</button>';
                        html += '</div>'; // fan-add-row

                        // Exit conditions — sources from inner blocks
                        html += '<div class="run-until-conditions-header">Abort When \u2014 any condition \u2265 0.5 exits the loop</div>';
                        exitConds.forEach((cond, ci) => {
                            const curSrc = (cond.src_block >= 0 ? cond.src_block + ':' + cond.src_port : '');
                            html += '<div class="run-until-row">';
                            html += '<input type="text" class="run-until-label-input" value="' + escapeHtml(cond.label) + '" placeholder="label" ' +
                                'oninput="updateExitConditionLabel(' + pi + ',' + bi + ',' + ci + ',this.value)" onclick="event.stopPropagation()" />';
                            html += '<select onchange="updateExitConditionSrc(' + pi + ',' + bi + ',' + ci + ',this.value)" onclick="event.stopPropagation()">';
                            html += '<option value="">\u2014 pick abort trigger \u2014</option>';
                            innerBlocks.forEach((srcBlk, srcIbi) => {
                                const srcDef = fbBlocks.find(f => f.id === srcBlk.blockType);
                                if (!srcDef || !srcDef.ports_out || !srcDef.ports_out.length) return;
                                srcDef.ports_out.forEach((outDef, outIdx) => {
                                    const v = srcIbi + ':' + outIdx;
                                    const lbl = 'when [' + srcIbi + '] ' + escapeHtml(srcBlk.alias || srcDef.label) + ' \u2192 ' + outDef.name + ' fires \u2192 abort';
                                    html += '<option value="' + v + '"' + (curSrc === v ? ' selected' : '') + '>' + lbl + '</option>';
                                });
                            });
                            html += '</select>';
                            html += '<button class="run-until-remove-btn" onclick="event.stopPropagation(); removeExitCondition(' + pi + ',' + bi + ',' + ci + ')">✕</button>';
                            html += '</div>'; // run-until-row
                        });
                        html += '<button class="run-until-add-btn" onclick="event.stopPropagation(); addExitCondition(' + pi + ',' + bi + ')">+ Condition</button>';
                        html += '</div>'; // run-until-panel
                    }
                    // Fan outputs panel — inline child blocks, shown whenever the block is a fan type
                    if (fbDef && fbDef.fan) {
                        const fanOuts = blk.fan_outputs || [];
                        html += '<div class="fan-outputs-panel" onclick="event.stopPropagation()">';
                        html += '<div class="fan-outputs-header">&#8627; Outputs (' + fanOuts.length + ')</div>';
                        fanOuts.forEach((fo, fi) => {
                            const foDef = fbBlocks.find(f => f.id === fo.blockType);
                            const foCat = foDef ? foDef.category : 'utility';
                            const foLabel = foDef ? foDef.label : fo.blockType;
                            html += '<div class="fan-output-block">';
                            html += '<div class="fan-output-row" onclick="toggleFanOutputDetail(' + pi + ',' + bi + ',' + fi + ')">';
                            html += '<span class="block-type-badge cat-' + foCat + '" style="font-size:10px;padding:1px 5px;">' + foLabel + '</span>';
                            html += '<input type="text" class="fan-output-alias" value="' + escapeHtml(fo.alias || '') + '" ' +
                                'placeholder="' + escapeHtml(foLabel + ' ' + (fi + 1)) + '" ' +
                                'onclick="event.stopPropagation()" ' +
                                'oninput="renameFanOutput(' + pi + ',' + bi + ',' + fi + ',this.value)" />';
                            html += '<button class="fan-output-settings-btn' + (fo.expanded ? ' active' : '') + '" ' +
                                'onclick="event.stopPropagation(); toggleFanOutputDetail(' + pi + ',' + bi + ',' + fi + ')" title="Toggle settings">Settings</button>';
                            html += '<button class="fan-output-remove-btn" onclick="event.stopPropagation(); removeFanOutput(' + pi + ',' + bi + ',' + fi + ')">✕</button>';
                            html += '</div>'; // fan-output-row
                            if (fo.expanded && foDef) {
                                html += '<div class="fan-output-detail">';
                                foDef.settings.forEach(sdef => {
                                    if (/active_low|active_high/.test(sdef.name)) return; // polarity set on inputs/outputs tab
                                    if (fo.blockType === 'gpio_input' && sdef.name === 'debounce_ms') return; // debounce set on Inputs tab
                                    const val = fo.settings[sdef.name] !== undefined ? fo.settings[sdef.name] : sdef.default;
                                    html += '<div class="instance-var">';
                                    html += '<label title="' + escapeHtml(sdef.description) + '">' + (fo.blockType === 'gpio_input' && sdef.pin_cap ? 'input_ref' : sdef.name) + '</label>';
                                    if (fo.blockType === 'gpio_input' && sdef.pin_cap) {
                                        const giCurRef3 = fo.settings['input_ref'] || '';
                                        const giInputs3 = [];
                                        (state.pipelines || []).forEach(function(pl) {
                                            if ((pl.kind || 'pipeline') !== 'sensor') return;
                                            (pl.blocks || []).forEach(function(b, bIdx) {
                                                if (b.blockType === 'gpio_input') giInputs3.push({ pl: pl, b: b, bIdx: bIdx });
                                            });
                                        });
                                        html += '<select onchange="updateFanOutputSetting(' + pi + ',' + bi + ',' + fi + ',\'input_ref\',this.value)">';
                                        html += '<option value="">— none —</option>';
                                        giInputs3.forEach(function(item) {
                                            const id = item.pl.id + ':' + item.bIdx;
                                            const lbl = escapeHtml(item.pl.name + ' › ' + (item.b.alias || 'GPIO Input'));
                                            html += '<option value="' + escapeHtml(id) + '"' + (giCurRef3 === id ? ' selected' : '') + '>' + lbl + '</option>';
                                        });
                                        if (!giInputs3.length) html += '<option value="" disabled>No GPIO Input blocks — add gpio_input blocks in Inputs tab</option>';
                                        html += '</select>';
                                    } else if (sdef.pin_cap) {
                                        const foOnChange = 'updateFanOutputSetting(' + pi + ',' + bi + ',' + fi + ',\'' + sdef.name + '\',parseInt(this.value))';
                                        html += renderPinSelectHtml(pi, bi, sdef.name, sdef.pin_cap, val, foOnChange);
                                    } else if (sdef.type.startsWith('enum:')) {
                                        const opts = sdef.type.substring(5).split(',');
                                        html += '<select onchange="updateFanOutputSetting(' + pi + ',' + bi + ',' + fi + ',\'' + sdef.name + '\',this.value)">';
                                        opts.forEach(o => { html += '<option value="' + o + '"' + (val === o ? ' selected' : '') + '>' + o + '</option>'; });
                                        html += '</select>';
                                    } else if (sdef.type === 'bool') {
                                        html += '<input type="checkbox" ' + (val ? 'checked' : '') +
                                            ' onchange="updateFanOutputSetting(' + pi + ',' + bi + ',' + fi + ',\'' + sdef.name + '\',this.checked)" />';
                                    } else if (sdef.type === 'output_ref') {
                                        const curRef = fo.settings[sdef.name] || '';
                                        const allOutPins = (state.output_groups || []).flatMap(g => g.pins || []);
                                        html += '<select onchange="updateFanOutputSetting(' + pi + ',' + bi + ',' + fi + ',\'' + sdef.name + '\',this.value)">';
                                        html += '<option value="">— select output pin —</option>';
                                        allOutPins.forEach(op => {
                                            const lbl = escapeHtml((op.label || op.id) + ' (GPIO' + op.gpio + ')');
                                            html += '<option value="' + escapeHtml(op.id) + '"' + (curRef === op.id ? ' selected' : '') + '>' + lbl + '</option>';
                                        });
                                        if (!allOutPins.length) html += '<option value="" disabled>No Output Pins defined \u2014 add in Outputs tab</option>';
                                        html += '</select>';
                                    } else if (sdef.type === 'gpio_output_ref') {
                                        const curRef3 = fo.settings[sdef.name] || '';
                                        const gpioPins3 = [];
                                        (state.output_groups || []).forEach(g => { (g.pins || []).filter(p => p.type === 'gpio').forEach(p => gpioPins3.push({ op: p, gName: g.name })); });
                                        html += '<select onchange="updateFanOutputSetting(' + pi + ',' + bi + ',' + fi + ',\'' + sdef.name + '\',this.value)">';
                                        html += '<option value="">\u2014 select GPIO output \u2014</option>';
                                        gpioPins3.forEach(({ op, gName }) => {
                                            const lbl = escapeHtml(gName + ' \u203a ' + (op.label || op.id) + ' (GPIO' + op.gpio + ')');
                                            html += '<option value="' + escapeHtml(op.id) + '"' + (curRef3 === op.id ? ' selected' : '') + '>' + lbl + '</option>';
                                        });
                                        if (!gpioPins3.length) html += '<option value="" disabled>No GPIO output pins \u2014 add gpio type pins in Outputs tab</option>';
                                        html += '</select>';
                                    } else if (sdef.type === 'gpio_input_ref') {
                                        const curRef3 = fo.settings[sdef.name] || '';
                                        const gpioInputs3 = [];
                                        (state.pipelines || []).forEach(function(pl) {
                                            if ((pl.kind || 'pipeline') !== 'sensor') return;
                                            (pl.blocks || []).forEach(function(b, bIdx) {
                                                if (b.blockType === 'gpio_input') gpioInputs3.push({ pl: pl, b: b, bIdx: bIdx });
                                            });
                                        });
                                        html += '<select onchange="updateFanOutputSetting(' + pi + ',' + bi + ',' + fi + ',\'' + sdef.name + '\',this.value)">';
                                        html += '<option value="">\u2014 none (pipeline trigger only) \u2014</option>';
                                        gpioInputs3.forEach(function(item) {
                                            const id = item.pl.id + ':' + item.bIdx;
                                            const lbl = escapeHtml(item.pl.name + ' \u203a ' + (item.b.alias || 'GPIO Input'));
                                            html += '<option value="' + escapeHtml(id) + '"' + (curRef3 === id ? ' selected' : '') + '>' + lbl + '</option>';
                                        });
                                        if (!gpioInputs3.length) html += '<option value="" disabled>No GPIO Input blocks \u2014 add gpio_input blocks in Inputs tab</option>';
                                        html += '</select>';
                                    } else {
                                        html += '<input type="' + (sdef.type === 'float' || sdef.type.startsWith('uint') || sdef.type.startsWith('int') ? 'number' : 'text') + '" value="' + escapeHtml(String(val)) + '"' +
                                            (sdef.type === 'float' ? ' step="0.01"' : '') +
                                            ' onchange="updateFanOutputSetting(' + pi + ',' + bi + ',' + fi + ',\'' + sdef.name + '\',this.value)" />';
                                    }
                                    html += '<span class="var-type-badge">' + (fo.blockType === 'gpio_input' && sdef.pin_cap ? 'gpio_input_ref' : sdef.pin_cap ? 'gpio:' + sdef.pin_cap.toLowerCase() : sdef.type) + '</span>';
                                    html += '</div>';
                                });
                                html += '</div>'; // fan-output-detail
                            }
                            html += '</div>'; // fan-output-block
                        });
                        // Add-output row: block type selector + Add button
                        // Only show blocks that accept a float input (port_in type === 'float')
                        // and are not fans themselves (no fan nesting).
                        const fanCompatible = fbBlocks.filter(f =>
                            !f.fan &&
                            f.ports_in && f.ports_in.some(p => p.type === 'float')
                        );
                        html += '<div class="fan-add-row">';
                        html += '<select class="fan-add-select" id="fan-add-sel-' + pi + '-' + bi + '"><option value="">— add output block —</option>';
                        ['hmi','input','output','logic','timer','utility','system'].forEach(cat => {
                            const catBlocks = fanCompatible.filter(f => f.category === cat);
                            if (!catBlocks.length) return;
                            html += '<optgroup label="' + cat.charAt(0).toUpperCase() + cat.slice(1) + '">';
                            catBlocks.forEach(f => { html += '<option value="' + f.id + '">' + f.label + '</option>'; });
                            html += '</optgroup>';
                        });
                        html += '</select>';
                        html += '<button class="fan-add-btn" onclick="addFanOutputFromDropdown(' + pi + ',' + bi + ')">Add</button>';
                        html += '</div>'; // fan-add-row
                        html += '</div>'; // fan-outputs-panel
                    }
                });
                html += '</div>'; // pipeline-blocks-list
            }
            // Add-block row
            html += '<div class="add-block-row">';
            html += '<select class="add-block-select" id="add-block-sel-' + pi + '"><option value="">— add block —</option>';
            const isSensorTab = (pl.kind || 'pipeline') === 'sensor';
            const sensorBlockIds = ['sensor_analog','sensor_dht22_temp','sensor_dht22_humid','sensor_hx711'];
            ['hmi','input','output','logic','timer','utility','system'].forEach(cat => {
                const catBlocks = fbBlocks.filter(f => {
                    if (f.category !== cat) return false;
                    if (isSensorTab) return sensorBlockIds.includes(f.id); // sensor tab: only sensor sources
                    return f.id !== 'sensor_value' ? !sensorBlockIds.includes(f.id) : true; // other tabs: hide raw sensors, show sensor_value
                });
                if (!catBlocks.length) return;
                html += '<optgroup label="' + cat.charAt(0).toUpperCase() + cat.slice(1) + '">';
                catBlocks.forEach(f => { html += '<option value="' + f.id + '">' + f.label + '</option>'; });
                html += '</optgroup>';
            });
            html += '</select>';
            html += '<button class="add-block-btn" onclick="addBlockFromDropdown(' + pi + ')">Add</button>';
            html += '</div>';

            html += '</div>'; // pipeline-body
            html += '</div>'; // pipeline-card
        });
        container.innerHTML = html;
        attachPipelineDragDrop();
        attachBlockDragDrop();
    }

    // ── Right sidebar rendering ──────────────────────────────────────────────
    function renderFbPalette() {
        const wrapper = document.getElementById('fb-palette-wrapper');
        if (!wrapper) return;
        const canAdd = selectedPipelineIdx >= 0 && selectedPipelineIdx < state.pipelines.length;
        let html = '<div class="fb-palette-grid">';
        ['hmi','input','output','logic','timer','utility','system'].forEach(cat => {
            const catBlocks = fbBlocks.filter(f => f.category === cat);
            if (!catBlocks.length) return;
            html += '<div class="fb-cat-section">' + cat.charAt(0).toUpperCase() + cat.slice(1) + '</div>';
            catBlocks.forEach(blk => {
                const portsIn  = (blk.ports_in  || []).map(p => p.type).join(',');
                const portsOut = (blk.ports_out || []).map(p => p.type).join(',');
                const portsTxt = (portsIn ? '← ' + portsIn + ' ' : '') + (portsOut ? '→ ' + portsOut : '');
                html += '<div class="fb-block-tile fb-cat-' + blk.category + (canAdd ? '' : ' no-target') + '" ' +
                    (canAdd ? 'onclick="addBlockToPipeline(' + selectedPipelineIdx + ',\'' + blk.id + '\')"' : '') + ' ' +
                    'title="' + escapeHtml(blk.description) + '">';
                html += '<span class="fb-tile-label">' + blk.label + '</span>';
                if (portsTxt) html += '<span class="fb-tile-ports">' + portsTxt + '</span>';
                html += '</div>';
            });
        });
        html += '</div>';
        if (!canAdd) {
            html += '<div style="padding:6px 4px; font-size:10px; color:var(--vscode-descriptionForeground); font-style:italic;">Select or create a pipeline to add blocks.</div>';
        }
        wrapper.innerHTML = html;
    }

    function renderPrefabs() {
        const wrapper = document.getElementById('prefabs-wrapper');
        if (!wrapper) return;
        let html = '';
        // Static (built-in) prefabs
        prefabs.forEach(pf => {
            html += '<div class="prefab-tile" onclick="applyPrefab(\'' + pf.id + '\')" title="Create a new pipeline from this template">';
            html += '<div class="prefab-tile-label">' + escapeHtml(pf.label) + '</div>';
            html += '<div class="prefab-tile-desc">' + escapeHtml(pf.description) + '</div>';
            html += '<div class="prefab-tile-chips">';
            pf.blocks.forEach(b => {
                const fbDef = fbBlocks.find(f => f.id === b.blockId);
                html += '<span class="prefab-chip">' + (fbDef ? fbDef.label : b.blockId) + '</span>';
            });
            html += '</div></div>';
        });
        // User-saved prefabs
        if (state.userPrefabs && state.userPrefabs.length > 0) {
            html += '<div class="prefab-user-divider">Saved</div>';
            state.userPrefabs.forEach(pf => {
                html += '<div class="prefab-tile" onclick="applyPrefab(\'' + pf.id + '\')" title="Create a new pipeline from this template" style="position:relative">';
                html += '<div class="prefab-tile-header">';
                html += '<div class="prefab-tile-label">' + escapeHtml(pf.label) + '</div>';
                html += '<button class="prefab-delete-btn" onclick="event.stopPropagation(); deleteUserPrefab(\'' + pf.id + '\')" title="Delete prefab">✕</button>';
                html += '</div>';
                html += '<div class="prefab-tile-desc">' + escapeHtml(pf.description) + '</div>';
                html += '<div class="prefab-tile-chips">';
                pf.blocks.forEach(b => {
                    const fbDef = fbBlocks.find(f => f.id === b.blockId);
                    html += '<span class="prefab-chip">' + (fbDef ? fbDef.label : b.blockId) + '</span>';
                });
                html += '</div></div>';
            });
        }
        wrapper.innerHTML = html || '<div style="padding:8px; font-size:11px; color:var(--vscode-descriptionForeground);">No prefabs defined.</div>';
    }

    function saveAsPrefab(pi) {
        const pl = state.pipelines[pi];
        if (!pl) return;
        const id = 'user_' + Math.random().toString(36).slice(2, 10);
        const blockCount = pl.blocks.length;
        state.userPrefabs.push({
            id,
            label: pl.name || 'My Pipeline',
            description: blockCount + ' block' + (blockCount !== 1 ? 's' : ''),
            blocks: pl.blocks.map(b => ({ blockId: b.blockType, alias: b.alias || '' })),
        });
        renderPrefabs();
    }

    function deleteUserPrefab(id) {
        state.userPrefabs = state.userPrefabs.filter(p => p.id !== id);
        renderPrefabs();
    }

    // ── Pipeline management ──────────────────────────────────────────────────
    function genPipelineId() {
        return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    }

    function genOutputPinId() {
        return 'op_' + Math.random().toString(36).slice(2, 8);
    }

    function genOutputGroupId() {
        return 'og_' + Math.random().toString(36).slice(2, 8);
    }

    function genTimerId() {
        return 'td_' + Math.random().toString(36).slice(2, 8);
    }

    // ── Output Groups (Outputs tab) ──────────────────────────────────────────

    function getOutputGroupConstraints(group) {
        if (!group.peripheral_id) {
            return { locked: false, allowedTypes: ['pwm', 'gpio', 'dac'], typeLabel: null };
        }
        const periph = state.peripherals.find(p => p.id === group.peripheral_id);
        if (!periph) return { locked: false, allowedTypes: ['pwm', 'gpio', 'dac'], typeLabel: null };
        const ptype = peripheralTypes.find(t => t.id === periph.type);
        if (!ptype) return { locked: false, allowedTypes: ['pwm', 'gpio', 'dac'], typeLabel: null };
        if (ptype.category === 'pwm_expander') {
            return { locked: true, allowedTypes: ['pwm'],  typeLabel: ptype.label + ' \u2014 PWM \uD83D\uDD12' };
        }
        if (ptype.category === 'gpio_expander') {
            return { locked: true, allowedTypes: ['gpio'], typeLabel: ptype.label + ' \u2014 GPIO \uD83D\uDD12' };
        }
        if (ptype.category === 'dac_expander') {
            return { locked: true, allowedTypes: ['dac'],  typeLabel: ptype.label + ' \u2014 DAC \uD83D\uDD12' };
        }
        return { locked: true, allowedTypes: ['pwm'], typeLabel: (ptype.label || periph.type) + ' \uD83D\uDD12' };
    }

    function addOutputGroup() {
        if (!state.output_groups) state.output_groups = [];
        state.output_groups.push({
            id:            genOutputGroupId(),
            name:          'Output Group ' + (state.output_groups.length + 1),
            peripheral_id: null,
            pins:          [],
        });
        renderOutputGroups();
    }

    function removeOutputGroup(gi) {
        if (!state.output_groups) return;
        state.output_groups.splice(gi, 1);
        rebuildPipelinePinAssignments();
        renderPinMap();
        renderOutputGroups();
    }

    function addOutputPinToGroup(gi) {
        const group = (state.output_groups || [])[gi];
        if (!group) return;
        const c   = getOutputGroupConstraints(group);
        const typ = c.allowedTypes[0] || 'pwm';
        group.pins.push({
            id:                 genOutputPinId(),
            type:               typ,
            type_locked:        c.locked,
            gpio:               -1,
            label:              'Output ' + (group.pins.length + 1),
            frequency:          1000,
            func_min:           0.0,
            func_max:           100.0,
            count_rate_at_full: 0.0,
        });
        renderOutputGroups();
    }

    function removeOutputPinFromGroup(gi, pi) {
        const group = (state.output_groups || [])[gi];
        if (!group) return;
        group.pins.splice(pi, 1);
        rebuildPipelinePinAssignments();
        renderPinMap();
        renderOutputGroups();
    }

    function updateOutputPinInGroup(gi, pi, field, rawValue) {
        const group = (state.output_groups || [])[gi];
        if (!group || !group.pins[pi]) return;
        const op = group.pins[pi];
        const numFields = ['gpio', 'frequency', 'func_min', 'func_max', 'count_rate_at_full'];
        op[field] = numFields.includes(field) ? parseFloat(rawValue) : rawValue;
        if (field === 'gpio') {
            rebuildPipelinePinAssignments();
            renderPinMap();
        } else if (field === 'type') {
            renderOutputGroups();
        }
    }

    function renderOutputGroups() {
        const container = document.getElementById('pipelines-container');
        const addBtn    = document.getElementById('btn-add-pipeline');
        if (addBtn) addBtn.textContent = '+ Add Output Group';

        const groups = state.output_groups || [];
        if (groups.length === 0) {
            container.innerHTML = '<div class="placeholder" style="padding:20px; margin-bottom:0;">' +
                'No output groups defined \u2014 click the button below to add one.<br>' +
                '<span style="font-size:11px; color:var(--vscode-descriptionForeground);">Group pins by IC: mainboard GPIOs, PWM expanders, etc. ' +
                'PWM Output blocks reference pins by ID.</span></div>';
            return;
        }

        const capData   = pinCaps[state.board];
        const boardPins = capData ? capData.pins : [];

        const outTypeMeta = {
            pwm:  { cat: 'cat-output', icon: '\u29bf PWM'  },
            gpio: { cat: 'cat-hmi',    icon: '\u2b21 GPIO' },
            dac:  { cat: 'cat-logic',  icon: '\u223f DAC'  },
        };

        let html = '';
        groups.forEach((group, gi) => {
            const c = getOutputGroupConstraints(group);

            html += '<div class="pipeline-card" style="margin-bottom:10px;" draggable="true" data-og-idx="' + gi + '">';

            // Group header
            html += '<div class="pipeline-card-header" style="cursor:default;">';
            html += '<span class="pipeline-drag-handle" title="Drag to reorder" onclick="event.stopPropagation()" ' +
                'onmousedown="event.stopPropagation(); _ogDragAllowed=true;" onmouseup="_ogDragAllowed=false;">' +
                '<span class="pipeline-drag-handle-icon">\u2807</span>' +
                '<span class="pipeline-drag-label">' + (gi + 1) + '</span></span>'; 
            html += '<input type="text" class="pipeline-name-input" value="' + escapeHtml(group.name) + '" ' +
                'placeholder="Output Group ' + (gi + 1) + '" maxlength="32" ' +
                'oninput="(state.output_groups[' + gi + '].name=this.value)" />';
            if (c.typeLabel) {
                html += '<span class="block-type-badge cat-output" style="font-size:10px; padding:2px 7px; margin-left:6px; opacity:0.8;">' +
                    escapeHtml(c.typeLabel) + '</span>';
            }
            html += '<span style="flex:1"></span>';
            html += '<button class="instance-remove" onclick="removeOutputGroup(' + gi + ')" title="Remove group">&#x2715;</button>';
            html += '</div>'; // header

            // Pins list
            html += '<div class="pipeline-body" style="display:block; padding:4px 8px 8px;">';
            if (group.pins.length === 0) {
                html += '<div style="font-size:11px; color:var(--vscode-descriptionForeground); padding:4px 0;">No pins \u2014 click + Pin to add one.</div>';
            } else {
                group.pins.forEach((op, pi) => {
                    const pinType = op.type || 'pwm';
                    const meta = outTypeMeta[pinType] || { cat: 'cat-output', icon: pinType.toUpperCase() };

                    html += '<div class="block-row" style="align-items:center; padding:3px 4px;" draggable="true" data-og-idx="' + gi + '" data-op-idx="' + pi + '">';
                    html += '<span class="block-drag-handle" title="Drag to reorder" onclick="event.stopPropagation()" ' +
                        'onmousedown="event.stopPropagation(); _opDragAllowed=true;" onmouseup="_opDragAllowed=false;"><span class="block-drag-handle-icon">\u2807</span></span>';

                    // Type selector or locked badge
                    if (!op.type_locked && !c.locked) {
                        html += '<select class="input-type-sel" onclick="event.stopPropagation()" ' +
                            'onchange="event.stopPropagation(); updateOutputPinInGroup(' + gi + ',' + pi + ',\'type\',this.value)">';
                        ['pwm', 'gpio', 'dac'].forEach(t => {
                            const m = outTypeMeta[t];
                            html += '<option value="' + t + '"' + (pinType === t ? ' selected' : '') + '>' + m.icon + '</option>';
                        });
                        html += '</select>';
                    } else {
                        html += '<span class="block-type-badge ' + meta.cat + '" style="font-size:10px; min-width:64px; text-align:center;" title="Type fixed by device">' +
                            escapeHtml(meta.icon) + '</span>';
                    }

                    // Label input
                    html += '<input type="text" class="block-alias-input" value="' + escapeHtml(op.label || '') + '" ' +
                        'placeholder="Pin ' + (pi + 1) + '" maxlength="32" style="flex:1; min-width:80px;" ' +
                        'oninput="updateOutputPinInGroup(' + gi + ',' + pi + ',\'label\',this.value)" />';

                    // ID display
                    html += '<code style="font-size:10px; color:var(--vscode-descriptionForeground); margin:0 6px; white-space:nowrap; display:inline-block; min-width:84px; max-width:84px; overflow:hidden; text-overflow:ellipsis; text-align:center;" title="' + escapeHtml(op.id) + '">' + escapeHtml(op.id) + '</code>';

                    // GPIO selector
                    if (boardPins.length > 0) {
                        const eligible = boardPins.filter(p => !p.reserved);
                        html += '<select class="pin-cap-select" title="GPIO" ' +
                            'onchange="updateOutputPinInGroup(' + gi + ',' + pi + ',\'gpio\',parseInt(this.value))">';
                        html += '<option value="-1"' + (op.gpio < 0 ? ' selected' : '') + '>\u2014 unassigned \u2014</option>';
                        eligible.forEach(p => {
                            const caps = (p.caps || []).join(' ');
                            const lbl  = 'GPIO' + p.gpio + (p.label ? ' \u2014 ' + p.label : '') + (caps ? ' [' + caps + ']' : '');
                            html += '<option value="' + p.gpio + '"' + (op.gpio === p.gpio ? ' selected' : '') + '>' + escapeHtml(lbl) + '</option>';
                        });
                        html += '</select>';
                    } else {
                        html += '<input type="number" value="' + op.gpio + '" min="-1" max="48" step="1" style="width:60px;" ' +
                            'onchange="updateOutputPinInGroup(' + gi + ',' + pi + ',\'gpio\',parseInt(this.value))" />';
                    }

                    // PWM-specific inline fields — omitted for peripheral-backed pins (settings live in peripheral)
                    if (pinType === 'pwm' && !op.peripheral_id) {
                        html += '<input type="number" value="' + (op.frequency || 1000) + '" min="1" max="100000" step="1" ' +
                            'style="width:70px; margin-left:6px;" title="Frequency (Hz)" ' +
                            'onchange="updateOutputPinInGroup(' + gi + ',' + pi + ',\'frequency\',this.value)" />';
                        html += '<span class="var-type-badge" style="margin-left:2px;">Hz</span>';
                        html += '<input type="number" value="' + (op.func_min || 0) + '" min="0" max="100" step="0.01" ' +
                            'style="width:55px; margin-left:6px;" title="func_min (%)" ' +
                            'onchange="updateOutputPinInGroup(' + gi + ',' + pi + ',\'func_min\',this.value)" />';
                        html += '<span class="var-type-badge" title="func_min">f\u2193</span>';
                        html += '<input type="number" value="' + (op.func_max !== undefined ? op.func_max : 100) + '" min="0" max="100" step="0.01" ' +
                            'style="width:55px; margin-left:4px;" title="func_max (%)" ' +
                            'onchange="updateOutputPinInGroup(' + gi + ',' + pi + ',\'func_max\',this.value)" />';
                        html += '<span class="var-type-badge" title="func_max">f\u2191</span>';
                    } else if (pinType === 'pwm' && op.peripheral_id) {
                        html += '<span style="font-size:10px; color:var(--vscode-descriptionForeground); margin-left:8px; white-space:nowrap;">\u2699\ufe0f settings in peripheral</span>';
                    }

                    html += '<button class="block-remove-btn" style="margin-left:auto;" onclick="removeOutputPinFromGroup(' + gi + ',' + pi + ')" title="Remove pin">\u2715</button>';
                    html += '</div>'; // block-row
                });
            }
            html += '<div class="add-block-row"><button class="add-block-btn" onclick="addOutputPinToGroup(' + gi + ')">+ Add Pin</button></div>';
            html += '</div>'; // pipeline-body
            html += '</div>'; // pipeline-card
        });
        container.innerHTML = html;
        attachOutputGroupDragDrop();
        attachOutputPinDragDrop();
    }

    // ── Timer Definitions (Timers tab) ────────────────────────────────────────

    function fmtMs(ms) {
        if (!ms || ms < 0) return '0s';
        const s  = Math.floor(ms / 1000);
        const m  = Math.floor(s / 60);
        const h  = Math.floor(m / 60);
        if (h > 0)  return h + 'h ' + (m % 60) + 'm';
        if (m > 0)  return m + 'm ' + (s % 60) + 's';
        return s + 's';
    }

    function fmtSec(sec) {
        if (sec === undefined || sec === null) return '--:--';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }

    function renderTimerDefs() {
        const container = document.getElementById('pipelines-container');
        const addBtn    = document.getElementById('btn-add-pipeline');
        if (addBtn) addBtn.style.display = 'none';

        // Scan all pipelines + inner blocks for timer-category blocks (the data lives in state.pipelines)
        const items = [];
        (state.pipelines || []).forEach((pl, pi) => {
            (pl.blocks || []).forEach((blk, bi) => {
                const fbDef = fbBlocks.find(f => f.id === blk.blockType);
                if (fbDef && fbDef.category === 'timer') {
                    items.push({ pl, pi, blk, bi, fbDef, isInner: false, pBlk: null, pBi: -1 });
                }
                // Also expose timers nested inside abortable_sub_pipeline
                (blk.blocks || []).forEach((iblk, ibi) => {
                    const iFbDef = fbBlocks.find(f => f.id === iblk.blockType);
                    if (iFbDef && iFbDef.category === 'timer') {
                        items.push({ pl, pi, blk: iblk, bi: ibi, fbDef: iFbDef, isInner: true, pBlk: blk, pBi: bi });
                    }
                });
            });
        });

        if (items.length === 0) {
            container.innerHTML = '<div class="placeholder" style="padding:20px; margin-bottom:0;">' +
                'No timers yet.<br>' +
                '<span style="font-size:11px; color:var(--vscode-descriptionForeground);">Add timer blocks (timer_countdown, timer_cycle…) inside Pipelines or Routines — they appear here automatically.</span></div>';
            return;
        }

        let html = '';
        items.forEach(({ pl, pi, blk, bi, fbDef, isInner, pBlk, pBi }) => {
            // Context label: pipeline name [> parent block alias if nested]
            const ctx = isInner
                ? escapeHtml(pl.name) + ' \u203a ' + escapeHtml(pBlk.alias || 'sub-pipeline')
                : escapeHtml(pl.name);

            // Build onclick call strings that route to the right update function
            const setCall = (field) => isInner
                ? 'updateInnerBlockSetting(' + pi + ',' + pBi + ',' + bi + ',\'' + field + '\',this.value)'
                : 'updateBlockSetting(' + pi + ',' + bi + ',\'' + field + '\',this.value)';
            const chkCall = (field) => isInner
                ? 'updateInnerBlockSetting(' + pi + ',' + pBi + ',' + bi + ',\'' + field + '\',this.checked)'
                : 'updateBlockSetting(' + pi + ',' + bi + ',\'' + field + '\',this.checked)';
            const aliasSet = isInner
                ? '(state.pipelines[' + pi + '].blocks[' + pBi + '].blocks[' + bi + '].alias=this.value)'
                : '(state.pipelines[' + pi + '].blocks[' + bi + '].alias=this.value)';

            html += '<div class="pipeline-card" style="margin-bottom:8px;">';
            html += '<div class="pipeline-card-header" style="cursor:default;">';
            html += '<span class="block-type-badge cat-timer" style="font-size:11px; padding:2px 8px; margin-right:6px;">' + escapeHtml(fbDef.label || blk.blockType) + '</span>';
            html += '<input type="text" class="pipeline-name-input" value="' + escapeHtml(blk.alias || '') + '" ' +
                'placeholder="' + escapeHtml(fbDef.label) + '" maxlength="32" oninput="' + aliasSet + '" />';
            html += '<span style="flex:1"></span>';
            html += '<span class="var-type-badge" style="margin-left:8px; opacity:0.75;" title="Pipeline context">' + ctx + '</span>';
            html += '</div>'; // header

            html += '<div class="pipeline-body" style="display:block;">';
            html += '<div class="block-detail" style="padding:6px 10px;">';

            // Render all settings from fbDef generically
            (fbDef.settings || []).forEach(sdef => {
                const val = blk.settings && blk.settings[sdef.name] !== undefined ? blk.settings[sdef.name] : sdef.default;
                html += '<div class="instance-var">';
                html += '<label title="' + escapeHtml(sdef.description || sdef.name) + '">' + escapeHtml(sdef.name) + '</label>';
                if (sdef.type === 'bool') {
                    html += '<input type="checkbox" ' + (val ? 'checked' : '') + ' onchange="' + chkCall(sdef.name) + '" />';
                    html += '<span class="var-type-badge">bool</span>';
                } else if (sdef.type.startsWith('uint') || sdef.type === 'float') {
                    const badge = sdef.name.endsWith('_ms') ? fmtMs(Number(val)) : sdef.type;
                    html += '<input type="number" value="' + val + '" min="0" onchange="' + setCall(sdef.name) + '" />';
                    html += '<span class="var-type-badge" title="' + escapeHtml(badge) + '">' + escapeHtml(badge) + '</span>';
                } else {
                    html += '<input type="text" value="' + escapeHtml(String(val)) + '" onchange="' + setCall(sdef.name) + '" />';
                    html += '<span class="var-type-badge">' + escapeHtml(sdef.type) + '</span>';
                }
                html += '</div>';
            });

            html += '</div>'; // block-detail
            html += '</div>'; // pipeline-body
            html += '</div>'; // pipeline-card
        });
        container.innerHTML = html;
    }

    // ── Input Cards (Inputs tab) ─────────────────────────────────────────────

    function getInputGroupConstraints(pl) {
        if (!pl.peripheral_id) {
            return { locked: false, allowedBlockIds: ['sensor_analog', 'gpio_input'], typeLabel: null };
        }
        const periph = state.peripherals.find(p => p.id === pl.peripheral_id);
        if (!periph) return { locked: false, allowedBlockIds: ['sensor_analog', 'gpio_input'], typeLabel: null };
        const ptype = peripheralTypes.find(t => t.id === periph.type);
        if (!ptype) return { locked: false, allowedBlockIds: ['sensor_analog', 'gpio_input'], typeLabel: null };
        if (ptype.category === 'adc') {
            return { locked: true, allowedBlockIds: ['sensor_analog'], typeLabel: ptype.label + ' \u2014 ADC \uD83D\uDD12' };
        }
        if (periph.type === 'dht22') {
            return { locked: true, allowedBlockIds: ['sensor_dht22_temp', 'sensor_dht22_humid'], typeLabel: 'DHT22 Protocol \uD83D\uDD12' };
        }
        if (periph.type === 'hx711') {
            return { locked: true, allowedBlockIds: ['sensor_hx711'], typeLabel: 'HX711 \uD83D\uDD12' };
        }
        if (periph.type === 'ds18b20') {
            return { locked: true, allowedBlockIds: ['sensor_analog'], typeLabel: 'DS18B20 Protocol \uD83D\uDD12' };
        }
        return { locked: true, allowedBlockIds: ['sensor_analog'], typeLabel: (ptype.label || periph.type) + ' \uD83D\uDD12' };
    }

    function changeInputBlockType(pi, bi, newTypeName) {
        const pl = state.pipelines[pi];
        if (!pl || !pl.blocks[bi]) return;
        const blk = pl.blocks[bi];
        const blockForType = { 'adc': 'sensor_analog', 'gpio': 'gpio_input' };
        const newBlockType = blockForType[newTypeName];
        if (!newBlockType || blk.blockType === newBlockType) return;
        const fbDef = fbBlocks.find(f => f.id === newBlockType);
        if (!fbDef) return;
        const newSettings = {};
        fbDef.settings.forEach(s => { newSettings[s.name] = s.default; });
        blk.blockType = newBlockType;
        blk.settings  = newSettings;
        blk.expanded  = false;
        rebuildPipelinePinAssignments();
        renderPinMap();
        renderInputCards();
    }

    function renderInputCards() {
        const container = document.getElementById('pipelines-container');
        const addBtn    = document.getElementById('btn-add-pipeline');
        if (addBtn) addBtn.textContent = '+ Add Input Group';

        const inputTypeMeta = {
            'sensor_analog':      { typeName: 'adc',           icon: '\u2295 ADC'   },
            'gpio_input':         { typeName: 'gpio',          icon: '\u2b21 GPIO'  },
            'sensor_dht22_temp':  { typeName: 'dht22',         icon: '\u29be DHT22' },
            'sensor_dht22_humid': { typeName: 'dht22',         icon: '\u29be DHT22' },
            'sensor_hx711':       { typeName: 'hx711',         icon: '\u29be HX711' },
            'encoder_mapped':     { typeName: 'encoder_mapped', icon: '\u29be ENC'  },
        };

        const visible = state.pipelines
            .map((pl, pi) => ({ pl, pi }))
            .filter(({ pl }) => {
                if ((pl.kind || 'pipeline') !== 'sensor') return false;
                // encoder_mapped pipelines are backend drivers — config lives in Peripherals panel
                if (pl.peripheral_id) {
                    const lp = state.peripherals.find(p => p.id === pl.peripheral_id);
                    if (lp && lp.type === 'encoder_mapped') return false;
                }
                return true;
            });

        if (visible.length === 0) {
            container.innerHTML = '<div class="placeholder" style="padding:20px; margin-bottom:0;">No input groups yet \u2014 click the button below to create one.</div>';
            return;
        }

        let html = '';
        visible.forEach(({ pl, pi }, visIdx) => {
            const isSelected   = selectedPipelineIdx === pi;
            const constraints  = getInputGroupConstraints(pl);

            html += '<div class="pipeline-card' + (pl.collapsed ? ' collapsed' : '') + (isSelected ? ' selected-pipeline' : '') +
                '" id="pipeline-' + pi + '" draggable="true" data-pipeline-idx="' + pi + '">';

            // Header
            html += '<div class="pipeline-card-header" onclick="selectPipeline(' + pi + '); togglePipelineCollapse(' + pi + ');">';
            html += '<span class="pipeline-drag-handle" title="Drag to reorder" onclick="event.stopPropagation()" ' +
                'onmousedown="event.stopPropagation(); _pipelineDragAllowed=true;" onmouseup="_pipelineDragAllowed=false;">' +
                '<span class="pipeline-drag-handle-icon">\u2807</span>' +
                '<span class="pipeline-drag-label">' + (visIdx + 1) + '</span></span>';
            html += '<input type="text" class="pipeline-name-input" value="' + escapeHtml(pl.name) + '" ' +
                'placeholder="Input Group ' + (visIdx + 1) + '" maxlength="32" ' +
                'onclick="event.stopPropagation()" onchange="renamePipeline(' + pi + ', this.value)" />';
            if (constraints.typeLabel) {
                html += '<span class="block-type-badge cat-input" style="font-size:10px; padding:2px 7px; margin-left:6px; opacity:0.8;">' +
                    escapeHtml(constraints.typeLabel) + '</span>';
            }
            html += '<label class="pipeline-enable-label" onclick="event.stopPropagation()">' +
                '<input type="checkbox" ' + (pl.enabled ? 'checked' : '') +
                ' onclick="event.stopPropagation(); togglePipelineEnabled(' + pi + ', this.checked)" />Enable</label>';
            html += '<span style="flex:1"></span>';
            html += '<button class="pipeline-save-prefab-btn" onclick="event.stopPropagation(); saveAsPrefab(' + pi + ')" title="Save as prefab">\u2606</button>';
            html += '<button class="instance-remove" onclick="event.stopPropagation(); removePipeline(' + pi + ')" title="Remove" style="margin-left:2px;">\u2715</button>';
            html += '</div>'; // pipeline-card-header

            // Body
            html += '<div class="pipeline-body">';
            if (pl.blocks.length === 0) {
                html += '<div style="font-size:11px; color:var(--vscode-descriptionForeground); padding:4px 0 6px;">No inputs \u2014 add from below</div>';
            } else {
                // Build power groups: key = String(pin_power ref), value = [{blk, bi}]
                const powerGroupMap = new Map();
                const ungroupedItems = [];
                pl.blocks.forEach((blk, bi) => {
                    const fd = fbBlocks.find(f => f.id === blk.blockType);
                    const hasPwr = fd && fd.settings && fd.settings.some(s => s.name === 'pin_power');
                    const pwr = hasPwr && blk.settings && blk.settings.pin_power !== undefined
                        && blk.settings.pin_power !== '' && blk.settings.pin_power !== null && blk.settings.pin_power !== -1
                        ? String(blk.settings.pin_power) : null;
                    if (pwr) {
                        if (!powerGroupMap.has(pwr)) powerGroupMap.set(pwr, []);
                        powerGroupMap.get(pwr).push({ blk, bi });
                    } else {
                        ungroupedItems.push({ blk, bi });
                    }
                });
                const allOutPins = (state.output_groups || []).flatMap(g => g.pins || []);

                // Helper: render one block-row + optional block-detail
                // skipSettings: array of sdef.name values to omit from the detail panel
                const renderInputBlk = (bi, blk, skipSettings) => {
                    const fbDef = fbBlocks.find(f => f.id === blk.blockType);
                    const cat   = fbDef ? fbDef.category : 'utility';
                    const label = fbDef ? fbDef.label : blk.blockType;
                    const tmeta = inputTypeMeta[blk.blockType] || { typeName: blk.blockType, icon: blk.blockType };
                    const isDht = (blk.blockType === 'sensor_dht22_temp' || blk.blockType === 'sensor_dht22_humid');
                    let bh = '';
                    bh += '<div class="block-row' + (blk.expanded ? ' blk-expanded' : '') +
                        '" draggable="true" data-pipeline-idx="' + pi + '" data-block-idx="' + bi +
                        '" onclick="toggleBlockDetail(' + pi + ', ' + bi + ')" style="cursor:pointer;">';
                    bh += '<span class="block-drag-handle" title="Drag to reorder" onclick="event.stopPropagation()" ' +
                        'onmousedown="event.stopPropagation(); _blockDragAllowed=true;" onmouseup="_blockDragAllowed=false;">' +
                        '<span class="block-drag-handle-icon">&#x2807;</span></span>';
                    if (!constraints.locked && (tmeta.typeName === 'adc' || tmeta.typeName === 'gpio')) {
                        bh += '<select class="input-type-sel" title="Input type" onclick="event.stopPropagation()" ' +
                            'onchange="event.stopPropagation(); changeInputBlockType(' + pi + ',' + bi + ',this.value)">';
                        bh += '<option value="adc"' + (tmeta.typeName === 'adc' ? ' selected' : '') + '>\u2295 ADC</option>';
                        bh += '<option value="gpio"' + (tmeta.typeName === 'gpio' ? ' selected' : '') + '>\u2b21 GPIO</option>';
                        bh += '</select>';
                    } else {
                        bh += '<span class="block-type-badge cat-input" style="font-size:10px; min-width:64px; text-align:center;" title="Type fixed by device">' +
                            escapeHtml(tmeta.icon) + '</span>';
                    }
                    bh += '<span class="block-type-badge cat-' + cat + '">' + label + '</span>';
                    if (isDht) {
                        const pid  = blk.settings && blk.settings.peripheral_id;
                        const per  = pid ? state.peripherals.find(p => p.id === pid) : null;
                        const sig  = blk.blockType === 'sensor_dht22_temp' ? 'Temp' : 'Humid';
                        const auto = per ? ((per.alias || 'DHT22') + ' ' + sig) : label;
                        if (per && blk.alias !== auto) blk.alias = auto;
                    }
                    bh += '<input type="text" class="block-alias-input" value="' + escapeHtml(blk.alias || '') + '" ' +
                        'placeholder="' + escapeHtml(label + ' ' + (bi + 1)) + '" ' +
                        'onclick="event.stopPropagation()" oninput="renameBlock(' + pi + ', ' + bi + ', this.value)" />';
                    bh += '<button class="block-settings-btn' + (blk.expanded ? ' active' : '') +
                        '" onclick="event.stopPropagation(); toggleBlockDetail(' + pi + ', ' + bi + ')" title="Toggle settings">Settings</button>';
                    bh += '<button class="block-remove-btn" onclick="event.stopPropagation(); removeBlockFromPipeline(' + pi + ', ' + bi + ')" title="Remove">\u2715</button>';
                    bh += '</div>'; // block-row
                    if (blk.expanded && fbDef) {
                        bh += '<div class="block-detail">';
                        fbDef.settings.forEach(sdef => {
                            if (skipSettings && skipSettings.includes(sdef.name)) return;
                            const val = blk.settings[sdef.name] !== undefined ? blk.settings[sdef.name] : sdef.default;
                            bh += '<div class="instance-var">';
                            bh += '<label title="' + escapeHtml(sdef.description || '') + '">' + sdef.name + '</label>';
                            if (sdef.pin_cap) {
                                bh += renderPinSelectHtml(pi, bi, sdef.name, sdef.pin_cap, val);
                            } else if (sdef.type === 'gpio_output_ref') {
                                const curRef = blk.settings[sdef.name] || '';
                                const gpioPins = [];
                                (state.output_groups || []).forEach(g => { (g.pins || []).filter(p => p.type === 'gpio').forEach(p => gpioPins.push({ op: p, gName: g.name })); });
                                bh += '<select onchange="updateBlockSetting(' + pi + ',' + bi + ',\'' + sdef.name + '\',this.value)">';
                                bh += '<option value="">\u2014 always on (no pin) \u2014</option>';
                                gpioPins.forEach(({ op, gName }) => {
                                    const lbl = escapeHtml(gName + ' \u203a ' + (op.label || op.id) + ' (GPIO' + op.gpio + ')');
                                    bh += '<option value="' + escapeHtml(op.id) + '"' + (curRef === op.id ? ' selected' : '') + '>' + lbl + '</option>';
                                });
                                if (!gpioPins.length) bh += '<option value="" disabled style="color:var(--vscode-errorForeground);">No GPIO output pins \u2014 add gpio type pins in Outputs tab</option>';
                                bh += '</select>';
                            } else if (sdef.type === 'bool') {
                                bh += '<input type="checkbox" ' + (val ? 'checked' : '') +
                                    ' onchange="updateBlockSetting(' + pi + ',' + bi + ',\'' + sdef.name + '\',this.checked)" />';
                            } else {
                                bh += '<input type="number" value="' + escapeHtml(String(val !== undefined && val !== null ? val : '')) +
                                    '" step="any" onchange="updateBlockSetting(' + pi + ',' + bi + ',\'' + sdef.name + '\',parseFloat(this.value)||this.value)" />';
                            }
                            bh += '<span class="var-type-badge">' + escapeHtml(sdef.type) + '</span>';
                            bh += '</div>';
                        });
                        bh += '</div>'; // block-detail
                    }
                    return bh;
                };

                html += '<div class="pipeline-blocks-list">';

                // Ungrouped blocks (no pin_power assigned)
                ungroupedItems.forEach(({ blk, bi }) => { html += renderInputBlk(bi, blk, null); });

                // Power groups — one section per unique pin_power value
                powerGroupMap.forEach((groupItems, pwrKey) => {
                    const pwrPin  = allOutPins.find(p => p.id === pwrKey);
                    const pwrLbl  = pwrPin ? (pwrPin.label || pwrPin.id) : ('Power: ' + pwrKey);
                    const fs        = groupItems[0].blk.settings || {};
                    const sampleInt = fs.sample_interval_ms !== undefined ? fs.sample_interval_ms : 1000;
                    const settling  = fs.settling_time_ms   !== undefined ? fs.settling_time_ms   : 500;
                    const actLow    = fs.power_active_low   !== undefined ? fs.power_active_low   : true;
                    const qKey = escapeHtml(pwrKey);
                    html += '<div class="pwr-group">';
                    html += '<div class="pwr-group-header" onclick="event.stopPropagation()">';
                    html += '<span class="pwr-group-icon">\u26a1</span>';
                    html += '<span class="pwr-group-label">' + escapeHtml(pwrLbl) + '</span>';
                    html += '<label class="pwr-group-meta">every <input type="number" class="pwr-group-input" value="' + sampleInt + '" min="50" max="3600000" ' +
                        'onclick="event.stopPropagation()" ' +
                        'onchange="event.stopPropagation(); updatePowerGroupSetting(' + pi + ',\'' + qKey + '\',\'sample_interval_ms\',parseInt(this.value)||1000)"> ms</label>';
                    html += '<label class="pwr-group-meta">settling <input type="number" class="pwr-group-input" value="' + settling + '" min="0" max="30000" ' +
                        'onclick="event.stopPropagation()" ' +
                        'onchange="event.stopPropagation(); updatePowerGroupSetting(' + pi + ',\'' + qKey + '\',\'settling_time_ms\',parseInt(this.value)||0)"> ms</label>';
                    html += '<label class="pwr-group-meta">active-low <input type="checkbox"' + (actLow ? ' checked' : '') +
                        ' onclick="event.stopPropagation(); updatePowerGroupSetting(' + pi + ',\'' + qKey + '\',\'power_active_low\',this.checked)"></label>';
                    html += '</div>'; // pwr-group-header
                    html += '<div class="pwr-group-body">';
                    groupItems.forEach(({ blk, bi }) => {
                        html += renderInputBlk(bi, blk, ['power_active_low', 'settling_time_ms', 'sample_interval_ms']);
                    });
                    html += '</div>'; // pwr-group-body
                    html += '</div>'; // pwr-group
                });

                html += '</div>'; // pipeline-blocks-list
            }

            // Add-input row — constrained by source device
            const allowed  = constraints.allowedBlockIds;
            const eligible = fbBlocks.filter(f => allowed.includes(f.id));
            html += '<div class="add-block-row">';
            html += '<select class="add-block-select" id="add-block-sel-' + pi + '"><option value="">\u2014 add input \u2014</option>';
            eligible.forEach(f => { html += '<option value="' + f.id + '">' + f.label + '</option>'; });
            html += '</select>';
            html += '<button class="add-block-btn" onclick="addBlockFromDropdown(' + pi + ')">Add</button>';
            html += '</div>';

            html += '</div>'; // pipeline-body
            html += '</div>'; // pipeline-card
        });
        container.innerHTML = html;
        attachPipelineDragDrop();
        attachBlockDragDrop();
    }

    function switchPipelineTab(kind) {
        activePipelineTab = kind;
        document.getElementById('tab-pipelines').classList.toggle('active', kind === 'pipeline');
        document.getElementById('tab-routines').classList.toggle('active', kind === 'routine');
        document.getElementById('tab-inputs').classList.toggle('active', kind === 'input');
        document.getElementById('tab-outputs').classList.toggle('active', kind === 'output');
        document.getElementById('tab-timers').classList.toggle('active', kind === 'timer');
        const btn = document.getElementById('btn-add-pipeline');
        if (btn) {
            btn.style.display = kind === 'timer' ? 'none' : '';
            if (kind === 'output')        btn.textContent = '+ Add Output Group';
            else if (kind === 'input')    btn.textContent = '+ Add Input Group';
            else if (kind === 'pipeline') btn.textContent = '+ Add Pipeline';
            else if (kind === 'routine')  btn.textContent = '+ Add Routine';
            else                          btn.textContent = '+ Add Pipeline';
        }
        renderPipelineCards();
    }

    function addPipeline() {
        if (activePipelineTab === 'output') { addOutputGroup(); return; }
        if (activePipelineTab === 'timer')  { return; } // timers added from Pipelines/Routines
        pipelineSeq++;
        const kind  = activePipelineTab === 'input' ? 'sensor' : activePipelineTab;
        const label = kind === 'routine' ? 'Routine ' : kind === 'sensor' ? 'Input Group ' : 'Pipeline ';
        state.pipelines.push({ id: genPipelineId(), name: label + pipelineSeq, kind, enabled: true, collapsed: false, blocks: [] });
        selectedPipelineIdx = state.pipelines.length - 1;
        renderPipelineCards();
        renderFbPalette();
    }

    function removePipeline(idx) {
        state.pipelines.splice(idx, 1);
        if (selectedPipelineIdx >= state.pipelines.length) selectedPipelineIdx = state.pipelines.length - 1;
        renderPipelineCards();
        renderFbPalette();
    }

    function renamePipeline(idx, name) {
        if (!state.pipelines[idx]) return;
        state.pipelines[idx].name = name.trim() || ('Pipeline ' + (idx + 1));
        // Keep suspend/resume aliases in sync with the renamed pipeline
        const renamedId = state.pipelines[idx].id;
        const newName   = state.pipelines[idx].name;
        state.pipelines.forEach(pl => pl.blocks.forEach(blk => {
            if ((blk.blockType === 'pipeline_suspend' || blk.blockType === 'pipeline_resume') &&
                    blk.settings && blk.settings.pipeline_id === renamedId) {
                blk.alias = (blk.blockType === 'pipeline_suspend' ? 'Suspend: ' : 'Resume: ') + newName;
            }
        }));
    }

    function togglePipelineCollapse(idx) {
        if (state.pipelines[idx]) state.pipelines[idx].collapsed = !state.pipelines[idx].collapsed;
        renderPipelineCards();
    }

    function togglePipelineEnabled(idx, enabled) {
        if (state.pipelines[idx]) state.pipelines[idx].enabled = enabled;
    }

    function selectPipeline(idx) {
        selectedPipelineIdx = idx;
        renderPipelineCards();
        renderFbPalette();
    }

    // ── Fan output helpers ────────────────────────────────────────────────────
    function addFanOutputFromDropdown(pipelineIdx, blockIdx) {
        const sel = document.getElementById('fan-add-sel-' + pipelineIdx + '-' + blockIdx);
        if (!sel || !sel.value) return;
        addFanOutput(pipelineIdx, blockIdx, sel.value);
        sel.value = '';
    }

    function addFanOutput(pipelineIdx, blockIdx, blockTypeId) {
        const blk = state.pipelines[pipelineIdx] && state.pipelines[pipelineIdx].blocks[blockIdx];
        if (!blk) return;
        const foDef = fbBlocks.find(f => f.id === blockTypeId);
        if (!foDef) return;
        if (!blk.fan_outputs) blk.fan_outputs = [];
        const settings = {};
        foDef.settings.forEach(s => { settings[s.name] = s.default; });
        blk.fan_outputs.push({ blockType: blockTypeId, alias: '', settings, expanded: false });
        renderPipelineCards();
        renderPinMap();
    }

    function removeFanOutput(pipelineIdx, blockIdx, outputIdx) {
        const blk = state.pipelines[pipelineIdx] && state.pipelines[pipelineIdx].blocks[blockIdx];
        if (!blk || !blk.fan_outputs) return;
        blk.fan_outputs.splice(outputIdx, 1);
        renderPipelineCards();
        renderPinMap();
    }

    function toggleFanOutputDetail(pipelineIdx, blockIdx, outputIdx) {
        const blk = state.pipelines[pipelineIdx] && state.pipelines[pipelineIdx].blocks[blockIdx];
        if (!blk || !blk.fan_outputs || !blk.fan_outputs[outputIdx]) return;
        blk.fan_outputs[outputIdx].expanded = !blk.fan_outputs[outputIdx].expanded;
        renderPipelineCards();
    }

    function renameFanOutput(pipelineIdx, blockIdx, outputIdx, alias) {
        const blk = state.pipelines[pipelineIdx] && state.pipelines[pipelineIdx].blocks[blockIdx];
        if (!blk || !blk.fan_outputs || !blk.fan_outputs[outputIdx]) return;
        blk.fan_outputs[outputIdx].alias = alias.trim();
    }

    function updateFanOutputSetting(pipelineIdx, blockIdx, outputIdx, name, value) {
        const blk = state.pipelines[pipelineIdx] && state.pipelines[pipelineIdx].blocks[blockIdx];
        if (!blk || !blk.fan_outputs || !blk.fan_outputs[outputIdx]) return;
        const fo = blk.fan_outputs[outputIdx];
        const foDef = fbBlocks.find(f => f.id === fo.blockType);
        if (!foDef) return;
        const sdef = foDef.settings.find(s => s.name === name);
        if (!sdef) return;
        if (sdef.type === 'bool') fo.settings[name] = !!value;
        else if (sdef.type === 'float') fo.settings[name] = parseFloat(value);
        else if (sdef.type.startsWith('uint') || sdef.type.startsWith('int')) fo.settings[name] = parseInt(value, 10);
        else fo.settings[name] = value;
        if (sdef.pin_cap) {
            if (sdef.pin_cap && typeof value === 'string' && value.startsWith('periph:')) {
                fo.settings[name] = value;
            }
            const assignKey = 'pl_' + pipelineIdx + '_bl_' + blockIdx + '_fo_' + outputIdx + '_' + name;
            delete state.pinAssignments[assignKey];
            const stored = fo.settings[name];
            if (typeof stored === 'number' && stored >= 0) {
                const foLabel = fo.alias ? fo.alias + ' - ' + fo.blockType : fo.blockType;
                state.pinAssignments[assignKey] = { gpio: stored, label: foLabel };
            }
        }
        renderPinMap();
    }

    function addBlockFromDropdown(pipelineIdx) {
        const sel = document.getElementById('add-block-sel-' + pipelineIdx);
        if (!sel || !sel.value) return;
        addBlockToPipeline(pipelineIdx, sel.value);
        sel.value = '';
    }

    function addBlockToPipeline(pipelineIdx, blockTypeId) {
        const pl = state.pipelines[pipelineIdx];
        if (!pl) return;
        const fbDef = fbBlocks.find(f => f.id === blockTypeId);
        if (!fbDef) return;
        const settings = {};
        fbDef.settings.forEach(s => { settings[s.name] = s.default; });
        const newBlock = { blockType: blockTypeId, alias: '', settings, expanded: false };
        if (fbDef.fan) newBlock.fan_outputs = [];
        pl.blocks.push(newBlock);
        renderPipelineCards();
        renderPinMap();
    }

    function removeBlockFromPipeline(pipelineIdx, blockIdx) {
        const pl = state.pipelines[pipelineIdx];
        if (!pl) return;
        pl.blocks.splice(blockIdx, 1);
        renderPipelineCards();
        renderPinMap();
    }

    function renameBlock(pipelineIdx, blockIdx, alias) {
        const pl = state.pipelines[pipelineIdx];
        if (pl && pl.blocks[blockIdx]) pl.blocks[blockIdx].alias = alias.trim();
        renderPinMap();
    }

    function toggleBlockDetail(pipelineIdx, blockIdx) {
        const pl = state.pipelines[pipelineIdx];
        if (!pl || !pl.blocks[blockIdx]) return;
        pl.blocks[blockIdx].expanded = !pl.blocks[blockIdx].expanded;
        renderPipelineCards();
    }

    function updatePowerGroupSetting(pipelineIdx, pwrKey, name, value) {
        const pl = state.pipelines[pipelineIdx];
        if (!pl) return;
        pl.blocks.forEach(blk => {
            if (String(blk.settings && blk.settings.pin_power) === String(pwrKey)) {
                if (!blk.settings) blk.settings = {};
                const fd = fbBlocks.find(f => f.id === blk.blockType);
                const sdef = fd ? fd.settings.find(s => s.name === name) : null;
                if (sdef && sdef.type === 'bool') blk.settings[name] = !!value;
                else if (sdef && (sdef.type.startsWith('uint') || sdef.type.startsWith('int'))) blk.settings[name] = parseInt(value, 10);
                else blk.settings[name] = value;
            }
        });
        renderInputCards();
    }

    function updateBlockSetting(pipelineIdx, blockIdx, name, value) {
        const pl = state.pipelines[pipelineIdx];
        if (!pl || !pl.blocks[blockIdx]) return;
        const blk = pl.blocks[blockIdx];
        const fbDef = fbBlocks.find(f => f.id === blk.blockType);
        const sdef  = fbDef ? fbDef.settings.find(s => s.name === name) : null;
        if (sdef) {
            // pin_cap settings accept either a raw GPIO integer OR a peripheral signal ref ("periph:id:sig")
            if (sdef.pin_cap && typeof value === 'string' && value.startsWith('periph:')) {
                blk.settings[name] = value;
            } else if (sdef.type === 'bool') blk.settings[name] = !!value;
            else if (sdef.type === 'float') blk.settings[name] = parseFloat(value);
            else if (sdef.type.startsWith('uint') || sdef.type.startsWith('int')) blk.settings[name] = parseInt(value, 10);
            else blk.settings[name] = value;
            // Update pin map when a pin_cap setting changes
            if (sdef.pin_cap) {
                const assignKey = 'pl_' + pipelineIdx + '_bl_' + blockIdx + '_' + name;
                delete state.pinAssignments[assignKey];
                const stored = blk.settings[name];
                if (typeof stored === 'number' && stored >= 0) {
                    state.pinAssignments[assignKey] = { gpio: stored, label: makePinLabel(blk.alias, blk.blockType, fbDef, name) };
                }
                // Sync HX711 pin changes back to the linked peripheral
                if (blk.blockType === 'sensor_hx711' && pl.peripheral_id) {
                    const periph = state.peripherals.find(p => p.id === pl.peripheral_id);
                    if (periph) periph.pins[name] = typeof stored === 'number' ? stored : -1;
                }
                renderPeripherals();
                renderPinMap();
            }
            // Auto-sync alias for pipeline_suspend / pipeline_resume when target pipeline changes
            if (name === 'pipeline_id' && (blk.blockType === 'pipeline_suspend' || blk.blockType === 'pipeline_resume')) {
                const tPl   = state.pipelines.find(p => p.id === value);
                const tName = tPl ? tPl.name : 'Unknown';
                blk.alias   = (blk.blockType === 'pipeline_suspend' ? 'Suspend: ' : 'Resume: ') + tName;
                renderPipelineCards();
                return;
            }
            // Auto-sync alias for DHT22 blocks when peripheral_id changes
            if (name === 'peripheral_id' && (blk.blockType === 'sensor_dht22_temp' || blk.blockType === 'sensor_dht22_humid')) {
                const periph = state.peripherals.find(p => p.id === value);
                if (periph) {
                    const sigLabel = blk.blockType === 'sensor_dht22_temp' ? 'Temp' : 'Humid';
                    blk.alias = (periph.alias || 'DHT22') + ' ' + sigLabel;
                }
                renderPipelineCards();
                return;
            }
            // Auto-sync alias for sensor_value when sensor_ref changes
            if (name === 'sensor_ref' && blk.blockType === 'sensor_value' && value) {
                const parts = value.split(':');
                if (parts.length >= 2) {
                    const sp = state.pipelines.find(p => p.id === parts[0]);
                    const sb = sp && sp.blocks[parseInt(parts[1], 10)];
                    if (sb && sb.alias) blk.alias = sb.alias;
                    else if (sp) blk.alias = sp.name + ' Sensor';
                }
                renderPipelineCards();
                return;
            }
        } else { blk.settings[name] = value; }
        // Changing pin_power moves the block to a different power group — re-render Inputs tab
        if (name === 'pin_power') renderPipelineCards();
    }

    // Rebuild pipeline-derived pin assignments from current state.pipelines.
    // Called after loading a role or any batch update to pipeline blocks.
    // ── Exit Conditions (Run Until) ────────────────────────────────────────────
    function addExitCondition(pi, bi) {
        const blk = state.pipelines[pi] && state.pipelines[pi].blocks[bi];
        if (!blk) return;
        if (!blk.exit_conditions) blk.exit_conditions = [];
        blk.exit_conditions.push({ id: Math.random().toString(36).slice(2, 8), label: '', src_block: -1, src_port: 0 });
        renderPipelineCards();
    }

    function removeExitCondition(pi, bi, ci) {
        const blk = state.pipelines[pi] && state.pipelines[pi].blocks[bi];
        if (!blk || !blk.exit_conditions) return;
        blk.exit_conditions.splice(ci, 1);
        renderPipelineCards();
    }

    function updateExitConditionLabel(pi, bi, ci, val) {
        const blk = state.pipelines[pi] && state.pipelines[pi].blocks[bi];
        if (!blk || !blk.exit_conditions || !blk.exit_conditions[ci]) return;
        blk.exit_conditions[ci].label = val;
    }

    function updateExitConditionSrc(pi, bi, ci, val) {
        const blk = state.pipelines[pi] && state.pipelines[pi].blocks[bi];
        if (!blk || !blk.exit_conditions || !blk.exit_conditions[ci]) return;
        if (!val) {
            blk.exit_conditions[ci].src_block = -1;
            blk.exit_conditions[ci].src_port  = 0;
        } else {
            const parts = val.split(':');
            blk.exit_conditions[ci].src_block = parseInt(parts[0], 10);
            blk.exit_conditions[ci].src_port  = parseInt(parts[1], 10);
        }
    }

    // ── Inner Pipeline (abortable_sub_pipeline blocks[]) ───────────────────────

    function addInnerBlockFromDropdown(pi, bi) {
        const sel = document.getElementById('inner-add-sel-' + pi + '-' + bi);
        if (!sel || !sel.value) return;
        const blockType = sel.value;
        sel.value = '';
        addInnerBlock(pi, bi, blockType);
    }

    function addInnerBlock(pi, bi, blockType) {
        const blk = state.pipelines[pi] && state.pipelines[pi].blocks[bi];
        if (!blk || blk.blockType !== 'abortable_sub_pipeline') return;
        if (!blk.blocks) blk.blocks = [];
        const fbDef = fbBlocks.find(f => f.id === blockType);
        if (!fbDef) return;
        const settings = {};
        (fbDef.settings || []).forEach(s => { settings[s.name] = s.default; });
        blk.blocks.push({ blockType, alias: '', settings, expanded: false });
        renderPipelineCards();
    }

    function removeInnerBlock(pi, bi, ibi) {
        const blk = state.pipelines[pi] && state.pipelines[pi].blocks[bi];
        if (!blk || !blk.blocks) return;
        blk.blocks.splice(ibi, 1);
        renderPipelineCards();
    }

    function toggleInnerBlockDetail(pi, bi, ibi) {
        const blk = state.pipelines[pi] && state.pipelines[pi].blocks[bi];
        if (!blk || !blk.blocks || !blk.blocks[ibi]) return;
        blk.blocks[ibi].expanded = !blk.blocks[ibi].expanded;
        renderPipelineCards();
    }

    function renameInnerBlock(pi, bi, ibi, val) {
        const blk = state.pipelines[pi] && state.pipelines[pi].blocks[bi];
        if (!blk || !blk.blocks || !blk.blocks[ibi]) return;
        blk.blocks[ibi].alias = val;
    }

    function updateInnerBlockSetting(pi, bi, ibi, name, val) {
        const blk = state.pipelines[pi] && state.pipelines[pi].blocks[bi];
        if (!blk || !blk.blocks || !blk.blocks[ibi]) return;
        const iblk = blk.blocks[ibi];
        const fbDef = fbBlocks.find(f => f.id === iblk.blockType);
        const sdef = fbDef && fbDef.settings.find(s => s.name === name);
        if (sdef) {
            if (sdef.type === 'bool') val = (val === true || val === 'true');
            else if (sdef.type.startsWith('uint') || sdef.type.startsWith('int')) val = parseInt(val, 10);
            else if (sdef.type === 'float') val = parseFloat(val);
            if (sdef.pin_cap) {
                val = parseInt(val, 10);
                const assignKey = 'pl_' + pi + '_bl_' + bi + '_ib_' + ibi + '_' + name;
                delete state.pinAssignments[assignKey];
                if (typeof val === 'number' && val >= 0) {
                    state.pinAssignments[assignKey] = { gpio: val, label: makePinLabel(iblk.alias, iblk.blockType, fbDef, name) };
                }
                renderPinMap();
            }
        }
        iblk.settings[name] = val;
        // Auto-alias for sensor_value
        if (name === 'sensor_ref' && iblk.blockType === 'sensor_value' && val) {
            const parts = String(val).split(':');
            if (parts.length >= 2) {
                const sp = state.pipelines.find(p => p.id === parts[0]);
                const sb = sp && sp.blocks[parseInt(parts[1], 10)];
                if (sb && sb.alias) iblk.alias = sb.alias;
            }
            renderPipelineCards();
        }
    }

    // ── Peripherals ────────────────────────────────────────────────────────────

    function genPeripheralId() {
        return 'periph_' + Math.random().toString(36).slice(2, 10);
    }

    function genMutexGroupId() {
        return 'mxg_' + Math.random().toString(36).slice(2, 8);
    }

    // ── Mutex Group Management ──────────────────────────────────────────────

    function renderMutexGroups() {
        const list = document.getElementById('mutex-groups-list');
        if (!list) return;
        if (!state.mutex_groups || state.mutex_groups.length === 0) {
            list.innerHTML = '<span class="mutex-group-empty">No groups defined</span>';
            return;
        }
        list.innerHTML = state.mutex_groups.map(g =>
            '<div class="mutex-group-chip" data-mgid="' + escapeHtml(g.id) + '">' +
            '<input type="text" value="' + escapeHtml(g.name) + '" ' +
                'onchange="renameMutexGroup(\'' + escapeHtml(g.id) + '\', this.value)" ' +
                'title="Rename this mutex group"/>' +
            '<button class="mutex-group-chip-remove" ' +
                'onclick="removeMutexGroup(\'' + escapeHtml(g.id) + '\')" ' +
                'title="Remove group">✕</button>' +
            '</div>'
        ).join('');
    }

    function addMutexGroup() {
        const id = genMutexGroupId();
        state.mutex_groups = state.mutex_groups || [];
        state.mutex_groups.push({ id, name: 'GROUP' });
        renderMutexGroups();
        // Re-render peripherals so new group appears in each dropdown
        renderPeripherals();
        // Focus the new chip's input
        setTimeout(() => {
            const chip = document.querySelector('.mutex-group-chip[data-mgid="' + id + '"] input');
            if (chip) { chip.select(); chip.focus(); }
        }, 0);
    }

    function removeMutexGroup(groupId) {
        state.mutex_groups = (state.mutex_groups || []).filter(g => g.id !== groupId);
        // Clear the group from any peripheral that had it
        (state.peripherals || []).forEach(p => {
            if (p.mutex_group === groupId) p.mutex_group = null;
        });
        renderMutexGroups();
        renderPeripherals();
    }

    function renameMutexGroup(groupId, newName) {
        const g = (state.mutex_groups || []).find(g => g.id === groupId);
        if (!g) return;
        g.name = (newName || '').trim() || g.name;
        // Re-render peripheral dropdowns so they show the updated name
        renderPeripherals();
    }

    function updatePeripheralMutexGroup(periphId, groupId) {
        const p = state.peripherals.find(p => p.id === periphId);
        if (!p) return;
        p.mutex_group = groupId || null;
        // No full re-render needed — just update the select value directly
    }

    function showAddPeripheralMenu(btn) {
        const menu = document.getElementById('add-peripheral-menu');
        if (!menu) return;
        const showing = menu.style.display !== 'none';
        if (showing) { menu.style.display = 'none'; return; }

        // Build menu items from peripheralTypes
        menu.innerHTML = peripheralTypes.map(pt =>
            '<div class="add-peripheral-menu-item" onclick="event.stopPropagation(); addPeripheral(\'' + pt.id + '\'); document.getElementById(\'add-peripheral-menu\').style.display=\'none\'">' +
            '<strong>' + escapeHtml(pt.label) + '</strong>' +
            '<div style="font-size:9px;color:var(--vscode-descriptionForeground);margin-top:1px">' + escapeHtml(pt.description) + '</div>' +
            '</div>'
        ).join('');
        menu.style.display = 'block';

        // Close on next outside click
        setTimeout(() => {
            const close = (e) => {
                if (!menu.contains(e.target) && e.target !== btn) {
                    menu.style.display = 'none';
                    document.removeEventListener('click', close);
                }
            };
            document.addEventListener('click', close);
        }, 0);
    }

    function addPeripheral(typeId) {
        const ptype = peripheralTypes.find(p => p.id === typeId);
        if (!ptype) return;
        const config = {};
        (ptype.config || []).forEach(c => { config[c.name] = c.default; });
        const pins = {};
        (ptype.pin_slots || []).forEach(s => { pins[s.name] = -1; });
        // Pre-assign mutex group: find an existing group whose name matches the type default (case-insensitive)
        let defaultMutexGroup = null;
        if (ptype.mutex_group) {
            const typeName = ptype.mutex_group.toUpperCase();
            const match = (state.mutex_groups || []).find(g => g.name.toUpperCase() === typeName);
            if (match) defaultMutexGroup = match.id;
        }
        const periph = {
            id:          genPeripheralId(),
            type:        typeId,
            alias:       ptype.label,
            config,
            pins,
            collapsed:   false,
            mutex_group: defaultMutexGroup,
        };
        state.peripherals.push(periph);
        renderPeripherals();
        rebuildPeripheralPinAssignments();
        renderPinMap();

        // Auto-create sensor source pipelines for known peripheral types
        if (typeId === 'encoder_mapped') {
            const encBlock = {
                blockType: 'encoder_mapped',
                alias: periph.alias,
                settings: { peripheral_id: periph.id, enabled: true },
                expanded: false, exit_conditions: [], fan_outputs: [],
            };
            state.pipelines.push({
                id: genPipelineId(),
                name: periph.alias,
                kind: 'sensor',
                enabled: true,
                collapsed: false,
                peripheral_id: periph.id,
                blocks: [encBlock],
            });
            selectedPipelineIdx = state.pipelines.length - 1;
            switchPipelineTab('input');
            renderPipelineCards();
            renderFbPalette();
            return;
        }

        if (typeId === 'hx711') {
            const cfg = periph.config;
            const gainVal = parseInt(cfg.gain, 10) || 128;
            const hxBlock = {
                blockType: 'sensor_hx711',
                alias: 'Weight',
                settings: {
                    pin_clk: -1, pin_dat: -1,
                    gain: gainVal,
                    sample_interval_ms: cfg.sample_interval_ms || 100,
                    tare_raw: cfg.tare_raw || 0,
                    scale_factor: cfg.scale_factor !== undefined ? cfg.scale_factor : 1.0,
                    scale_offset: cfg.scale_offset !== undefined ? cfg.scale_offset : 0.0,
                    enabled: true,
                },
                expanded: false, exit_conditions: [], fan_outputs: [],
            };
            state.pipelines.push({
                id: genPipelineId(),
                name: periph.alias,
                kind: 'sensor',
                enabled: true,
                collapsed: false,
                peripheral_id: periph.id,
                blocks: [hxBlock],
            });
            selectedPipelineIdx = state.pipelines.length - 1;
            switchPipelineTab('input');
            renderPipelineCards();
            renderFbPalette();
            return;
        }

        const autoSensorDef =
            typeId === 'ads1115'  ? { blocks: ['Ch 0', 'Ch 1', 'Ch 2', 'Ch 3'], rawHigh: 32767 } :
            typeId === 'ds18b20'  ? { blocks: ['Temperature'],                   rawHigh: 4095  } :
            null;

        if (autoSensorDef) {
            pipelineSeq++;
            const makeBlock = (alias) => ({
                blockType: 'sensor_analog',
                alias,
                settings: { adc_channel: -1, pin_power: -1, sample_interval_ms: 1000, oversample_count: 8, raw_low: 0, raw_high: autoSensorDef.rawHigh, scale_min: 0.0, scale_max: 100.0, enabled: true },
                expanded: false, exit_conditions: [], fan_outputs: [],
            });
            state.pipelines.push({
                id: genPipelineId(),
                name: periph.alias,
                kind: 'sensor',
                enabled: true,
                collapsed: false,
                peripheral_id: periph.id,
                blocks: autoSensorDef.blocks.map(makeBlock),
            });
            selectedPipelineIdx = state.pipelines.length - 1;
            switchPipelineTab('input');
            renderPipelineCards();
            renderFbPalette();
        }
    }

    function removePeripheral(periphId) {
        const idx = state.peripherals.findIndex(p => p.id === periphId);
        if (idx < 0) return;
        // Remove pin assignments for this peripheral
        Object.keys(state.pinAssignments).forEach(k => {
            if (k.startsWith('periph:' + periphId + ':')) delete state.pinAssignments[k];
        });
        // Remove any output groups auto-created for this peripheral
        if (state.output_groups) {
            // Remove groups owned by this peripheral (e.g. future group-level peripherals)
            state.output_groups = state.output_groups.filter(g => g.peripheral_id !== periphId);
            // Remove individual pins that were auto-registered for this peripheral (e.g. pwm_device)
            state.output_groups.forEach(g => {
                g.pins = g.pins.filter(p => p.peripheral_id !== periphId);
            });
        }
        // Remove any sensor pipelines auto-created for this peripheral
        const linkedPl = state.pipelines.filter(pl => pl.peripheral_id === periphId);
        if (linkedPl.length > 0) {
            state.pipelines = state.pipelines.filter(pl => pl.peripheral_id !== periphId);
            if (selectedPipelineIdx >= state.pipelines.length) selectedPipelineIdx = state.pipelines.length - 1;
            renderPipelineCards();
            renderFbPalette();
        }
        state.peripherals.splice(idx, 1);
        renderPeripherals();
        renderPinMap();
    }

    // ── OLED screen designer (ptype.ui_params === true) ──────────────────────

    /**
     * Ensure a peripheral has a valid ui_params structure with 2 screens × 8 elements.
     */
    function ensureOledUiParams(periph) {
        if (!periph.ui_params) periph.ui_params = {};
        if (!periph.ui_params.screens) periph.ui_params.screens = [];
        while (periph.ui_params.screens.length < 2) {
            periph.ui_params.screens.push({ elements: [] });
        }
    }

    function _oledActiveScreen(periphId) {
        const key = '_oledActiveScreen_' + periphId;
        return window[key] !== undefined ? window[key] : 0;
    }

    function switchOledScreen(periphId, idx) {
        window['_oledActiveScreen_' + periphId] = idx;
        renderPeripherals();
    }

    function addOledElement(periphId) {
        const p = state.peripherals.find(x => x.id === periphId);
        if (!p) return;
        ensureOledUiParams(p);
        const s = _oledActiveScreen(periphId);
        const elems = p.ui_params.screens[s].elements;
        if (elems.length >= 8) return;
        elems.push({ type: 'label', x: 0, y: 0, font: '6x8', fmt: 'f1', width: 0,
                     range_min: 0, range_max: 100, prefix: '', tel_key: '' });
        renderPeripherals();
    }

    function deleteOledElement(periphId, screenIdx, elemIdx) {
        const p = state.peripherals.find(x => x.id === periphId);
        if (!p) return;
        ensureOledUiParams(p);
        p.ui_params.screens[screenIdx].elements.splice(elemIdx, 1);
        renderPeripherals();
    }

    function updateOledElement(periphId, screenIdx, elemIdx, field, val) {
        const p = state.peripherals.find(x => x.id === periphId);
        if (!p) return;
        ensureOledUiParams(p);
        const elem = p.ui_params.screens[screenIdx].elements[elemIdx];
        if (!elem) return;
        if (field === 'x' || field === 'y' || field === 'width') val = parseInt(val, 10) || 0;
        if (field === 'range_min' || field === 'range_max') val = parseFloat(val) || 0;
        elem[field] = val;
        refreshOledCanvas(periphId);
    }

    /** Repaint only the canvas preview for one OLED peripheral, without re-rendering the whole card. */
    function refreshOledCanvas(periphId) {
        const p = state.peripherals.find(x => x.id === periphId);
        if (!p) return;
        ensureOledUiParams(p);
        const canvasEl = document.getElementById('oled-canvas-' + periphId);
        if (!canvasEl) return;
        const activeScreen = _oledActiveScreen(periphId);
        const elements = (p.ui_params.screens[activeScreen] || {}).elements || [];
        const fontMap = { '6x8': [6, 8], '8x8': [8, 8], '8x16': [8, 16], '16x16': [16, 16] };
        const scale = 4;
        canvasEl.innerHTML = elements.map(elem => {
            if (!elem.type || elem.type === 'none') return '';
            const [, fh] = fontMap[elem.font || '6x8'] || [6, 8];
            const label = (elem.prefix || '') + (elem.tel_key ? '[' + elem.tel_key.split(':').pop() + ']' : '');
            if (elem.type === 'hline') {
                const w = (elem.width || 128) * scale;
                return '<div style="position:absolute;left:' + (elem.x * scale) + 'px;top:' + (elem.y * scale) + 'px;' +
                    'width:' + w + 'px;height:' + scale + 'px;background:#0f0;opacity:0.7"></div>';
            }
            if (elem.type === 'bar') {
                const w = (elem.width || 80) * scale;
                const h = fh * scale;
                return '<div style="position:absolute;left:' + (elem.x * scale) + 'px;top:' + (elem.y * scale) + 'px;' +
                    'width:' + w + 'px;height:' + h + 'px;border:' + scale + 'px solid #0f0;opacity:0.7;' +
                    'box-sizing:border-box"></div>';
            }
            return '<div style="position:absolute;left:' + (elem.x * scale) + 'px;top:' + (elem.y * scale) + 'px;' +
                'color:#0f0;font-size:' + (fh * scale * 0.6) + 'px;line-height:' + (fh * scale) + 'px;' +
                'font-family:monospace;white-space:nowrap;pointer-events:none">' +
                escapeHtml(label || elem.type) + '</div>';
        }).join('');
    }

    /**
     * Collect all telemetry keys exposed by peripherals that have signals.
     * Returns array of { key, label } for populating tel_key dropdowns.
     */
    function _oledTelKeys() {
        const keys = [{ key: '', label: '— none —' }];

        // Peripheral signals (encoder, dht22, etc.)
        state.peripherals.forEach(periph => {
            const ptype = peripheralTypes.find(pt => pt.id === periph.type);
            if (!ptype || !ptype.signals) return;
            ptype.signals.forEach(sig => {
                const key = 'periph:' + periph.id + ':' + sig.name;
                const label = (periph.alias || ptype.label) + ' / ' + sig.label;
                keys.push({ key, label });
            });
        });

        // Pipeline sensor_analog blocks → key "ADC<channel>" matches firmware pds_tel_sink label
        (state.pipelines || []).forEach(pl => {
            (pl.blocks || []).forEach(blk => {
                if (blk.blockType !== 'sensor_analog') return;
                const ch = (blk.settings || {}).adc_channel;
                if (ch == null) return;
                const displayName = blk.alias || ('ADC Channel ' + ch);
                keys.push({ key: 'ADC' + ch, label: displayName + ' (ADC' + ch + ')' });
            });
        });

        // Control-point variables — pipeline block settable float fields.
        // Key format: 'cp:<pipeline_id>:<block_idx>:<field_name>'
        // Packer resolves to 'cp:<pl_numeric_idx>:<block_idx>:<field_name>' at pack time.
        // Firmware registers these via pds_tel_sink (PDS_TEL_PIPELINE kind).
        (state.pipelines || []).forEach(pl => {
            (pl.blocks || []).forEach((blk, bi) => {
                const blkDef = fbBlocks.find(f => f.id === blk.blockType);
                if (!blkDef || !blkDef.settings) return;
                blkDef.settings.forEach(fdef => {
                    if (fdef.type !== 'float') return;
                    const key = 'cp:' + pl.id + ':' + bi + ':' + fdef.name;
                    const plName = pl.name || pl.id;
                    const blkLabel = blk.alias || blkDef.label || blk.blockType;
                    keys.push({ key, label: '[' + plName + '] ' + blkLabel + ' → ' + fdef.name });
                });
            });
        });

        return keys;
    }

    /**
     * Render the OLED screen designer panel body for one OLED peripheral.
     * Returns an HTML string replacing the normal pins/config/signals body.
     */
    function renderOledPanel(periph, ptype) {
        ensureOledUiParams(periph);
        const activeScreen = _oledActiveScreen(periph.id);
        const si = periph.id;

        // ── Tab bar ──
        const tabs = [0, 1].map(i =>
            '<button class="oled-screen-tab' + (i === activeScreen ? ' active' : '') + '" ' +
            'onclick="event.stopPropagation(); switchOledScreen(\'' + si + '\',' + i + ')">Screen ' + (i + 1) + '</button>'
        ).join('');

        // ── Config rows (i2c_addr, flip, refresh_ms, cycle_ms) ──
        const cfgRows = (ptype.config || []).map(cdef => {
            const val = periph.config[cdef.name] !== undefined ? periph.config[cdef.name] : cdef.default;
            let input;
            if (cdef.type === 'bool') {
                input = '<input type="checkbox" ' + (val ? 'checked' : '') +
                    ' onclick="event.stopPropagation()" ' +
                    ' onchange="updatePeripheralConfig(\'' + si + '\',\'' + cdef.name + '\',this.checked)" />';
            } else {
                input = '<input class="periph-cfg-input" type="number" value="' + escapeHtml(String(val)) + '" ' +
                    'title="' + escapeHtml(cdef.description || '') + '" ' +
                    'onclick="event.stopPropagation()" ' +
                    'oninput="updatePeripheralConfig(\'' + si + '\',\'' + cdef.name + '\',this.value)" />';
            }
            return '<div class="periph-cfg-row"><span class="periph-cfg-label" title="' +
                escapeHtml(cdef.description || '') + '">' + escapeHtml(cdef.name) + '</span>' + input + '</div>';
        }).join('');

        // ── Pin rows ──
        const capData = pinCaps[state.board];
        const pinRows = (ptype.pin_slots || []).map(slot => {
            const curGpio = (periph.pins[slot.name] !== undefined && periph.pins[slot.name] >= 0)
                ? periph.pins[slot.name] : -1;
            let options = '<option value="-1"' + (curGpio < 0 ? ' selected' : '') + '>— unassigned —</option>';
            if (capData) {
                capData.pins
                    .filter(p => !p.reserved && p.caps.some(c => c.toUpperCase() === 'GPIO'))
                    .sort((a, b) => a.gpio - b.gpio)
                    .forEach(p => {
                        const label = 'GPIO' + p.gpio + (p.jpin ? '  J' + p.jpin : '') + (p.name ? '  ' + p.name : '');
                        options += '<option value="' + p.gpio + '"' + (p.gpio === curGpio ? ' selected' : '') + '>' +
                            escapeHtml(label) + '</option>';
                    });
            }
            return '<div class="periph-pin-row"><span class="periph-pin-label">' + escapeHtml(slot.label) + '</span>' +
                '<select class="periph-pin-input" onclick="event.stopPropagation()" ' +
                'onchange="updatePeripheralPin(\'' + si + '\',\'' + slot.name + '\',this.value)">' +
                options + '</select></div>';
        }).join('');

        // ── Canvas preview (128×32 → 4× = 512×128 CSS px) ──
        const screen = periph.ui_params.screens[activeScreen];
        const elements = screen.elements || [];
        // Draw preview elements as positioned boxes with labels
        const previewItems = elements.map((elem, ei) => {
            if (!elem.type || elem.type === 'none') return '';
            const fontMap = { '6x8': [6, 8], '8x8': [8, 8], '8x16': [8, 16], '16x16': [16, 16] };
            const [fw, fh] = fontMap[elem.font || '6x8'] || [6, 8];
            const scale = 4;
            const label = (elem.prefix || '') + (elem.tel_key ? '[' + elem.tel_key.split(':').pop() + ']' : '');
            if (elem.type === 'hline') {
                const w = (elem.width || 128) * scale;
                return '<div style="position:absolute;left:' + (elem.x * scale) + 'px;top:' + (elem.y * scale) + 'px;' +
                    'width:' + w + 'px;height:' + scale + 'px;background:#0f0;opacity:0.7"></div>';
            }
            if (elem.type === 'bar') {
                const w = (elem.width || 80) * scale;
                const h = fh * scale;
                return '<div style="position:absolute;left:' + (elem.x * scale) + 'px;top:' + (elem.y * scale) + 'px;' +
                    'width:' + w + 'px;height:' + h + 'px;border:' + scale + 'px solid #0f0;opacity:0.7;' +
                    'box-sizing:border-box"></div>';
            }
            return '<div style="position:absolute;left:' + (elem.x * scale) + 'px;top:' + (elem.y * scale) + 'px;' +
                'color:#0f0;font-size:' + (fh * scale * 0.6) + 'px;line-height:' + (fh * scale) + 'px;' +
                'font-family:monospace;white-space:nowrap;pointer-events:none">' +
                escapeHtml(label || elem.type) + '</div>';
        }).join('');

        const canvas =
            '<div id="oled-canvas-' + si + '" style="position:relative;width:512px;height:128px;background:#111;border:1px solid #444;' +
            'margin:8px 0;overflow:hidden;cursor:default" ' +
            'title="128×32 OLED preview (4× scale)">' +
            previewItems +
            '</div>';

        // ── Element list ──
        const telKeys = _oledTelKeys();
        const fontOpts = ['6x8','8x8','8x16','16x16'];
        const fmtOpts  = ['f2','f1','f0','int','bool','pct'];
        const typeOpts = ['none','label','value','sensor value','bar','hline'];

        const elemRows = elements.map((elem, ei) => {
            const telOptions = telKeys.map(tk =>
                '<option value="' + escapeHtml(tk.key) + '"' +
                (elem.tel_key === tk.key ? ' selected' : '') + '>' +
                escapeHtml(tk.label) + '</option>'
            ).join('');

            const fmtStr = '<select onclick="event.stopPropagation()" ' +
                'onchange="updateOledElement(\'' + si + '\',' + activeScreen + ',' + ei + ',\'fmt\',this.value)">' +
                fmtOpts.map(o => '<option value="' + o + '"' + (elem.fmt === o ? ' selected' : '') + '>' + o + '</option>').join('') +
                '</select>';
            const fontStr = '<select onclick="event.stopPropagation()" ' +
                'onchange="updateOledElement(\'' + si + '\',' + activeScreen + ',' + ei + ',\'font\',this.value)">' +
                fontOpts.map(o => '<option value="' + o + '"' + (elem.font === o ? ' selected' : '') + '>' + o + '</option>').join('') +
                '</select>';
            const typeStr = '<select onclick="event.stopPropagation()" ' +
                'onchange="updateOledElement(\'' + si + '\',' + activeScreen + ',' + ei + ',\'type\',this.value)">' +
                typeOpts.map(o => '<option value="' + o + '"' + (elem.type === o ? ' selected' : '') + '>' + o + '</option>').join('') +
                '</select>';

            return '<div class="oled-elem-row">' +
                typeStr +
                '<label>x<input type="number" min="0" max="127" value="' + (elem.x || 0) + '" ' +
                    'onclick="event.stopPropagation()" ' +
                    'oninput="updateOledElement(\'' + si + '\',' + activeScreen + ',' + ei + ',\'x\',this.value)" /></label>' +
                '<label>y<input type="number" min="0" max="31" value="' + (elem.y || 0) + '" ' +
                    'onclick="event.stopPropagation()" ' +
                    'oninput="updateOledElement(\'' + si + '\',' + activeScreen + ',' + ei + ',\'y\',this.value)" /></label>' +
                fontStr +
                '<label>prefix<input type="text" maxlength="8" value="' + escapeHtml(elem.prefix || '') + '" ' +
                    'onclick="event.stopPropagation()" ' +
                    'oninput="updateOledElement(\'' + si + '\',' + activeScreen + ',' + ei + ',\'prefix\',this.value)" /></label>' +
                '<label>tel<select onclick="event.stopPropagation()" ' +
                    'onchange="updateOledElement(\'' + si + '\',' + activeScreen + ',' + ei + ',\'tel_key\',this.value)">' +
                    telOptions + '</select></label>' +
                fmtStr +
                '<label>w<input type="number" min="0" max="128" value="' + (elem.width || 0) + '" ' +
                    'onclick="event.stopPropagation()" ' +
                    'oninput="updateOledElement(\'' + si + '\',' + activeScreen + ',' + ei + ',\'width\',this.value)" /></label>' +
                '<button onclick="event.stopPropagation(); deleteOledElement(\'' + si + '\',' + activeScreen + ',' + ei + ')" ' +
                    'title="Remove element">\u2715</button>' +
                '</div>';
        }).join('');

        const addBtn = elements.length < 8
            ? '<button class="oled-add-elem-btn" onclick="event.stopPropagation(); addOledElement(\'' + si + '\')" ' +
              'title="Add element (max 8 per screen)">+ Add element</button>'
            : '<span style="font-size:11px;color:#888">Max 8 elements per screen</span>';

        return '<div class="periph-body oled-designer" onclick="event.stopPropagation()">' +
            '<div class="periph-section-label">Hardware</div>' +
            pinRows + cfgRows +
            '<div class="periph-section-label">Screen designer</div>' +
            '<div class="oled-screen-tabs">' + tabs + '</div>' +
            canvas +
            '<div class="oled-elem-list">' + elemRows + '</div>' +
            addBtn +
            '</div>';
    }

    function renderPeripherals() {
        renderMutexGroups();
        const list = document.getElementById('peripherals-list');
        if (!list) return;
        if (state.peripherals.length === 0) {
            list.innerHTML = '<div class="periph-empty">No peripherals added.<br>Use + Add to define sensors and chips.</div>';
            return;
        }
        list.innerHTML = state.peripherals.map((periph, idx) => {
            const ptype = peripheralTypes.find(p => p.id === periph.type);
            if (!ptype) return '';
            const chevronClass = periph.collapsed ? 'periph-chevron collapsed' : 'periph-chevron';

            // Pin rows
            const capData = pinCaps[state.board];
            const pinRows = (ptype.pin_slots || []).map(slot => {
                const curGpio = (periph.pins[slot.name] !== undefined && periph.pins[slot.name] >= 0)
                    ? periph.pins[slot.name] : -1;
                const capUpper = slot.cap.toUpperCase();
                // Build option list: unassigned + all non-reserved pins matching this cap
                let options = '<option value="-1"' + (curGpio < 0 ? ' selected' : '') + '>— unassigned —</option>';
                if (capData) {
                    capData.pins
                        .filter(p => !p.reserved && p.caps.some(c => {
                            const cu = c.toUpperCase();
                            return cu === capUpper || cu === 'GPIO' || (capUpper === 'ADC' && (cu === 'ADC-1' || cu === 'ADC-2'));
                        }))
                        .sort((a, b) => a.gpio - b.gpio)
                        .forEach(p => {
                            const label = 'GPIO' + p.gpio + (p.jpin ? '  J' + p.jpin : '') + (p.name ? '  ' + p.name : '');
                            options += '<option value="' + p.gpio + '"' + (p.gpio === curGpio ? ' selected' : '') + '>' +
                                escapeHtml(label) + '</option>';
                        });
                }
                return '<div class="periph-pin-row">' +
                    '<span class="periph-pin-label" title="' + escapeHtml(slot.description || '') + '">' + escapeHtml(slot.label) + '</span>' +
                    '<span class="periph-pin-cap cap-badge cap-' + slot.cap + '">' + escapeHtml(slot.cap) + '</span>' +
                    '<select class="periph-pin-input" ' +
                        'onchange="updatePeripheralPin(\'' + periph.id + '\',\'' + slot.name + '\',this.value)">' +
                        options +
                    '</select>' +
                    '</div>';
            }).join('');

            // Config rows
            const cfgRows = (ptype.config || []).map(cdef => {
                const val = periph.config[cdef.name] !== undefined ? periph.config[cdef.name] : cdef.default;
                let input;
                if (cdef.type === 'bool') {
                    input = '<input type="checkbox" ' + (val ? 'checked' : '') +
                        ' onchange="updatePeripheralConfig(\'' + periph.id + '\',\'' + cdef.name + '\',this.checked)" />';
                } else if (cdef.type.startsWith('enum:')) {
                    const opts = cdef.type.slice(5).split(',');
                    input = '<select class="periph-cfg-input" onchange="updatePeripheralConfig(\'' + periph.id + '\',\'' + cdef.name + '\',this.value)">' +
                        opts.map(o => '<option value="' + escapeHtml(o) + '"' + (String(val) === o ? ' selected' : '') + '>' + escapeHtml(o) + '</option>').join('') +
                        '</select>';
                } else if (cdef.type === 'control_point') {
                    const curRef = val || '';
                    let cpOpts = '<option value="">— none —</option>';
                    let cpCount = 0;
                    state.pipelines.forEach(tpl => {
                        (tpl.blocks || []).forEach((tb, tbi) => {
                            const tbDef = fbBlocks.find(f => f.id === tb.blockType);
                            if (!tbDef || !tbDef.settings) return;
                            tbDef.settings.forEach(fdef => {
                                if (fdef.type !== 'float') return;
                                const v = tpl.id + ':' + tbi + ':' + fdef.name;
                                const lbl = escapeHtml('[' + tpl.name + '] ' + (tb.alias || tbDef.label) + ' \u2192 ' + fdef.name);
                                cpOpts += '<option value="' + escapeHtml(v) + '"' + (curRef === v ? ' selected' : '') + '>' + lbl + '</option>';
                                cpCount++;
                            });
                        });
                    });
                    if (!cpCount) cpOpts += '<option value="" disabled style="color:var(--vscode-errorForeground);">No settable float fields found</option>';
                    input = '<select class="periph-cfg-input" onchange="updatePeripheralConfig(\'' + periph.id + '\',\'' + cdef.name + '\',this.value)">' + cpOpts + '</select>';
                } else {
                    input = '<input class="periph-cfg-input" type="' + (cdef.type.startsWith('uint') || cdef.type === 'float' ? 'number' : 'text') + '" ' +
                        'value="' + escapeHtml(String(val)) + '" ' +
                        'title="' + escapeHtml(cdef.description || '') + '" ' +
                        'oninput="updatePeripheralConfig(\'' + periph.id + '\',\'' + cdef.name + '\',this.value)" />';
                }
                return '<div class="periph-cfg-row">' +
                    '<span class="periph-cfg-label" title="' + escapeHtml(cdef.description || '') + '">' + escapeHtml(cdef.name) + '</span>' +
                    input + '</div>';
            }).join('');

            // Signal rows — each shows the signal name, type, and which block is assigned to read it
            const signalRows = (ptype.signals || []).map(sig => {
                const asgn = getSignalAssignment(periph.id, sig.name);
                const assignId = 'sig:' + periph.id + ':' + sig.name;
                const badge = asgn
                    ? '<span class="pin-assigned periph-sig-assigned" draggable="true" ' +
                        'data-assign-id="' + assignId + '">' + escapeHtml(asgn.label) + '</span>'
                    : '<span class="periph-sig-unassigned">—</span>';
                return '<div class="periph-signal-row" data-drop-signal="periph:' + periph.id + ':' + sig.name + '">' +
                    '<span class="periph-signal-name">' + escapeHtml(sig.name) + '</span>' +
                    '<span class="periph-signal-type">' + escapeHtml(sig.label) + '</span>' +
                    badge +
                    '</div>';
            }).join('');

            const body = periph.collapsed ? '' :
                ptype.ui_params
                    ? renderOledPanel(periph, ptype)
                    : '<div class="periph-body">' +
                    '<div class="periph-section-label">Pins</div>' + pinRows +
                    '<div class="periph-section-label">Config</div>' + cfgRows +
                    '<div class="periph-section-label">Signals</div>' +
                    '<div class="periph-signals">' + signalRows + '</div>' +
                    '</div>';

            // Mutex group selector — only show if any groups are defined
            const mutexGroups = state.mutex_groups || [];
            const mutexSelect = mutexGroups.length > 0
                ? '<select class="periph-mutex-select" ' +
                    'title="Mutual-exclusion group — only one peripheral per group may be active at a time" ' +
                    'onchange="updatePeripheralMutexGroup(\'' + periph.id + '\',this.value)" ' +
                    'onclick="event.stopPropagation()">' +
                    '<option value="">— mutex —</option>' +
                    mutexGroups.map(g =>
                        '<option value="' + escapeHtml(g.id) + '"' +
                        (periph.mutex_group === g.id ? ' selected' : '') +
                        '>' + escapeHtml(g.name) + '</option>'
                    ).join('') +
                    '</select>'
                : '';

            return '<div class="periph-card" data-periph-id="' + periph.id + '">' +
                '<div class="periph-card-header" onclick="togglePeripheralCollapse(\'' + periph.id + '\')">' +
                '<span class="periph-type-badge">' + escapeHtml(ptype.id) + '</span>' +
                mutexSelect +
                '<input class="periph-alias-input" type="text" value="' + escapeHtml(periph.alias) + '" ' +
                    'onclick="event.stopPropagation()" ' +
                    'oninput="updatePeripheralAlias(\'' + periph.id + '\',this.value)" ' +
                    'title="Peripheral name — used as label in pin map" />' +
                '<span class="' + chevronClass + '">&#9660;</span>' +
                '<button class="periph-remove-btn" onclick="event.stopPropagation(); removePeripheral(\'' + periph.id + '\')" title="Remove peripheral">\u2715</button>' +
                '</div>' +
                body +
                '</div>';
        }).join('');
    }

    function togglePeripheralCollapse(periphId) {
        const p = state.peripherals.find(p => p.id === periphId);
        if (p) { p.collapsed = !p.collapsed; renderPeripherals(); }
    }

    function updatePeripheralAlias(periphId, val) {
        const p = state.peripherals.find(p => p.id === periphId);
        if (p) {
            p.alias = val;
            // Keep labels on peripheral-backed output pins in sync with the new alias.
            // Label format: "<alias> — <slot label>". Preserve the suffix after the first ' — '.
            const ptype = peripheralTypes.find(pt => pt.id === p.type);
            if (ptype) {
                (state.output_groups || []).forEach(g => {
                    g.pins.forEach(op => {
                        if (op.peripheral_id !== periphId) return;
                        const sep = op.label.indexOf(' \u2014 ');
                        op.label = (val || ptype.label) + (sep >= 0 ? op.label.slice(sep) : '');
                    });
                });
            }
            rebuildPeripheralPinAssignments();
            renderPinMap();
            // Refresh pipeline cards so periph_ref: dropdowns show the updated name,
            // and refresh outputs tab so the output pin label is current.
            renderPipelineCards();
            renderOutputGroups();
        }
    }

    function updatePeripheralPin(periphId, slotName, val) {
        const p = state.peripherals.find(p => p.id === periphId);
        if (!p) return;
        const gpio = parseInt(val, 10);
        p.pins[slotName] = isNaN(gpio) ? -1 : gpio;
        syncPeripheralPinToOutputs(p, slotName, isNaN(gpio) ? -1 : gpio);
        // Sync HX711 pin changes down to the linked sensor_hx711 block
        if (p.type === 'hx711') {
            const linkedPl = state.pipelines.find(pl => pl.peripheral_id === p.id);
            if (linkedPl) {
                const hxBlock = linkedPl.blocks.find(b => b.blockType === 'sensor_hx711');
                if (hxBlock) hxBlock.settings[slotName] = isNaN(gpio) ? -1 : gpio;
            }
        }
        rebuildPeripheralPinAssignments();
        renderPinMap();
        // Auto-populate Outputs tab so the new GPIO appears there immediately.
        renderOutputGroups();
    }

    function updatePeripheralConfig(periphId, cfgName, val) {
        const p = state.peripherals.find(p => p.id === periphId);
        if (!p) return;
        const ptype = peripheralTypes.find(pt => pt.id === p.type);
        const cdef = ptype && ptype.config.find(c => c.name === cfgName);
        if (cdef) {
            if (cdef.type === 'bool') p.config[cfgName] = val === true || val === 'true';
            else if (cdef.type.startsWith('uint') || cdef.type === 'float') p.config[cfgName] = parseFloat(val);
            else p.config[cfgName] = val;
        }
    }

    // Returns the pipeline block consuming a peripheral signal, or null.
    // Scans all blocks for a setting with value 'periph:<periphId>:<sigName>'.
    function getSignalAssignment(periphId, sigName) {
        const ref = 'periph:' + periphId + ':' + sigName;
        for (let pi = 0; pi < state.pipelines.length; pi++) {
            const pl = state.pipelines[pi];
            for (let bi = 0; bi < pl.blocks.length; bi++) {
                const blk = pl.blocks[bi];
                const fbDef = fbBlocks.find(f => f.id === blk.blockType);
                if (!fbDef) continue;
                for (const sdef of fbDef.settings) {
                    if (blk.settings[sdef.name] === ref) {
                        const label = blk.alias || (fbDef.label + ' ' + (bi + 1));
                        return { label, pi, bi, sName: sdef.name };
                    }
                }
            }
        }
        return null;
    }

    function updatePeripheralSignalAlias() {} // removed — signals show computed assignments

    /**
     * When a GPIO is assigned to a peripheral pin that has output_type set (e.g. servo
     * pin_signal with output_type:'pwm'), auto-create or update a matching Output Group
     * entry so the assignment is visible in the Outputs tab and persists in the role JSON.
     */
    function syncPeripheralPinToOutputs(periph, slotName, gpio) {
        const ptype = peripheralTypes.find(pt => pt.id === periph.type);
        if (!ptype) return;
        const slotDef = (ptype.pin_slots || []).find(s => s.name === slotName);
        if (!slotDef || !slotDef.output_type) return;  // only act on output-type pins

        if (!state.output_groups) state.output_groups = [];

        // Servo/output pins belong in the mainboard (parent) group, not their own group.
        // Find the first group with no peripheral_id (mainboard group), or create one.
        let group = state.output_groups.find(g => !g.peripheral_id);
        if (!group) {
            group = {
                id:            genOutputGroupId(),
                name:          'Mainboard Outputs',
                peripheral_id: null,
                pins:          [],
            };
            state.output_groups.push(group);
        }

        // Label includes peripheral alias so the pin is identifiable in the group.
        const pinLabel = (periph.alias || ptype.label) + ' — ' + slotDef.label;
        let pin = group.pins.find(p => p.label === pinLabel);
        if (!pin) {
            // Compute pin parameters based on peripheral type
            let frequency, funcMin, funcMax;
            if (periph.type === 'pwm_device') {
                frequency = parseInt(periph.config && periph.config.frequency_hz || 1000, 10);
                funcMin   = periph.config && periph.config.func_min !== undefined ? periph.config.func_min : 0.0;
                funcMax   = periph.config && periph.config.func_max !== undefined ? periph.config.func_max : 100.0;
            } else {
                // Servo: express pulse widths as % of PWM period
                const freqHz   = parseInt((periph.config && periph.config.frequency_hz) || 50, 10);
                const pMinUs   = parseInt((periph.config && periph.config.pulse_min_us) || 1000, 10);
                const pMaxUs   = parseInt((periph.config && periph.config.pulse_max_us) || 2000, 10);
                const periodUs = 1000000.0 / freqHz;
                frequency = freqHz;
                funcMin   = Math.round(pMinUs / periodUs * 10000) / 100;
                funcMax   = Math.round(pMaxUs / periodUs * 10000) / 100;
            }
            pin = {
                id:                 genOutputPinId(),
                type:               slotDef.output_type,
                type_locked:        true,
                peripheral_id:      periph.type === 'pwm_device' ? periph.id : null,
                gpio:               gpio,
                label:              pinLabel,
                frequency:          frequency,
                func_min:           funcMin,
                func_max:           funcMax,
                count_rate_at_full: periph.config && periph.config.count_rate_at_full !== undefined ? periph.config.count_rate_at_full : 0.0,
            };
            group.pins.push(pin);
        } else {
            pin.gpio = gpio;
            // Ensure peripheral linkage stays current even when pin was created before this
            // peripheral was added (handles load-time label-match after a label sync).
            if (periph.type === 'pwm_device') {
                pin.peripheral_id = periph.id;
                pin.type_locked   = true;
            }
        }
        // If the Outputs tab is active, refresh it
        if (activePipelineTab === 'output') renderOutputGroups();
    }

    function rebuildPeripheralPinAssignments() {
        // Clear existing periph: keys
        Object.keys(state.pinAssignments).forEach(k => {
            if (k.startsWith('periph:')) delete state.pinAssignments[k];
        });
        state.peripherals.forEach(periph => {
            const ptype = peripheralTypes.find(pt => pt.id === periph.type);
            if (!ptype) return;
            (ptype.pin_slots || []).forEach(slot => {
                const gpio = parseInt(periph.pins[slot.name], 10);
                if (isNaN(gpio) || gpio < 0) return;
                const key = 'periph:' + periph.id + ':' + slot.name;
                const label = (periph.alias || ptype.label) + ' · ' + slot.label;
                // Slots with output_type drive a GPIO (output); others read it (input).
                const dir = slot.output_type ? 'out' : 'in';
                state.pinAssignments[key] = { gpio, label, peripheral: periph.id, dir };
            });
        });
    }

    /**
     * Build the pin-map label for a single pin_cap field.
     * When a block has multiple pin_cap fields (e.g. sensor_analog has both
     * adc_channel and pin_power), each entry gets a disambiguating per-field
     * suffix so the operator can tell them apart in the GPIO pin map panel:
     *   alias=PH, adc_channel  → "PH - sensor-adc"
     *   alias=PH, pin_power    → "PH - sensor-power"
     * Blocks with only one pin_cap field keep the legacy "alias - blockType" form.
     */
    function makePinLabel(alias, blockType, fbDef, fieldName) {
        const pinCapCount = fbDef.settings.filter(s => s.pin_cap).length;
        if (pinCapCount <= 1) {
            return alias ? alias + ' - ' + blockType : blockType;
        }
        // Derive a short field qualifier: strip leading 'pin_', trailing '_channel', normalise _ → -
        const fieldSuffix = fieldName.replace(/^pin_/, '').replace(/_channel$/, '').replace(/_/g, '-');
        const blockPrefix = blockType.split('_')[0];
        const pinLabel    = blockPrefix + '-' + fieldSuffix;
        return alias ? alias + ' - ' + pinLabel : pinLabel;
    }

    function rebuildPipelinePinAssignments() {
        Object.keys(state.pinAssignments).forEach(k => {
            if (k.startsWith('pl_') || k.startsWith('op_')) delete state.pinAssignments[k];
        });
        state.pipelines.forEach((pl, pi) => {
            pl.blocks.forEach((blk, bi) => {
                const fbDef = fbBlocks.find(f => f.id === blk.blockType);
                if (!fbDef) return;
                fbDef.settings.forEach(sdef => {
                    if (!sdef.pin_cap) return;
                    const raw = blk.settings[sdef.name];
                    if (typeof raw === 'string') return; // periph: ref — no raw GPIO
                    const gpio = parseInt(raw, 10);
                    if (isNaN(gpio) || gpio < 0) return; // -1 = not wired → skip
                    const assignKey = 'pl_' + pi + '_bl_' + bi + '_' + sdef.name;
                    // All pin_cap fields on pipeline blocks are GPIO reads (inputs).
                    state.pinAssignments[assignKey] = { gpio, label: makePinLabel(blk.alias, blk.blockType, fbDef, sdef.name), dir: 'in' };
                });
                // Also scan fan output blocks
                (blk.fan_outputs || []).forEach((fo, fi) => {
                    const foDef = fbBlocks.find(f => f.id === fo.blockType);
                    if (!foDef) return;
                    foDef.settings.forEach(sdef => {
                        if (!sdef.pin_cap) return;
                        const gpio = parseInt(fo.settings[sdef.name], 10);
                        if (isNaN(gpio) || gpio < 0) return; // -1 = not wired → skip
                        const assignKey = 'pl_' + pi + '_bl_' + bi + '_fo_' + fi + '_' + sdef.name;
                        state.pinAssignments[assignKey] = { gpio, label: makePinLabel(fo.alias, fo.blockType, foDef, sdef.name), dir: 'in' };
                    });
                });
            });
        });
        // Register output pins (from all groups) in the pin map so they show as assigned.
        // Skip peripheral-backed pins (peripheral_id set) — their periph: entry already occupies
        // that GPIO. Registering both would trigger a false conflict (red row) every time.
        (state.output_groups || []).forEach(group => {
            (group.pins || []).forEach(op => {
                if (op.gpio < 0) return;
                if (op.peripheral_id) return; // covered by periph: entry — skip
                const assignKey = 'op_' + op.id;
                state.pinAssignments[assignKey] = { gpio: op.gpio, label: (op.label || op.id) + ' [' + (op.type || 'pwm').toUpperCase() + ' out]', dir: 'out' };
            });
        });
        // Rebuild peripheral pin assignments too so periph: keys stay in sync
        rebuildPeripheralPinAssignments();
    }

    function applyPrefab(prefabId) {
        const pf = prefabs.find(p => p.id === prefabId) || (state.userPrefabs && state.userPrefabs.find(p => p.id === prefabId));
        if (!pf) return;
        pipelineSeq++;
        const pl = {
            id: genPipelineId(),
            name: pf.label, kind: activePipelineTab, enabled: true, collapsed: false,
            blocks: pf.blocks.map(b => {
                const fbDef = fbBlocks.find(f => f.id === b.blockId);
                const settings = {};
                if (fbDef) fbDef.settings.forEach(s => { settings[s.name] = s.default; });
                return { blockType: b.blockId, alias: b.alias || '', settings, expanded: false };
            }),
        };
        state.pipelines.push(pl);
        selectedPipelineIdx = state.pipelines.length - 1;
        renderPipelineCards();
        renderFbPalette();
    }

    // ── Pipeline drag-to-reorder ─────────────────────────────────────────────
    let pipelineDragIdx = null;
    let _pipelineDragAllowed = false;
    let _blockDragAllowed    = false;

    function attachPipelineDragDrop() {
        document.querySelectorAll('.pipeline-card[data-pipeline-idx]').forEach(card => {
            card.addEventListener('dragstart', onPipelineDragStart);
            card.addEventListener('dragover',  onPipelineDragOver);
            card.addEventListener('dragleave', onPipelineDragLeave);
            card.addEventListener('drop',      onPipelineDrop);
            card.addEventListener('dragend',   onPipelineDragEnd);
        });
    }

    function onPipelineDragStart(e) {
        if (!_pipelineDragAllowed) { e.preventDefault(); return; }
        _pipelineDragAllowed = false;
        pipelineDragIdx = parseInt(e.currentTarget.getAttribute('data-pipeline-idx'), 10);
        e.currentTarget.classList.add('pl-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(pipelineDragIdx));
    }
    function onPipelineDragEnd(e) {
        _pipelineDragAllowed = false;
        e.currentTarget.classList.remove('pl-dragging');
        document.querySelectorAll('.pl-drag-over').forEach(el => el.classList.remove('pl-drag-over'));
        pipelineDragIdx = null;
    }
    function onPipelineDragOver(e) {
        if (pipelineDragIdx === null) return;
        e.preventDefault();
        const idx = parseInt(e.currentTarget.getAttribute('data-pipeline-idx'), 10);
        if (idx !== pipelineDragIdx) e.currentTarget.classList.add('pl-drag-over');
        e.dataTransfer.dropEffect = 'move';
    }
    function onPipelineDragLeave(e) { e.currentTarget.classList.remove('pl-drag-over'); }
    function onPipelineDrop(e) {
        e.preventDefault();
        const toIdx = parseInt(e.currentTarget.getAttribute('data-pipeline-idx'), 10);
        e.currentTarget.classList.remove('pl-drag-over');
        if (pipelineDragIdx === null || toIdx === pipelineDragIdx) return;
        const fromIdx = pipelineDragIdx;
        // Update selected pipeline tracking
        const selId = (selectedPipelineIdx >= 0 && state.pipelines[selectedPipelineIdx])
            ? state.pipelines[selectedPipelineIdx].id : null;
        // Reorder — pipeline IDs travel with their objects, so suspend/resume refs remain valid
        const moved = state.pipelines.splice(fromIdx, 1)[0];
        state.pipelines.splice(toIdx, 0, moved);
        // Restore selectedPipelineIdx by id
        if (selId) selectedPipelineIdx = state.pipelines.findIndex(p => p.id === selId);
        pipelineDragIdx = null;
        renderPipelineCards();
    }

    // ── Block drag-to-reorder within a pipeline ────────────────────────────
    let blockDragPipelineIdx = null;
    let blockDragIdx         = null;

    function attachBlockDragDrop() {
        document.querySelectorAll('[data-block-idx]').forEach(row => {
            row.addEventListener('dragstart', onBlockDragStart);
            row.addEventListener('dragover',  onBlockDragOver);
            row.addEventListener('dragleave', onBlockDragLeave);
            row.addEventListener('drop',      onBlockDrop);
            row.addEventListener('dragend',   onBlockDragEnd);
        });
    }

    function onBlockDragStart(e) {
        if (!_blockDragAllowed) { e.preventDefault(); return; }
        _blockDragAllowed = false;
        e.stopPropagation(); // prevent pipeline card dragstart from firing
        blockDragPipelineIdx = parseInt(e.currentTarget.getAttribute('data-pipeline-idx'), 10);
        blockDragIdx         = parseInt(e.currentTarget.getAttribute('data-block-idx'), 10);
        e.currentTarget.classList.add('blk-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(blockDragIdx));
    }
    function onBlockDragEnd(e) {
        _blockDragAllowed = false;
        e.currentTarget.classList.remove('blk-dragging');
        document.querySelectorAll('.blk-drag-over').forEach(el => el.classList.remove('blk-drag-over'));
        blockDragPipelineIdx = null;
        blockDragIdx = null;
    }
    function onBlockDragOver(e) {
        if (blockDragIdx === null) return;
        const pi = parseInt(e.currentTarget.getAttribute('data-pipeline-idx'), 10);
        const bi = parseInt(e.currentTarget.getAttribute('data-block-idx'), 10);
        if (pi !== blockDragPipelineIdx) return; // no cross-pipeline drops
        e.preventDefault();
        if (bi !== blockDragIdx) e.currentTarget.classList.add('blk-drag-over');
        e.dataTransfer.dropEffect = 'move';
    }
    function onBlockDragLeave(e) { e.currentTarget.classList.remove('blk-drag-over'); }
    function onBlockDrop(e) {
        e.preventDefault();
        const toIdx = parseInt(e.currentTarget.getAttribute('data-block-idx'), 10);
        const pi    = parseInt(e.currentTarget.getAttribute('data-pipeline-idx'), 10);
        e.currentTarget.classList.remove('blk-drag-over');
        if (blockDragIdx === null || pi !== blockDragPipelineIdx || toIdx === blockDragIdx) return;
        const blocks = state.pipelines[pi].blocks;
        const moved = blocks.splice(blockDragIdx, 1)[0];
        blocks.splice(toIdx, 0, moved);
        blockDragPipelineIdx = null;
        blockDragIdx = null;
        renderPipelineCards();
    }

    // ── Output Group drag-to-reorder ─────────────────────────────────────────
    let _ogDragAllowed = false;
    let ogDragIdx      = null;

    function attachOutputGroupDragDrop() {
        document.querySelectorAll('.pipeline-card[data-og-idx]').forEach(card => {
            card.addEventListener('dragstart', onOgDragStart);
            card.addEventListener('dragover',  onOgDragOver);
            card.addEventListener('dragleave', onOgDragLeave);
            card.addEventListener('drop',      onOgDrop);
            card.addEventListener('dragend',   onOgDragEnd);
        });
    }
    function onOgDragStart(e) {
        if (!_ogDragAllowed) { e.preventDefault(); return; }
        _ogDragAllowed = false;
        ogDragIdx = parseInt(e.currentTarget.getAttribute('data-og-idx'), 10);
        e.currentTarget.classList.add('pl-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(ogDragIdx));
    }
    function onOgDragEnd(e) {
        _ogDragAllowed = false;
        e.currentTarget.classList.remove('pl-dragging');
        document.querySelectorAll('.pl-drag-over').forEach(el => el.classList.remove('pl-drag-over'));
        ogDragIdx = null;
    }
    function onOgDragOver(e) {
        if (ogDragIdx === null || opDragIdx !== null) return;
        e.preventDefault();
        const idx = parseInt(e.currentTarget.getAttribute('data-og-idx'), 10);
        if (idx !== ogDragIdx) e.currentTarget.classList.add('pl-drag-over');
        e.dataTransfer.dropEffect = 'move';
    }
    function onOgDragLeave(e) { e.currentTarget.classList.remove('pl-drag-over'); }
    function onOgDrop(e) {
        e.preventDefault();
        const toIdx = parseInt(e.currentTarget.getAttribute('data-og-idx'), 10);
        e.currentTarget.classList.remove('pl-drag-over');
        if (ogDragIdx === null || toIdx === ogDragIdx) return;
        const moved = state.output_groups.splice(ogDragIdx, 1)[0];
        state.output_groups.splice(toIdx, 0, moved);
        ogDragIdx = null;
        renderOutputGroups();
    }

    // ── Output Pin drag-to-reorder within a group ────────────────────────────
    let _opDragAllowed = false;
    let opDragGi       = null;
    let opDragIdx      = null;

    function attachOutputPinDragDrop() {
        document.querySelectorAll('.block-row[data-op-idx]').forEach(row => {
            row.addEventListener('dragstart', onOpDragStart);
            row.addEventListener('dragover',  onOpDragOver);
            row.addEventListener('dragleave', onOpDragLeave);
            row.addEventListener('drop',      onOpDrop);
            row.addEventListener('dragend',   onOpDragEnd);
        });
    }
    function onOpDragStart(e) {
        if (!_opDragAllowed) { e.preventDefault(); return; }
        _opDragAllowed = false;
        e.stopPropagation(); // prevent group card dragstart
        opDragGi  = parseInt(e.currentTarget.getAttribute('data-og-idx'), 10);
        opDragIdx = parseInt(e.currentTarget.getAttribute('data-op-idx'), 10);
        e.currentTarget.classList.add('blk-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(opDragIdx));
    }
    function onOpDragEnd(e) {
        _opDragAllowed = false;
        e.currentTarget.classList.remove('blk-dragging');
        document.querySelectorAll('.blk-drag-over').forEach(el => el.classList.remove('blk-drag-over'));
        opDragGi = null; opDragIdx = null;
    }
    function onOpDragOver(e) {
        if (opDragIdx === null) return;
        const gi = parseInt(e.currentTarget.getAttribute('data-og-idx'), 10);
        if (gi !== opDragGi) return; // no cross-group drops
        e.preventDefault();
        e.stopPropagation();
        const pi = parseInt(e.currentTarget.getAttribute('data-op-idx'), 10);
        if (pi !== opDragIdx) e.currentTarget.classList.add('blk-drag-over');
        e.dataTransfer.dropEffect = 'move';
    }
    function onOpDragLeave(e) { e.currentTarget.classList.remove('blk-drag-over'); }
    function onOpDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        const toIdx = parseInt(e.currentTarget.getAttribute('data-op-idx'), 10);
        const gi    = parseInt(e.currentTarget.getAttribute('data-og-idx'), 10);
        e.currentTarget.classList.remove('blk-drag-over');
        if (opDragIdx === null || gi !== opDragGi || toIdx === opDragIdx) return;
        const pins = state.output_groups[gi].pins;
        const moved = pins.splice(opDragIdx, 1)[0];
        pins.splice(toIdx, 0, moved);
        opDragGi = null; opDragIdx = null;
        renderOutputGroups();
    }

    function renderCompPinSlot(compId, instIdx, pinIdx, pdef, currentGpio) {
        const caps = pinCaps[state.board];
        if (!caps) return '';

        const available = caps.pins.filter(p => !p.reserved);
        // null = explicitly unassigned; undefined/-1 = auto-assign; number >= 0 = specific gpio
        const isUnassigned = currentGpio === null;
        const isAuto = currentGpio === undefined || currentGpio === -1;

        let html = '<div class="pin-slot">';
        html += '<span class="pin-slot-label">' + pdef.label + '</span>';
        html += '<span class="pin-func-label">[' + pdef.func.toUpperCase() + ']</span>';
        html += '<select onchange="assignCompPin(\'' + compId + '\', ' + instIdx + ', \'' + pdef.pin_id + '\', this.value)">';
        html += '<option value="unassigned"' + (isUnassigned ? ' selected' : '') + '>— unassigned —</option>';
        html += '<option value="-1"' + (isAuto ? ' selected' : '') + '>— auto —</option>';
        available.forEach(p => {
            const selected = (!isUnassigned && !isAuto && currentGpio === p.gpio) ? ' selected' : '';
            const capStr = p.caps.join('/');
            html += '<option value="' + p.gpio + '"' + selected + '>GPIO' + p.gpio + ' (' + capStr + ')</option>';
        });
        html += '</select>';
        html += '</div>';
        return html;
    }

    function renderPinSlot(modName, header, instIdx, pinIdx, pinData) {
        const caps = pinCaps[state.board];
        if (!caps) return '';

        const available = caps.pins.filter(p => !p.reserved);
        const isUnassigned = pinData.gpio === null;
        const isAuto = pinData.gpio === undefined || pinData.gpio === -1;

        let html = '<div class="pin-slot">';
        html += '<span class="pin-slot-label">' + pinData.label + '</span>';
        html += '<span class="pin-func-label">[' + pinData.func.toUpperCase() + ']</span>';
        html += '<select onchange="assignPin(\'' + modName + '\', \'' + header + '\', ' + instIdx + ', ' + pinIdx + ', this.value)">';
        html += '<option value="unassigned"' + (isUnassigned ? ' selected' : '') + '>— unassigned —</option>';
        html += '<option value="-1"' + (isAuto ? ' selected' : '') + '>— auto —</option>';
        available.forEach(p => {
            const selected = (!isUnassigned && !isAuto && pinData.gpio === p.gpio) ? ' selected' : '';
            const capStr = p.caps.join('/');
            html += '<option value="' + p.gpio + '"' + selected + '>GPIO' + p.gpio + ' (' + capStr + ')</option>';
        });
        html += '</select>';
        html += '</div>';
        return html;
    }

    function renderAdcScaling(modName, header, instIdx, pinIdx, pinData) {
        const s = pinData.scaling_values || { input_min: 0, input_max: 4095, scale_min: 0.0, scale_max: 3.3 };
        let html = '<div class="adc-scaling">';
        html += '<div class="scale-field"><label>Input Min</label><input type="number" value="' + s.input_min + '" onchange="updateScaling(\'' + modName + '\', \'' + header + '\', ' + instIdx + ', ' + pinIdx + ', \'input_min\', this.value)" /></div>';
        html += '<div class="scale-field"><label>Input Max</label><input type="number" value="' + s.input_max + '" onchange="updateScaling(\'' + modName + '\', \'' + header + '\', ' + instIdx + ', ' + pinIdx + ', \'input_max\', this.value)" /></div>';
        html += '<div class="scale-field"><label>Scale Min</label><input type="number" step="0.01" value="' + s.scale_min + '" onchange="updateScaling(\'' + modName + '\', \'' + header + '\', ' + instIdx + ', ' + pinIdx + ', \'scale_min\', this.value)" /></div>';
        html += '<div class="scale-field"><label>Scale Max</label><input type="number" step="0.01" value="' + s.scale_max + '" onchange="updateScaling(\'' + modName + '\', \'' + header + '\', ' + instIdx + ', ' + pinIdx + ', \'scale_max\', this.value)" /></div>';
        html += '</div>';
        return html;
    }

    function updateScaling(modName, header, instIdx, pinIdx, field, value) {
        const ms = state.modules[modName];
        if (!ms || !ms.headers[header] || !ms.headers[header][instIdx]) return;
        const pin = ms.headers[header][instIdx].pins[pinIdx];
        if (!pin.scaling_values) pin.scaling_values = { input_min: 0, input_max: 4095, scale_min: 0.0, scale_max: 3.3 };
        pin.scaling_values[field] = parseFloat(value);
    }

    // ── Actions ──
    function toggleSection(el, wrapperId) {
        el.classList.toggle('collapsed');
        const wrapper = document.getElementById(wrapperId);
        wrapper.style.display = el.classList.contains('collapsed') ? 'none' : '';
    }

    function toggleCard(modName) {
        const card = document.getElementById('card-' + modName);
        if (card) card.classList.toggle('collapsed');
    }

    function toggleModule(modName, enabled) {
        const ms = state.modules[modName];
        if (!ms || ms.locked) return;
        ms.enabled = enabled;
        if (enabled && !Object.keys(ms.headers).length) {
            // Auto-initialize default headers
        }
        if (enabled && defaultVars[modName] && !state.variables[modName]) {
            state.variables[modName] = JSON.parse(JSON.stringify(defaultVars[modName]));
        }
        renderModuleCards();
        renderPipelineCards();
        renderVariableRegistry();
        renderPinMap();
    }

    function toggleHeader(modName, header, enabled) {
        const ms = state.modules[modName];
        if (!ms) return;
        if (enabled) {
            const reqs = [];
            const pins = [];
            ms.headers[header] = [{ pins }];
            // Register pin assignments
            pins.forEach(p => {
                if (p.gpio >= 0) {
                    state.pinAssignments[p.pin_id] = { gpio: p.gpio, label: p.label, module: modName };
                }
            });
        } else {
            // Remove instances and their pin assignments
            const instances = ms.headers[header] || [];
            instances.forEach(inst => {
                inst.pins.forEach(p => { delete state.pinAssignments[p.pin_id]; });
            });
            delete ms.headers[header];
        }
        renderModuleCards();
        renderPipelineCards();
        renderPinMap();
        renderVariableRegistry();
    }

    function addInstance(modName, header) {
        const ms = state.modules[modName];
        if (!ms) return;
        const reqs = [];
        const idx = (ms.headers[header] || []).length;
        const pins = [];
        if (!ms.headers[header]) ms.headers[header] = [];
        ms.headers[header].push({ pins });
        pins.forEach(p => {
            if (p.gpio >= 0) {
                state.pinAssignments[p.pin_id] = { gpio: p.gpio, label: p.label, module: modName };
            }
        });
        renderModuleCards();
        renderPipelineCards();
        renderPinMap();
    }

    function removeInstance(modName, header, idx) {
        const ms = state.modules[modName];
        if (!ms || !ms.headers[header]) return;
        const inst = ms.headers[header][idx];
        if (inst) inst.pins.forEach(p => { delete state.pinAssignments[p.pin_id]; });
        ms.headers[header].splice(idx, 1);
        if (ms.headers[header].length === 0) delete ms.headers[header];
        renderModuleCards();
        renderPipelineCards();
        renderPinMap();
    }

    function assignPin(modName, header, instIdx, pinIdx, gpioStr) {
        const ms = state.modules[modName];
        if (!ms || !ms.headers[header] || !ms.headers[header][instIdx]) return;

        const pin = ms.headers[header][instIdx].pins[pinIdx];
        if (pin.pin_id in state.pinAssignments) {
            delete state.pinAssignments[pin.pin_id];
        }

        if (gpioStr === 'unassigned') {
            pin.gpio = null;
            renderPinMap();
            return;
        }

        const gpio = parseInt(gpioStr, 10);
        if (gpio >= 0) {
            pin.gpio = gpio;
            state.pinAssignments[pin.pin_id] = { gpio, label: pin.label, module: modName };
        } else {
            pin.gpio = autoAssignGpio(pin.func);
            if (pin.gpio >= 0) {
                state.pinAssignments[pin.pin_id] = { gpio: pin.gpio, label: pin.label, module: modName };
            }
        }
        renderPinMap();
    }

    function autoAssignGpio(funcType) {
        const caps = pinCaps[state.board];
        if (!caps) return -1;
        const used = new Set(Object.values(state.pinAssignments).map(a => a.gpio));
        const candidates = caps.pins.filter(p =>
            !p.reserved && !used.has(p.gpio) &&
            (funcType === 'gpio' || p.caps.includes(funcType.toUpperCase()))
        );
        return candidates.length > 0 ? candidates[0].gpio : -1;
    }

    // ── Component Actions ──
    function getAllCompPins(comp) {
        const pins = comp.pins.slice();
        if (comp.subcomponents) {
            comp.subcomponents.forEach(sub => { pins.push(...sub.pins); });
        }
        return pins;
    }

    // Returns a human-readable pin label: for subcomponent pins includes the short name
    // e.g. "Up — Pump PWM" or just "pH Probe ADC"
    function getCompPinLabel(comp, pinId) {
        const top = comp.pins.find(p => p.pin_id === pinId);
        if (top) return top.label;
        if (comp.subcomponents) {
            for (const sub of comp.subcomponents) {
                const sp = sub.pins.find(p => p.pin_id === pinId);
                if (sp) return sp.label + ' \u2014 ' + (sub.short || sub.id);
            }
        }
        return pinId;
    }

    function getAllCompSettings(comp) {
        const settings = comp.settings.slice();
        if (comp.subcomponents) {
            comp.subcomponents.forEach(sub => { settings.push(...sub.settings); });
        }
        return settings;
    }

    function toggleCompCard(compId) {
        const card = document.getElementById('comp-' + compId);
        if (card) card.classList.toggle('collapsed');
        const cs = state.components[compId];
        if (cs) cs.collapsed = card ? card.classList.contains('collapsed') : !cs.collapsed;
    }

    function toggleSubcomp(compId, instIdx, subId) {
        const el = document.getElementById('subcomp-' + compId + '-' + instIdx + '-' + subId);
        if (el) el.classList.toggle('collapsed');
    }

    function toggleComponent(compId, enabled) {
        const cs = state.components[compId];
        if (!cs) return;
        cs.enabled = enabled;
        if (enabled && cs.instances.length === 0) {
            addCompInstance(compId);
            return; // addCompInstance already re-renders
        }
        if (!enabled) {
            cs.collapsed = true;
            // Remove all pin assignments for this component's instances (including subcomponents)
            const comp = components[compId];
            const allPins = getAllCompPins(comp);
            cs.instances.forEach((inst, idx) => {
                allPins.forEach(pdef => {
                    delete state.pinAssignments[compId + '_' + idx + '_' + pdef.pin_id];
                });
            });
            cs.instances = [];
        }
        renderPipelineCards();
        renderPinMap();
    }

    function addCompInstance(compId) {
        const cs = state.components[compId];
        const comp = components[compId];
        if (!cs || !comp) return;

        const idx = cs.instances.length;
        const pins = {};
        const allPins = getAllCompPins(comp);
        const defaultName = comp.label + ' #' + (idx + 1);
        allPins.forEach(pdef => {
            const gpio = autoAssignGpio(pdef.func);
            const key = compId + '_' + idx + '_' + pdef.pin_id;
            pins[pdef.pin_id] = gpio;
            if (gpio >= 0) {
                state.pinAssignments[key] = { gpio, label: defaultName + ' \u2014 ' + getCompPinLabel(comp, pdef.pin_id), component: compId };
            }
        });

        const settings = {};
        const allSettings = getAllCompSettings(comp);
        allSettings.forEach(sdef => { settings[sdef.name] = sdef.default; });

        cs.instances.push({ pins, settings, alias: '' });
        renderPipelineCards();
        renderPinMap();
    }

    function removeCompInstance(compId, idx) {
        const cs = state.components[compId];
        const comp = components[compId];
        if (!cs || !comp || !cs.instances[idx]) return;

        const allPins = getAllCompPins(comp);

        // Remove pin assignments for the removed instance
        allPins.forEach(pdef => {
            delete state.pinAssignments[compId + '_' + idx + '_' + pdef.pin_id];
        });
        cs.instances.splice(idx, 1);

        // Re-key pin assignments for remaining instances after the removed one
        for (let i = idx; i < cs.instances.length; i++) {
            allPins.forEach(pdef => {
                const oldKey = compId + '_' + (i + 1) + '_' + pdef.pin_id;
                const newKey = compId + '_' + i + '_' + pdef.pin_id;
                if (state.pinAssignments[oldKey]) {
                    const instName = cs.instances[i].alias || (comp.label + ' #' + (i + 1));
                    state.pinAssignments[newKey] = state.pinAssignments[oldKey];
                    state.pinAssignments[newKey].label = instName + ' \u2014 ' + getCompPinLabel(comp, pdef.pin_id);
                    delete state.pinAssignments[oldKey];
                }
            });
        }

        if (cs.instances.length === 0) cs.enabled = false;
        renderPipelineCards();
        renderPinMap();
    }

    function assignCompPin(compId, instIdx, pinId, gpioStr) {
        const cs = state.components[compId];
        const comp = components[compId];
        if (!cs || !comp || !cs.instances[instIdx]) return;

        const key = compId + '_' + instIdx + '_' + pinId;
        delete state.pinAssignments[key];

        if (gpioStr === 'unassigned') {
            cs.instances[instIdx].pins[pinId] = null;
            renderPinMap();
            return;
        }

        const gpio = parseInt(gpioStr, 10);
        if (gpio >= 0) {
            cs.instances[instIdx].pins[pinId] = gpio;
            const instName = cs.instances[instIdx].alias || (comp.label + ' #' + (instIdx + 1));
            const pinLabel = getCompPinLabel(comp, pinId);
            state.pinAssignments[key] = { gpio, label: instName + ' \u2014 ' + pinLabel, component: compId };
        } else {
            const pdef = comp.pins.find(p => p.pin_id === pinId);
            const autoGpio = autoAssignGpio(pdef ? pdef.func : 'gpio');
            cs.instances[instIdx].pins[pinId] = autoGpio;
            if (autoGpio >= 0) {
                const instName = cs.instances[instIdx].alias || (comp.label + ' #' + (instIdx + 1));
                const pinLabel = getCompPinLabel(comp, pinId);
                state.pinAssignments[key] = { gpio: autoGpio, label: instName + ' \u2014 ' + pinLabel, component: compId };
            }
        }
        renderPinMap();
    }

    function updateCompAlias(compId, instIdx, alias) {
        const cs = state.components[compId];
        const comp = components[compId];
        if (!cs || !comp || !cs.instances[instIdx]) return;
        cs.instances[instIdx].alias = alias.trim();
        // Update pin assignment labels to reflect the new alias
        const instName = cs.instances[instIdx].alias || (comp.label + ' #' + (instIdx + 1));
        const allPins = getAllCompPins(comp);
        allPins.forEach(pdef => {
            const key = compId + '_' + instIdx + '_' + pdef.pin_id;
            if (state.pinAssignments[key]) {
                state.pinAssignments[key].label = instName + ' \u2014 ' + getCompPinLabel(comp, pdef.pin_id);
            }
        });
        renderPinMap();
    }

    function updateCompSetting(compId, instIdx, name, value) {
        const cs = state.components[compId];
        if (!cs || !cs.instances[instIdx]) return;
        const comp = components[compId];
        const sdef = comp.settings.find(s => s.name === name);
        if (sdef && sdef.type === 'bool') {
            cs.instances[instIdx].settings[name] = !!value;
        } else if (sdef && sdef.type === 'float') {
            cs.instances[instIdx].settings[name] = parseFloat(value);
        } else if (sdef && sdef.type.startsWith('enum:')) {
            const num = Number(value);
            cs.instances[instIdx].settings[name] = isNaN(num) ? value : num;
        } else {
            cs.instances[instIdx].settings[name] = isNaN(Number(value)) ? value : Number(value);
        }
    }

    function updateVarDefault(modName, idx, value) {
        if (state.variables[modName] && state.variables[modName][idx]) {
            const v = state.variables[modName][idx];
            v.default = v.type.startsWith('string') ? value : (isNaN(Number(value)) ? value : Number(value));
        }
    }

    // ── Save / Generate ──
    function onSave() {
        const config = buildConfig();
        if (!config.role_id) return;
        vscode.postMessage({ command: 'saveRole', config });
    }

    function onGenerate(dryRun) {
        const config = buildConfig();
        const missing = [];
        if (!config.role_id) missing.push('Role ID');
        if (!config.target)  missing.push('MCU Target');
        if (!config.hwrev)   missing.push('HwRev');
        if (missing.length) {
            alert('Cannot generate — missing: ' + missing.join(', '));
            return;
        }
        // Warn on unassigned pins
        const pinWarnings = [];
        state.pipelines.forEach((pl, pi) => {
            pl.blocks.forEach((blk, bi) => {
                const fbDef = fbBlocks.find(f => f.id === blk.blockType);
                if (fbDef) {
                    fbDef.settings.forEach(sdef => {
                        if (sdef.pin_cap && parseInt(blk.settings[sdef.name]) < 0) {
                            const lbl = blk.alias || (fbDef.label + ' ' + (bi + 1));
                            pinWarnings.push(pl.name + ' › ' + lbl + ' › ' + sdef.name);
                        }
                    });
                }
                (blk.fan_outputs || []).forEach((fo, fi) => {
                    const foDef = fbBlocks.find(f => f.id === fo.blockType);
                    if (!foDef) return;
                    foDef.settings.forEach(sdef => {
                        if (sdef.pin_cap && parseInt(fo.settings[sdef.name]) < 0) {
                            const lbl = fo.alias || (foDef.label + ' ' + (fi + 1));
                            pinWarnings.push(pl.name + ' › fan out ' + (fi + 1) + ' › ' + lbl + ' › ' + sdef.name);
                        }
                    });
                });
            });
        });
        if (pinWarnings.length > 0) {
            // confirm() always returns false in VS Code webviews — never use it as a gate.
            // Post a non-blocking warning to the extension and proceed with generate.
            vscode.postMessage({ command: 'showWarning', text: 'Generating with ' + pinWarnings.length + ' unassigned pin(s):\n' + pinWarnings.join('\n') });
        }
        vscode.postMessage({ command: 'generateRole', config, dryRun });
    }

    function buildConfig() {
        // Build modules dict for serialization
        const mods = {};
        Object.entries(state.modules).forEach(([name, ms]) => {
            mods[name] = { enabled: ms.enabled, locked: ms.locked };
            const enabledHeaders = Object.keys(ms.headers);
            if (enabledHeaders.length > 0) mods[name].headers = enabledHeaders;
        });
        // Build component state for serialization
        const comps = {};
        Object.entries(state.components).forEach(([cid, cs]) => {
            if (cs.enabled && cs.instances.length > 0) {
                comps[cid] = cs.instances.map(inst => ({
                    pins: inst.pins,
                    settings: cid === 'sensor_ec' ? sensorEcSettingsToBinary(inst.settings || {}) : inst.settings,
                }));
            }
        });
        const selRole = document.getElementById('sel-role');
        const divRoleIdVisible = document.getElementById('div-role-id').style.display !== 'none';
        const roleIdFromInput = document.getElementById('inp-role-id').value.trim();
        const resolvedRoleId = divRoleIdVisible ? roleIdFromInput : (selRole.value !== '__new__' ? selRole.value : roleIdFromInput);
        const selN = document.getElementById('sel-display-name');
        const inpNew = document.getElementById('inp-display-name-new');
        const resolvedDisplayName = (selN.value === '__add_new__' || selN.value === '')
            ? inpNew.value.trim()
            : (selN.options[selN.selectedIndex] ? selN.options[selN.selectedIndex].textContent : '');
        return {
            role_id: resolvedRoleId,
            display_name: resolvedDisplayName,
            device_type: document.getElementById('inp-device-type').value.trim(),
            target: state.target,
            board:  state.board,
            hwrev: state.hwrev,
            flash_size_kb: state.flash_size_kb,
            app_size_kb: state.app_size_kb,
            system_prefs: {
                tz_offset_min: state.system_prefs.tz_offset_min,
            },
            modules: mods,
            components: comps,
            pin_assignments: state.pinAssignments,
            variables: state.variables,
            user_prefabs: state.userPrefabs || [],
            output_groups: (state.output_groups || []).map(g => ({
                id:            g.id,
                name:          g.name || '',
                peripheral_id: g.peripheral_id || null,
                pins: (g.pins || []).map(op => ({
                    id:                 op.id,
                    type:               op.type || 'pwm',
                    type_locked:        op.type_locked || false,
                    peripheral_id:      op.peripheral_id || null,
                    gpio:               op.gpio,
                    label:              op.label || '',
                    frequency:          op.frequency,
                    func_min:           op.func_min,
                    func_max:           op.func_max,
                    count_rate_at_full: op.count_rate_at_full,
                })),
            })),
            // Flattened output_pins for blob_packer backward compatibility
            output_pins: (state.output_groups || []).flatMap(g =>
                (g.pins || []).map(op => ({
                    id:                 op.id,
                    type:               op.type || 'pwm',
                    gpio:               op.gpio,
                    label:              op.label || '',
                    frequency:          op.frequency,
                    func_min:           op.func_min,
                    func_max:           op.func_max,
                    count_rate_at_full: op.count_rate_at_full,
                }))
            ),
            // Compute timer registry by scanning all pipeline/routine blocks at build time
            timer_defs: (() => {
                const items = [];
                (state.pipelines || []).forEach((pl, pi) => {
                    (pl.blocks || []).forEach((blk, bi) => {
                        const fbDef = fbBlocks.find(f => f.id === blk.blockType);
                        if (fbDef && fbDef.category === 'timer') {
                            items.push(Object.assign({ _id: 'tm_' + pi + '_' + bi, label: blk.alias || fbDef.label }, blk.settings || {}));
                        }
                        (blk.blocks || []).forEach((iblk, ibi) => {
                            const iFbDef = fbBlocks.find(f => f.id === iblk.blockType);
                            if (iFbDef && iFbDef.category === 'timer') {
                                items.push(Object.assign({ _id: 'tm_' + pi + '_' + bi + '_' + ibi, label: iblk.alias || iFbDef.label }, iblk.settings || {}));
                            }
                        });
                    });
                });
                return items;
            })(),
            pipelines: state.pipelines.map((pl, plIdx) => ({
                id: pl.id,
                name: pl.name,
                kind: pl.kind || 'pipeline',
                enabled: pl.enabled,
                ...(pl.peripheral_id ? { peripheral_id: pl.peripheral_id } : {}),
                blocks: pl.blocks.map(b => {
                    // Resolve stable pipeline_id → current numeric index for firmware consumption
                    let settings = b.settings;
                    if ((b.blockType === 'pipeline_suspend' || b.blockType === 'pipeline_resume') &&
                            settings && settings.pipeline_id !== undefined) {
                        const targetIdx = state.pipelines.findIndex(p => p.id === settings.pipeline_id);
                        settings = Object.assign({}, settings, { pipeline_index: targetIdx >= 0 ? targetIdx : 0 });
                    }
                    const blkOut = { blockType: b.blockType, alias: b.alias, settings };
                    if (b.exit_conditions && b.exit_conditions.length > 0) blkOut.exit_conditions = b.exit_conditions;
                    if (b.blockType === 'abortable_sub_pipeline' && b.blocks && b.blocks.length > 0) {
                        blkOut.blocks = b.blocks.map(ib => {
                            return { blockType: ib.blockType, alias: ib.alias || '', settings: ib.settings || {} };
                        });
                    }
                    if (b.fan_outputs && b.fan_outputs.length > 0) {
                        blkOut.fan_outputs = b.fan_outputs.map(fo => ({
                            blockType: fo.blockType, alias: fo.alias, settings: fo.settings
                        }));
                    }
                    return blkOut;
                }),
            })),
            mutex_groups: (state.mutex_groups || []).map(g => ({ id: g.id, name: g.name })),
            peripherals: state.peripherals.map(p => ({
                id:          p.id,
                type:        p.type,
                alias:       p.alias,
                config:      p.config,
                pins:        p.pins,
                mutex_group: p.mutex_group || null,
                ...(p.ui_params ? { ui_params: p.ui_params } : {}),
            })),
        };
    }

    // ── Messages from extension ──
    window.addEventListener('message', event => {
        const msg = event.data;
        if (msg.command === 'roleLoaded') applyLoadedConfig(msg.config);
        if (msg.command === 'savedRolesRefreshed') {
            savedRoles.length = 0;
            (msg.roles || []).forEach(r => savedRoles.push(r));
            // Re-run cascade from board to refresh hwrev + role dropdowns
            if (state.board) {
                const prevHwrev = state.hwrev;
                const prevRoleId = state.roleId;
                // Capture the current display name before cascade resets it
                const selNPrev = document.getElementById('sel-display-name');
                const prevDisplayName = selNPrev
                    ? (selNPrev.value === '__add_new__'
                        ? (document.getElementById('inp-display-name-new') || {}).value || ''
                        : (selNPrev.options[selNPrev.selectedIndex] ? selNPrev.options[selNPrev.selectedIndex].textContent : ''))
                    : '';
                document.getElementById('sel-board').value = state.board;
                onBoardChange();
                // Restore previous hwrev selection if it still exists
                const selH = document.getElementById('sel-hwrev');
                if (prevHwrev && selH.querySelector('option[value="' + prevHwrev + '"]')) {
                    selH.value = prevHwrev;
                    state.hwrev = prevHwrev;
                    onHwrevChange();
                    // Restore role selection — onHwrevChange() rebuilds the dropdown, select back
                    const selR = document.getElementById('sel-role');
                    if (prevRoleId && selR.querySelector('option[value="' + prevRoleId + '"]')) {
                        selR.value = prevRoleId;
                        state.roleId = prevRoleId;
                        // Re-populate the display name dropdown and restore selection
                        populateNameDropdown(prevRoleId);
                        if (prevDisplayName) {
                            const selN = document.getElementById('sel-display-name');
                            const matchOpt = [...selN.options].find(o => o.textContent === prevDisplayName && o.value !== '__add_new__');
                            if (matchOpt) selN.value = matchOpt.value;
                        }
                    }
                }
            }
        }
    });

    function applyLoadedConfig(config) {
        if (!config) return;
        // Board drives the entire cascade
        document.getElementById('sel-board').value = config.board || '';
        onBoardChange();
        // Restore hwrev — may not be in dropdown yet if not in board spec or saved roles
        const selH = document.getElementById('sel-hwrev');
        const hwrevVal = config.hwrev || '';
        if (hwrevVal && !selH.querySelector('option[value="' + hwrevVal + '"]')) {
            const o = document.createElement('option'); o.value = hwrevVal; o.textContent = hwrevVal;
            selH.insertBefore(o, selH.querySelector('option[value="__new__"]') || null);
        }
        if (hwrevVal) {
            selH.value = hwrevVal;
            onHwrevChange();
        }
        document.getElementById('sel-role').value = config.role_id || '';
        // Role ID field — hide it (we're loading an existing role, not creating new)
        document.getElementById('div-role-id').style.display = 'none';
        document.getElementById('inp-role-id').value = '';
        // Populate the Name dropdown for this role and select the matching name
        if (config.role_id) {
            populateNameDropdown(config.role_id);
            // Select the option whose text matches config.display_name
            const selN = document.getElementById('sel-display-name');
            const matchOpt = [...selN.options].find(o => o.textContent === config.display_name && o.value !== '__add_new__');
            if (matchOpt) {
                selN.value = matchOpt.value;
                document.getElementById('inp-display-name-new').style.display = 'none';
            } else if (config.display_name) {
                // Name not in saved list — show it in the text input with __add_new__ selected
                selN.value = '__add_new__';
                const inpNew = document.getElementById('inp-display-name-new');
                inpNew.style.display = '';
                inpNew.value = config.display_name;
            }
        }
        document.getElementById('inp-device-type').value = config.device_type || '';
        if (config.flash_size_kb) state.flash_size_kb = config.flash_size_kb;
        if (config.app_size_kb)   state.app_size_kb   = config.app_size_kb;
        if (config.system_prefs) {
            if (config.system_prefs.tz_offset_min !== undefined)
                state.system_prefs.tz_offset_min = parseInt(config.system_prefs.tz_offset_min, 10);
        }
        if (config.pin_assignments) state.pinAssignments = config.pin_assignments;
        if (config.variables) state.variables = config.variables;
        if (config.modules) {
            Object.entries(config.modules).forEach(([name, cfg]) => {
                state.modules[name] = {
                    enabled: cfg.enabled,
                    locked: cfg.locked || false,
                    headers: {},
                };
            });
        }
        if (config.components) {
            Object.entries(config.components).forEach(([cid, instances]) => {
                state.components[cid] = {
                    enabled: true,
                    instances: cid === 'sensor_ec'
                        ? instances.map(inst => ({ pins: inst.pins, settings: sensorEcSettingsFromBinary(inst.settings || {}) }))
                        : instances,
                };
            });
        }
        if (config.user_prefabs) state.userPrefabs = config.user_prefabs;
        // Load output_groups (new format); fall back to migrating flat output_pins
        if (config.output_groups && Array.isArray(config.output_groups)) {
            state.output_groups = config.output_groups.map(g => ({
                id:            g.id || genOutputGroupId(),
                name:          g.name || 'Output Group',
                peripheral_id: g.peripheral_id || null,
                pins: (g.pins || []).map(op => ({
                    id:                 op.id || genOutputPinId(),
                    type:               op.type || 'pwm',
                    type_locked:        op.type_locked || false,
                    peripheral_id:      op.peripheral_id || null,
                    gpio:               op.gpio !== undefined ? op.gpio : -1,
                    label:              op.label || '',
                    frequency:          op.frequency !== undefined ? op.frequency : 1000,
                    func_min:           op.func_min !== undefined ? op.func_min : 0.0,
                    func_max:           op.func_max !== undefined ? op.func_max : 100.0,
                    count_rate_at_full: op.count_rate_at_full !== undefined ? op.count_rate_at_full : 0.0,
                })),
            }));
        } else if (config.output_pins && Array.isArray(config.output_pins) && config.output_pins.length > 0) {
            // Migrate legacy flat output_pins → single mainboard group
            state.output_groups = [{
                id:            genOutputGroupId(),
                name:          'Mainboard Outputs',
                peripheral_id: null,
                pins: config.output_pins.map(op => ({
                    id:                 op.id || genOutputPinId(),
                    type:               op.type || 'pwm',
                    type_locked:        false,
                    gpio:               op.gpio !== undefined ? op.gpio : -1,
                    label:              op.label || '',
                    frequency:          op.frequency !== undefined ? op.frequency : 1000,
                    func_min:           op.func_min !== undefined ? op.func_min : 0.0,
                    func_max:           op.func_max !== undefined ? op.func_max : 100.0,
                    count_rate_at_full: op.count_rate_at_full !== undefined ? op.count_rate_at_full : 0.0,
                })),
            }];
        } else {
            state.output_groups = [];
        }
        // timer_defs are now computed from pipeline blocks at build time — no load step needed
        if (config.pipelines && Array.isArray(config.pipelines)) {
            // First pass: assign stable IDs to any pipeline that lacks one (migration from old format)
            const seenIds = new Set();
            config.pipelines.forEach(pl => {
                if (!pl.id || seenIds.has(pl.id)) pl.id = genPipelineId();
                seenIds.add(pl.id);
            });
            activePipelineTab = 'pipeline';
            switchPipelineTab('pipeline');
            state.userPrefabs = config.user_prefabs || [];
            state.pipelines = config.pipelines.map(pl => ({
                id: pl.id,
                name: pl.name || 'Pipeline',
                kind: pl.kind || 'pipeline',
                enabled: pl.enabled !== false,
                collapsed: false,
                peripheral_id: pl.peripheral_id || null,
                blocks: (pl.blocks || []).map(b => {
                    // Migration: old format used pipeline_index; convert to pipeline_id
                    let settings = b.settings || {};
                    if ((b.blockType === 'pipeline_suspend' || b.blockType === 'pipeline_resume') &&
                            settings.pipeline_id === undefined && settings.pipeline_index !== undefined) {
                        const tPl = config.pipelines[settings.pipeline_index];
                        settings = Object.assign({}, settings, { pipeline_id: tPl ? tPl.id : (config.pipelines[0] ? config.pipelines[0].id : '') });
                    }
                    return {
                        blockType: b.blockType,
                        alias: b.alias || '',
                        settings,
                        expanded: false,
                        exit_conditions: b.exit_conditions || [],
                        blocks: b.blockType === 'abortable_sub_pipeline' ? (b.blocks || []).map(ib => ({
                            blockType: ib.blockType,
                            alias: ib.alias || '',
                            settings: ib.settings || {},
                            expanded: false,
                        })) : [],
                        fan_outputs: (b.fan_outputs || []).map(fo => ({
                            blockType: fo.blockType,
                            alias: fo.alias || '',
                            settings: fo.settings || {},
                            expanded: false,
                        })),
                    };
                }),
            }));
            pipelineSeq = state.pipelines.length;
            selectedPipelineIdx = state.pipelines.length > 0 ? 0 : -1;
        }
        rebuildPipelinePinAssignments();
        // Restore mutex groups
        state.mutex_groups = (config.mutex_groups && Array.isArray(config.mutex_groups))
            ? config.mutex_groups.map(g => ({ id: g.id || genMutexGroupId(), name: g.name || 'group' }))
            : [];
        // Restore peripherals
        if (config.peripherals && Array.isArray(config.peripherals)) {
            state.peripherals = config.peripherals.map(p => ({
                id:          p.id || genPeripheralId(),
                type:        p.type,
                alias:       p.alias || p.type,
                config:      p.config || {},
                pins:        p.pins || {},
                collapsed:   false,
                mutex_group: p.mutex_group || null,
                ...(p.ui_params ? { ui_params: p.ui_params } : {}),
            }));
        } else {
            state.peripherals = [];
        }
        // Rebuild peripheral pin assignments now that state.peripherals is populated.
        // (rebuildPipelinePinAssignments above ran before peripherals were loaded)
        rebuildPeripheralPinAssignments();
        // Sync HX711 peripheral pins to linked sensor_hx711 blocks on load
        state.peripherals.filter(p => p.type === 'hx711').forEach(p => {
            const linkedPl = state.pipelines.find(pl => pl.peripheral_id === p.id);
            if (!linkedPl) return;
            const hxBlock = linkedPl.blocks.find(b => b.blockType === 'sensor_hx711');
            if (!hxBlock) return;
            Object.entries(p.pins || {}).forEach(([slot, gpio]) => { hxBlock.settings[slot] = gpio; });
        });
        // Migration: old-format JSONs lack peripheral_id on output pins.
        // Match peripheral pins to output pins by GPIO so peripheral_id, type_locked, and labels
        // are correct without requiring a manual re-save.
        state.peripherals.forEach(periph => {
            const ptype = peripheralTypes.find(pt => pt.id === periph.type);
            if (!ptype) return;
            (ptype.pin_slots || []).forEach(slot => {
                if (!slot.output_type) return;
                const gpio = parseInt(periph.pins[slot.name], 10);
                if (isNaN(gpio) || gpio < 0) return;
                const correctLabel = (periph.alias || ptype.label) + ' \u2014 ' + slot.label;
                (state.output_groups || []).forEach(g => {
                    g.pins.forEach(op => {
                        if (op.peripheral_id) return; // already linked
                        if (op.gpio !== gpio) return;  // different GPIO — not this peripheral
                        op.peripheral_id = periph.id;
                        op.type_locked   = true;
                        op.label         = correctLabel; // fix any stale label from before alias set
                    });
                });
            });
        });
        // Rebuild once more so op_ skip-logic in rebuildPipelinePinAssignments sees the
        // just-populated peripheral_id fields.
        rebuildPipelinePinAssignments();
        renderPeripherals();
        renderModuleCards();
        renderPipelineCards();
        renderFbPalette();
        renderPinMap();
        renderVariableRegistry();
        renderPartitionLayout();
    }

    // ── Resize Handle ──
    (function initResize() {
        const handle = document.getElementById('resize-handle');
        const sidebar = document.getElementById('left-sidebar');
        let startX, startW;
        handle.addEventListener('mousedown', e => {
            e.preventDefault();
            startX = e.clientX;
            startW = sidebar.offsetWidth;
            handle.classList.add('active');
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', onStop);
        });
        function onDrag(e) {
            const w = startW + (e.clientX - startX);
            const min = parseInt(getComputedStyle(sidebar).minWidth) || 180;
            const max = window.innerWidth * 0.5;
            sidebar.style.width = Math.max(min, Math.min(max, w)) + 'px';
        }
        function onStop() {
            handle.classList.remove('active');
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', onStop);
        }
    })();

    // ── Right sidebar resize (handle is on LEFT edge of right sidebar) ──
    (function initRightResize() {
        const handle = document.getElementById('right-resize-handle');
        const sidebar = document.getElementById('right-sidebar');
        if (!handle || !sidebar) return;
        let startX, startW;
        handle.addEventListener('mousedown', e => {
            e.preventDefault();
            startX = e.clientX;
            startW = sidebar.offsetWidth;
            handle.classList.add('active');
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', onStop);
        });
        function onDrag(e) {
            // Dragging left = larger; dragging right = smaller (right sidebar grows leftward)
            const w = startW - (e.clientX - startX);
            const min = parseInt(getComputedStyle(sidebar).minWidth) || 160;
            const max = window.innerWidth * 0.4;
            sidebar.style.width = Math.max(min, Math.min(max, w)) + 'px';
        }
        function onStop() {
            handle.classList.remove('active');
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', onStop);
        }
    })();

    // ── Left sidebar vertical resize (independent height per section) ──
    // Each h-resize-handle drags to resize the wrapper immediately above it.
    // Min height enforced per section. Sidebar scrolls if sections exceed its height.
    (function initLeftVResizeHandles() {
        function makeVResizer(handleId, wrapperId) {
            const handle  = document.getElementById(handleId);
            const wrapper = document.getElementById(wrapperId);
            if (!handle || !wrapper) return;
            let startY, startH;
            handle.addEventListener('mousedown', e => {
                e.preventDefault();
                startY = e.clientY;
                startH = wrapper.offsetHeight;
                handle.classList.add('active');
                document.addEventListener('mousemove', onDrag);
                document.addEventListener('mouseup', onStop);
            });
            function onDrag(e) {
                const h = startH + (e.clientY - startY);
                wrapper.style.height = Math.max(40, h) + 'px';
            }
            function onStop() {
                handle.classList.remove('active');
                document.removeEventListener('mousemove', onDrag);
                document.removeEventListener('mouseup', onStop);
            }
        }
        makeVResizer('left-v-resize',  'pin-map-wrapper');
        makeVResizer('left-v-resize2', 'peripherals-wrapper');
        makeVResizer('left-v-resize3', 'var-registry-wrapper');
    })();

    // ── Right sidebar vertical resize (pds_fb Palette ↕ Prefabs) ──
    (function initRightVResize() {
        const handle = document.getElementById('right-v-resize');
        const upper  = document.getElementById('fb-palette-wrapper');
        if (!handle || !upper) return;
        let startY, startH;
        handle.addEventListener('mousedown', e => {
            e.preventDefault();
            startY = e.clientY;
            startH = upper.offsetHeight;
            handle.classList.add('active');
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', onStop);
        });
        function onDrag(e) {
            const h = startH + (e.clientY - startY);
            const max = (upper.parentElement.offsetHeight || 600) * 0.85;
            upper.style.height = Math.max(40, Math.min(max, h)) + 'px';
        }
        function onStop() {
            handle.classList.remove('active');
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', onStop);
        }
    })();

    // ── Initial render of right sidebar ──
    renderFbPalette();
    renderPrefabs();
