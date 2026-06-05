// Pinleaf Forge - JSON Import/Export Functions

function parseAndFillForm() {
    const jsonText = document.getElementById('pasteJsonInput').value.trim();
    if (!jsonText) {
        alert('?? Please paste JSON first');
        return;
    }

    try {
        const data = JSON.parse(jsonText);

        // Populate form fields from JSON
        // Support both new schema (boardId/mcuTarget/boardAlias) and legacy (id/processor/name)
        if (data.boardId || data.id) document.getElementById('boardId').value = data.boardId || data.id;
        if (data.mcuTarget || data.processor) document.getElementById('processor').value = data.mcuTarget || data.processor;
        if (data.boardAlias || data.name) document.getElementById('boardAlias').value = data.boardAlias || data.name;
        if (data.website) document.getElementById('websiteUrl').value = data.website;
        if (data.sku) document.getElementById('skuNumber').value = data.sku;
        if (data.description) document.getElementById('description').value = data.description;
        if (data.architecture) document.getElementById('architecture').value = data.architecture;
        if (data.cores) document.getElementById('cores').value = data.cores;
        if (data.frequency_mhz) document.getElementById('frequency').value = data.frequency_mhz;
        if (data.ram_kb) document.getElementById('ramKb').value = data.ram_kb;
        if (data.flash_kb) document.getElementById('flashKb').value = data.flash_kb;
        if (data.gpio_total) document.getElementById('gpioTotal').value = data.gpio_total;
        if (data.adc_channels) document.getElementById('adcChannels').value = data.adc_channels;
        if (data.pwm_channels) document.getElementById('pwmChannels').value = data.pwm_channels;
        if (data.wifi) document.getElementById('wifi').value = data.wifi;
        if (data.ble) document.getElementById('ble').value = data.ble;
        if (data.toolchain) document.getElementById('toolchain').value = data.toolchain;
        if (data.notes) document.getElementById('notes').value = data.notes;

        // USB ports
        if (data.usb_ports) {
            if (data.usb_ports.usb1) document.getElementById('usb1Count').value = data.usb_ports.usb1;
            if (data.usb_ports.usb2) document.getElementById('usb2Count').value = data.usb_ports.usb2;
            if (data.usb_ports.usb3) document.getElementById('usb3Count').value = data.usb_ports.usb3;
            if (data.usb_ports.usb4) document.getElementById('usb4Count').value = data.usb_ports.usb4;
        }

        // System features (toggle buttons)
        if (data.system_features && Array.isArray(data.system_features)) {
            data.system_features.forEach(feature => {
                const btn = document.querySelector(`.feature-toggle-btn[data-feature="${feature}"]`);
                if (btn) btn.classList.add('active');
            });
        }

        // Communication interfaces (toggle buttons)
        if (data.supported_interfaces && Array.isArray(data.supported_interfaces)) {
            data.supported_interfaces.forEach(iface => {
                const btn = document.querySelector(`.feature-toggle-btn[data-feature="${iface.toLowerCase()}"]`);
                if (btn) btn.classList.add('active');
            });
        }

        // Pin capabilities
        if (data.pin_capabilities && Array.isArray(data.pin_capabilities)) {
            document.getElementById('totalPinsInput').value = data.pin_capabilities.length;
            generatePinRows();

            // Wait for DOM update
            setTimeout(() => {
                data.pin_capabilities.forEach((pinData, idx) => {
                    const rows = document.querySelectorAll('.pin-row');
                    if (idx < rows.length) {
                        const row = rows[idx];

                        // Set header_id
                        const headerEl = row.querySelector('.pin-header');
                        if (headerEl && pinData.header_id != null) headerEl.textContent = pinData.header_id;

                        // Set group
                        const groupEl = row.querySelector('.pin-group');
                        if (groupEl && pinData.group != null) groupEl.textContent = pinData.group;

                        // Set var_alias
                        const varAliasEl = row.querySelector('.pin-var-alias');
                        if (varAliasEl && pinData.var_alias != null) varAliasEl.textContent = pinData.var_alias;

                        // Set physical pin
                        const physicalEl = row.querySelector('.pin-physical');
                        if (physicalEl && pinData.physical_pin != null) physicalEl.textContent = pinData.physical_pin;

                        // Set name
                        const labelEl = row.querySelector('.pin-label');
                        if (labelEl && pinData.name != null) labelEl.textContent = pinData.name;

                        // Set capabilities
                        if (pinData.capabilities && Array.isArray(pinData.capabilities)) {
                            pinData.capabilities.forEach(cap => {
                                const capBtn = row.querySelector(`.capability-btn[data-capability="${cap}"]`);
                                if (capBtn) capBtn.classList.add('active');
                            });
                        }
                    }
                });

                updatePreview();
                if (typeof updateMemoryMapPreview === 'function') updateMemoryMapPreview();
                alert('? JSON imported successfully!');
            }, 100);
        } else {
            updatePreview();
            if (typeof updateMemoryMapPreview === 'function') updateMemoryMapPreview();
            alert('? Platform data imported! (No pin capabilities found)');
        }

    } catch (error) {
        alert(`? Invalid JSON:\n\n${error.message}`);
    }
}

