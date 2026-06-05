// Pinleaf Forge - Pinout Generator Download Handler
// SVG and PDF download functions

function downloadSVG() {
    // Download combined SVG (deprecated - use downloadAllSVGs instead)
    downloadAllSVGs();
}

function downloadHeaderSVG(headerId) {
    if (!platformData) {
        alert('?? Please load platform data first');
        return;
    }
    
    // Filter pins for this header
    const headerPins = platformData.pin_capabilities.filter(p => (p.header_id || 'J1') === headerId);
    
    if (headerPins.length === 0) {
        alert(`No pins found for header ${headerId}`);
        return;
    }
    
    // Temporarily replace pin_capabilities with filtered pins
    const originalPins = platformData.pin_capabilities;
    platformData.pin_capabilities = headerPins;
    
    const svg = generatePinoutLeafSVG();
    
    // Restore original pins
    platformData.pin_capabilities = originalPins;
    
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().split('T')[0];
    const platformId = platformData.id || 'board';
    const platformName = platformData.name || platformId;
    
    // Suggested path: platforms/{platform-name-or-id}/{platform-id}_{header}_pinout.svg
    a.download = `platforms_${platformId}_${platformId}_${headerId}_pinout_${timestamp}.svg`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Show helpful message after first download
    if (headerId === [...new Set(platformData.pin_capabilities.map(p => p.header_id || 'J1'))][0]) {
        setTimeout(() => {
            alert(`? SVG downloaded!\n\n?? Recommended file structure:\n./platforms/${platformName}/\n  ??? ${platformId}.json\n  ??? ${platformId}_${headerId}_pinout.svg\n  ??? (other headers...)\n\nPlease create the folder and organize files accordingly.`);
        }, 200);
    }
}

function downloadAllSVGs() {
    if (!platformData) {
        alert('?? Please load platform data first');
        return;
    }
    
    // Get unique headers
    const headers = [...new Set(platformData.pin_capabilities.map(p => p.header_id || 'J1'))];
    
    // Download SVG for each header
    headers.forEach((headerId, index) => {
        setTimeout(() => downloadHeaderSVG(headerId), 100 * index);
    });
    
    const platformId = platformData.id || 'board';
    const platformName = platformData.name || platformId;
    
    setTimeout(() => {
        alert(`? Downloading ${headers.length} SVG file(s)\n\n?? Recommended organization:\n./platforms/${platformName}/\n  ??? ${platformId}.json\n${headers.map(h => `  ??? ${platformId}_${h}_pinout.svg`).join('\n')}\n\nPlease create the folder and move files accordingly.`);
    }, (headers.length + 1) * 100);
}

function downloadPDF() {
    alert('?? PDF export coming soon!\n\nFor now:\n1. Download SVG\n2. Open in browser\n3. Print to PDF (Ctrl+P)\n4. Set scale to 100%');
}
