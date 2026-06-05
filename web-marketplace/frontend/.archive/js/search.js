// ============================================================================
// PDS Marketplace - Search Module  
// Phase 4: Search & Discovery with API Integration
// ============================================================================

let currentSearchResults = [];
let currentFilters = {
  query: "",
  capability: "",
  location: "",
  distance: 50,
  category: "",
  minPrice: 0,
  maxPrice: 999999,
  sort: "relevance",
};
let savedSearches = [];
let favorites = [];

/**
 * Initialize search module - load favorites and set up event listeners
 */
async function initSearchModule() {
  await loadFavorites();
  setupSearchEventListeners();
}

/**
 * Setup event listeners for search inputs
 */
function setupSearchEventListeners() {
  const searchInput = document.getElementById("searchInput");
  const capabilityFilter = document.getElementById("capabilityFilter");
  const locationFilter = document.getElementById("locationFilter");
  const sortFilter = document.getElementById("sortFilter");
  const minPriceFilter = document.getElementById("minPriceFilter");
  const maxPriceFilter = document.getElementById("maxPriceFilter");

  if (searchInput) searchInput.addEventListener("change", updateFilters);
  if (capabilityFilter) capabilityFilter.addEventListener("change", updateFilters);
  if (locationFilter) locationFilter.addEventListener("change", updateFilters);
  if (sortFilter) sortFilter.addEventListener("change", updateFilters);
  if (minPriceFilter) minPriceFilter.addEventListener("change", updateFilters);
  if (maxPriceFilter) maxPriceFilter.addEventListener("change", updateFilters);
}

/**
 * Search products by query and filters via API
 */
async function searchProducts(query = "", filters = {}) {
  try {
    const searchParams = new URLSearchParams({
      query: filters.query || query,
      capability: filters.capability || "",
      location: filters.location || "",
      distance: filters.distance || 50,
      category: filters.category || "",
      minPrice: filters.minPrice || 0,
      maxPrice: filters.maxPrice || 999999,
      sort: filters.sort || "relevance",
      limit: filters.limit || 20,
      offset: filters.offset || 0,
    });

    const response = await apiFetch(`/v1/search/products?${searchParams}`);

    if (!response.ok) {
      console.error("Search failed");
      return { results: [] };
    }

    const data = await response.json();
    currentSearchResults = data.results || [];

    // Update filters in state
    currentFilters = { ...currentFilters, ...filters };

    displaySearchResults(data);
    return data;
  } catch (error) {
    console.error("Search error:", error);
    return { results: [] };
  }
}

/**
 * Search designers by query and filters
 */
async function searchDesigners(query = "") {
  try {
    const capability = currentFilters.capability || "";
    const location = currentFilters.location || "";
    const sort = currentFilters.sort === "relevance" ? "rating" : currentFilters.sort;

    const searchParams = new URLSearchParams({
      query: query || "",
      capability: capability,
      location: location,
      sort: sort,
      limit: 20,
      offset: 0,
    });

    const response = await apiFetch(`/v1/search/designers?${searchParams}`);

    if (!response.ok) {
      return { results: [] };
    }

    const data = await response.json();
    displayDesignerResults(data.results || []);
    return data;
  } catch (error) {
    console.error("Designer search error:", error);
    return { results: [] };
  }
}

/**
 * Search producers by query and filters
 */
async function searchProducers(query = "") {
  try {
    const capability = currentFilters.capability || "";
    const location = currentFilters.location || "";
    const sort = currentFilters.sort === "relevance" ? "rating" : currentFilters.sort;

    const searchParams = new URLSearchParams({
      query: query || "",
      capability: capability,
      location: location,
      sort: sort,
      limit: 20,
      offset: 0,
    });

    const response = await apiFetch(`/v1/search/producers?${searchParams}`);

    if (!response.ok) {
      return { results: [] };
    }

    const data = await response.json();
    displayProducerResults(data.results || []);
    return data;
  } catch (error) {
    console.error("Producer search error:", error);
    return { results: [] };
  }
}

/**
 * Search for authors/books
 */
