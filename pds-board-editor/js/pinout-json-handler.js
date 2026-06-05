// Pinleaf Forge - Pinout Generator JSON Handler
// Import JSON and manage platform data

function loadJSON() {
    const jsonText = document.getElementById('jsonInput').value.trim();
    if (!jsonText) {
        alert('?? Please paste JSON first');
        return;
    }
    
    try {
        platformData = JSON.parse(jsonText);
        
        // Auto-fill board name
        if (platformData.name) {
            document.getElementById('boardName').value = platformData.name;
        }
        
        updatePreview();
        alert('? Platform data loaded successfully!');
    } catch (error) {
        alert(`? Invalid JSON:\n\n${error.message}`);
    }
}
