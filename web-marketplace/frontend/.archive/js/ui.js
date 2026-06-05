// ui.js - UI interactions, modals, and event handlers

let map = null;
let mapMarkers = [];

// Global wrapper functions for Leaflet popups
window.goToDesignerPortfolio = function(designerId) {
    // Close the popup
    if (map) {
        map.closePopup();
    }
    // Navigate to the portfolio
    viewDesignerPortfolio(designerId);
};

window.goToProducerPortfolio = function(producerId) {
    // Close the popup
    if (map) {
        map.closePopup();
    }
    // Navigate to the portfolio
    viewProducerPortfolio(producerId);
};

function setupMap() {
    const mapContainer = document.getElementById('map');
    
    if (!mapContainer) {
        console.error('❌ Map container (#map) not found in DOM');
        return;
    }
    
    if (typeof L === 'undefined') {
        console.error('❌ Leaflet library (L) not loaded. Check if leaflet.js is included in HTML');
        return;
    }
    
    if (typeof mockDesigners === 'undefined' || typeof mockProducers === 'undefined') {
        console.warn('Data arrays not ready yet. Map will render with available data.');
    }
    
    try {
        // Clean up old map
        if (map) {
            map.remove();
        }
        
        // Create map
        map = L.map('map').setView([39.8283, -98.5795], 4);
        
        // Add tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(map);
        
        // Add markers
        rerenderMapMarkers();
        
    } catch (error) {
        console.error('❌ setupMap error:', error);
    }
}