function downloadJSON() {
    // Refresh preview first to ensure latest data
    updatePreview();
    
    const data = {
        id: document.getElementById('boardId').value,
        name: document.getElementById('boardAlias').value,
        website: document.getElementById('websiteUrl').value,
        sku: document.getElementById('skuNumber').value,
        description: document.getElementById('description').value,
        architecture: document.getElementById('architecture').value,
        cores: parseInt(document.getElementById('cores').value) || null,
        frequency_mhz: parseInt(document.getElementById('frequency').value) || null,
        ram_kb: parseInt(document.getElementById('ramKb').value) || null,
        flash_kb: parseInt(document.getElementById('flashKb').value) || null,
        gpio_total: parseInt(document.getElementById('gpioTotal').value) || null,
        adc_channels: parseInt(document.getElementById('adcChannels').value) || null,
        pwm_channels: parseInt(document.getElementById('pwmChannels').value) || null,
        wifi: document.getElementById('wifi').value,
        ble: document.getElementById('ble').value,
        supported_interfaces: getCommunicationInterfaces(),
        usb_ports: getUsbPorts(),
        system_features: getSystemFeatures(),
        toolchain: document.getElementById('toolchain').value,
        notes: document.getElementById('notes').value,
        pin_capabilities: populatePinCapabilities()
    };

    // Remove null values and empty arrays
    Object.keys(data).forEach(key => {
        if (data[key] === null || data[key] === '' || (Array.isArray(data[key]) && data[key].length === 0)) {
            delete data[key];
        }
    });

    // Validate required fields
    if (!data.boardId) {
        alert('?? Board ID is required before downloading');
        return;
    }

    // Create JSON blob
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const platformId = data.boardId;
    const platformName = data.boardAlias || platformId;
    
    a.download = `${platformId}.json`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Show helpful message about file organization
    setTimeout(() => {
        alert(`? JSON downloaded!\n\n?? Recommended file structure:\n./platforms/${platformName}/\n  ??? ${platformId}.json\n  ??? ${platformId}_pinout.svg\n  ??? ${platformId}_diagram.svg\n\nPlease create the folder and move the downloaded file accordingly.`);
    }, 100);
}

function openPinoutLeafGenerator() {
    const data = {
        boardId: document.getElementById('boardId').value,
        mcuTarget: document.getElementById('processor').value,
        boardAlias: document.getElementById('boardAlias').value,
        pin_capabilities: populatePinCapabilities()
    };

    // Validate
    if (!data.boardId) {
        alert('?? Board ID is required before generating pinout');
        return;
    }

    // Store in sessionStorage for pinout generator
    sessionStorage.setItem('boardData', JSON.stringify(data));

    // In VS Code webview, window.open is blocked — show guidance
    if (window.__isVSCodeWebview) {
        alert('Pinout Leaf Generator is not available inside VS Code.\nOpen pinout-leaf-generator.html in your browser and paste the JSON.');
        return;
    }

    // Open pinout generator in new tab
    window.open('pinout-leaf-generator.html', '_blank');
}
