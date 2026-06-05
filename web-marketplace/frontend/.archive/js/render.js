// render.js - All rendering functions for products, designers, and producers

// ============================================================================
// Helper: Star rating display
// ============================================================================
function renderStars(rating) {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.3 && rating % 1 <= 0.7 ? 1 : 0;
    const addFull = rating % 1 > 0.7 ? 1 : 0;
    const totalFull = full + addFull;
    const empty = 5 - totalFull - half;
    return '\u2605'.repeat(totalFull) + (half ? '\u00BD' : '') + '\u2606'.repeat(empty);
}

// ============================================================================
// Helper: Availability badge
// ============================================================================
function getAvailabilityBadge(availability) {
    const map = {
        'available':      '<span class="avail-badge avail-available">\u2705 Available Now</span>',
        'busy':           '<span class="avail-badge avail-busy">\u23f3 Busy</span>',
        'waitlist_only':  '<span class="avail-badge avail-waitlist">\ud83d\udccb Waitlist Only</span>',
        'unavailable':    '<span class="avail-badge avail-unavailable">\u26d4 Unavailable</span>'
    };
    return map[availability] || map['available'];
}

// ============================================================================
// Pagination state
// ============================================================================
let currentProductPage = 1;
let productsPerPage = 50;

/**
 * Fetch products from API and populate the global products array.
 */
async function fetchProductsFromAPI() {
    try {
        const categoryFilter = document.getElementById('categoryFilter');
        const activeCategory = categoryFilter ? categoryFilter.value : '';
        const params = new URLSearchParams({ limit: '100', offset: '0' });
        if (activeCategory) params.set('capability', activeCategory);

        const resp = await fetch(`${(import.meta.env.VITE_API_BASE || "")}/v1/search/products?${params}`);
        if (!resp.ok) return false;
        const data = await resp.json();

        if (data.results && data.results.length > 0) {
            // Map API product entities to the shape render.js expects
            const apiProducts = data.results.map(p => ({
                id: p.id,
                name: p.name,
                category: (p.category || '').toLowerCase(),
                emoji: p.emoji || '📦',
                image: p.images?.[0] || p.image || '',
                images: p.images || (p.image ? [p.image] : []),
                designerId: p.designer?.id || p.designerId || null,
                designerName: p.designer?.businessName || p.designerName || 'Independent',
                designerLatitude: p.designer?.latitude || p.designerLatitude || 0,
                designerLongitude: p.designer?.longitude || p.designerLongitude || 0,
                price: parseFloat(p.price) || 0,
                stock: p.stock ?? 0,
                leadTime: p.estimatedLeadDays || p.leadTime || 14,
                rating: parseFloat(p.averageRating) || 0,
                reviewCount: p.reviewCount || 0,
                verifiedReviewCount: p.verifiedReviewCount || 0,
                description: p.description || '',
                selfDesigned: p.selfDesigned || false,
                allowBidding: p.allowBidding || false,
                biddingProducers: p.biddingProducers || [],
                waitlistCount: p.waitlistCount || 0,
            }));
            // Replace global array with API data
            mockProducts.length = 0;
            mockProducts.push(...apiProducts);
            return true;
        }
    } catch (err) {
        console.warn('Products API fetch failed:', err.message);
    }
    return false;
}

function renderProducts() {
    // Try API fetch first (non-blocking for initial render, updates on next call)
    fetchProductsFromAPI().then(() => _renderProductsFromData());
}