function rerenderMapMarkers() {
    if (!map) {
        console.error('Map not initialized');
        return;
    }
    
    // Clear existing markers
    mapMarkers.forEach(marker => map.removeLayer(marker));
    mapMarkers = [];
    
    // Get filter states from toggle pills
    const activeCategories = new Set();
    document.querySelectorAll('.map-toggle-pill.active').forEach(btn => {
        activeCategories.add(btn.dataset.category);
    });
    
    const searchTerm = document.getElementById('mapSearchInput')?.value.toLowerCase() ?? '';
    const availabilityFilter = document.getElementById('mapAvailabilityFilter')?.value ?? 'all';
    
    // Get active product subcategory
    const activeSubPill = document.querySelector('.map-sub-pill.active');
    const productSubcategory = activeSubPill ? activeSubPill.dataset.subcategory : 'all';
    
    // Show/hide product subcategory bar
    const subBar = document.getElementById('mapProductSubcategories');
    if (subBar) {
        subBar.style.display = activeCategories.has('products') ? 'flex' : 'none';
    }
    
    let counts = { designers: 0, producers: 0, products: 0, projects: 0 };
    
    // ── Combined Person Markers (Designers + Producers merged by userId) ──
    // Build a map of userId → { services[], designerData, producerData, lat, lng }
    const userMarkerMap = new Map();
    
    if (activeCategories.has('designers')) {
        mockDesigners.forEach(designer => {
            if (availabilityFilter !== 'all' && designer.availability !== availabilityFilter) return;
            if (searchTerm && !designer.name.toLowerCase().includes(searchTerm) && !(designer.location || '').toLowerCase().includes(searchTerm) && !(designer.specialties || '').toLowerCase().includes(searchTerm)) return;
            if (!designer.latitude || !designer.longitude) return; // skip users without valid coordinates
            
            const key = designer.userId || designer.id;
            if (!userMarkerMap.has(key)) {
                userMarkerMap.set(key, { activeServices: [], allServices: [], designerData: null, producerData: null, lat: designer.latitude, lng: designer.longitude, name: designer.name, location: designer.location });
            }
            const entry = userMarkerMap.get(key);
            entry.activeServices.push('designer');
            entry.designerData = designer;
            // Also note all registered services from API (for pie chart regardless of toggle)
            if (designer.services) {
                if (designer.services.designer && !entry.allServices.includes('designer')) entry.allServices.push('designer');
                if (designer.services.producer && !entry.allServices.includes('producer')) entry.allServices.push('producer');
                if (designer.services.materials && !entry.allServices.includes('materials')) entry.allServices.push('materials');
                if (designer.services.author && !entry.allServices.includes('author')) entry.allServices.push('author');
                if (designer.services.gizmo && !entry.allServices.includes('gizmo')) entry.allServices.push('gizmo');
            }
            counts.designers++;
        });
    }
    
    if (activeCategories.has('producers')) {
        mockProducers.forEach(producer => {
            if (availabilityFilter !== 'all' && producer.availability !== availabilityFilter) return;
            if (searchTerm && !producer.name.toLowerCase().includes(searchTerm) && !(producer.location || '').toLowerCase().includes(searchTerm) && !(producer.capabilities || '').toLowerCase().includes(searchTerm)) return;
            if (!producer.latitude || !producer.longitude) return; // skip users without valid coordinates
            
            const key = producer.userId || producer.id;
            if (!userMarkerMap.has(key)) {
                userMarkerMap.set(key, { activeServices: [], allServices: [], designerData: null, producerData: null, lat: producer.latitude, lng: producer.longitude, name: producer.name, location: producer.location });
            }
            const entry = userMarkerMap.get(key);
            if (!entry.activeServices.includes('producer')) entry.activeServices.push('producer');
            entry.producerData = producer;
            // Use producer coords if designer coords were missing
            if (!entry.lat || !entry.lng) { entry.lat = producer.latitude; entry.lng = producer.longitude; }
            // Merge all registered services from API
            if (producer.services) {
                if (producer.services.designer && !entry.allServices.includes('designer')) entry.allServices.push('designer');
                if (producer.services.producer && !entry.allServices.includes('producer')) entry.allServices.push('producer');
                if (producer.services.materials && !entry.allServices.includes('materials')) entry.allServices.push('materials');
                if (producer.services.author && !entry.allServices.includes('author')) entry.allServices.push('author');
                if (producer.services.gizmo && !entry.allServices.includes('gizmo')) entry.allServices.push('gizmo');
            }
            if (!entry.activeServices.includes('designer')) counts.producers++; // don't double-count
            else counts.producers++;
        });
    }
    
    // Render combined person markers
    userMarkerMap.forEach((entry, userId) => {
        const { allServices, designerData, producerData, lat, lng, name, location } = entry;
        const serviceList = allServices.length > 0 ? allServices : entry.activeServices;
        
        // Choose icon: pie chart for multi-service, solid circle for single
        let icon;
        if (serviceList.length > 1) {
            icon = createPieChartIcon(serviceList);
        } else {
            const type = serviceList[0] || 'designer';
            const emoji = type === 'producer' ? (producerData?.emoji || '🏭') : (designerData?.emoji || '🎨');
            icon = createMapIcon(emoji, type);
        }
        
        // Build popup content combining all available data
        let popupHtml = `<div class="map-popup">`;
        
        // Header with service badges
        const serviceBadges = serviceList.map(s => {
            const labels = { designer: '🎨 Designer', producer: '🏭 Producer', materials: '🧱 Materials', author: '📚 Author', gizmo: '🔧 Gizmo' };
            const colors = { designer: '#3b82f6', producer: '#f59e0b', materials: '#6b7280', author: '#8b5cf6', gizmo: '#10b981' };
            return `<span style="display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600;color:#fff;background:${colors[s] || '#888'};margin-right:3px;">${labels[s] || s}</span>`;
        }).join('');
        
        popupHtml += `<h4>${name}</h4>`;
        popupHtml += `<div style="margin-bottom:4px;">${serviceBadges}</div>`;
        popupHtml += `<p class="map-popup-loc">📍 ${location}</p>`;
        
        // Designer details
        if (designerData) {
            popupHtml += `<p class="map-popup-rating">⭐ ${designerData.rating} (${designerData.reviewCount} reviews — ${designerData.verifiedReviewCount} verified)</p>`;
            if (designerData.specialties) popupHtml += `<p class="map-popup-detail">${designerData.specialties}</p>`;
            popupHtml += `<p class="map-popup-avail">${getAvailabilityLabel(designerData.availability)}${designerData.waitlistCount ? ` · 📋 ${designerData.waitlistCount} on waitlist` : ''}</p>`;
            popupHtml += `<p class="map-popup-detail">⏱ Avg lead time: ${designerData.averageLeadTime} days</p>`;
        }
        
        // Producer details (if also a producer)
        if (producerData && designerData) {
            popupHtml += `<hr style="margin:6px 0;border:none;border-top:1px solid #eee;">`;
        }
        if (producerData) {
            if (!designerData) {
                popupHtml += `<p class="map-popup-rating">⭐ ${producerData.rating} (${producerData.reviewCount} reviews — ${producerData.verifiedReviewCount} verified)</p>`;
                popupHtml += `<p class="map-popup-avail">${getAvailabilityLabel(producerData.availability)}${producerData.waitlistCount ? ` · 📋 ${producerData.waitlistCount} on waitlist` : ''}</p>`;
            }
            if (producerData.capabilities) popupHtml += `<p class="map-popup-detail"><strong>Capabilities:</strong> ${producerData.capabilities}</p>`;
            if (producerData.leadTime) popupHtml += `<p class="map-popup-detail">⏱ Lead Time: ${producerData.leadTime}</p>`;
        }
        
        // Action buttons
        if (designerData) {
            popupHtml += `<button class="map-popup-btn map-popup-btn-designer" onclick="goToDesignerPortfolio('${designerData.id}')">View Designer Portfolio</button>`;
        }
        if (producerData) {
            popupHtml += `<button class="map-popup-btn map-popup-btn-producer" onclick="goToProducerPortfolio('${producerData.id}')">View Producer Portfolio</button>`;
        }
        
        popupHtml += `</div>`;
        
        const marker = L.marker([lat, lng], { icon }).addTo(map);
        marker.bindPopup(popupHtml);
        mapMarkers.push(marker);
    });
    
    // ── Product Markers (Green) — remain separate (item-level, not person-level) ──
    if (activeCategories.has('products')) {
        mockProducts.forEach(product => {
            if (productSubcategory !== 'all' && product.category !== productSubcategory) return;
            
            if (availabilityFilter !== 'all') {
                const prodAvail = product.stock > 0 ? 'available' : (product.waitlistCount > 0 ? 'waitlist_only' : 'busy');
                if (prodAvail !== availabilityFilter) return;
            }
            
            const lat = product.designerLatitude;
            const lng = product.designerLongitude;
            if (!lat || !lng) return;
            
            if (searchTerm && !product.name.toLowerCase().includes(searchTerm) && !(product.designerName || '').toLowerCase().includes(searchTerm) && !(product.category || '').toLowerCase().includes(searchTerm) && !(product.description || '').toLowerCase().includes(searchTerm)) return;
            
            // Slight offset to prevent exact overlaps at same designer coords
            const jitteredLat = lat + (Math.random() - 0.5) * 0.3;
            const jitteredLng = lng + (Math.random() - 0.5) * 0.3;
            
            const stockLabel = product.stock > 0
                ? `<span style="color:#16a34a;">✓ In Stock (${product.stock})</span>`
                : `<span style="color:#dc2626;">✗ Out of Stock</span>`;
            
            const marker = L.marker([jitteredLat, jitteredLng], {
                icon: createMapIcon(product.emoji, 'product')
            }).addTo(map);
            
            marker.bindPopup(`
                <div class="map-popup">
                    <h4>${product.emoji} ${product.name}</h4>
                    <p class="map-popup-loc">👤 ${product.designerName}</p>
                    <p class="map-popup-rating">⭐ ${product.rating} (${product.reviewCount} reviews)</p>
                    <p class="map-popup-price">$${product.totalPrice ? product.totalPrice.toFixed(2) : product.price.toFixed(2)}</p>
                    <p class="map-popup-detail">${stockLabel} · ⏱ ${product.leadTime} days</p>
                    <p class="map-popup-detail" style="font-size:12px; color:#888;">${product.category}</p>
                    <button class="map-popup-btn map-popup-btn-product" onclick="viewProductPage('${product.id}')">View Product</button>
                </div>
            `);
            
            mapMarkers.push(marker);
            counts.products++;
        });
    }
    
    // ── Custom Project Markers (Purple) ──
    if (activeCategories.has('custom-projects') && typeof mockCustomProjects !== 'undefined') {
        mockCustomProjects.forEach(project => {
            const firstBid = project.bids && project.bids[0];
            let lat, lng;
            
            if (firstBid) {
                const bidderDesigner = mockDesigners.find(d => d.name === firstBid.bidderName);
                const bidderProducer = mockProducers.find(p => p.name === firstBid.bidderName);
                if (bidderDesigner && bidderDesigner.latitude) {
                    lat = bidderDesigner.latitude + (Math.random() - 0.5) * 0.5;
                    lng = bidderDesigner.longitude + (Math.random() - 0.5) * 0.5;
                } else if (bidderProducer && bidderProducer.latitude) {
                    lat = bidderProducer.latitude + (Math.random() - 0.5) * 0.5;
                    lng = bidderProducer.longitude + (Math.random() - 0.5) * 0.5;
                }
            }
            
            if (!lat) {
                const usCoords = [
                    [40.7128, -74.0060], [34.0522, -118.2437], [41.8781, -87.6298], [29.7604, -95.3698]
                ];
                const coord = usCoords[project.id % usCoords.length];
                lat = coord[0] + (Math.random() - 0.5) * 1;
                lng = coord[1] + (Math.random() - 0.5) * 1;
            }
            
            if (searchTerm && !project.title.toLowerCase().includes(searchTerm) && !(project.category || '').toLowerCase().includes(searchTerm) && !(project.postedBy || '').toLowerCase().includes(searchTerm)) return;
            
            const marker = L.marker([lat, lng], {
                icon: createMapIcon('📋', 'project')
            }).addTo(map);
            
            marker.bindPopup(`
                <div class="map-popup">
                    <h4>📋 ${project.title}</h4>
                    <p class="map-popup-loc">Posted by: ${project.postedBy}</p>
                    <p class="map-popup-detail">Budget: $${project.budget}</p>
                    <p class="map-popup-detail">${project.bids.length} bids · ${project.category}</p>
                    <p class="map-popup-detail" style="font-size:12px;">${project.description.substring(0, 100)}...</p>
                </div>
            `);
            
            mapMarkers.push(marker);
            counts.projects++;
        });
    }
    
    // Update marker count in legend
    const countEl = document.getElementById('mapMarkerCount');
    if (countEl) {
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        countEl.textContent = `${total} marker${total !== 1 ? 's' : ''} shown`;
    }
}

