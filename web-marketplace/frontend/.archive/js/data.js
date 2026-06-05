// ============================================================================
// PDS Marketplace - Data Module (Production)
// Runtime data arrays populated from API. No hardcoded mock data.
// Archived: .old/data.js.bak
// ============================================================================

// --- Live data arrays (populated by API fetch functions) ---
const designers = [];
const producers = [];
const products = [];
const customProjects = [];

// --- Buyer location (runtime state, defaults to center-US until detected) ---
let buyerLocation = {
    latitude: 39.8283,
    longitude: -98.5795,
    city: "",
    state: ""
};

// --- Newsletter posts (static editorial content) ---
const newsletterPosts = [
    {
        id: 1,
        title: "\ud83d\udca1 Our Mission: Supporting Local Makers",
        date: "2026-02-13",
        author: "PipeDream Team",
        category: "Mission",
        content: `<strong>The PDS Marketplace exists to support local manufacturers, designers, and creators in your community.</strong>

We believe in a different way to do business. The products available here may sometimes cost more than items mass-produced overseas by multinational corporations maximizing profits through overseas labor. But when you buy from PDS Marketplace, something important happens:

<strong>\ud83c\udfea The money stays local.</strong> Your purchase directly supports local workers, families, and communities.

<strong>\ud83d\udc65 You're buying from real people.</strong> These are products created by friends, neighbors, fellow community members\u2014not faceless multinational conglomerates.

<strong>\ud83d\udcb0 Fair compensation.</strong> Our partners pay their employees fair wages and care about their craft, not just cutting costs to the bone.

<strong>\u2b50 Quality and craftsmanship.</strong> Local creators take pride in their work because their reputation is everything.

<strong>\ud83c\udfdb\ufe0f Economic strength.</strong> When you support local business, you strengthen your community\u2019s economic resilience and independence.

The PDS Marketplace is a platform that connects buyers who care\u2014with makers who care. It\u2019s about rebuilding local manufacturing, one order at a time.

<em style="font-size: 16px; color: var(--primary);">Support local. Support your neighbors.</em>`
    },
    {
        id: 2,
        title: "Welcome to PipeDream Marketplace",
        date: "2026-02-01",
        author: "PipeDream Founder",
        category: "Announcement",
        content: `Welcome to the PipeDream Marketplace\u2014a new platform dedicated to connecting buyers with local designers and manufacturers.

We\u2019re excited to launch this platform and build a community around supporting local manufacturing. Whether you\u2019re looking for custom products, seeking manufacturing partners, or want to showcase your work, PDS Marketplace is here to help.

<strong>What We Offer:</strong>
\u2022 Browse products from verified local makers
\u2022 Post custom requests and receive competitive bids
\u2022 Connect with skilled designers and manufacturers
\u2022 Support local communities and workers

Thank you for being part of our journey. Together, we\u2019re rebuilding local manufacturing.`
    }
];

// ============================================================================
// API Fetch Functions — populate live data arrays from backend
// ============================================================================

/**
 * Fetch designers from the API and populate the designers array.
 */
async function fetchDesignersFromAPI() {
    try {
        const resp = await fetch((import.meta.env.VITE_API_BASE || "") + '/v1/search/designers?limit=200');
        if (!resp.ok) return false;
        const data = await resp.json();
        if (data.results && data.results.length > 0) {
            const apiDesigners = data.results.map(d => {
                const lat = parseFloat(d.latitude);
                const lng = parseFloat(d.longitude);
                return {
                    id: d.id,
                    userId: d.userId,
                    name: d.businessName || d.name || 'Unknown Designer',
                    type: 'designer',
                    emoji: d.emoji || '\ud83c\udfa8',
                    location: d.location || `${d.city || ''}, ${d.state || ''}`.replace(/^, |, $/, '') || 'USA',
                    latitude: (lat && lat !== 0) ? lat : null,
                    longitude: (lng && lng !== 0) ? lng : null,
                    rating: parseFloat(d.averageRating || d.rating) || 0,
                    reviewCount: d.reviewCount || 0,
                    verifiedReviewCount: d.verifiedReviewCount || 0,
                    specialties: d.specialties || d.capabilities || '',
                    bio: d.bio || d.description || '',
                    availability: d.availability || 'available',
                    waitlistCount: d.waitlistCount || 0,
                    averageLeadTime: d.averageLeadTime || 14,
                    services: d.services || {},
                };
            });
            designers.length = 0;
            designers.push(...apiDesigners);
            return true;
        }
    } catch (err) {
        console.warn('Designers API fetch failed:', err.message);
    }
    return false;
}