async function searchAuthors(query = "") {
  try {
    const searchInput = document.getElementById("authorSearchInput");
    const searchQuery = query || (searchInput ? searchInput.value : "");
    
    // Authors/Books is coming soon — show placeholder message
    const container = document.getElementById("authorsGrid");
    if (container) {
      container.innerHTML = searchQuery
        ? `<p style="text-align:center;color:#888;grid-column:1/-1;">Search for "${searchQuery}" — Authors & Books coming soon!</p>`
        : `<p style="text-align:center;color:#888;grid-column:1/-1;">Authors & Books marketplace coming soon. Stay tuned!</p>`;
    }
    return { results: [] };
  } catch (error) {
    console.error("Author search error:", error);
    return { results: [] };
  }
}

/**
 * Display product search results
 */
function displaySearchResults(data) {
  const container = document.getElementById("searchResultsContainer");
  if (!container) return;

  const results = data.results || [];

  if (results.length === 0) {
    container.innerHTML = '<p style="text-align: center; padding: 40px; color: #999;">No results found</p>';
    return;
  }

  container.innerHTML = results
    .map(
      (product) => `
    <div class="search-result-card">
      <div class="result-header">
        <h3>${escapeHtml(product.name)}</h3>
        <button onclick="toggleFavorite('${product.id}')" class="favorite-btn" id="fav-${product.id}" title="Add to favorites">
          ${favorites.includes(product.id) ? "★" : "☆"}
        </button>
      </div>
      <p class="result-description">${escapeHtml((product.description || "").substring(0, 100))}</p>
      <div class="result-meta">
        <span class="price">$${(product.price || 0).toLocaleString()}</span>
        <span class="rating">⭐ ${(product.rating || 0).toFixed(1)}</span>
        <span class="designer">by ${escapeHtml(product.designerName || "Unknown")}</span>
      </div>
      <div class="result-actions">
        <button onclick="viewProductDetail('${product.id}')" class="btn-small">View</button>
        <button onclick="addToCart('${product.id}', '${escapeHtml(product.name)}', ${product.price || 0})" class="btn-small btn-primary">Buy Now</button>
      </div>
    </div>
  `
    )
    .join("");
}

/**
 * Display designer search results
 */
function displayDesignerResults(designers) {
  const container = document.getElementById("designerResultsContainer");
  if (!container) return;

  if (designers.length === 0) {
    container.innerHTML = '<p style="text-align: center; padding: 40px; color: #999;">No designers found</p>';
    return;
  }

  container.innerHTML = designers
    .map(
      (designer) => `
    <div class="designer-result-card">
      <h3>${escapeHtml(designer.name)}</h3>
      <p class="location">📍 ${escapeHtml(designer.location || "Unknown")}</p>
      <p class="rating">⭐ ${(designer.rating || 0).toFixed(1)} • ${designer.orderCount || 0} orders</p>
      <p class="bio">${escapeHtml((designer.bio || "").substring(0, 80))}</p>
      <button onclick="viewDesignerProfile('${designer.id}')" class="btn-small btn-primary">View Profile</button>
    </div>
  `
    )
    .join("");
}

/**
 * Display producer search results
 */
function displayProducerResults(producers) {
  const container = document.getElementById("producerResultsContainer");
  if (!container) return;

  if (producers.length === 0) {
    container.innerHTML = '<p style="text-align: center; padding: 40px; color: #999;">No producers found</p>';
    return;
  }

  container.innerHTML = producers
    .map(
      (producer) => `
    <div class="producer-result-card">
      <h3>${escapeHtml(producer.name)}</h3>
      <p class="location">📍 ${escapeHtml(producer.location || "Unknown")}</p>
      <p class="rating">⭐ ${(producer.rating || 0).toFixed(1)} • ${producer.completedOrders || 0} completed</p>
      <p class="capabilities">${escapeHtml((producer.capabilities || "").substring(0, 80))}</p>
      <button onclick="viewProducerProfile('${producer.id}')" class="btn-small btn-primary">View Profile</button>
    </div>
  `
    )
    .join("");
}

/**
 * Save a search with filters
 */
async function saveSearch(name, query, filters) {
  try {
    const response = await apiFetch("/v1/search/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, query, filters }),
    });

    if (response.ok) {
      alert("Search saved successfully!");
      await loadSavedSearches();
      return true;
    } else {
      alert("Failed to save search");
      return false;
    }
  } catch (error) {
    console.error("Save search error:", error);
    return false;
  }
}

/**
 * Load user's saved searches
 */