function _renderProductsFromData() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (mockProducts.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;"><p style="font-size: 18px; color: var(--text-secondary);">No products available yet. Designers, list your first product!</p></div>';
        return;
    }
    
    // ── Get active category filter ──
    const categoryFilter = document.getElementById('categoryFilter');
    const activeCategory = categoryFilter ? categoryFilter.value : '';
    
    // ── Filter products by category ──
    let filtered = mockProducts;
    if (activeCategory) {
        filtered = mockProducts.filter(p => p.category === activeCategory);
    }
    
    // ── Calculate distances ──
    filtered.forEach(product => {
        if (product.designerLatitude && product.designerLongitude) {
            product.distance = Math.round(calculateDistance(
                buyerLocation.latitude, buyerLocation.longitude,
                product.designerLatitude, product.designerLongitude
            ));
        } else {
            product.distance = null;
        }
        
        if (product.biddingProducers && product.biddingProducers.length > 0) {
            product.biddingProducers.forEach(producer => {
                if (producer.latitude && producer.longitude) {
                    producer.distance = Math.round(calculateDistance(
                        buyerLocation.latitude, buyerLocation.longitude,
                        producer.latitude, producer.longitude
                    ));
                } else {
                    producer.distance = null;
                }
            });
            product.biddingProducers.sort((a, b) => a.distance - b.distance);
            product.designFee = calculateDesignFee(product.price, product.biddingProducers);
            product.selectedProducer = product.biddingProducers[0];
            product.totalPrice = product.designFee + product.selectedProducer.quote;
        }
    });
    
    // ── Apply current sort (re-sort already-sorted data ensures filter + sort work together) ──
    const sortSelect = document.getElementById('productSort');
    const sortType = sortSelect ? sortSelect.value : 'distance';
    sortProductArray(filtered, sortType);
    
    // ── Pagination ──
    const totalItems = filtered.length;
    const perPage = productsPerPage === 'all' ? totalItems : productsPerPage;
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    
    // Clamp current page
    if (currentProductPage > totalPages) currentProductPage = totalPages;
    if (currentProductPage < 1) currentProductPage = 1;
    
    const startIdx = (currentProductPage - 1) * perPage;
    const endIdx = Math.min(startIdx + perPage, totalItems);
    const pageItems = filtered.slice(startIdx, endIdx);
    
    // ── Empty state ──
    if (pageItems.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px;">
            <p style="font-size: 18px; color: var(--text-secondary);">No products found${activeCategory ? ' in this category' : ''}</p>
            ${activeCategory ? '<button class="btn-secondary" style="margin-top:12px;" onclick="document.getElementById(\'categoryFilter\').value=\'\'; filterByCategory();">Show All Products</button>' : ''}
        </div>`;
        renderPagination(0, 0, 0);
        return;
    }
    
    // ── Render each product card ──
    pageItems.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card product-card--listing';
        const carouselId = `carousel-${product.id}`;
        const images = product.images && product.images.length > 0 ? product.images : [product.image];
        const imageCount = images.length;
        
        // Create image carousel HTML (wrapped in .product-card-thumb for mobile layout)
        let carouselHTML = `
            <div class="product-card-thumb">
                <div class="product-image-carousel" id="${carouselId}">
                    <div class="carousel-images">
        `;
        
        images.forEach((img, idx) => {
            carouselHTML += `<img src="${img}" alt="${product.name} ${idx + 1}" class="carousel-img ${idx === 0 ? 'active' : ''}" onerror="this.src='https://via.placeholder.com/300?text=${encodeURIComponent(product.name)}'" />`;
        });
        
        carouselHTML += `
                    </div>
                    ${imageCount > 1 ? `
                        <button class="carousel-prev" onclick="carouselPrev('${carouselId}')" style="position: absolute; left: 4px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.5); border: none; color: white; font-size: 16px; padding: 4px 8px; cursor: pointer; border-radius: 4px; z-index: 10;">‹</button>
                        <button class="carousel-next" onclick="carouselNext('${carouselId}')" style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.5); border: none; color: white; font-size: 16px; padding: 4px 8px; cursor: pointer; border-radius: 4px; z-index: 10;">›</button>
                        <div class="carousel-dots" style="position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px;">
                            ${images.map((_, idx) => `<span class="dot ${idx === 0 ? 'active' : ''}" onclick="carouselGoTo('${carouselId}', ${idx})" style="width: 6px; height: 6px; border-radius: 50%; background: ${idx === 0 ? 'white' : 'rgba(255,255,255,0.6)'}; cursor: pointer; transition: all 0.3s;"></span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        // Stock status
        const stockStatus = product.stock > 10 ? 
            `<span style="color: var(--success); font-weight: 600;">✓ In Stock</span>` :
            product.stock > 0 ?
            `<span style="color: var(--warning); font-weight: 600;">⚠ Low (${product.stock})</span>` :
            `<span style="color: var(--danger); font-weight: 600;">✗ Out of Stock</span>`;
        
        // Stock status (desktop version with count)
        const stockStatusFull = product.stock > 10 ? 
            `<span style="color: var(--success); font-weight: 600;">✓ In Stock (${product.stock})</span>` :
            product.stock > 0 ?
            `<span style="color: var(--warning); font-weight: 600;">⚠ Low Stock (${product.stock})</span>` :
            `<span style="color: var(--danger); font-weight: 600;">✗ Out of Stock</span>`;
        
        // Rating display
        const ratingHTML = product.rating ? `
            <div class="rating-two-tier" style="margin: 8px 0;">
                <span class="rating-stars">${renderStars(product.rating)} ${product.rating}</span>
                <span class="rating-breakdown desktop-only">(${product.verifiedReviewCount || 0} verified, ${(product.reviewCount || 0) - (product.verifiedReviewCount || 0)} community)</span>
            </div>` : '';
        
        // Designer section
        const designerHTML = `<div class="designer-section">👤 <strong>Designed by:</strong> ${product.designerName}</div>`;
        const distanceHTML = `<div class="product-distance">📍 ${product.distance} miles from you</div>`;
        
        // Producer section with dropdown
        let producerHTML = '';
        if (product.biddingProducers && product.biddingProducers.length > 0) {
            producerHTML = `
                <div class="producer-section">
                    <label for="producer-${product.id}"><strong>Produced by:</strong></label>
                    <select id="producer-${product.id}" class="producer-dropdown" onchange="updateProductPrice(event, ${product.id})">
                        ${product.biddingProducers.map((prod, idx) => `
                            <option value="${idx}" ${idx === 0 ? 'selected' : ''}>
                                ${prod.name} (${prod.distance} mi) - ${prod.leadTime}
                            </option>
                        `).join('')}
                    </select>
                </div>
            `;
        } else {
            producerHTML = `<div class="producer-section">✓ <strong>Designer Designed & Produced</strong></div>`;
        }
        
        // Price display
        const totalPrice = product.totalPrice ? product.totalPrice.toFixed(2) : product.price.toFixed(2);
        let priceHTML = `<div class="product-price">$${totalPrice}</div>`;
        if (product.biddingProducers && product.biddingProducers.length > 0) {
            priceHTML += `<div class="price-breakdown" style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                Design: $${product.designFee.toFixed(2)} + Production: $${product.selectedProducer.quote.toFixed(2)}
            </div>`;
        }
        
        // Lead time and stock status section (desktop — full)
        const statusHTML = `
            <div class="product-status-row desktop-only" style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; margin: 12px 0; padding-top: 12px; border-top: 1px solid var(--border);">
                <div>
                    <span style="color: var(--text-secondary);">⏱ Lead Time:</span>
                    <strong>${product.leadTime} days</strong>
                </div>
                <div>${stockStatusFull}</div>
            </div>
            ${product.stock === 0 ? `<div class="waitlist-indicator desktop-only">📋 <strong>${product.waitlistCount || 0}</strong> on waitlist</div>` : ''}
        `;
        
        // Mobile-compact status (lead + stock on one line)
        const mobileStatusHTML = `
            <div class="mobile-only product-meta-compact">
                <span>⏱ ${product.leadTime}d</span>
                <span>${stockStatus}</span>
                <span>📍 ${product.distance} mi</span>
            </div>
        `;
        
        // Waitlist button (show only if out of stock)
        const waitlistButton = product.stock === 0 ? 
            `<button class="btn-secondary product-waitlist-btn" onclick="addToWaitlist(${JSON.stringify({id: product.id, name: product.name}).replace(/"/g, '&quot;')})">⏰ Waitlist</button>` : '';
        
        card.innerHTML = `
            ${carouselHTML}
            <div class="product-card-info">
                <div class="product-header" onclick="viewProductPage('${escapeHtml(product.id)}')" style="cursor: pointer;">
                    <h4>${escapeHtml(product.emoji || '')} ${escapeHtml(product.name)}</h4>
                </div>
                <div class="product-body" data-product-id="${product.id}">
                    ${ratingHTML}
                    ${mobileStatusHTML}
                    ${distanceHTML}
                    ${designerHTML}
                    ${producerHTML}
                    ${priceHTML}
                    ${statusHTML}
                    <p class="product-description desktop-only" style="font-size: 13px; color: var(--text-secondary); margin: 12px 0;">${escapeHtml(product.description)}</p>
                    <div class="product-actions">
                        <button class="btn-primary product-buy-btn" data-product-id="${product.id}" onclick="addProductToCartById('${escapeHtml(product.id)}')">🛒 Buy Now</button>
                        ${waitlistButton}
                        <button class="btn-report" title="Report this product" onclick="event.stopPropagation(); showReportModal('product', '${escapeHtml(product.id)}', '${escapeHtml(product.userId || '')}')" style="background: none; border: none; cursor: pointer; font-size: 14px; color: var(--text-secondary); padding: 4px 8px; margin-left: auto;" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--text-secondary)'">🚩</button>
                    </div>
                </div>
            </div>
        `;
        
        grid.appendChild(card);
    });
    
    // ── Render pagination bar ──
    renderPagination(totalItems, totalPages, currentProductPage);
}

/**
 * Sort a product array in-place by the given sort type
 */