// ── Map marker color map (shared) ──
const MAP_SERVICE_COLORS = {
    designer:  '#3b82f6', // blue
    producer:  '#f59e0b', // amber
    product:   '#10b981', // green
    project:   '#8b5cf6', // purple
    materials: '#6b7280', // gray
    author:    '#8b5cf6', // purple
    gizmo:     '#10b981', // green
};

/**
 * Create a colored Leaflet divIcon for single-service map markers
 */
function createMapIcon(emoji, type) {
    const color = MAP_SERVICE_COLORS[type] || '#6b7280';
    
    return L.divIcon({
        className: 'custom-marker',
        html: `<div class="map-marker-circle" style="background:${color};">
                    <span class="map-marker-emoji">${emoji}</span>
               </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20]
    });
}

/**
 * Create a pie-chart Leaflet divIcon for multi-service users.
 * Each service gets an equal slice of the circle.
 */
function createPieChartIcon(services) {
    const colors = services.map(s => MAP_SERVICE_COLORS[s] || '#6b7280');
    const sliceAngle = 360 / colors.length;
    
    const gradientParts = colors.map((color, i) => {
        const start = i * sliceAngle;
        const end = (i + 1) * sliceAngle;
        return `${color} ${start}deg ${end}deg`;
    });
    
    const gradient = `conic-gradient(${gradientParts.join(', ')})`;
    
    // Build legend dots for service types
    const dots = services.map(s => {
        const c = MAP_SERVICE_COLORS[s] || '#6b7280';
        return `<span style="width:6px;height:6px;border-radius:50%;background:${c};display:inline-block;"></span>`;
    }).join('');
    
    return L.divIcon({
        className: 'custom-marker',
        html: `<div class="map-marker-pie" style="background:${gradient};">
                    <span class="map-marker-emoji">⚡</span>
               </div>
               <div class="map-marker-pie-legend">${dots}</div>`,
        iconSize: [36, 42],
        iconAnchor: [18, 21],
        popupAnchor: [0, -22]
    });
}

/**
 * Helper: availability label for map popups
 */
function getAvailabilityLabel(status) {
    switch (status) {
        case 'available': return '<span style="color:#16a34a; font-weight:600;">✅ Available</span>';
        case 'busy': return '<span style="color:#f59e0b; font-weight:600;">⚠️ Busy</span>';
        case 'waitlist_only': return '<span style="color:#dc2626; font-weight:600;">📋 Waitlist Only</span>';
        default: return status;
    }
}

/**
 * Toggle a map category pill on/off
 */
function toggleMapCategory(btn) {
    if (btn.disabled) return;
    btn.classList.toggle('active');
    rerenderMapMarkers();
}

/**
 * Toggle a product sub-category pill (single-select with "All" reset)
 */
function toggleMapSubcategory(btn) {
    const subcategory = btn.dataset.subcategory;
    
    // If clicking "All", deactivate others and activate All
    if (subcategory === 'all') {
        document.querySelectorAll('.map-sub-pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
    } else {
        // Deactivate "All" pill, toggle clicked pill
        document.querySelector('.map-sub-pill[data-subcategory="all"]')?.classList.remove('active');
        btn.classList.toggle('active');
        
        // If nothing selected, re-activate "All"
        const anyActive = document.querySelector('.map-sub-pill.active:not([data-subcategory="all"])');
        if (!anyActive) {
            document.querySelector('.map-sub-pill[data-subcategory="all"]')?.classList.add('active');
        }
    }
    
    rerenderMapMarkers();
}

function updateLocation() {
    const input = document.getElementById('locationInput');
    const val = input ? input.value.trim() : '';
    if (!val) {
        alert('Please enter a zip code or city name.');
        return;
    }
    
    updateLocationStatus('📍 Looking up...');
    
    // Check if input is a 5-digit ZIP code — use our fast backend lookup
    const isZip = /^\d{5}$/.test(val);
    
    if (isZip) {
        fetch(`${(import.meta.env.VITE_API_BASE || "")}/v1/geo/zip/${val}`)
            .then(r => {
                if (!r.ok) throw new Error('ZIP not found');
                return r.json();
            })
            .then(geo => {
                buyerLocation.latitude = geo.lat;
                buyerLocation.longitude = geo.lng;
                const displayName = geo.city ? `${geo.city}, ${geo.state}` : val;
                buyerLocation.city = displayName;
                setLocationCookie(buyerLocation);
                updateLocationStatus(`📍 ${displayName}`);
                if (input) input.value = displayName;
                if (typeof renderProducts === 'function') renderProducts();
                if (typeof renderDesigners === 'function') renderDesigners();
                if (typeof renderProducers === 'function') renderProducers();
            })
            .catch(() => {
                // Fall back to Nominatim for the ZIP
                nominatimLookup(val, input);
            });
    } else {
        nominatimLookup(val, input);
    }
}

/**
 * Nominatim geocode fallback (for city names or when backend ZIP lookup fails)
 */
function nominatimLookup(val, input) {
    const nominatimHeaders = { 'Accept': 'application/json' };
    
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=1&countrycodes=us`, {
        headers: nominatimHeaders
    })
        .then(r => {
            if (!r.ok) throw new Error(`Nominatim returned ${r.status}`);
            return r.json();
        })
        .then(results => {
            if (results && results.length > 0) {
                const loc = results[0];
                buyerLocation.latitude = parseFloat(loc.lat);
                buyerLocation.longitude = parseFloat(loc.lon);
                const displayName = loc.display_name ? loc.display_name.split(',').slice(0, 2).join(',').trim() : val;
                buyerLocation.city = displayName;
                setLocationCookie(buyerLocation);
                updateLocationStatus(`📍 ${displayName}`);
                if (input) input.value = displayName;
                if (typeof renderProducts === 'function') renderProducts();
                if (typeof renderDesigners === 'function') renderDesigners();
                if (typeof renderProducers === 'function') renderProducers();
            } else {
                updateLocationStatus('📍 Not found');
                alert('Could not find that location. Try a zip code or city, state (e.g., "Austin, TX" or "78701").');
            }
        })
        .catch((err) => {
            console.error('Location lookup failed:', err);
            updateLocationStatus('📍 Lookup failed');
            alert('Location lookup failed. Please check your connection and try again.');
        });
}

/**
 * Location cookie helpers
 */
function setLocationCookie(loc) {
    const data = JSON.stringify({ latitude: loc.latitude, longitude: loc.longitude, city: loc.city || '' });
    document.cookie = `pds_location=${encodeURIComponent(data)}; max-age=${60*60*24*90}; path=/; SameSite=Lax`;
}

function getLocationCookie() {
    const match = document.cookie.match(/(?:^|; )pds_location=([^;]*)/);
    if (match) {
        try { return JSON.parse(decodeURIComponent(match[1])); } catch(e) { return null; }
    }
    return null;
}

function updateLocationStatus(text) {
    const el = document.getElementById('locationStatus');
    if (el) el.textContent = text;
}

/**
 * Initialize location on page load: cookie → geolocation → default
 */
function initLocation() {
    const saved = getLocationCookie();
    if (saved && saved.latitude) {
        buyerLocation.latitude = saved.latitude;
        buyerLocation.longitude = saved.longitude;
        buyerLocation.city = saved.city || '';
        const input = document.getElementById('locationInput');
        if (input) input.value = saved.city || '';
        updateLocationStatus(`📍 ${saved.city || 'Saved location'}`);
        return;
    }
    // Try browser geolocation
    if (navigator.geolocation) {
        updateLocationStatus('📍 Detecting location...');
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                buyerLocation.latitude = pos.coords.latitude;
                buyerLocation.longitude = pos.coords.longitude;
                // Reverse geocode for display
                fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`, {
                    headers: { 'Accept': 'application/json' }
                })
                    .then(r => {
                        if (!r.ok) throw new Error(`Nominatim returned ${r.status}`);
                        return r.json();
                    })
                    .then(data => {
                        const city = data.address?.city || data.address?.town || data.address?.village || '';
                        const state = data.address?.state || '';
                        const display = city ? `${city}, ${state}` : 'Your location';
                        buyerLocation.city = display;
                        const input = document.getElementById('locationInput');
                        if (input) input.placeholder = display;
                        updateLocationStatus(`📍 ${display}`);
                        setLocationCookie(buyerLocation);
                        // Re-render with new location
                        if (typeof renderProducts === 'function') renderProducts();
                        if (typeof renderDesigners === 'function') renderDesigners();
                        if (typeof renderProducers === 'function') renderProducers();
                    })
                    .catch(() => {
                        updateLocationStatus('📍 Location detected');
                        setLocationCookie(buyerLocation);
                    });
            },
            () => {
                // Geolocation denied/failed — prompt for zip
                updateLocationStatus('📍 Enter your location');
            },
            { timeout: 8000 }
        );
    } else {
        updateLocationStatus('📍 Enter your location');
    }
}

/**
 * Materials search — queries the product search API filtered by category=materials
 * and renders results into #materialsGrid.
 */
async function searchMaterials() {
    const input = document.getElementById('materialsSearchInput');
    const query = input ? input.value.trim() : '';

    const grid = document.getElementById('materialsGrid');
    if (!grid) return;

    grid.innerHTML = '<p style="text-align:center;padding:40px;color:#999;">Searching...</p>';

    try {
        const params = new URLSearchParams({ query, category: 'materials', limit: '20' });
        const resp = await apiFetch(`/v1/search/products?${params}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const results = data.results || [];

        if (results.length === 0) {
            grid.innerHTML = '<p style="text-align:center;padding:40px;color:#999;">No materials found' +
                (query ? ` for "${escapeHtml(query)}"` : '') + '</p>';
            return;
        }

        grid.innerHTML = results.map(p => `
            <div class="product-card">
                ${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" class="product-image" style="width:100%;height:160px;object-fit:cover;border-radius:8px 8px 0 0;">` : ''}
                <div style="padding:12px;">
                    <h4 style="margin:0 0 4px;">${escapeHtml(p.name)}</h4>
                    <p style="font-size:13px;color:#666;margin:0 0 8px;">${escapeHtml((p.description || '').substring(0, 80))}</p>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-weight:600;">$${(p.price || 0).toLocaleString()}</span>
                        <button class="btn-primary" style="padding:6px 12px;font-size:13px;"
                            onclick="addToCart('${p.id}', '${escapeHtml(p.name).replace(/'/g, "\\'")}', ${p.price || 0})">Add to Cart</button>
                    </div>
                    ${p.stock === 0 ? `<button class="btn-secondary" style="width:100%;margin-top:6px;padding:6px;"
                        onclick="addToWaitlist(${JSON.stringify({id:p.id, name:p.name}).replace(/"/g, '&quot;')})">⏰ Join Waitlist</button>` : ''}
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('searchMaterials error:', err);
        grid.innerHTML = '<p style="text-align:center;padding:40px;color:#c00;">Search failed. Please try again.</p>';
    }
}

