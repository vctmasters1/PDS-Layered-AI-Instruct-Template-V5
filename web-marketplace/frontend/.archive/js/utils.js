// ============================================================================
// PDS Marketplace - Utilities Module
// Contains helper functions: distance calculation, formatting, etc.
// ============================================================================

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return (text || "").replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in miles
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Format price with dollar sign and decimals
 * @param {number} price - Price to format
 * @returns {string} Formatted price string
 */
function formatPrice(price) {
    return `$${parseFloat(price).toFixed(2)}`;
}

/**
 * Calculate design fee from product price and lowest producer quote
 * @param {number} productPrice - Original product price
 * @param {array} biddingProducers - Array of producers with quotes
 * @returns {number} Design fee amount
 */
function calculateDesignFee(productPrice, biddingProducers) {
    if (!biddingProducers || biddingProducers.length === 0) {
        return productPrice; // If no producers, entire price is design fee
    }
    const lowestQuote = Math.min(...biddingProducers.map(p => p.quote));
    const fee = productPrice - lowestQuote;
    return Math.max(fee, 0); // Ensure non-negative
}

/**
 * Get closest producer from list based on buyer location
 * @param {array} producers - Array of producers with latitude/longitude
 * @returns {object} Closest producer object or null
 */
function getClosestProducer(producers) {
    if (!producers || producers.length === 0) return null;
    
    let closest = producers[0];
    let minDistance = calculateDistance(
        buyerLocation.latitude,
        buyerLocation.longitude,
        closest.latitude,
        closest.longitude
    );
    
    for (let i = 1; i < producers.length; i++) {
        const distance = calculateDistance(
            buyerLocation.latitude,
            buyerLocation.longitude,
            producers[i].latitude,
            producers[i].longitude
        );
        if (distance < minDistance) {
            minDistance = distance;
            closest = producers[i];
        }
    }
    
    return { ...closest, distance: Math.round(minDistance) };
}

/**
 * Generate star rating HTML
 * @param {number} rating - Rating from 0-5
 * @returns {string} HTML string with stars
 */
function generateStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;
    let stars = '⭐'.repeat(fullStars);
    if (hasHalfStar) stars += '✨';
    return stars;
}

/**
 * Parse location string to extract coordinates
 * @param {string} location - Location string (e.g., "New York, NY")
 * @returns {object} Object with latitude and longitude
 */
function parseLocation(location) {
    // This would connect to a real geocoding API in production
    // For now, we'll map common cities
    const locationMap = {
        'new york': { lat: 40.7128, lon: -74.0060 },
        'los angeles': { lat: 34.0522, lon: -118.2437 },
        'chicago': { lat: 41.8781, lon: -87.6298 },
        'houston': { lat: 29.7604, lon: -95.3698 },
        'phoenix': { lat: 33.4484, lon: -112.0742 },
        'philadelphia': { lat: 39.9526, lon: -75.1652 },
        'san antonio': { lat: 29.4241, lon: -98.4936 },
        'san diego': { lat: 32.7157, lon: -117.1611 },
        'dallas': { lat: 32.7767, lon: -96.7970 },
        'san jose': { lat: 37.3382, lon: -121.8863 },
        'austin': { lat: 30.2672, lon: -97.7431 },
        'denver': { lat: 39.7392, lon: -104.9903 },
        'seattle': { lat: 47.6062, lon: -122.3321 },
        'portland': { lat: 45.5152, lon: -122.6784 },
        'boston': { lat: 42.3601, lon: -71.0589 },
        'atlanta': { lat: 33.7490, lon: -84.3880 },
        'charlotte': { lat: 35.2271, lon: -80.8431 }
    };
    
    const cleanLocation = location.toLowerCase().trim();
    for (let key in locationMap) {
        if (cleanLocation.includes(key)) {
            return locationMap[key];
        }
    }
    
    // Default to NYC if not found
    return { lat: 40.7128, lon: -74.0060 };
}

/**
 * Check if element is in viewport
 * @param {element} el - Element to check
 * @returns {boolean} True if element is visible
 */
function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

/**
 * Debounce function for search input
 * @param {function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {function} Debounced function
 */
function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
}

/**
 * Centralized fetch wrapper that auto-includes auth credentials.
 * Sends httpOnly cookie via credentials:'include' AND Authorization header as fallback.
 * Usage: apiFetch('/v1/admin/analytics') or apiFetch('/v1/orders', { method: 'POST', body: ... })
 * @param {string} url - The URL to fetch
 * @param {RequestInit} [options={}] - Fetch options
 * @returns {Promise<Response>}
 */
function apiFetch(url, options = {}) {
    const token = localStorage.getItem("pds_token");
    const headers = new Headers(options.headers || {});
    if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    return fetch((import.meta.env.VITE_API_BASE || "") + url, {
        ...options,
        credentials: "include",
        headers,
        signal: options.signal ?? controller.signal,
    }).finally(() => clearTimeout(timeoutId));
}

// --- Vite module exports (attach to window for HTML event handler compat) ---
window.escapeHtml = escapeHtml;
window.calculateDistance = calculateDistance;
window.formatPrice = formatPrice;
window.calculateDesignFee = calculateDesignFee;
window.getClosestProducer = getClosestProducer;
window.generateStars = generateStars;
window.parseLocation = parseLocation;
window.isInViewport = isInViewport;
window.debounce = debounce;
window.apiFetch = apiFetch;