async function loadSavedSearches() {
  try {
    const response = await apiFetch("/v1/search/saved?limit=50");

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    savedSearches = data.searches || [];
    displaySavedSearches();
    return savedSearches;
  } catch (error) {
    console.error("Load saved searches error:", error);
    return [];
  }
}

/**
 * Display saved searches
 */
function displaySavedSearches() {
  const container = document.getElementById("savedSearchesList");
  if (!container) return;

  if (savedSearches.length === 0) {
    container.innerHTML = '<p style="text-align: center; padding: 20px; color: #999;">No saved searches</p>';
    return;
  }

  container.innerHTML = savedSearches
    .map(
      (search) => `
    <div class="saved-search-item">
      <div class="search-name">${escapeHtml(search.name)}</div>
      <div class="search-query">"${escapeHtml(search.query)}"</div>
      <div class="search-date">Saved ${new Date(search.createdAt).toLocaleDateString()}</div>
      <div class="search-actions">
        <button onclick="executeSavedSearch('${search.id}')" class="btn-small btn-primary">Search</button>
        <button onclick="deleteSavedSearch('${search.id}')" class="btn-small btn-danger">Delete</button>
      </div>
    </div>
  `
    )
    .join("");
}

/**
 * Execute a saved search
 */
async function executeSavedSearch(searchId) {
  const search = savedSearches.find((s) => s.id === searchId);
  if (!search) return;

  // Restore filters
  const filters = search.filters || {};
  if (document.getElementById("searchInput")) {
    document.getElementById("searchInput").value = search.query;
  }
  if (document.getElementById("capabilityFilter") && filters.capability) {
    document.getElementById("capabilityFilter").value = filters.capability;
  }
  if (document.getElementById("sortFilter") && filters.sort) {
    document.getElementById("sortFilter").value = filters.sort;
  }

  // Execute search
  await searchProducts(search.query, filters);
}

/**
 * Delete a saved search
 */