function contactBusiness(userId, businessName) {
    if (!requireAuth('send messages')) return;
    // Navigate to Dashboard > Messages and open conversation with that user
    if (typeof showSection === 'function') showSection('dashboard-section');
    setTimeout(() => {
        if (typeof showDashboardTab === 'function') showDashboardTab('messaging');
        setTimeout(() => {
            if (typeof messagingModule !== 'undefined' && messagingModule.openConversation) {
                messagingModule.openConversation(userId, businessName);
            }
        }, 300);
    }, 200);
}

function requireAuth(actionName) {
    if (!authService || !authService.isAuthenticated()) {
        alert(`Please sign in or create an account to ${actionName}.`);
        if (typeof showSignupModal === 'function') showSignupModal();
        return false;
    }
    return true;
}

function addToCart(productId, productName, price) {
    if (!requireAuth('add items to your cart')) return;
    alert(`✓ Added to Cart\n\n${productName}\nPrice: $${price.toFixed(2)}`);
}

function requestBids(productId) {
    if (!requireAuth('request bids')) return;
    const product = mockProducts.find(p => p.id === productId);
    alert(`📤 Bid Request Sent\n\nQualified producers will be notified about:\n${product.name}\n\nYou'll receive bids within 24 hours.`);
}

/**
 * Image carousel navigation functions
 */
