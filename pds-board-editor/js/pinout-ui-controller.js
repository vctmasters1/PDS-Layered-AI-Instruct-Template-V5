// Pinleaf Forge - Pinout Generator UI Controller
// Preview updates and UI management

function updatePreview() {
    if (!platformData || !platformData.pin_capabilities) {
        document.getElementById('svgPreview').innerHTML = '<p style="color: #999;">Load platform JSON to see preview</p>';
        return;
    }
    
    const svg = generatePinoutLeafSVG();
    document.getElementById('svgPreview').innerHTML = svg;
    
    // Generate individual header download buttons
    generateHeaderButtons();
}

function generateHeaderButtons() {
    const headerButtons = document.getElementById('headerButtons');
    if (!platformData || !platformData.pin_capabilities) {
        headerButtons.innerHTML = '';
        return;
    }
    
    // Get unique headers
    const headers = [...new Set(platformData.pin_capabilities.map(p => p.header_id || 'J1'))];
    
    // Create a button for each header
    let buttonsHTML = '<div style="margin-top: 10px;">';
    buttonsHTML += '<small style="color: #666; display: block; margin-bottom: 5px;">Download Individual Headers:</small>';
    headers.forEach(headerId => {
        const pinCount = platformData.pin_capabilities.filter(p => (p.header_id || 'J1') === headerId).length;
        buttonsHTML += `<button class="primary" style="margin-bottom: 5px; font-size: 0.9em;" onclick="downloadHeaderSVG('${headerId}')">
            ?? ${headerId} (${pinCount} pins)
        </button>`;
    });
    buttonsHTML += '</div>';
    headerButtons.innerHTML = buttonsHTML;
}