function sortProductArray(arr, type) {
    if (type === 'distance') {
        arr.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    } else if (type === 'rating') {
        arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (type === 'leadTime') {
        arr.sort((a, b) => (a.leadTime || 999) - (b.leadTime || 999));
    } else if (type === 'price-low') {
        arr.sort((a, b) => a.price - b.price);
    } else if (type === 'price-high') {
        arr.sort((a, b) => b.price - a.price);
    } else if (type === 'stock') {
        arr.sort((a, b) => b.stock - a.stock);
    }
}

/**
 * Render pagination controls below the products grid
 */
function renderPagination(totalItems, totalPages, currentPage) {
    const container = document.getElementById('productsPagination');
    if (!container) return;
    
    if (totalItems === 0 || totalPages <= 1) {
        container.innerHTML = totalItems > 0
            ? `<span class="pagination-info">Showing all ${totalItems} product${totalItems !== 1 ? 's' : ''}</span>`
            : '';
        return;
    }
    
    const perPage = productsPerPage === 'all' ? totalItems : productsPerPage;
    const startItem = (currentPage - 1) * perPage + 1;
    const endItem = Math.min(currentPage * perPage, totalItems);
    
    let pagesHTML = '';
    
    // Previous button
    pagesHTML += `<button class="page-btn ${currentPage === 1 ? 'disabled' : ''}" onclick="goToProductPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹ Prev</button>`;
    
    // Page numbers (show max 7 with ellipsis)
    const maxVisible = 7;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }
    
    if (startPage > 1) {
        pagesHTML += `<button class="page-btn" onclick="goToProductPage(1)">1</button>`;
        if (startPage > 2) pagesHTML += `<span class="page-ellipsis">…</span>`;
    }
    
    for (let i = startPage; i <= endPage; i++) {
        pagesHTML += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToProductPage(${i})">${i}</button>`;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) pagesHTML += `<span class="page-ellipsis">…</span>`;
        pagesHTML += `<button class="page-btn" onclick="goToProductPage(${totalPages})">${totalPages}</button>`;
    }
    
    // Next button
    pagesHTML += `<button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" onclick="goToProductPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next ›</button>`;
    
    container.innerHTML = `
        <span class="pagination-info">Showing ${startItem}–${endItem} of ${totalItems}</span>
        <div class="pagination-pages">${pagesHTML}</div>
    `;
}

/**
 * Navigate to a specific product page
 */