function carouselNext(carouselId) {
    const carousel = document.getElementById(carouselId);
    if (!carousel) return;
    
    const images = carousel.querySelectorAll('.carousel-img');
    const dots = carousel.querySelectorAll('.dot');
    
    let currentIndex = Array.from(images).findIndex(img => img.classList.contains('active'));
    let nextIndex = (currentIndex + 1) % images.length;
    
    images[currentIndex].classList.remove('active');
    images[nextIndex].classList.add('active');
    
    dots.forEach((d, i) => d.classList.toggle('active', i === nextIndex));
}

function carouselPrev(carouselId) {
    const carousel = document.getElementById(carouselId);
    if (!carousel) return;
    
    const images = carousel.querySelectorAll('.carousel-img');
    const dots = carousel.querySelectorAll('.dot');
    
    let currentIndex = Array.from(images).findIndex(img => img.classList.contains('active'));
    let prevIndex = (currentIndex - 1 + images.length) % images.length;
    
    images[currentIndex].classList.remove('active');
    images[prevIndex].classList.add('active');
    
    dots.forEach((d, i) => d.classList.toggle('active', i === prevIndex));
}

function carouselGoTo(carouselId, index) {
    const carousel = document.getElementById(carouselId);
    if (!carousel) return;
    
    const images = carousel.querySelectorAll('.carousel-img');
    const dots = carousel.querySelectorAll('.dot');
    
    let currentIndex = Array.from(images).findIndex(img => img.classList.contains('active'));
    
    images[currentIndex].classList.remove('active');
    images[index].classList.add('active');
    
    dots.forEach((d, i) => {
        d.classList.toggle('active', i === index);
    });
}

