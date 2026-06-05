// theme.js - Dark/Light mode theme management
// ============================================================================
// Handles system color theme preference detection and manual theme toggling
// Respects prefers-color-scheme media query and localStorage preferences

/**
 * Initialize theme system and apply saved preference
 * Runs on page load to detect system preference or user's saved choice
 */
function initializeTheme() {
    const savedTheme = localStorage.getItem('pds-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Determine which theme to use
    let theme;
    if (savedTheme) {
        // User has explicitly set a theme
        theme = savedTheme;
    } else if (prefersDark) {
        // No saved preference, use system preference
        theme = 'dark';
    } else {
        // Default to light theme
        theme = 'light';
    }
    
    // Apply the theme
    applyTheme(theme);
    
    // Update theme toggle button to reflect current theme
    updateThemeToggleButton(theme);
}

/**
 * Apply theme to the document
 * @param {string} theme - 'light' or 'dark'
 */
function applyTheme(theme) {
    const html = document.documentElement;
    
    if (theme === 'dark') {
        html.setAttribute('data-theme', 'dark');
        localStorage.setItem('pds-theme', 'dark');
    } else {
        html.setAttribute('data-theme', 'light');
        localStorage.setItem('pds-theme', 'light');
    }
}

/**
 * Get current theme
 * @returns {string} Current theme: 'light' or 'dark'
 */
function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/**
 * Toggle between light and dark themes
 */
function toggleTheme() {
    const currentTheme = getCurrentTheme();
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    updateThemeToggleButton(newTheme);
}

/**
 * Update the theme toggle button icon based on current theme
 * @param {string} theme - Current theme: 'light' or 'dark'
 */
function updateThemeToggleButton(theme) {
    const button = document.getElementById('themeToggleBtn');
    if (!button) return;
    
    // Update button appearance based on theme
    if (theme === 'dark') {
        button.innerHTML = '☀️'; // Sun icon for light mode
        button.setAttribute('title', 'Switch to Light Mode');
        button.setAttribute('aria-label', 'Switch to Light Mode');
    } else {
        button.innerHTML = '🌙'; // Moon icon for dark mode
        button.setAttribute('title', 'Switch to Dark Mode');
        button.setAttribute('aria-label', 'Switch to Dark Mode');
    }
}

/**
 * Listen for system theme changes
 * If user hasn't explicitly set a theme preference, switch with system settings
 */
function watchSystemTheme() {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    darkModeQuery.addListener((e) => {
        // Only auto-switch if user hasn't set explicit preference
        const savedTheme = localStorage.getItem('pds-theme');
        if (!savedTheme) {
            const newTheme = e.matches ? 'dark' : 'light';
            applyTheme(newTheme);
            updateThemeToggleButton(newTheme);
        }
    });
}

/**
 * Export functions for global use
 */
window.toggleTheme = toggleTheme;
window.getCurrentTheme = getCurrentTheme;
window.initializeTheme = initializeTheme;
window.watchSystemTheme = watchSystemTheme;