function goToProductPage(page) {
    currentProductPage = page;
    renderProducts();
    const grid = document.getElementById('productsGrid');
    if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Change results per page
 */
function changeResultsPerPage(value) {
    productsPerPage = value === 'all' ? 'all' : parseInt(value, 10);
    currentProductPage = 1;
    renderProducts();
}

/**
 * Filter products by category (called from category dropdown)
 */
function filterByCategory() {
    currentProductPage = 1;
    
    // Update active filter badge (visible on mobile)
    const select = document.getElementById('categoryFilter');
    const badge = document.getElementById('activeFilterBadge');
    if (select && badge) {
        if (select.value) {
            const selectedText = select.options[select.selectedIndex].text;
            badge.innerHTML = `Showing: <strong>${selectedText}</strong> <button onclick="document.getElementById('categoryFilter').value=''; filterByCategory();" style="background:none;border:none;color:var(--primary);font-weight:700;cursor:pointer;font-size:14px;padding:0 4px;">✕</button>`;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
    
    renderProducts();
}

/**
 * Filter producers by capability (called from producers capability dropdown)
 */
function filterProducersByCapability() {
    const select = document.getElementById('producerCapabilityFilter');
    const capability = select ? select.value : '';
    
    if (!capability) {
        renderProducers();
        return;
    }
    
    const filtered = mockProducers.filter(p =>
        p.capabilities && p.capabilities.toLowerCase().includes(capability.toLowerCase())
    );
    renderFilteredProducers(filtered);
}

/**
 * Filter designers by specialty (called from designers specialty dropdown)
 */
function filterDesignersBySpecialty() {
    const select = document.getElementById('categoryFilter2');
    const specialty = select ? select.value : '';
    
    if (!specialty) {
        renderDesigners();
        return;
    }
    
    const filtered = mockDesigners.filter(d =>
        d.specialties && d.specialties.toLowerCase().includes(specialty.toLowerCase())
    );
    renderFilteredDesigners(filtered);
}

function renderProductResults(products) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (products.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;"><p style="font-size: 18px; color: var(--text-secondary);">No products found</p></div>';
        return;
    }
    
    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="product-image">
                <img src="${product.image}" alt="${product.name}" onerror="this.src='https://via.placeholder.com/300?text=${encodeURIComponent(product.name)}'">
            </div>
            <div class="product-header">
                <h4>${escapeHtml(product.emoji || '')} ${escapeHtml(product.name)}</h4>
                <div class="seller-name">by ${escapeHtml(product.designerName || '')}</div>
            </div>
            <div class="product-body">
                <div class="product-price">$${product.price.toFixed(2)}</div>
                <div class="product-distance">📍 ${product.distance} miles away</div>
                <button class="btn-primary" style="width: 100%; margin-top: 15px; padding: 10px;" onclick="addToCart('${escapeHtml(product.id)}', '${escapeHtml(product.name)}', ${product.price})">🛒 Add to Cart</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderDesigners() {
    const grid = document.getElementById('designersGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (mockDesigners.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;"><p style="font-size: 18px; color: var(--text-secondary);">No designers registered yet. Be the first!</p></div>';
        return;
    }
    
    // Calculate distances
    mockDesigners.forEach(designer => {
        if (designer.latitude && designer.longitude) {
            designer.distance = Math.round(calculateDistance(
                buyerLocation.latitude, buyerLocation.longitude,
                designer.latitude, designer.longitude
            ));
        } else {
            designer.distance = null;
        }
    });
    
    // Sort by distance (null distances go to end)
    mockDesigners.sort((a, b) => {
        if (a.distance === null && b.distance === null) return 0;
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
    });
    
    mockDesigners.forEach(designer => {
        const card = document.createElement('div');
        card.className = 'designer-card';
        
        const availBadge = getAvailabilityBadge(designer.availability);
        const waitlistInfo = designer.waitlistCount > 0 ? `<span class="waitlist-count">📋 ${designer.waitlistCount} on waitlist</span>` : '';
        const verifiedPct = designer.reviewCount > 0 ? Math.round((designer.verifiedReviewCount / designer.reviewCount) * 100) : 0;
        
        card.innerHTML = `
            <div class="designer-header">
                <div class="designer-emoji">${designer.emoji}</div>
                <div class="designer-info-top">
                    <div class="designer-name">${escapeHtml(designer.name)}</div>
                    <div class="designer-location">📍 ${escapeHtml(designer.location)}${designer.distance != null ? ` (${designer.distance} miles)` : ''}</div>
                </div>
            </div>
            <div class="designer-body">
                <div class="availability-row">${availBadge} ${waitlistInfo}</div>
                <div class="rating-two-tier">
                    <span class="rating-stars">${renderStars(designer.rating)} ${designer.rating}</span>
                    <span class="rating-breakdown">(${designer.verifiedReviewCount} verified, ${designer.reviewCount - designer.verifiedReviewCount} community)</span>
                </div>
                <div class="designer-lead-time">⏱️ <strong>Avg Lead Time:</strong> ${designer.averageLeadTime} days</div>
                <div class="designer-specialties">
                    <strong>Specialties:</strong> ${escapeHtml(designer.specialties || 'Product Design, Prototyping')}
                </div>
                <div class="designer-bio">
                    ${escapeHtml(designer.bio || 'Experienced designer ready to help bring your ideas to life')}
                </div>
                <div class="designer-cta">
                    <button class="btn-primary" onclick="contactBusiness('${escapeHtml(designer.userId || designer.id || '')}', '${escapeHtml(designer.name)}')">
                        🤝 Request Collaboration
                    </button>
                    <button class="btn-secondary" onclick="openPublicProfile('${escapeHtml(designer.userId || designer.id || '')}', 'designer')">
                        👤 View Profile
                    </button>
                    <button class="btn-report" title="Report this user" onclick="event.stopPropagation(); showReportModal('user', '${escapeHtml(designer.userId || designer.id || '')}', '${escapeHtml(designer.userId || designer.id || '')}')" style="background: none; border: none; cursor: pointer; font-size: 14px; color: var(--text-secondary); padding: 4px 8px;" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--text-secondary)'">🚩 Report</button>
                </div>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

function renderDesignerResults(designers) {
    const grid = document.getElementById('designersGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (designers.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;"><p style="font-size: 18px; color: var(--text-secondary);">No designers found</p></div>';
        return;
    }
    
    designers.forEach(designer => {
        const card = document.createElement('div');
        card.className = 'designer-card';
        
        const availBadge = getAvailabilityBadge(designer.availability);
        const waitlistInfo = designer.waitlistCount > 0 ? `<span class="waitlist-count">📋 ${designer.waitlistCount} on waitlist</span>` : '';
        
        card.innerHTML = `
            <div class="designer-header">
                <div class="designer-emoji">${designer.emoji}</div>
                <div class="designer-info-top">
                    <div class="designer-name">${escapeHtml(designer.name)}</div>
                    <div class="designer-location">📍 ${escapeHtml(designer.location)}${designer.distance != null ? ` (${designer.distance} miles)` : ''}</div>
                </div>
            </div>
            <div class="designer-body">
                <div class="availability-row">${availBadge} ${waitlistInfo}</div>
                <div class="rating-two-tier">
                    <span class="rating-stars">${renderStars(designer.rating)} ${designer.rating}</span>
                    <span class="rating-breakdown">(${designer.verifiedReviewCount || 0} verified, ${(designer.reviewCount || 0) - (designer.verifiedReviewCount || 0)} community)</span>
                </div>
                <div class="designer-lead-time">⏱️ <strong>Avg Lead Time:</strong> ${designer.averageLeadTime || '?'} days</div>
                <div class="designer-specialties">
                    <strong>Specialties:</strong> ${escapeHtml(designer.specialties || 'Product Design, Prototyping')}
                </div>
                <div class="designer-bio">
                    ${escapeHtml(designer.bio || 'Experienced designer ready to help bring your ideas to life')}
                </div>
                <div class="designer-cta">
                    <button class="btn-primary" onclick="contactBusiness('${escapeHtml(designer.userId || designer.id || "")}', '${escapeHtml(designer.name)}')">
                        🤝 Request Collaboration
                    </button>
                    <button class="btn-secondary" onclick="openPublicProfile('${escapeHtml(designer.userId || designer.id || "")}', 'designer')">
                        👤 View Profile
                    </button>
                    <button class="btn-report" title="Report this user" onclick="event.stopPropagation(); showReportModal('user', '${escapeHtml(designer.userId || designer.id || "")}', '${escapeHtml(designer.userId || designer.id || "")}')" style="background: none; border: none; cursor: pointer; font-size: 14px; color: var(--text-secondary); padding: 4px 8px;" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--text-secondary)'">🚩 Report</button>
                </div>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

function renderProducers() {
    const grid = document.getElementById('producersGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (mockProducers.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;"><p style="font-size: 18px; color: var(--text-secondary);">No producers registered yet. Be the first!</p></div>';
        return;
    }
    
    // Calculate distances
    mockProducers.forEach(producer => {
        if (producer.latitude && producer.longitude) {
            producer.distance = Math.round(calculateDistance(
                buyerLocation.latitude, buyerLocation.longitude,
                producer.latitude, producer.longitude
            ));
        } else {
            producer.distance = null;
        }
    });
    
    // Sort by distance (null distances go to end)
    mockProducers.sort((a, b) => {
        if (a.distance === null && b.distance === null) return 0;
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
    });
    
    mockProducers.forEach(producer => {
        const card = document.createElement('div');
        card.className = 'producer-card';
        
        const availBadge = getAvailabilityBadge(producer.availability);
        const waitlistInfo = producer.waitlistCount > 0 ? `<span class="waitlist-count">📋 ${producer.waitlistCount} on waitlist</span>` : '';
        
        card.innerHTML = `
            <div class="producer-header">
                <div class="producer-emoji">${producer.emoji}</div>
                <div class="producer-info-top">
                    <div class="producer-name">${escapeHtml(producer.name)}</div>
                    <div class="producer-location">📍 ${escapeHtml(producer.location)}${producer.distance != null ? ` (${producer.distance} miles)` : ''}</div>
                </div>
            </div>
            <div class="producer-body">
                <div class="availability-row">${availBadge} ${waitlistInfo}</div>
                <div class="rating-two-tier">
                    <span class="rating-stars">${renderStars(producer.rating)} ${producer.rating}</span>
                    <span class="rating-breakdown">(${producer.verifiedReviewCount} verified, ${producer.reviewCount - producer.verifiedReviewCount} community)</span>
                </div>
                <div class="producer-capabilities">
                    <strong>Capabilities:</strong> ${escapeHtml(producer.capabilities || 'CNC Machining, 3D Printing, Metal Fabrication')}
                </div>
                <div class="producer-lead-time">
                    ⏱️ <strong>Typical Lead Time:</strong> ${producer.leadTime || '2-4 weeks'}
                </div>
                <div class="producer-cta">
                    <button class="btn-primary" onclick="contactBusiness('${escapeHtml(producer.userId || producer.id || "")}', '${escapeHtml(producer.name)}')">
                        📋 Request Quote
                    </button>
                    <button class="btn-secondary" onclick="openPublicProfile('${escapeHtml(producer.userId || producer.id || "")}', 'producer')">
                        👤 View Profile
                    </button>
                    <button class="btn-report" title="Report this user" onclick="event.stopPropagation(); showReportModal('user', '${escapeHtml(producer.userId || producer.id || "")}', '${escapeHtml(producer.userId || producer.id || "")}')" style="background: none; border: none; cursor: pointer; font-size: 14px; color: var(--text-secondary); padding: 4px 8px;" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--text-secondary)'">🚩 Report</button>
                </div>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

function renderProducerResults(producers) {
    const grid = document.getElementById('producersGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (producers.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;"><p style="font-size: 18px; color: var(--text-secondary);">No producers found</p></div>';
        return;
    }
    
    producers.forEach(producer => {
        const card = document.createElement('div');
        card.className = 'producer-card';
        
        const availBadge = getAvailabilityBadge(producer.availability);
        const waitlistInfo = producer.waitlistCount > 0 ? `<span class="waitlist-count">📋 ${producer.waitlistCount} on waitlist</span>` : '';
        
        card.innerHTML = `
            <div class="producer-header">
                <div class="producer-emoji">${producer.emoji}</div>
                <div class="producer-info-top">
                    <div class="producer-name">${escapeHtml(producer.name)}</div>
                    <div class="producer-location">📍 ${escapeHtml(producer.location)}${producer.distance != null ? ` (${producer.distance} miles)` : ''}</div>
                </div>
            </div>
            <div class="producer-body">
                <div class="availability-row">${availBadge} ${waitlistInfo}</div>
                <div class="rating-two-tier">
                    <span class="rating-stars">${renderStars(producer.rating)} ${producer.rating}</span>
                    <span class="rating-breakdown">(${producer.verifiedReviewCount || 0} verified, ${(producer.reviewCount || 0) - (producer.verifiedReviewCount || 0)} community)</span>
                </div>
                <div class="producer-capabilities">
                    <strong>Capabilities:</strong> ${escapeHtml(producer.capabilities || 'CNC Machining, 3D Printing, Metal Fabrication')}
                </div>
                <div class="producer-lead-time">
                    ⏱️ <strong>Typical Lead Time:</strong> ${producer.leadTime || '2-4 weeks'}
                </div>
                <div class="producer-cta">
                    <button class="btn-primary" onclick="contactBusiness('${escapeHtml(producer.userId || producer.id || "")}', '${escapeHtml(producer.name)}')">
                        📋 Request Quote
                    </button>
                    <button class="btn-secondary" onclick="openPublicProfile('${escapeHtml(producer.userId || producer.id || "")}', 'producer')">
                        👤 View Profile
                    </button>
                    <button class="btn-report" title="Report this user" onclick="event.stopPropagation(); showReportModal('user', '${escapeHtml(producer.userId || producer.id || "")}', '${escapeHtml(producer.userId || producer.id || "")}')" style="background: none; border: none; cursor: pointer; font-size: 14px; color: var(--text-secondary); padding: 4px 8px;" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--text-secondary)'">🚩 Report</button>
                </div>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

/**
 * View a designer's portfolio - all designs they created
 */
function viewDesignerPortfolio(designerId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.main-tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById('marketplace-section').classList.add('active');
    document.getElementById('marketplace-section').style.display = 'block';
    document.querySelector('.main-tab-btn').classList.add('active');
    
    const designer = mockDesigners.find(d => d.id === designerId);
    
    // Show all products designed by this designer
    const filtered = mockProducts.filter(p => p.designerId === designerId);
    
    const grid = document.getElementById('productsGrid');
    
    grid.innerHTML = `<div style="grid-column: 1/-1; padding: 20px; background: var(--gray-100); border-radius: 8px; text-align: center; margin-bottom: 20px;">
        <h3>🎨 ${escapeHtml(designer.name)}</h3>
        <p style="color: var(--text-light); margin-top: 8px;">${escapeHtml(designer.specialties)}</p>
        <p style="color: var(--text-light); font-size: 14px; margin-top: 4px;">⭐ ${designer.rating} (${designer.reviewCount} reviews)</p>
        <p style="color: var(--text-light); font-size: 14px; margin-top: 4px;">${filtered.length} designs</p>
        <button class="btn-secondary" onclick="renderProducts()" style="margin-top: 15px;">← Back to All Designs</button>
    </div>`;
    
    filtered.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        
        let producerHTML = '';
        if (product.biddingProducers && product.biddingProducers.length > 0) {
            producerHTML = `<p style="font-size: 12px; color: #666; margin-top: 5px;"><strong>Can be produced by:</strong> ${product.biddingProducers.map(p => escapeHtml(p.name)).join(', ')}</p>`;
        }
        
        card.innerHTML = `
            <div class="product-image-carousel" id="carousel-${product.id}">
                <div class="carousel-images">
                    ${product.images && product.images.length > 0 ? product.images.map((img, idx) => 
                        `<img src="${img}" alt="${product.name}" class="carousel-img${idx === 0 ? ' active' : ''}" onerror="this.src='https://via.placeholder.com/300?text=${encodeURIComponent(product.name)}'">` 
                    ).join('') : `<img src="${product.image}" alt="${product.name}" class="carousel-img active" onerror="this.src='https://via.placeholder.com/300?text=${encodeURIComponent(product.name)}'">`}
                </div>
                ${product.images && product.images.length > 1 ? `
                <button class="carousel-prev" onclick="carouselPrev('carousel-${product.id}')">❮</button>
                <button class="carousel-next" onclick="carouselNext('carousel-${product.id}')">❯</button>
                <div class="carousel-dots">
                    ${product.images.map((_, idx) => `<span class="dot${idx === 0 ? ' active' : ''}" onclick="carouselGoTo('carousel-${product.id}', ${idx})"></span>`).join('')}
                </div>
                ` : ''}
            </div>
            <h3>${escapeHtml(product.name)} ${escapeHtml(product.emoji || '')}</h3>
            <p style="color: var(--text-secondary); font-size: 14px; margin-top: 5px;">${escapeHtml(product.description)}</p>
            
            <div class="product-status">
                ${product.stock > 10 ? 
                    `<span style="color: #10b981; font-weight: bold;">✓ In Stock (${product.stock})</span>` : 
                product.stock > 0 ? 
                    `<span style="color: #f59e0b; font-weight: bold;">⚠ Low Stock (${product.stock})</span>` : 
                    `<span style="color: #ef4444; font-weight: bold;">✗ Out of Stock</span>`
                }
                <span style="color: var(--text-secondary); font-size: 14px;">📅 ${product.leadTime} days</span>
            </div>
            
            ${producerHTML}
            
            <div style="display: flex; gap: 10px; margin-top: 12px; align-items: center;">
                <span style="font-weight: bold; color: var(--primary); font-size: 18px;">$${product.price.toFixed(2)}</span>
                <button class="btn-primary" onclick="addToCart('${escapeHtml(product.id)}', '${escapeHtml(product.name)}', ${product.price})" style="flex: 1;">🛒 Add to Cart</button>
                ${product.stock === 0 ? `<button class="btn-secondary" onclick="addToWaitlist('${product.id}')" style="flex: 1;">📋 Waitlist</button>` : ''}
            </div>
        `;
        grid.appendChild(card);
    });
}

/**
 * View a producer's portfolio - all designs they can produce
 */
function viewProducerPortfolio(producerId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.main-tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById('marketplace-section').classList.add('active');
    document.getElementById('marketplace-section').style.display = 'block';
    document.querySelector('.main-tab-btn').classList.add('active');
    
    const producer = mockProducers.find(p => p.id === producerId);
    
    // Show products this producer can produce (appears in biddingProducers) or designed themselves
    const filtered = mockProducts.filter(p => 
        p.designerId === producerId || 
        (p.biddingProducers && p.biddingProducers.some(bp => bp.producerId === producerId))
    );
    
    const grid = document.getElementById('productsGrid');
    
    grid.innerHTML = `<div style="grid-column: 1/-1; padding: 20px; background: var(--gray-100); border-radius: 8px; text-align: center; margin-bottom: 20px;">
        <h3>🏭 ${escapeHtml(producer.name)}</h3>
        <p style="color: var(--text-light); margin-top: 8px;">📦 ${escapeHtml(producer.capabilities)}</p>
        <p style="color: var(--text-light); font-size: 14px; margin-top: 4px;">⭐ ${producer.rating} (${producer.reviewCount} reviews)</p>
        <p style="color: var(--text-light); font-size: 14px; margin-top: 4px;">⏱️ Lead Time: ${producer.leadTime}</p>
        <p style="color: var(--text-light); font-size: 14px; margin-top: 4px;">${filtered.length} designs they can produce</p>
        <button class="btn-secondary" onclick="renderProducts()" style="margin-top: 15px;">← Back to All Designs</button>
    </div>`;
    
    filtered.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        
        // Find the quote from this producer if available
        let producerQuote = null;
        if (product.biddingProducers) {
            const bid = product.biddingProducers.find(bp => bp.producerId === producerId);
            if (bid) {
                producerQuote = bid.quote;
            }
        }
        
        card.innerHTML = `
            <div class="product-image-carousel" id="carousel-${product.id}">
                <div class="carousel-images">
                    ${product.images && product.images.length > 0 ? product.images.map((img, idx) => 
                        `<img src="${img}" alt="${product.name}" class="carousel-img${idx === 0 ? ' active' : ''}" onerror="this.src='https://via.placeholder.com/300?text=${encodeURIComponent(product.name)}'">` 
                    ).join('') : `<img src="${product.image}" alt="${product.name}" class="carousel-img active" onerror="this.src='https://via.placeholder.com/300?text=${encodeURIComponent(product.name)}'">`}
                </div>
                ${product.images && product.images.length > 1 ? `
                <button class="carousel-prev" onclick="carouselPrev('carousel-${product.id}')">❮</button>
                <button class="carousel-next" onclick="carouselNext('carousel-${product.id}')">❯</button>
                <div class="carousel-dots">
                    ${product.images.map((_, idx) => `<span class="dot${idx === 0 ? ' active' : ''}" onclick="carouselGoTo('carousel-${product.id}', ${idx})"></span>`).join('')}
                </div>
                ` : ''}
            </div>
            <h3>${escapeHtml(product.name)} ${escapeHtml(product.emoji || '')}</h3>
            <p style="color: var(--text-secondary); font-size: 14px; margin-top: 5px;">${escapeHtml(product.description)}</p>
            <p style="color: var(--text-secondary); font-size: 12px; margin-top: 5px;"><strong>Designed by:</strong> ${escapeHtml(product.designerName)}</p>
            
            <div class="product-status">
                ${product.stock > 10 ? 
                    `<span style="color: #10b981; font-weight: bold;">✓ In Stock (${product.stock})</span>` : 
                product.stock > 0 ? 
                    `<span style="color: #f59e0b; font-weight: bold;">⚠ Low Stock (${product.stock})</span>` : 
                    `<span style="color: #ef4444; font-weight: bold;">✗ Out of Stock</span>`
                }
                <span style="color: var(--text-secondary); font-size: 14px;">📅 ${product.leadTime} days</span>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 12px; align-items: center;">
                <span style="font-weight: bold; color: var(--primary); font-size: 18px;">
                    ${producerQuote ? `$${producerQuote.toFixed(2)}` : `$${product.price.toFixed(2)}`}
                </span>
                <button class="btn-primary" onclick="addToCart('${escapeHtml(product.id)}', '${escapeHtml(product.name)}', ${producerQuote || product.price})" style="flex: 1;">🛒 Add to Cart</button>
                ${product.stock === 0 ? `<button class="btn-secondary" onclick="addToWaitlist('${product.id}')" style="flex: 1;">📋 Waitlist</button>` : ''}
            </div>
        `;
        grid.appendChild(card);
    });
}

function viewStoreProducts(sellerId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.main-tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById('marketplace-section').classList.add('active');
    document.querySelector('.main-tab-btn').classList.add('active');
    
    const allBusinesses = [...mockDesigners, ...mockProducers];
    const store = allBusinesses.find(s => s.id === sellerId);
    
    const filtered = mockProducts.filter(p => p.designerId === sellerId);
    
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = `<div style="grid-column: 1/-1; padding: 20px; background: var(--gray-100); border-radius: 8px; text-align: center; margin-bottom: 20px;">
        <h3>${store.name}</h3>
        <p style="color: var(--text-light); margin-top: 8px;">${filtered.length} designs available</p>
        <button class="btn-secondary" onclick="renderProducts()" style="margin-top: 15px;">← Back to All Designs</button>
    </div>`;
    
    filtered.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        
        let producerHTML = '';

        if (product.selfDesigned) {
            producerHTML = `<div class="producer-section"><h5>✓ Designer Designed</h5></div>`;
        } else if (product.allowBidding && product.biddingProducers.length > 0) {
            producerHTML = `
                <div class="producer-section">
                    <h5>📍 Available Producers</h5>
                    <select class="producer-dropdown" onchange="selectProducer(event, ${product.id})">
                        <option value="">Select producer...</option>
                        ${product.biddingProducers.map(prod => `
                            <option value="${prod.producerId}">
                                ${escapeHtml(prod.name)} - ${prod.distance} mi - ${escapeHtml(prod.leadTime || '')}
                            </option>
                        `).join('')}
                    </select>
                </div>
            `;
        }
        
        card.innerHTML = `
            <div class="product-image">
                <img src="${product.image}" alt="${product.name}" onerror="this.src='https://via.placeholder.com/300?text=${encodeURIComponent(product.name)}'">
            </div>
            <div class="product-header">
                <h4>${escapeHtml(product.emoji || '')} ${escapeHtml(product.name)}</h4>
            </div>
            <div class="product-body">
                <div class="product-price">$${product.price.toFixed(2)}</div>
                <p style="font-size: 13px; color: var(--text-secondary); margin: 12px 0;">${escapeHtml(product.description)}</p>
                ${producerHTML}
                <button class="btn-primary" style="width: 100%; margin-top: 15px; padding: 10px;" onclick="addToCart('${escapeHtml(product.id)}', '${escapeHtml(product.name)}', ${product.price})">🛒 Add to Cart</button>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

function selectProducer(event, productId) {
    const producerId = event.target.value;
    if (!producerId) return;
    
    const product = mockProducts.find(p => p.id === productId);
    const producer = product.biddingProducers.find(m => m.producerId == producerId);
    
    alert(`✓ Selected Producer:\n\n${producer.name}\nLead Time: ${producer.leadTime}\nQuote: $${producer.quote}`);
}

function sortProducersBy(type) {
    mockProducers.forEach(p => {
        if (p.latitude && p.longitude) {
            p.distance = Math.round(calculateDistance(
                buyerLocation.latitude, buyerLocation.longitude,
                p.latitude, p.longitude
            ));
        } else {
            p.distance = null;
        }
    });
    
    if (type === 'distance') {
        mockProducers.sort((a, b) => {
            if (a.distance === null && b.distance === null) return 0;
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;
            return a.distance - b.distance;
        });
    } else if (type === 'rating') {
        mockProducers.sort((a, b) => b.rating - a.rating);
    } else if (type === 'availability') {
        const order = { 'available': 0, 'busy': 1, 'waitlist_only': 2, 'unavailable': 3 };
        mockProducers.sort((a, b) => (order[a.availability] || 9) - (order[b.availability] || 9));
    } else if (type === 'leadTime') {
        mockProducers.sort((a, b) => {
            const aLead = parseInt(a.leadTime) || 999;
            const bLead = parseInt(b.leadTime) || 999;
            return aLead - bLead;
        });
    } else if (type === 'waitlist') {
        mockProducers.sort((a, b) => (a.waitlistCount || 0) - (b.waitlistCount || 0));
    }
    
    renderProducers();
}

function sortDesignersBy(type) {
    mockDesigners.forEach(d => {
        if (d.latitude && d.longitude) {
            d.distance = Math.round(calculateDistance(
                buyerLocation.latitude, buyerLocation.longitude,
                d.latitude, d.longitude
            ));
        } else {
            d.distance = null;
        }
    });
    
    if (type === 'distance') {
        mockDesigners.sort((a, b) => {
            if (a.distance === null && b.distance === null) return 0;
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;
            return a.distance - b.distance;
        });
    } else if (type === 'rating') {
        mockDesigners.sort((a, b) => b.rating - a.rating);
    } else if (type === 'availability') {
        const order = { 'available': 0, 'busy': 1, 'waitlist_only': 2, 'unavailable': 3 };
        mockDesigners.sort((a, b) => (order[a.availability] || 9) - (order[b.availability] || 9));
    } else if (type === 'leadTime') {
        mockDesigners.sort((a, b) => (a.averageLeadTime || 999) - (b.averageLeadTime || 999));
    } else if (type === 'waitlist') {
        mockDesigners.sort((a, b) => (a.waitlistCount || 0) - (b.waitlistCount || 0));
    }
    
    renderDesigners();
}

function sortProductsBy(type) {
    currentProductPage = 1;
    renderProducts();
}

// Filter products by availability status
function filterByAvailability(entityType, status) {
    if (entityType === 'designers') {
        const filtered = status === 'all' ? mockDesigners : mockDesigners.filter(d => d.availability === status);
        renderFilteredDesigners(filtered);
    } else if (entityType === 'producers') {
        const filtered = status === 'all' ? mockProducers : mockProducers.filter(p => p.availability === status);
        renderFilteredProducers(filtered);
    }
}

function renderFilteredDesigners(designers) {
    const grid = document.getElementById('designersGrid');
    if (!grid) return;
    grid.innerHTML = '';
    if (designers.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;"><p style="font-size: 18px; color: var(--text-secondary);">No designers match this filter</p></div>';
        return;
    }
    designers.forEach(designer => {
        if (designer.distance == null && designer.latitude && designer.longitude) {
            designer.distance = Math.round(calculateDistance(buyerLocation.latitude, buyerLocation.longitude, designer.latitude, designer.longitude));
        }
        const card = document.createElement('div');
        card.className = 'designer-card';
        const availBadge = getAvailabilityBadge(designer.availability);
        const waitlistInfo = designer.waitlistCount > 0 ? `<span class="waitlist-count">\ud83d\udccb ${designer.waitlistCount} on waitlist</span>` : '';
        card.innerHTML = `
            <div class="designer-header">
                <div class="designer-emoji">${designer.emoji}</div>
                <div class="designer-info-top">
                    <div class="designer-name">${designer.name}</div>
                    <div class="designer-location">\ud83d\udccd ${designer.location}${designer.distance != null ? ` (${designer.distance} miles)` : ''}</div>
                </div>
            </div>
            <div class="designer-body">
                <div class="availability-row">${availBadge} ${waitlistInfo}</div>
                <div class="rating-two-tier">
                    <span class="rating-stars">${renderStars(designer.rating)} ${designer.rating}</span>
                    <span class="rating-breakdown">(${designer.verifiedReviewCount || 0} verified, ${(designer.reviewCount || 0) - (designer.verifiedReviewCount || 0)} community)</span>
                </div>
                <div class="designer-lead-time">\u23f1\ufe0f <strong>Avg Lead Time:</strong> ${designer.averageLeadTime || '?'} days</div>
                <div class="designer-specialties"><strong>Specialties:</strong> ${designer.specialties || 'Product Design, Prototyping'}</div>
                <div class="designer-bio">${designer.bio || 'Experienced designer'}</div>
                <div class="designer-cta">
                    <button class="btn-primary" onclick="contactBusiness('${escapeHtml(designer.userId || designer.id || "")}', '${escapeHtml(designer.name)}')">\ud83e\udd1d Request Collaboration</button>
                    <button class="btn-secondary" onclick="viewDesignerPortfolio('${designer.id}')">\ud83d\udcc2 View Portfolio</button>
                </div>
            </div>`;
        grid.appendChild(card);
    });
}

function renderFilteredProducers(producers) {
    const grid = document.getElementById('producersGrid');
    if (!grid) return;
    grid.innerHTML = '';
    if (producers.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;"><p style="font-size: 18px; color: var(--text-secondary);">No producers match this filter</p></div>';
        return;
    }
    producers.forEach(producer => {
        if (producer.distance == null && producer.latitude && producer.longitude) {
            producer.distance = Math.round(calculateDistance(buyerLocation.latitude, buyerLocation.longitude, producer.latitude, producer.longitude));
        }
        const card = document.createElement('div');
        card.className = 'producer-card';
        const availBadge = getAvailabilityBadge(producer.availability);
        const waitlistInfo = producer.waitlistCount > 0 ? `<span class="waitlist-count">\ud83d\udccb ${producer.waitlistCount} on waitlist</span>` : '';
        card.innerHTML = `
            <div class="producer-header">
                <div class="producer-emoji">${producer.emoji}</div>
                <div class="producer-info-top">
                    <div class="producer-name">${producer.name}</div>
                    <div class="producer-location">\ud83d\udccd ${producer.location}${producer.distance != null ? ` (${producer.distance} miles)` : ''}</div>
                </div>
            </div>
            <div class="producer-body">
                <div class="availability-row">${availBadge} ${waitlistInfo}</div>
                <div class="rating-two-tier">
                    <span class="rating-stars">${renderStars(producer.rating)} ${producer.rating}</span>
                    <span class="rating-breakdown">(${producer.verifiedReviewCount || 0} verified, ${(producer.reviewCount || 0) - (producer.verifiedReviewCount || 0)} community)</span>
                </div>
                <div class="producer-capabilities"><strong>Capabilities:</strong> ${producer.capabilities || 'Manufacturing'}</div>
                <div class="producer-lead-time">\u23f1\ufe0f <strong>Typical Lead Time:</strong> ${producer.leadTime || '2-4 weeks'}</div>
                <div class="producer-cta">
                    <button class="btn-primary" onclick="contactBusiness('${escapeHtml(producer.userId || producer.id || "")}', '${escapeHtml(producer.name)}')">\ud83d\udccb Request Quote</button>
                    <button class="btn-secondary" onclick="openPublicProfile('${escapeHtml(producer.userId || producer.id || "")}', 'producer')">\ud83d\udc64 View Profile</button>
                </div>
            </div>`;
        grid.appendChild(card);
    });
}

function renderCustomProjects() {
    const grid = document.getElementById('customProjectsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (!mockCustomProjects || mockCustomProjects.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;"><p style="font-size: 18px; color: var(--text-secondary);">No custom projects posted yet.</p></div>';
        return;
    }
    
    mockCustomProjects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'custom-project-card';
        
        // Count bids
        const bidCount = project.bids.length;
        
        // Calculate average bid if 5 or more bids exist
        let bidDisplayHTML = '';
        if (bidCount >= 5) {
            const averageBid = project.bids.reduce((sum, bid) => sum + bid.amount, 0) / bidCount;
            bidDisplayHTML = `
                <div class="bid-info average-bid-display">
                    <div class="bid-label">📊 Average Bid (${bidCount} bids)</div>
                    <div class="bid-amount">$${averageBid.toFixed(2)}</div>
                </div>
            `;
        } else {
            bidDisplayHTML = `
                <div class="bid-info">
                    <div class="bid-label">📥 Bids Received</div>
                    <div class="bid-count">${bidCount} / 5 (hidden until 5 bids received)</div>
                </div>
            `;
        }
        
        // Bidders list (only names, not amounts)
        const biddersHTML = project.bids.map(bid => `
            <span class="bidder-badge">${bid.bidderName}</span>
        `).join('');
        
        // Project images
        const imageHTML = project.images.length > 0 ? `
            <div class="project-images">
                <img src="${project.images[0]}" alt="${project.title}" onerror="this.src='https://via.placeholder.com/400x300?text=${encodeURIComponent(project.title)}'">
            </div>
        ` : '';
        
        card.innerHTML = `
            ${imageHTML}
            <div class="project-content">
                <div class="project-header">
                    <h4>${project.title}</h4>
                    <span class="project-budget">Budget: ${project.budget}</span>
                </div>
                
                <p class="project-description">${project.description}</p>
                
                <div class="project-meta">
                    <span class="posted-by">Posted by: ${project.postedBy}</span>
                    <span class="posted-date">${project.postedDate}</span>
                </div>
                
                <div class="bidders-section">
                    <div class="bidders-label">🤝 Interested Bidders:</div>
                    <div class="bidders-list">
                        ${biddersHTML}
                    </div>
                </div>
                
                ${bidDisplayHTML}
                
                <div class="project-actions">
                    <button class="btn-primary" onclick="viewProjectDetails(${project.id})">View Details & View Bids</button>
                    <button class="btn-secondary" onclick="placeBid(${project.id})">Place Bid</button>
                </div>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

function renderNewsletter() {
    const feed = document.getElementById('newsletterFeed');
    if (!feed) return;
    
    feed.innerHTML = '';
    
    // Display posts in reverse chronological order (newest first)
    mockNewsletterPosts.forEach(post => {
        const article = document.createElement('div');
        article.className = 'newsletter-post';
        article.style.cssText = `
            background: var(--bg-secondary);
            border-radius: 8px;
            padding: 25px;
            margin-bottom: 20px;
            border-left: 4px solid var(--primary);
            box-shadow: 0 2px 6px rgba(0,0,0,0.08);
        `;
        
        article.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div>
                    <h3 style="margin: 0 0 5px 0; color: var(--text-primary);">${post.title}</h3>
                    <p style="margin: 0; font-size: 13px; color: var(--text-secondary);">
                        📅 ${new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} • 
                        By ${post.author} • 
                        <span style="background: var(--primary); color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;">${post.category}</span>
                    </p>
                </div>
            </div>
            <div style="line-height: 1.7; color: var(--text-primary); font-size: 14px;">
                ${post.content}
            </div>
        `;
        
        feed.appendChild(article);
    });
}

function viewProducerWork(producerId) {
    viewProducerPortfolio(producerId);
}

/**
 * Open a user's public profile page in the current view
 * (or in a new tab if Ctrl/Cmd is held)
 */
function openPublicProfile(userId, serviceType) {
    if (!userId) return;
    // Open profile in a new tab so user doesn't lose their place
    const profileUrl = `${window.location.origin}${window.location.pathname}#profile/${userId}/${serviceType || 'designer'}`;
    window.open(profileUrl, '_blank');
}

// --- Vite module exports (attach to window for HTML event handler compat) ---
window.renderProducts = renderProducts;
window.fetchProductsFromAPI = fetchProductsFromAPI;
window._renderProductsFromData = _renderProductsFromData;
window.filterByCategory = filterByCategory;
window.sortProductsBy = sortProductsBy;
window.changeResultsPerPage = changeResultsPerPage;
window.goToProductPage = goToProductPage;
window.filterDesignersBySpecialty = filterDesignersBySpecialty;
window.sortDesignersBy = sortDesignersBy;
window.filterByAvailability = filterByAvailability;
window.filterProducersByCapability = filterProducersByCapability;
window.sortProducersBy = sortProducersBy;
window.renderDesigners = renderDesigners;
window.renderProducers = renderProducers;
window.renderNewsletter = renderNewsletter;
window.renderCustomProjects = renderCustomProjects;
window.viewDesignerPortfolio = viewDesignerPortfolio;
window.viewProducerPortfolio = viewProducerPortfolio;
window.viewStoreProducts = viewStoreProducts;
window.selectProducer = selectProducer;
window.viewProducerWork = viewProducerWork;
window.openPublicProfile = openPublicProfile;

