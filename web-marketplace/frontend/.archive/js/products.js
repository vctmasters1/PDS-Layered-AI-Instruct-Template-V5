/**
 * Product Management Module - Designer Portal
 * Handles product CRUD operations, producer routing, and portfolio management
 */

const MAX_PRODUCT_IMAGES = 5;

const productsModule = {
  currentProducts: [],
  currentEditingProductId: null,
  availableProducers: [], // Populated from API via loadAvailableProducers()
  uploadedImages: [], // Array of uploaded image URLs for current product
  producerSearchFilter: '', // Search filter text for approved producers

  /**
   * Load available producers from API for product creation forms
   */
  async loadAvailableProducers() {
    try {
      const resp = await fetch((import.meta.env.VITE_API_BASE || "") + '/v1/search/producers?limit=100');
      if (resp.ok) {
        const data = await resp.json();
        if (data.results && data.results.length > 0) {
          this.availableProducers = data.results.map(p => {
            // capabilities from API is an object {materialTypes: [...], ...} — convert to string
            let caps = '';
            if (p.capabilities && typeof p.capabilities === 'object') {
              const mt = p.capabilities.materialTypes;
              caps = Array.isArray(mt) ? mt.map(c => c.replace(/_/g, ' ')).join(', ') : '';
            } else if (typeof p.capabilities === 'string') {
              caps = p.capabilities;
            }
            return {
              id: p.id,
              name: p.businessName || p.name || 'Unknown Producer',
              emoji: p.emoji || '\ud83c\udfed',
              capabilities: caps,
            };
          });
          this.renderProducerCheckboxes();
          return;
        }
      }
    } catch (err) {
      console.warn('Failed to load producers for product form:', err.message);
    }
    // Fallback: use global producers array if API call fails
    if (window.producers && window.producers.length > 0) {
      this.availableProducers = window.producers.map(p => {
        let caps = '';
        if (p.capabilities && typeof p.capabilities === 'object') {
          const mt = p.capabilities.materialTypes || p.capabilities;
          caps = Array.isArray(mt) ? mt.join(', ') : String(mt);
        } else if (typeof p.capabilities === 'string') {
          caps = p.capabilities;
        }
        return {
          id: p.id,
          name: p.name,
          emoji: p.emoji || '\ud83c\udfed',
          capabilities: caps,
        };
      });
    }
    // Render checkboxes after loading
    this.renderProducerCheckboxes();
  },

  /**
   * Load designer's products from backend
   */
  async loadProducts() {
    try {
      const response = await apiFetch("/v1/products");

      if (!response.ok) {
        if (response.status === 401) {
          // Not authenticated as designer — skip silently
        } else {
          console.error("Failed to load products");
        }
        return;
      }

      const data = await response.json();
      this.currentProducts = data.products || [];
      this.renderProductsList();
    } catch (error) {
      console.error("Error loading products:", error);
      showToast("Failed to load your products", "error");
    }
  },

  /**
   * Create new product
   */
  async createProduct(productData) {
    try {
      // Fetch the user's default payment method for the $1 listing fee
      const methodsResp = await apiFetch("/v1/payments/methods");

      if (methodsResp.ok) {
        const methodsData = await methodsResp.json();
        const paymentMethodId = methodsData.defaultPaymentMethod || methodsData.paymentMethods?.[0]?.id;
        if (paymentMethodId) {
          productData.paymentMethodId = paymentMethodId;
        }
      }

      const response = await apiFetch("/v1/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create product");
      }

      const data = await response.json();
      showToast("Product created successfully!", "success");
      this.loadProducts();
      this.closeProductModal();
      return data.product;
    } catch (error) {
      console.error("Error creating product:", error);
      showToast(error.message || "Failed to create product", "error");
    }
  },

  /**
   * Update existing product
   */
  async updateProduct(productId, productData) {
    try {
      const response = await apiFetch(`/v1/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update product");
      }

      const data = await response.json();
      showToast("Product updated successfully!", "success");
      this.loadProducts();
      this.closeProductModal();
      return data.product;
    } catch (error) {
      console.error("Error updating product:", error);
      showToast(error.message || "Failed to update product", "error");
    }
  },

  /**
   * Delete product
   */
  async deleteProduct(productId) {
    if (
      !confirm(
        "Archive this listing? It will be removed from the marketplace but preserved in your records for GAAP compliance. This frees up one of your active listing slots."
      )
    ) {
      return;
    }

    try {
      const response = await apiFetch(`/v1/products/${productId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to archive product");
      }

      showToast("Product archived successfully", "success");
      this.loadProducts();
    } catch (error) {
      console.error("Error archiving product:", error);
      showToast("Failed to archive product", "error");
    }
  },

  /**
   * Toggle product visibility (publish/unpublish)
   */
  async toggleProductActive(productId) {
    try {
      const response = await apiFetch(`/v1/products/${productId}/toggle`, {
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Failed to toggle product");
      }

      const data = await response.json();
      showToast(data.message, "success");
      this.loadProducts();
    } catch (error) {
      console.error("Error toggling product:", error);
      showToast("Failed to toggle product visibility", "error");
    }
  },

  /**
   * Render products list in dashboard
   */
  renderProductsList() {
    const container = document.getElementById("myProductsList");
    if (!container) return;

    // Update listing count in header
    const activeCount = this.currentProducts.filter(p => p.active).length;
    const totalCount = this.currentProducts.length;
    const countEl = document.getElementById('listingCount');
    if (countEl) {
      countEl.textContent = `${activeCount} / 50 active listings`;
      countEl.style.color = activeCount >= 45 ? 'var(--warning)' : 'var(--text-secondary)';
      if (activeCount >= 50) countEl.style.color = 'var(--error)';
    }

    // Disable Add button if at limit
    const addBtn = document.getElementById('addProductBtn');
    if (addBtn) {
      addBtn.disabled = activeCount >= 50;
      if (activeCount >= 50) {
        addBtn.title = 'Maximum 50 active listings reached. Archive or hide a listing first.';
      } else {
        addBtn.title = '';
      }
    }

    if (this.currentProducts.length === 0) {
      container.innerHTML =
        '<div style="text-align: center; padding: 40px; grid-column: 1/-1;"><p style="color: var(--text-secondary);">No products yet. <button class="btn-primary" onclick="productsModule.openProductModal()">Create Your First Product</button></p></div>';
      return;
    }

    container.innerHTML = this.currentProducts
      .map((product) => this.renderProductCard(product))
      .join("");
  },

  /**
   * Render single product card
   */
  renderProductCard(product) {
    const statusBadge = product.active
      ? '<span style="background: var(--success); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Published</span>'
      : '<span style="background: var(--warning); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Draft</span>';

    const fulfillmentLabel =
      product.fulfilledBy === "self" ? "Self-Fulfilled" : "Needs Producer";
    const producerCount = product.selectedProducerIds?.length || 0;

    // Build image thumbnail strip
    const images = product.images && product.images.length > 0 ? product.images : [];
    const imageHTML = images.length > 0
      ? `<div style="display: flex; gap: 6px; overflow-x: auto; padding: 4px 0;">
          ${images.map((img, i) => `<img src="${img}" alt="${product.name} ${i + 1}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border);" onerror="this.src='https://via.placeholder.com/60?text=${i + 1}'">`).join('')}
        </div>`
      : '<p style="font-size: 12px; color: var(--text-secondary); margin: 0;">No images uploaded</p>';

    return `
      <div class="product-card" style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div style="flex: 1;">
            <h4 style="margin: 0 0 8px 0;">${product.name}</h4>
            <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">${product.category} • SKU: ${product.sku}</p>
          </div>
          ${statusBadge}
        </div>

        ${imageHTML}

        <p style="margin: 0; font-size: 14px; color: var(--text-secondary);">${product.description.substring(0, 80)}...</p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px;">
          <div><strong>Price:</strong> $${parseFloat(product.price).toFixed(2)}</div>
          <div><strong>Lead Time:</strong> ${product.leadTime} days</div>
          <div><strong>Type:</strong> ${fulfillmentLabel}</div>
          ${
            product.fulfilledBy === "producer"
              ? `<div><strong>Producers:</strong> ${producerCount} selected</div>`
              : '<div><strong>Stock:</strong> ' + product.stock + " units</div>"
          }
        </div>

        <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
          <button class="btn-secondary" onclick="productsModule.openProductModal(${JSON.stringify(product).replace(/"/g, "&quot;")})">
            ✏️ Edit
          </button>
          <button class="btn-secondary" onclick="productsModule.toggleProductActive('${product.id}')">
            ${product.active ? "👁️ Hide" : "✓ Publish"}
          </button>
          <button class="btn-danger" onclick="productsModule.deleteProduct('${product.id}')" style="background: var(--error);" title="Archive this listing (soft delete — preserved for records)">
            📦 Archive
          </button>
        </div>
      </div>
    `;
  },

  /**
   * Open product modal for create/edit
   */
  openProductModal(product = null) {
    this.currentEditingProductId = product?.id || null;

    const modal = document.getElementById("productModal");
    if (!modal) return;

    // Reset uploaded images
    this.uploadedImages = [];

    if (product) {
      // Edit mode
      document.getElementById("productModalTitle").textContent =
        "Edit Product";
      document.getElementById("productName").value = product.name;
      document.getElementById("productDescription").value = product.description;
      document.getElementById("productCategory").value = product.category;
      document.getElementById("productPrice").value = product.price;
      document.getElementById("productSku").value = product.sku;
      document.getElementById("productLeadTime").value = product.leadTime;
      document.getElementById("productMfgReq").value =
        product.manufacturingRequirements || "";
      document.getElementById("productFulfillment").value = product.fulfilledBy;

      // Load existing images into the upload preview
      this.uploadedImages = (product.images || []).slice();
      this.renderImagePreviews();

      // Set dimensions and weight
      document.getElementById("productWidth").value = product.productWidth || "";
      document.getElementById("productHeight").value = product.productHeight || "";
      document.getElementById("productDepth").value = product.productDepth || "";
      document.getElementById("productWeight").value = product.productWeight || "";
      document.getElementById("shippingWidth").value = product.shippingWidth || "";
      document.getElementById("shippingHeight").value = product.shippingHeight || "";
      document.getElementById("shippingDepth").value = product.shippingDepth || "";
      document.getElementById("shippingWeight").value = product.shippingWeight || "";

      if (product.fulfilledBy === "self") {
        document.getElementById("productStock").value = product.stock;
      }

      if (product.fulfilledBy === "producer") {
        document.getElementById("producerSelection").style.display = "block";
        this.updateProducerCheckboxes(product.selectedProducerIds || []);
      }

      // Load approved producers (selected ones)
      this.renderApprovedProducerCheckboxes(product.selectedProducerIds || []);

      document.getElementById("productSaveBtn").textContent = "Update Product";
    } else {
      // Create mode
      document.getElementById("productModalTitle").textContent =
        "Create New Product";
      document.getElementById("productForm").reset();
      document.getElementById("productFulfillment").value = "self";
      document.getElementById("producerSelection").style.display = "none";
      document.getElementById("productSaveBtn").textContent = "Create Product";
      this.renderImagePreviews();
      this.renderApprovedProducerCheckboxes([]);
    }

    // Initialize drag-and-drop handlers
    this.initImageDropZone();

    modal.style.display = "block";
  },

  /**
   * Close product modal
   */
  closeProductModal() {
    const modal = document.getElementById("productModal");
    if (modal) modal.style.display = "none";
    this.currentEditingProductId = null;
    this.uploadedImages = [];
  },

  // ========== IMAGE DRAG & DROP UPLOAD ==========

  /**
   * Initialize drag-and-drop zone event listeners
   */
  initImageDropZone() {
    const dropZone = document.getElementById('imageDropZone');
    const fileInput = document.getElementById('imageFileInput');
    if (!dropZone || !fileInput) return;

    // Remove old listeners by cloning
    const newDropZone = dropZone.cloneNode(true);
    dropZone.parentNode.replaceChild(newDropZone, dropZone);
    const newFileInput = newDropZone.querySelector('#imageFileInput');

    // Click to browse
    newDropZone.addEventListener('click', (e) => {
      if (e.target.closest('.image-preview-item')) return; // Don't trigger on preview items
      newFileInput.click();
    });

    // File input change
    newFileInput.addEventListener('change', (e) => {
      this.handleImageFiles(e.target.files);
      newFileInput.value = ''; // Reset so same file can be re-selected
    });

    // Drag events
    newDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      newDropZone.classList.add('drag-over');
    });

    newDropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      newDropZone.classList.remove('drag-over');
    });

    newDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      newDropZone.classList.remove('drag-over');
      this.handleImageFiles(e.dataTransfer.files);
    });

    // Keyboard accessibility
    newDropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        newFileInput.click();
      }
    });
  },

  /**
   * Handle selected/dropped image files — upload to server
   */
  async handleImageFiles(fileList) {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    const remaining = MAX_PRODUCT_IMAGES - this.uploadedImages.length;
    if (remaining <= 0) {
      this.setUploadStatus(`Maximum ${MAX_PRODUCT_IMAGES} images allowed.`, 'error');
      return;
    }

    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      this.setUploadStatus(`Only ${remaining} more image(s) allowed. Uploading first ${remaining}.`, 'warning');
    }

    // Show uploading state
    this.setUploadStatus(`Uploading ${toUpload.length} image(s)...`, 'info');

    const formData = new FormData();
    toUpload.forEach(file => formData.append('images', file));

    try {
      const response = await apiFetch('/v1/uploads/images', {
        method: 'POST',
        body: formData,
        // Don't set Content-Type — browser sets it with boundary for FormData
      });

      const result = await response.json();

      if (!response.ok) {
        this.setUploadStatus(result.error || 'Upload failed', 'error');
        return;
      }

      // Add new URLs to uploaded images
      this.uploadedImages.push(...result.images);
      this.renderImagePreviews();
      this.updateHiddenImageField();

      const stats = result.compression
        ? result.compression.map(s => `${s.savings} saved`).join(', ')
        : '';
      this.setUploadStatus(
        `${result.count} image(s) uploaded & compressed. ${stats}`,
        'success'
      );
    } catch (err) {
      console.error('Image upload error:', err);
      this.setUploadStatus('Upload failed. Please try again.', 'error');
    }
  },

  /**
   * Render uploaded image previews with remove buttons
   */
  renderImagePreviews() {
    const container = document.getElementById('imagePreviewContainer');
    const prompt = document.getElementById('dropZonePrompt');
    if (!container) return;

    if (this.uploadedImages.length === 0) {
      container.innerHTML = '';
      if (prompt) prompt.style.display = 'block';
      this.updateHiddenImageField();
      return;
    }

    if (prompt) {
      prompt.style.display = this.uploadedImages.length >= MAX_PRODUCT_IMAGES ? 'none' : 'block';
    }

    container.innerHTML = this.uploadedImages.map((url, idx) => `
      <div class="image-preview-item" data-index="${idx}">
        <img src="${url}" alt="Product image ${idx + 1}" onerror="this.src='https://via.placeholder.com/100?text=Error'">
        <button type="button" class="image-remove-btn" onclick="productsModule.removeImage(${idx})" title="Remove image">&times;</button>
        <span class="image-order-badge">${idx + 1}</span>
      </div>
    `).join('');

    this.updateHiddenImageField();
  },

  /**
   * Remove an uploaded image by index
   */
  async removeImage(index) {
    const url = this.uploadedImages[index];
    if (!url) return;

    // Try to delete from server if it's our upload
    const filename = url.split('/').pop();
    if (filename && filename.endsWith('.webp')) {
      try {
        await apiFetch(`/v1/uploads/images/${filename}`, { method: 'DELETE' });
      } catch (e) {
        // Ignore — may be an external URL or already deleted
      }
    }

    this.uploadedImages.splice(index, 1);
    this.renderImagePreviews();
    this.setUploadStatus('Image removed.', 'info');
  },

  /**
   * Update the hidden input field with current image URLs
   */
  updateHiddenImageField() {
    const hidden = document.getElementById('productImages');
    if (hidden) {
      hidden.value = this.uploadedImages.join(',');
    }
  },

  /**
   * Set upload status message
   */
  setUploadStatus(message, type = 'info') {
    const el = document.getElementById('imageUploadStatus');
    if (!el) return;
    const colors = {
      info: 'var(--text-secondary)',
      success: 'var(--success, #22c55e)',
      warning: 'var(--warning, #f59e0b)',
      error: 'var(--error, #ef4444)',
    };
    el.style.color = colors[type] || colors.info;
    el.textContent = message;
    // Auto-clear after 5 seconds
    clearTimeout(this._uploadStatusTimer);
    this._uploadStatusTimer = setTimeout(() => {
      if (el.textContent === message) {
        el.textContent = this.uploadedImages.length > 0
          ? `${this.uploadedImages.length}/${MAX_PRODUCT_IMAGES} images`
          : '';
      }
    }, 5000);
  },

  // ========== APPROVED / VERIFIED PRODUCERS ==========

  /**
   * Render the approved producers checklist with search filtering
   */
  renderApprovedProducerCheckboxes(selectedIds = []) {
    const container = document.getElementById('approvedProducerCheckboxList');
    const tagsContainer = document.getElementById('selectedProducerTags');
    const searchInput = document.getElementById('producerSearchInput');
    if (!container) return;

    // Wire up search
    if (searchInput) {
      const newSearch = searchInput.cloneNode(true);
      searchInput.parentNode.replaceChild(newSearch, searchInput);
      newSearch.value = this.producerSearchFilter || '';
      newSearch.addEventListener('input', (e) => {
        this.producerSearchFilter = e.target.value.toLowerCase();
        this._renderFilteredProducers(selectedIds);
      });
    }

    this._renderFilteredProducers(selectedIds);
    this._renderProducerTags(selectedIds);
  },

  /**
   * Render filtered producer checkboxes
   */
  _renderFilteredProducers(preSelectedIds) {
    const container = document.getElementById('approvedProducerCheckboxList');
    if (!container) return;

    const filter = (this.producerSearchFilter || '').toLowerCase();
    const producers = this.availableProducers.filter(p => {
      if (!filter) return true;
      return (p.name || '').toLowerCase().includes(filter) ||
             (p.capabilities || '').toLowerCase().includes(filter);
    });

    if (producers.length === 0) {
      container.innerHTML = '<span style="color: var(--text-secondary);">No producers match your search.</span>';
      return;
    }

    container.innerHTML = producers.map(p => {
      const checked = preSelectedIds.includes(p.id) ? 'checked' : '';
      return `
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 0;">
          <input type="checkbox" name="approvedProducerCheckbox" value="${p.id}" ${checked}
            onchange="productsModule.onApprovedProducerToggle()">
          <span>${p.emoji || '🏭'} ${escapeHtml(p.name)}</span>
          <span style="color: var(--text-secondary); font-size: 12px; margin-left: auto;">${escapeHtml(p.capabilities || '')}</span>
        </label>
      `;
    }).join('');
  },

  /**
   * Handle toggling an approved producer checkbox — update tags
   */
  onApprovedProducerToggle() {
    const checkboxes = document.querySelectorAll('input[name="approvedProducerCheckbox"]:checked');
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);
    this._renderProducerTags(selectedIds);
  },

  /**
   * Render selected producer tags
   */
  _renderProducerTags(selectedIds) {
    const container = document.getElementById('selectedProducerTags');
    if (!container) return;

    if (selectedIds.length === 0) {
      container.innerHTML = '<span style="font-size: 12px; color: var(--text-secondary);">No producers selected</span>';
      return;
    }

    container.innerHTML = selectedIds.map(id => {
      const p = this.availableProducers.find(pr => pr.id === id);
      const name = p ? `${p.emoji || '🏭'} ${p.name}` : `Producer ${id}`;
      return `
        <span class="producer-tag" style="display: inline-flex; align-items: center; gap: 4px; background: var(--primary); color: white; padding: 4px 10px; border-radius: 12px; font-size: 12px;">
          ${escapeHtml(name)}
          <button type="button" onclick="productsModule.removeApprovedProducer('${id}')" style="background: none; border: none; color: white; cursor: pointer; font-size: 14px; line-height: 1; padding: 0 2px;">&times;</button>
        </span>
      `;
    }).join('');
  },

  /**
   * Remove an approved producer by unchecking their checkbox
   */
  removeApprovedProducer(producerId) {
    const cb = document.querySelector(`input[name="approvedProducerCheckbox"][value="${producerId}"]`);
    if (cb) cb.checked = false;
    this.onApprovedProducerToggle();
  },

  /**
   * Handle product form save
   */
  async saveProduct() {
    const form = document.getElementById("productForm");
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    // Collect approved producer IDs from the approved producers checklist
    const approvedCheckboxes = document.querySelectorAll(
      'input[name="approvedProducerCheckbox"]:checked'
    );
    const selectedProducerIds = Array.from(approvedCheckboxes).map((cb) => cb.value);

    const productData = {
      name: document.getElementById("productName").value,
      description: document.getElementById("productDescription").value,
      category: document.getElementById("productCategory").value,
      price: parseFloat(document.getElementById("productPrice").value),
      sku: document.getElementById("productSku").value,
      leadTime: parseInt(document.getElementById("productLeadTime").value),
      images: this.uploadedImages.slice(), // Use uploaded image URLs
      fulfilledBy: document.getElementById("productFulfillment").value,
      manufacturingRequirements: document.getElementById("productMfgReq")?.value || null,
      selectedProducerIds: selectedProducerIds, // Approved/verified producers
      producerIds: selectedProducerIds, // Also send as producerIds for create route compat
      // Product dimensions
      productWidth: parseFloat(document.getElementById("productWidth").value) || null,
      productHeight: parseFloat(document.getElementById("productHeight").value) || null,
      productDepth: parseFloat(document.getElementById("productDepth").value) || null,
      productWeight: parseFloat(document.getElementById("productWeight").value) || null,
      // Shipping dimensions
      shippingWidth: parseFloat(document.getElementById("shippingWidth").value) || null,
      shippingHeight: parseFloat(document.getElementById("shippingHeight").value) || null,
      shippingDepth: parseFloat(document.getElementById("shippingDepth").value) || null,
      shippingWeight: parseFloat(document.getElementById("shippingWeight").value) || null,
    };

    if (productData.fulfilledBy === "self") {
      productData.stock = parseInt(
        document.getElementById("productStock").value
      ) || 0;
    } else if (productData.fulfilledBy === "producer") {
      // Get selected producers from the bid-routing list
      const checkboxes = document.querySelectorAll(
        'input[name="producerCheckbox"]:checked'
      );
      productData.producerIds = Array.from(checkboxes).map(
        (cb) => cb.value
      );
    }

    if (this.currentEditingProductId) {
      await this.updateProduct(this.currentEditingProductId, productData);
    } else {
      await this.createProduct(productData);
    }
  },

  /**
   * Handle fulfillment type change
   */
  onFulfillmentChange(value) {
    const stockDiv = document.getElementById("stockDiv");
    const producerDiv = document.getElementById("producerSelection");

    if (value === "self") {
      stockDiv.style.display = "block";
      producerDiv.style.display = "none";
    } else {
      stockDiv.style.display = "none";
      producerDiv.style.display = "block";
    }
  },

  /**
   * Render producer checkboxes into the form from availableProducers
   */
  renderProducerCheckboxes() {
    const container = document.getElementById('producerCheckboxList');
    if (!container) return;
    if (this.availableProducers.length === 0) {
      container.innerHTML = '<span style="color: var(--text-secondary);">No producers available yet.</span>';
      return;
    }
    container.innerHTML = this.availableProducers.map(p => `
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
        <input type="checkbox" name="producerCheckbox" value="${p.id}">
        <span>${p.emoji} ${escapeHtml(p.name)}</span>
        <span style="color: var(--text-secondary); font-size: 12px;">(${escapeHtml(p.capabilities)})</span>
      </label>
    `).join('');
  },

  /**
   * Update producer checkboxes
   */
  updateProducerCheckboxes(selectedIds) {
    this.renderProducerCheckboxes();
    document.querySelectorAll('input[name="producerCheckbox"]').forEach((cb) => {
      cb.checked = selectedIds.includes(cb.value);
    });
  },

  /**
   * Get producer name by ID
   */
  getProducerName(producerId) {
    const producer = this.availableProducers.find((p) => p.id == producerId);
    return producer
      ? `${producer.emoji} ${producer.name}`
      : `Producer ${producerId}`;
  },
};

// Initialize products on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    productsModule.loadAvailableProducers();
    productsModule.loadProducts();
  });
} else {
  productsModule.loadAvailableProducers();
  productsModule.loadProducts();
}

// --- Vite module exports (attach to window for HTML event handler compat) ---
window.productsModule = productsModule;