/**
 * Touch swipe support for image carousels
 * Attaches to all elements with data-swipe="true"
 */
function initCarouselSwipe() {
    document.addEventListener('touchstart', function(e) {
        const carousel = e.target.closest('[data-swipe="true"]');
        if (!carousel) return;
        carousel._touchStartX = e.touches[0].clientX;
        carousel._touchStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
        const carousel = e.target.closest('[data-swipe="true"]');
        if (!carousel || carousel._touchStartX === undefined) return;
        const dx = e.changedTouches[0].clientX - carousel._touchStartX;
        const dy = e.changedTouches[0].clientY - carousel._touchStartY;
        // Only swipe if horizontal movement > 40px and more horizontal than vertical
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
            e.preventDefault();
            if (dx < 0) {
                carouselNext(carousel.id);
            } else {
                carouselPrev(carousel.id);
            }
        }
        delete carousel._touchStartX;
        delete carousel._touchStartY;
    }, { passive: false });
}

// Initialize swipe on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCarouselSwipe);
} else {
    initCarouselSwipe();
}

/**
 * View Product Page — opens a full product detail modal
 */
function viewProductPage(productId) {
    const product = mockProducts.find(p => p.id === productId);
    if (!product) return;

    const images = product.images && product.images.length > 0 ? product.images : [product.image];
    const modalCarouselId = `modal-carousel-${product.id}`;

    // Stock status
    const stockLabel = product.stock > 10
        ? `<span style="color: var(--success); font-weight:600;">✓ In Stock (${product.stock})</span>`
        : product.stock > 0
        ? `<span style="color: var(--warning); font-weight:600;">⚠ Low Stock (${product.stock})</span>`
        : `<span style="color: var(--danger); font-weight:600;">✗ Out of Stock</span>`;

    const waitlistHTML = product.stock === 0
        ? `<div class="waitlist-indicator" style="margin:8px 0;">📋 <strong>${product.waitlistCount || 0}</strong> on waitlist</div>`
        : '';

    const ratingHTML = product.rating
        ? `<div class="rating-two-tier" style="margin:10px 0;">
                <span class="rating-stars">${renderStars(product.rating)} ${product.rating}</span>
                <span class="rating-breakdown">(${product.verifiedReviewCount || 0} verified, ${(product.reviewCount || 0) - (product.verifiedReviewCount || 0)} community)</span>
           </div>`
        : '';

    // Build producer info
    let producerInfo = '';
    if (product.biddingProducers && product.biddingProducers.length > 0) {
        producerInfo = `
            <div style="margin:12px 0;">
                <strong>Available Producers:</strong>
                <ul style="margin:8px 0 0 16px; font-size:13px; color:var(--text-secondary);">
                    ${product.biddingProducers.map(p => `<li>${p.name} — ${p.leadTime} — $${p.quote}</li>`).join('')}
                </ul>
            </div>`;
    } else {
        producerInfo = `<div style="margin:12px 0; font-size:13px;">✓ <strong>Designer Designed & Produced</strong></div>`;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
        <div class="modal-content" style="max-width:700px; max-height:90vh; overflow-y:auto; position:relative;">
            <span class="close" onclick="this.parentElement.parentElement.remove()" style="position:absolute;top:12px;right:16px;cursor:pointer;font-size:28px;z-index:10;">&times;</span>

            <!-- Image gallery -->
            <div class="product-image-carousel" id="${modalCarouselId}" data-swipe="true" style="height:350px; border-radius:8px 8px 0 0;">
                <div class="carousel-images">
                    ${images.map((img, i) => `<img src="${img}" alt="${product.name}" class="carousel-img ${i === 0 ? 'active' : ''}" style="border-radius:8px 8px 0 0;" />`).join('')}
                </div>
                ${images.length > 1 ? `
                    <button class="carousel-prev" onclick="event.stopPropagation(); carouselPrev('${modalCarouselId}')">&#8249;</button>
                    <button class="carousel-next" onclick="event.stopPropagation(); carouselNext('${modalCarouselId}')">&#8250;</button>
                    <div class="carousel-dots">
                        ${images.map((_, i) => `<span class="dot ${i === 0 ? 'active' : ''}" onclick="event.stopPropagation(); carouselGoTo('${modalCarouselId}', ${i})"></span>`).join('')}
                    </div>
                ` : ''}
            </div>

            <div style="padding:24px;">
                <h2 style="margin:0 0 6px;">${product.emoji} ${product.name}</h2>
                ${ratingHTML}

                <div class="product-price" style="font-size:28px; margin:12px 0;">\$${product.totalPrice ? product.totalPrice.toFixed(2) : product.price.toFixed(2)}</div>

                <div style="display:flex; gap:16px; flex-wrap:wrap; font-size:13px; margin:12px 0;">
                    <div>⏱ <strong>Lead Time:</strong> ${product.leadTime} days</div>
                    <div>${stockLabel}</div>
                </div>
                ${waitlistHTML}

                <p style="font-size:14px; line-height:1.6; color:var(--text-secondary); margin:16px 0;">${product.description}</p>

                <div class="designer-section" style="margin:16px 0;">👤 <strong>Designed by:</strong> ${product.designerName}</div>
                ${producerInfo}

                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button class="btn-primary" style="flex:1; padding:12px;" onclick="addProductToCart(${JSON.stringify(product).replace(/"/g, '&quot;')})">🛒 Buy Now</button>
                    ${product.stock === 0 ? `<button class="btn-secondary" style="flex:1; padding:12px;" onclick="addToWaitlist(${JSON.stringify({id:product.id, name:product.name}).replace(/"/g, '&quot;')})">⏰ Join Waitlist</button>` : ''}
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