/**
 * Fetch producers from the API and populate the producers array.
 */
async function fetchProducersFromAPI() {
    try {
        const resp = await fetch((import.meta.env.VITE_API_BASE || "") + '/v1/search/producers?limit=200');
        if (!resp.ok) return false;
        const data = await resp.json();
        if (data.results && data.results.length > 0) {
            const apiProducers = data.results.map(p => {
                // capabilities comes from API as {materialTypes: [...], ...}
                let capStr = '';
                if (p.capabilities) {
                    if (Array.isArray(p.capabilities.materialTypes)) {
                        capStr = p.capabilities.materialTypes.map(c => c.replace(/_/g, ' ')).join(', ');
                    } else if (typeof p.capabilities === 'string') {
                        capStr = p.capabilities;
                    }
                }
                const lat = parseFloat(p.latitude);
                const lng = parseFloat(p.longitude);
                return {
                    id: p.id,
                    userId: p.userId,
                    name: p.businessName || p.name || 'Unknown Producer',
                    emoji: p.emoji || '\ud83c\udfed',
                    location: p.location || `${p.city || ''}, ${p.state || ''}`.replace(/^, |, $/, '') || 'USA',
                    latitude: (lat && lat !== 0) ? lat : null,
                    longitude: (lng && lng !== 0) ? lng : null,
                    rating: parseFloat(p.averageRating || p.rating) || 0,
                    reviewCount: p.reviewCount || 0,
                    verifiedReviewCount: p.verifiedReviewCount || 0,
                    capabilities: capStr,
                    leadTime: p.averageLeadTime ? `${p.averageLeadTime} days` : '10-14 days',
                    bio: p.bio || (typeof p.description === 'string' && !p.description.startsWith('{') ? p.description : '') || '',
                    availability: p.availability || 'available',
                    waitlistCount: p.waitlistCount || 0,
                    services: p.services || {},
                };
            });
            producers.length = 0;
            producers.push(...apiProducers);
            return true;
        }
    } catch (err) {
        console.warn('Producers API fetch failed:', err.message);
    }
    return false;
}

/**
 * Fetch all marketplace data from API (called on page load).
 */
async function fetchAllMarketplaceData() {
    const results = await Promise.allSettled([
        fetchDesignersFromAPI(),
        fetchProducersFromAPI(),
    ]);
    return results;
}

// --- Backward-compatible aliases (global window references used by other modules) ---
// These point to the SAME arrays so modules that reference the old names still work.
const mockDesigners = designers;
const mockProducers = producers;
const mockProducts = products;
const mockCustomProjects = customProjects;
const mockNewsletterPosts = newsletterPosts;

// --- Vite module exports (attach to window for HTML event handler compat) ---
window.designers = designers;
window.producers = producers;
window.products = products;
window.customProjects = customProjects;
window.newsletterPosts = newsletterPosts;
window.buyerLocation = buyerLocation;
window.fetchDesignersFromAPI = fetchDesignersFromAPI;
window.fetchProducersFromAPI = fetchProducersFromAPI;
window.fetchAllMarketplaceData = fetchAllMarketplaceData;

// Backward-compatible aliases
window.mockDesigners = designers;
window.mockProducers = producers;
window.mockProducts = products;
window.mockCustomProjects = customProjects;
window.mockNewsletterPosts = newsletterPosts;
