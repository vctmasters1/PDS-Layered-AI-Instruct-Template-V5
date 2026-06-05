// Pinleaf Forge - Data Collection and Preview
// Collect form data and update JSON preview

function toggleSystemFeature(button) {
    button.classList.toggle('active');
    updatePreview();
}

function getSystemFeatures() {
    const features = [];
    document.querySelectorAll('.feature-toggle-btn.active').forEach(btn => {
        features.push(btn.dataset.feature);
    });
    return features;
}

function getCommunicationInterfaces() {
    const interfaces = [];
    const commButtons = document.querySelectorAll('.feature-toggle-btn[data-feature="i2c"], .feature-toggle-btn[data-feature="spi"], .feature-toggle-btn[data-feature="uart"], .feature-toggle-btn[data-feature="can"], .feature-toggle-btn[data-feature="i2s"]');
    commButtons.forEach(btn => {
        if (btn.classList.contains('active')) {
            interfaces.push(btn.dataset.feature.toUpperCase());
        }
    });
    return interfaces;
}

function getUsbPorts() {
    const usb = {};
    const usb1 = parseInt(document.getElementById('usb1Count').value) || 0;
    const usb2 = parseInt(document.getElementById('usb2Count').value) || 0;
    const usb3 = parseInt(document.getElementById('usb3Count').value) || 0;
    const usb4 = parseInt(document.getElementById('usb4Count').value) || 0;

    if (usb1 > 0) usb['usb1'] = usb1;
    if (usb2 > 0) usb['usb2'] = usb2;
    if (usb3 > 0) usb['usb3'] = usb3;
    if (usb4 > 0) usb['usb4'] = usb4;

    return Object.keys(usb).length > 0 ? usb : null;
}

function populatePinCapabilities() {
    const capabilities = [];
    const activeButtons = document.querySelectorAll('.capability-btn.active');
    
    // Group by pin
    const pinMap = {};
    activeButtons.forEach(btn => {
        const pin = parseInt(btn.dataset.pin);
        const cap = btn.dataset.capability;
        
        if (!pinMap[pin]) {
            pinMap[pin] = {
                pin: pin,
                header_id: null,
                physical_pin: null,
                group: null,
                var_alias: null,
                name: null,
                capabilities: []
            };
        }
        pinMap[pin].capabilities.push(cap);
    });

    // Get pin names and physical pins from labels
    document.querySelectorAll('.pin-label').forEach(label => {
        const pin = parseInt(label.dataset.pin);
        const name = label.textContent.trim();
        
        // Get corresponding physical pin
        const physicalEl = label.parentElement.querySelector('.pin-physical');
        const physicalPin = physicalEl ? physicalEl.textContent.trim() : null;
        
        // Get corresponding header
        const headerEl = label.parentElement.querySelector('.pin-header');
        const header = headerEl ? headerEl.textContent.trim() : 'J1';
        
        // Get corresponding group
        const groupEl = label.parentElement.querySelector('.pin-group');
        const group = groupEl ? groupEl.textContent.trim() : 'Uncategorized';
        
        // Get corresponding var_alias
        const varAliasEl = label.parentElement.querySelector('.pin-var-alias');
        const varAlias = varAliasEl ? varAliasEl.textContent.trim() : null;
        
        if (!pinMap[pin]) {
            pinMap[pin] = {
                pin: pin,
                header_id: header,
                physical_pin: physicalPin,
                group: group,
                var_alias: varAlias,
                name: name,
                capabilities: []
            };
        } else {
            pinMap[pin].name = name;
            pinMap[pin].header_id = header;
            pinMap[pin].physical_pin = physicalPin;
            pinMap[pin].group = group;
            pinMap[pin].var_alias = varAlias;
        }
    });

    // Convert to array format
    Object.values(pinMap).forEach(pinData => {
        capabilities.push({
            pin: pinData.pin,
            header_id: pinData.header_id,
            physical_pin: pinData.physical_pin,
            group: pinData.group,
            var_alias: pinData.var_alias,
            name: pinData.name,
            capabilities: pinData.capabilities
        });
    });

    // Sort by pin number
    capabilities.sort((a, b) => a.pin - b.pin);

    return capabilities;
}

function updatePreview() {
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
        if (data[key] === null || (Array.isArray(data[key]) && data[key].length === 0)) {
            delete data[key];
        }
    });

    document.getElementById('preview').textContent = JSON.stringify(data, null, 2);
    
    // Update quick pinout preview
    updateQuickPinoutPreview(data);
}

function updateQuickPinoutPreview(data) {
    const previewEl = document.getElementById('quickPinoutPreview');
    
    if (!data.pin_capabilities || data.pin_capabilities.length === 0) {
        previewEl.innerHTML = '<p style="color: #999;">Generate pin rows to see preview</p>';
        return;
    }
    
    const svg = generateQuickPinoutSVG(data);
    previewEl.innerHTML = svg;
}

