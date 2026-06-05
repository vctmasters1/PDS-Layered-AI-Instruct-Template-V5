// Pinleaf Forge - Memory Map (Partition Table) Generator
// Generates ESP-IDF compatible memorymap.csv from flash size

/**
 * Partition layout constants (ESP-IDF standard).
 * Bootloader occupies 0x0000–0x8FFF (not in the partition table).
 */
const PARTITION_DEFAULTS = {
    NVS_OFFSET: 0x9000,
    NVS_SIZE: 0x5000,       // 20 KB
    OTADATA_OFFSET: 0xE000,
    OTADATA_SIZE: 0x2000,   // 8 KB
    APP_START: 0x10000,     // 64 KB — first app partition (must be 64K-aligned)
    ALIGN: 0x1000           // 4 KB sector alignment
};

/**
 * Compute a partition table for the given flash size.
 *
 * @param {number} flashKb   Total flash in KB (e.g. 2048, 4096, 8192, 16384)
 * @param {object} opts
 * @param {boolean} opts.ota        Include OTA (dual app) partitions (default true)
 * @param {boolean} opts.fatfs      Include FATFS storage partition (default true)
 * @param {string}  opts.storageType  'fat' | 'spiffs' (default 'fat')
 * @param {number}  opts.storagePct   % of remaining space for storage (0–100, default 25)
 * @param {string}  opts.platformName Human-readable platform name for the header comment
 * @returns {{ csv: string, partitions: Array, errors: string[] }}
 */
function generateMemoryMap(flashKb, opts = {}) {
    const ota = opts.ota !== false;
    const includeStorage = opts.fatfs !== false;
    const storageType = opts.storageType || 'fat';
    const storagePct = Math.min(100, Math.max(0, opts.storagePct ?? 25));
    const platformName = opts.platformName || '';

    const flashBytes = flashKb * 1024;
    const errors = [];

    if (flashKb < 512) {
        errors.push('Flash size too small (minimum 512 KB for a usable layout).');
        return { csv: '', partitions: [], errors };
    }

    const partitions = [];
    let cursor = PARTITION_DEFAULTS.APP_START; // after NVS + otadata

    // NVS
    partitions.push({
        name: 'nvs',
        type: 'data',
        subtype: 'nvs',
        offset: PARTITION_DEFAULTS.NVS_OFFSET,
        size: PARTITION_DEFAULTS.NVS_SIZE
    });

    // OTA data (only if OTA enabled)
    if (ota) {
        partitions.push({
            name: 'otadata',
            type: 'data',
            subtype: 'ota',
            offset: PARTITION_DEFAULTS.OTADATA_OFFSET,
            size: PARTITION_DEFAULTS.OTADATA_SIZE
        });
    }

    // Calculate available space for app + storage
    const availableBytes = flashBytes - cursor;

    if (availableBytes < 0x20000) {
        errors.push('Not enough space after reserved regions for an application.');
        return { csv: '', partitions: [], errors };
    }

    if (ota) {
        // Split available space: app0 + app1 + optional storage
        let storageBytes = 0;
        if (includeStorage && storagePct > 0) {
            storageBytes = align(Math.floor(availableBytes * storagePct / 100));
        }

        const appSpace = availableBytes - storageBytes;
        const appSize = align(Math.floor(appSpace / 2));

        if (appSize < 0x20000) {
            errors.push('App partitions too small with current storage allocation. Reduce storage % or increase flash.');
        }

        const app0Offset = cursor;
        const app1Offset = app0Offset + appSize;

        partitions.push({
            name: 'app0',
            type: 'app',
            subtype: 'ota_0',
            offset: app0Offset,
            size: appSize
        });

        partitions.push({
            name: 'app1',
            type: 'app',
            subtype: 'ota_1',
            offset: app1Offset,
            size: appSize
        });

        if (includeStorage && storageBytes > 0) {
            const storageOffset = app1Offset + appSize;
            // Recalculate to use all remaining bytes (avoids rounding gaps)
            const actualStorageSize = flashBytes - storageOffset;
            if (actualStorageSize > 0) {
                partitions.push({
                    name: storageType === 'spiffs' ? 'storage' : 'ffat',
                    type: 'data',
                    subtype: storageType === 'spiffs' ? 'spiffs' : 'fat',
                    offset: storageOffset,
                    size: align(actualStorageSize)
                });
            }
        }
    } else {
        // Single app partition + optional storage
        let storageBytes = 0;
        if (includeStorage && storagePct > 0) {
            storageBytes = align(Math.floor(availableBytes * storagePct / 100));
        }

        const appSize = align(availableBytes - storageBytes);

        partitions.push({
            name: 'app0',
            type: 'app',
            subtype: 'factory',
            offset: cursor,
            size: appSize
        });

        if (includeStorage && storageBytes > 0) {
            const storageOffset = cursor + appSize;
            const actualStorageSize = flashBytes - storageOffset;
            if (actualStorageSize > 0) {
                partitions.push({
                    name: storageType === 'spiffs' ? 'storage' : 'ffat',
                    type: 'data',
                    subtype: storageType === 'spiffs' ? 'spiffs' : 'fat',
                    offset: storageOffset,
                    size: align(actualStorageSize)
                });
            }
        }
    }

    // Validate: last partition must not exceed flash
    const last = partitions[partitions.length - 1];
    if (last.offset + last.size > flashBytes) {
        errors.push(`Partition layout exceeds flash! Last partition ends at ${hex(last.offset + last.size)} but flash is ${hex(flashBytes)}.`);
    }

    // Build CSV
    const csv = buildCsv(partitions, flashKb, platformName, ota, storageType);

    return { csv, partitions, errors };
}