/**
 * Waitlist management
 */
async function addToWaitlist(product) {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    if (!user.id) {
        alert('❌ Please sign in first to join the waitlist.');
        showLoginModal();
        return;
    }
    
    try {
        const resp = await apiFetch('/v1/waitlist', {
            method: 'POST',
            body: JSON.stringify({ productId: product.id }),
        });
        const data = resp.ok ? await resp.json() : null;
        const alreadyOn = resp.status === 200 && data?.message?.includes('Already');

        // Confirmation modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <span class="close" onclick="this.parentElement.parentElement.remove()" style="position: absolute; top: 10px; right: 10px; cursor: pointer; font-size: 24px;">&times;</span>
                <h2>${alreadyOn ? 'Already on Waitlist' : '✓ Added to Waitlist'}</h2>
                <p>${alreadyOn ? 'You are already on the waitlist for' : "You've been added to the waitlist for"} <strong>${product.name}</strong>.</p>
                <p style="color: var(--text-secondary); margin: 20px 0;">
                    We'll notify you via email as soon as this item is back in stock. 
                    You can manage your waitlist items in your account settings.
                </p>
                <button class="btn-primary" style="width: 100%; padding: 10px;" onclick="this.parentElement.parentElement.remove()">Got it!</button>
            </div>
        `;
        document.body.appendChild(modal);
    } catch (error) {
        console.error('Error adding to waitlist:', error);
        alert('❌ Failed to add to waitlist. Please try again.');
    }
}

// Event listener for modal closing when clicking outside modal
document.addEventListener('click', function(event) {
    const modal = document.getElementById('businessModal');
    if (modal && event.target === modal) {
        modal.classList.remove('show');
    }
});

// NOTE: showTab and showSection are defined in app.js (loaded after ui.js)
// Removed duplicate definitions here to prevent confusion.

// --- Vite module exports (attach to window for HTML event handler compat) ---
window.updateLocation = updateLocation;
window.searchMaterials = searchMaterials;
window.rerenderMapMarkers = rerenderMapMarkers;
window.toggleMapCategory = toggleMapCategory;
window.toggleMapSubcategory = toggleMapSubcategory;
window.setupMap = setupMap;
window.getMapInstance = () => map;
window.initLocation = initLocation;
window.contactBusiness = contactBusiness;
window.requireAuth = requireAuth;
window.addToCart = addToCart;
window.requestBids = requestBids;
window.carouselNext = carouselNext;
window.carouselPrev = carouselPrev;
window.carouselGoTo = carouselGoTo;
window.initCarouselSwipe = initCarouselSwipe;
window.viewProductPage = viewProductPage;
window.addToWaitlist = addToWaitlist;
