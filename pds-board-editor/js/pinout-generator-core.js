// Pinleaf Forge - Pinout Generator Core
// Global state and initialization

let platformData = null;

// Auto-load platform data from sessionStorage if available
window.addEventListener('DOMContentLoaded', function() {
    const storedData = sessionStorage.getItem('boardData');
    if (storedData) {
        try {
            platformData = JSON.parse(storedData);
            document.getElementById('jsonInput').value = JSON.stringify(platformData, null, 2);
            
            // Auto-fill board name
            if (platformData.name) {
                document.getElementById('boardName').value = platformData.name;
            }
            
            updatePreview();
            
            // Clear sessionStorage after loading
            sessionStorage.removeItem('boardData');
            
            // Show success message
            setTimeout(() => {
                alert('? Platform data loaded automatically from Platform Editor!');
            }, 100);
        } catch (error) {
            console.error('Error loading platform data:', error);
        }
    }
});