/**
 * Align a byte value down to 4 KB sector boundary.
 */
function align(bytes) {
    return Math.floor(bytes / PARTITION_DEFAULTS.ALIGN) * PARTITION_DEFAULTS.ALIGN;
}

/**
 * Format a number as hex string like 0x1A0000.
 */
function hex(n) {
    return '0x' + n.toString(16).toUpperCase();
}

/**
 * Human-readable size string.
 */
function humanSize(bytes) {
    if (bytes >= 1024 * 1024) {
        const mb = bytes / (1024 * 1024);
        return mb === Math.floor(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
    }
    return `${Math.floor(bytes / 1024)} KB`;
}

/**
 * Build the CSV string from partition array.
 */
function buildCsv(partitions, flashKb, platformName, ota, storageType) {
    const date = new Date().toISOString().split('T')[0];

    const lines = [];
    lines.push(`# Partition Table — ${flashKb >= 1024 ? (flashKb / 1024) + ' MB' : flashKb + ' KB'} Flash`);
    if (platformName) {
        lines.push(`# Platform: ${platformName}`);
    }
    lines.push(`# Generated by Pinleaf Forge — ${date}`);
    lines.push('#');
    lines.push('# Allocation strategy:');

    for (const p of partitions) {
        lines.push(`#   - ${p.name}: ${humanSize(p.size)}`);
    }

    lines.push('#');
    lines.push(`# Total: ${flashKb >= 1024 ? (flashKb / 1024) + ' MB' : flashKb + ' KB'} (${(flashKb * 1024).toLocaleString()} bytes)`);
    lines.push('#');
    lines.push('# Name,   Type,   SubType,  Offset,  Size,      Flags');

    for (const p of partitions) {
        const name = (p.name + ',').padEnd(10);
        const type = (p.type + ',').padEnd(8);
        const sub = (p.subtype + ',').padEnd(10);
        const off = (hex(p.offset) + ',').padEnd(11);
        const sz = (hex(p.size) + ',').padEnd(11);
        lines.push(`${name}${type}${sub}${off}${sz}`);
    }

    return lines.join('\n') + '\n';
}

/**
 * Update the memory map preview in the UI.
 * Called when flash size, OTA toggle, or storage slider changes.
 */
function updateMemoryMapPreview() {
    const flashKb = parseInt(document.getElementById('flashKb')?.value) || 0;
    const previewEl = document.getElementById('memorymapPreview');
    const visualEl = document.getElementById('memorymapVisual');
    const errorEl = document.getElementById('memorymapErrors');

    if (!previewEl) return;

    if (flashKb < 512) {
        previewEl.textContent = '# Enter a flash size ≥ 512 KB to generate a partition table';
        if (visualEl) visualEl.innerHTML = '';
        if (errorEl) errorEl.textContent = '';
        return;
    }

    const ota = document.getElementById('memorymapOta')?.checked !== false;
    const includeStorage = document.getElementById('memorymapStorage')?.checked !== false;
    const storageType = document.getElementById('memorymapStorageType')?.value || 'fat';
    const storagePct = parseInt(document.getElementById('memorymapStoragePct')?.value) || 25;
    const platformName = document.getElementById('boardAlias')?.value || '';

    const result = generateMemoryMap(flashKb, {
        ota, fatfs: includeStorage, storageType, storagePct, platformName
    });

    previewEl.textContent = result.csv || '# Could not generate partition table';

    if (errorEl) {
        errorEl.textContent = result.errors.length ? '⚠ ' + result.errors.join(' | ') : '';
    }

    if (visualEl) {
        visualEl.innerHTML = renderMemoryMapVisual(result.partitions, flashKb * 1024);
    }
}

/**
 * Render a horizontal stacked bar showing partition layout.
 */
function renderMemoryMapVisual(partitions, flashBytes) {
    if (!partitions.length || !flashBytes) return '';

    const colors = {
        nvs: '#667eea',
        otadata: '#a78bfa',
        app0: '#34d399',
        app1: '#6ee7b7',
        ffat: '#fbbf24',
        storage: '#fb923c'
    };

    let html = '<div style="display:flex;height:36px;border-radius:6px;overflow:hidden;border:2px solid #ccc;margin-bottom:8px;">';

    for (const p of partitions) {
        const pct = (p.size / flashBytes) * 100;
        if (pct < 0.5) continue; // too small to draw
        const color = colors[p.name] || '#94a3b8';
        const label = pct > 6 ? `${p.name}<br>${humanSize(p.size)}` : '';
        html += `<div style="width:${pct}%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;font-size:0.7em;font-weight:600;text-align:center;line-height:1.2;padding:0 2px;text-shadow:0 1px 2px rgba(0,0,0,0.3);" title="${p.name}: ${humanSize(p.size)} at ${hex(p.offset)}">${label}</div>`;
    }

    html += '</div>';

    // Legend
    html += '<div style="display:flex;flex-wrap:wrap;gap:10px;font-size:0.8em;">';
    for (const p of partitions) {
        const color = colors[p.name] || '#94a3b8';
        html += `<span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:12px;height:12px;background:${color};border-radius:3px;"></span>${p.name} (${humanSize(p.size)})</span>`;
    }
    html += '</div>';

    return html;
}

/**
 * Download the memory map CSV.
 * In VS Code webview, routes through the bridge. In browser, uses blob download.
 */
function downloadMemoryMapCSV() {
    const previewEl = document.getElementById('memorymapPreview');
    if (!previewEl || !previewEl.textContent.trim() || previewEl.textContent.startsWith('# Enter')) {
        alert('Generate a partition table first (set flash size ≥ 512 KB).');
        return;
    }

    const csv = previewEl.textContent;
    const platformId = document.getElementById('boardId')?.value || 'platform';

    // VS Code webview path
    if (window.__isVSCodeWebview && window.__vscodeApi) {
        window.__vscodeApi.postMessage({
            command: 'saveMemoryMap',
            data: csv,
            filename: 'memorymap.csv'
        });
        return;
    }

    // Browser path
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memorymap.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