function generateQuickPinoutSVG(data) {
    const pins = data.pin_capabilities;
    const boardName = data.name || 'Dev Board';

    // Group pins by header_id, then sort each group by physical_pin
    const headers = {};
    pins.forEach(p => {
        const hdr = p.header_id || 'J1';
        if (!headers[hdr]) headers[hdr] = [];
        headers[hdr].push(p);
    });
    Object.values(headers).forEach(arr =>
        arr.sort((a, b) => {
            const pa = parseInt(a.physical_pin) || 0;
            const pb = parseInt(b.physical_pin) || 0;
            return pa - pb;
        })
    );

    const headerNames = Object.keys(headers);

    // Assign sides: first header = left, second = right, extras alternate
    // Common conventions: LS=left, RS=right
    let leftPins = [];
    let rightPins = [];

    if (headerNames.length === 1) {
        // Single header: split in half like a DIP
        const all = headers[headerNames[0]];
        const half = Math.ceil(all.length / 2);
        leftPins = all.slice(0, half);
        rightPins = all.slice(half);
    } else {
        // Map headers to sides
        const leftKeys = headerNames.filter(h => /^(LS|L|J1|P1|LEFT)/i.test(h));
        const rightKeys = headerNames.filter(h => /^(RS|R|J2|P2|RIGHT)/i.test(h));
        const remaining = headerNames.filter(h => !leftKeys.includes(h) && !rightKeys.includes(h));

        // Assign remaining headers alternating
        remaining.forEach((h, i) => {
            if (i % 2 === 0) leftKeys.push(h);
            else rightKeys.push(h);
        });

        // If all ended up on one side, split them
        if (leftKeys.length === 0) { leftKeys.push(rightKeys.shift()); }
        if (rightKeys.length === 0) { rightKeys.push(leftKeys.pop()); }

        leftKeys.forEach(k => { if (headers[k]) leftPins = leftPins.concat(headers[k]); });
        rightKeys.forEach(k => { if (headers[k]) rightPins = rightPins.concat(headers[k]); });
    }

    const maxSide = Math.max(leftPins.length, rightPins.length, 1);
    const spacing = 18;
    const pinRadius = 4;
    const labelWidth = 120;
    const chipWidth = 40;
    const margin = 40;

    const height = maxSide * spacing + margin * 2 + 10;
    const width = labelWidth * 2 + chipWidth + margin * 2;
    const chipX = margin + labelWidth;
    const chipTop = margin - 5;
    const chipBottom = margin + maxSide * spacing + 5;

    let svgContent = '';

    // Draw chip body
    svgContent += `<rect x="${chipX}" y="${chipTop}" width="${chipWidth}" height="${chipBottom - chipTop}" rx="4" fill="#2d2d44" stroke="#667eea" stroke-width="1"/>`;
    // Notch at top center
    svgContent += `<circle cx="${chipX + chipWidth / 2}" cy="${chipTop}" r="4" fill="#1e1e2e" stroke="#667eea" stroke-width="0.5"/>`;

    // Color map for groups
    const groupColors = {
        'Power': '#e74c3c', 'I2C': '#3498db', 'SPI': '#9b59b6', 'UART': '#e67e22',
        'ADC': '#27ae60', 'PWM': '#f39c12', 'GPIO': '#667eea', 'Special': '#95a5a6',
        'Stepper': '#d35400', 'HX711': '#c0392b', 'Relay': '#e84393', 'LED': '#fdcb6e'
    };
    function getColor(group) {
        if (!group) return '#667eea';
        for (const key of Object.keys(groupColors)) {
            if (group.toLowerCase().includes(key.toLowerCase())) return groupColors[key];
        }
        return '#667eea';
    }

    // Left side pins
    leftPins.forEach((pin, i) => {
        const y = margin + i * spacing;
        const x = chipX;
        const color = getColor(pin.group);
        const label = pin.var_alias || pin.name || ('gpio_' + pin.pin);
        const physLabel = pin.physical_pin ? pin.physical_pin : '';

        // Pin stub
        svgContent += `<line x1="${x - 8}" y1="${y}" x2="${x}" y2="${y}" stroke="${color}" stroke-width="1.5"/>`;
        svgContent += `<circle cx="${x - 8}" cy="${y}" r="${pinRadius}" fill="${color}" stroke="#333" stroke-width="0.5"/>`;
        // Physical pin number near chip
        svgContent += `<text x="${x - 12}" y="${y + 2}" text-anchor="end" font-size="5" fill="#999">${physLabel}</text>`;
        // Label
        svgContent += `<text x="${x - 20}" y="${y + 2}" text-anchor="end" font-size="6" font-weight="bold" fill="${color}">${label}</text>`;
    });

    // Right side pins
    rightPins.forEach((pin, i) => {
        const y = margin + i * spacing;
        const x = chipX + chipWidth;
        const color = getColor(pin.group);
        const label = pin.var_alias || pin.name || ('gpio_' + pin.pin);
        const physLabel = pin.physical_pin ? pin.physical_pin : '';

        // Pin stub
        svgContent += `<line x1="${x}" y1="${y}" x2="${x + 8}" y2="${y}" stroke="${color}" stroke-width="1.5"/>`;
        svgContent += `<circle cx="${x + 8}" cy="${y}" r="${pinRadius}" fill="${color}" stroke="#333" stroke-width="0.5"/>`;
        // Physical pin number near chip
        svgContent += `<text x="${x + 12}" y="${y + 2}" text-anchor="start" font-size="5" fill="#999">${physLabel}</text>`;
        // Label
        svgContent += `<text x="${x + 20}" y="${y + 2}" text-anchor="start" font-size="6" font-weight="bold" fill="${color}">${label}</text>`;
    });

    // Board title
    svgContent = `<text x="${width / 2}" y="18" text-anchor="middle" font-size="10" font-weight="bold" fill="#667eea">${boardName}</text>` + svgContent;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto;">
        <rect width="100%" height="100%" fill="#f9f9f9"/>
        ${svgContent}
    </svg>`;
}
