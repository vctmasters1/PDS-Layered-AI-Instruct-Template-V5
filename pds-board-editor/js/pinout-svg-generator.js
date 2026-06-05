// Pinleaf Forge - Pinout Generator SVG Generator
// Generate SVG pinout diagrams

function generatePinoutLeafSVG() {
    const boardName = document.getElementById('boardName').value || 'Dev Board';
    const headerLayout = document.getElementById('headerLayout').value;
    const pinSpacing = parseFloat(document.getElementById('pinSpacing').value) || 2.54;
    const fontSize = parseInt(document.getElementById('fontSize').value) || 8;
    const colorScheme = document.getElementById('colorScheme').value;
    
    const pins = platformData.pin_capabilities;
    const mmToPixels = 3.7795275591; // 1mm = 3.78 pixels at 96 DPI
    const spacing = pinSpacing * mmToPixels;
    const pinHoleRadius = 0.8 * mmToPixels; // 0.8mm radius hole
    const labelWidth = 120;
    const margin = 30;
    
    const pinElements = [];
    let width = 0;
    let height = 0;
    
    if (headerLayout === 'dual') {
        const pinsPerSide = Math.ceil(pins.length / 2);
        height = pinsPerSide * spacing + margin * 2;
        width = labelWidth * 2 + spacing * 3 + margin * 2;
        
        // Left side pins
        for (let i = 0; i < pinsPerSide; i++) {
            const pin = pins[i];
            if (!pin) continue;
            
            const y = margin + i * spacing;
            const x = margin + labelWidth;
            const pinGroup = [];
            
            pinGroup.push(`<circle cx="${x}" cy="${y}" r="${pinHoleRadius}" fill="white" stroke="#333" stroke-width="1"/>`);
            
            if (pin.physical_pin) {
                pinGroup.push(`<text x="${x - pinHoleRadius - 5}" y="${y - 2}" text-anchor="end" font-size="${fontSize - 2}" fill="#999">${pin.physical_pin}</text>`);
            }
            
            const pinColor = getPinColor(pin, colorScheme);
            pinGroup.push(`<text x="${x - pinHoleRadius - 10}" y="${y + fontSize / 2}" text-anchor="end" font-size="${fontSize}" font-weight="bold" fill="${pinColor}">${pin.name || 'GPIO' + pin.pin}</text>`);
            
            pinElements.push(`    <!-- Pin ${i + 1}: ${pin.name || 'GPIO' + pin.pin} -->`);
            pinElements.push(`    <g id="pin-${i}">`);
            pinElements.push(`      ${pinGroup.join('\n      ')}`);
            pinElements.push(`    </g>`);
        }
        
        // Right side pins
        for (let i = 0; i < pinsPerSide; i++) {
            const pin = pins[pinsPerSide + i];
            if (!pin) continue;
            
            const y = margin + i * spacing;
            const x = margin + labelWidth + spacing * 2;
            const pinGroup = [];
            
            pinGroup.push(`<circle cx="${x}" cy="${y}" r="${pinHoleRadius}" fill="white" stroke="#333" stroke-width="1"/>`);
            
            if (pin.physical_pin) {
                pinGroup.push(`<text x="${x + pinHoleRadius + 5}" y="${y - 2}" text-anchor="start" font-size="${fontSize - 2}" fill="#999">${pin.physical_pin}</text>`);
            }
            
            const pinColor = getPinColor(pin, colorScheme);
            pinGroup.push(`<text x="${x + pinHoleRadius + 10}" y="${y + fontSize / 2}" text-anchor="start" font-size="${fontSize}" font-weight="bold" fill="${pinColor}">${pin.name || 'GPIO' + pin.pin}</text>`);
            
            pinElements.push(`    <!-- Pin ${pinsPerSide + i + 1}: ${pin.name || 'GPIO' + pin.pin} -->`);
            pinElements.push(`    <g id="pin-${pinsPerSide + i}">`);
            pinElements.push(`      ${pinGroup.join('\n      ')}`);
            pinElements.push(`    </g>`);
        }
        
    } else {
        const isLeft = headerLayout === 'single-left';
        height = pins.length * spacing + margin * 2;
        width = labelWidth + spacing + margin * 2;
        
        pins.forEach((pin, i) => {
            const y = margin + i * spacing;
            const x = isLeft ? margin : margin + labelWidth;
            const pinGroup = [];
            
            pinGroup.push(`<circle cx="${x}" cy="${y}" r="${pinHoleRadius}" fill="white" stroke="#333" stroke-width="1"/>`);
            
            const pinColor = getPinColor(pin, colorScheme);
            const anchor = isLeft ? 'end' : 'start';
            const labelX = isLeft ? x - pinHoleRadius - 10 : x + pinHoleRadius + 10;
            
            if (pin.physical_pin) {
                const physX = isLeft ? x - pinHoleRadius - 5 : x + pinHoleRadius + 5;
                pinGroup.push(`<text x="${physX}" y="${y - 2}" text-anchor="${anchor}" font-size="${fontSize - 2}" fill="#999">${pin.physical_pin}</text>`);
            }
            
            pinGroup.push(`<text x="${labelX}" y="${y + fontSize / 2}" text-anchor="${anchor}" font-size="${fontSize}" font-weight="bold" fill="${pinColor}">${pin.name || 'GPIO' + pin.pin}</text>`);
            
            pinElements.push(`    <!-- Pin ${i + 1}: ${pin.name || 'GPIO' + pin.pin} -->`);
            pinElements.push(`    <g id="pin-${i}">`);
            pinElements.push(`      ${pinGroup.join('\n      ')}`);
            pinElements.push(`    </g>`);
        });
    }
    
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- Background -->
  <rect width="100%" height="100%" fill="#f9f9f9"/>
  
  <!-- Cutting guide border -->
  <rect x="5" y="5" width="${width - 10}" height="${height - 10}" fill="none" stroke="#ccc" stroke-width="1" stroke-dasharray="5,5"/>
  
  <!-- Board title -->
  <text x="${width / 2}" y="20" text-anchor="middle" font-size="${fontSize + 4}" font-weight="bold" fill="#667eea">${boardName}</text>
  
  <!-- Pin elements -->
${pinElements.join('\n')}
</svg>`;
}

function getPinColor(pin, scheme) {
    if (scheme === 'bw' || scheme === 'minimal') {
        return '#333';
    }
    
    // Color code by capability
    if (!pin.capabilities || pin.capabilities.length === 0) return '#333';
    
    const cap = pin.capabilities[0];
    const colorMap = {
        'VIN': '#ff0000',
        'GND': '#000000',
        '3V3': '#8B0000',
        '5V': '#ff0000',
        'GPIO': '#9370DB',
        'ADC': '#FFA500',
        'PWM': '#4ecdc4',
        'UART': '#00ff00',
        'SPI': '#0000FF',
        'I2C': '#708090',
        'RESET': '#00CED1'
    };
    
    return colorMap[cap] || '#333';
}