async function deleteSavedSearch(searchId) {
  if (!confirm("Are you sure you want to delete this saved search?")) return;

  try {
    const response = await apiFetch(`/v1/search/saved/${searchId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      await loadSavedSearches();
    }
  } catch (error) {
    console.error("Delete search error:", error);
  }
}

/**
 * Add product to favorites/wishlist
 */
async function addToFavorites(productId) {
  try {
    const response = await apiFetch("/v1/search/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });

    if (response.ok) {
      favorites.push(productId);
      updateFavoriteButton(productId);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Add favorite error:", error);
    return false;
  }
}

/**
 * Remove product from favorites
 */
async function removeFromFavorites(productId) {
  try {
    const response = await apiFetch(`/v1/search/favorites/${productId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      favorites = favorites.filter((id) => id !== productId);
      updateFavoriteButton(productId);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Remove favorite error:", error);
    return false;
  }
}

/**
 * Toggle favorite status
 */
async function toggleFavorite(productId) {
  if (favorites.includes(productId)) {
    await removeFromFavorites(productId);
  } else {
    await addToFavorites(productId);
  }
}

/**
 * Update favorite button UI
 */
function updateFavoriteButton(productId) {
  const btn = document.getElementById(`fav-${productId}`);
  if (btn) {
    btn.textContent = favorites.includes(productId) ? "★" : "☆";
    btn.classList.toggle("favorited");
  }
}

/**
 * Load user's favorites/wishlist
 */
async function loadFavorites() {
  try {
    const response = await apiFetch("/v1/search/favorites?limit=50");

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    favorites = (data.favorites || []).map((f) => f.productId || f.id);
    return data.favorites || [];
  } catch (error) {
    console.error("Load favorites error:", error);
    return [];
  }
}

/**
 * Display favorites/wishlist
 */
function displayFavorites(products) {
  const container = document.getElementById("favoritesContainer");
  if (!container) return;

  if (products.length === 0) {
    container.innerHTML = '<p style="text-align: center; padding: 40px; color: #999;">No favorites yet</p>';
    return;
  }

  container.innerHTML = products
    .map(
      (product) => `
    <div class="favorite-card">
      <h3>${escapeHtml(product.name)}</h3>
      <p class="price">$${(product.price || 0).toLocaleString()}</p>
      <p class="category">${escapeHtml(product.category || "")}</p>
      <p class="designer">by ${escapeHtml(product.designerName || "Unknown")}</p>
      <div class="actions">
        <button onclick="removeFromFavorites('${product.productId || product.id}')" class="btn-small btn-danger">Remove</button>
        <button onclick="addToCart('${product.productId || product.id}', '${escapeHtml(product.name)}', ${product.price || 0})" class="btn-small btn-primary">Buy Now</button>
      </div>
    </div>
  `
    )
    .join("");
}

/**
 * Get available capabilities for filtering
 */
async function getCapabilities(type = "designer") {
  try {
    const response = await fetch(`${(import.meta.env.VITE_API_BASE || "")}/v1/search/capabilities?type=${type}`);
    if (!response.ok) return [];

    const data = await response.json();
    return data.capabilities || [];
  } catch (error) {
    console.error("Get capabilities error:", error);
    return [];
  }
}

/**
 * Populate capability filter dropdown
 */
async function populateCapabilityFilters(type = "designer") {
  const container = document.getElementById("capabilityFilter");
  if (!container) return;

  const capabilities = await getCapabilities(type);

  container.innerHTML =
    '<option value="">Any Capability</option>' +
    capabilities.map((cap) => `<option value="${escapeHtml(cap)}">${escapeHtml(cap)}</option>`).join("");
}

/**
 * Update search filters from form inputs
 */
async function updateFilters() {
  const query = document.getElementById("searchInput")?.value || "";
  const capability = document.getElementById("capabilityFilter")?.value || "";
  const location = document.getElementById("locationFilter")?.value || "";
  const sort = document.getElementById("sortFilter")?.value || "relevance";
  const minPrice = parseInt(document.getElementById("minPriceFilter")?.value || 0);
  const maxPrice = parseInt(document.getElementById("maxPriceFilter")?.value || 999999);

  currentFilters = {
    query,
    capability,
    location,
    sort,
    minPrice,
    maxPrice,
  };

  await searchProducts(query, currentFilters);
}

/**
 * Get role-based product recommendations
 */
async function getRecommendations() {
  try {
    const response = await apiFetch("/v1/search/recommendations");

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.recommendations || [];
  } catch (error) {
    console.error("Get recommendations error:", error);
    return [];
  }
}

/**
 * Display product recommendations
 */
async function displayRecommendations() {
  const container = document.getElementById("recommendationsContainer");
  if (!container) return;

  const recommendations = await getRecommendations();

  if (recommendations.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = recommendations
    .map(
      (item) => `
    <div class="recommendation-card">
      <h4>${escapeHtml(item.name)}</h4>
      <p class="price">$${(item.price || 0).toLocaleString()}</p>
      <p class="reason" style="font-size: 0.9em; color: #666;">${escapeHtml(item.reason || "Recommended for you")}</p>
      <button onclick="addToCart('${item.id}', '${escapeHtml(item.name)}', ${item.price || 0})" class="btn-small btn-primary">Add to Cart</button>
    </div>
  `
    )
    .join("");
}

/**
 * Placeholder: View product detail
 */
function viewProductDetail(productId) {
  const product = currentSearchResults.find((p) => p.id === productId);
  if (product) {
    alert(`${product.name}\n\nPrice: $${product.price}\n\nDesigner: ${product.designerName}`);
  }
}

/**
 * Placeholder: View designer profile
 */
function viewDesignerProfile(designerId) {
  alert(`Designer Profile ID: ${designerId}`);
}

/**
 * Placeholder: View producer profile
 */
function viewProducerProfile(producerId) {
  alert(`Producer Profile ID: ${producerId}`);
}

/**
 * Helper: escapeHtml() is now in utils.js (loaded globally before search.js)
 */

/**
 * Module export
 */
const searchModule = {
  initSearchModule,
  searchProducts,
  searchDesigners,
  searchProducers,
  saveSearch,
  loadSavedSearches,
  executeSavedSearch,
  deleteSavedSearch,
  displaySearchResults,
  addToFavorites,
  removeFromFavorites,
  toggleFavorite,
  loadFavorites,
  displayFavorites,
  getCapabilities,
  populateCapabilityFilters,
  updateFilters,
  getRecommendations,
  displayRecommendations,
  viewProductDetail,
  viewDesignerProfile,
  viewProducerProfile,
};

// --- Vite module exports (attach to window for HTML event handler compat) ---
window.searchModule = searchModule;
window.searchProducts = searchProducts;
window.searchDesigners = searchDesigners;
window.searchProducers = searchProducers;
window.searchAuthors = searchAuthors;
