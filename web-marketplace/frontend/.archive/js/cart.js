// ============================================================================
// SHOPPING CART & PURCHASE FLOW MODULE
// ============================================================================

/**
 * Shopping Cart State Management
 */
const shoppingCart = {
  items: [],
  selectedProducers: {}, // Map productId -> selectedProducerId
  lastIdempotencyKey: null,

  /**
   * Add product to cart
   */
  addItem(product, quantity = 1) {
    const existingItem = this.items.find((i) => i.productId === product.id);

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      this.items.push({
        productId: product.id,
        product,
        quantity,
      });
    }

    // Store in localStorage for persistence
    this.save();
    this.updateCartUI();

    // Show confirmation
    showCartToast(
      `✅ Added "${product.name}" to cart (x${quantity})`
    );
  },

  /**
   * Remove item from cart
   */
  removeItem(productId) {
    this.items = this.items.filter((i) => i.productId !== productId);
    delete this.selectedProducers[productId];
    this.save();
    this.updateCartUI();
    updateCartModalDisplay();
  },

  /**
   * Update quantity
   */
  updateQuantity(productId, quantity) {
    const item = this.items.find((i) => i.productId === productId);
    if (item) {
      item.quantity = Math.max(1, quantity);
      this.save();
      this.updateCartUI();
      updateCartModalDisplay();
    }
  },

  /**
   * Set selected producer for a product
   */
  setSelectedProducer(productId, producerId) {
    this.selectedProducers[productId] = producerId;
    this.save();
  },

  /**
   * Calculate cart totals
   */
  calculateTotals() {
    let subtotal = 0;

    for (const item of this.items) {
      subtotal += item.product.price * item.quantity;
    }

    // Estimates for display only — backend calculates final totals
    const TAX_RATE = window.__PDS_TAX_RATE || 0.08;
    const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
    const SHIPPING = window.__PDS_FLAT_SHIPPING || 12.99;
    const total = subtotal + tax + SHIPPING;

    return { subtotal, tax, shipping: SHIPPING, total, itemCount: this.items.length };
  },

  /**
   * Save cart to localStorage
   */
  save() {
    localStorage.setItem(
      "pipedream_shopping_cart",
      JSON.stringify({
        items: this.items,
        selectedProducers: this.selectedProducers,
      })
    );
  },

  /**
   * Load cart from localStorage
   */
  load() {
    const saved = localStorage.getItem("pipedream_shopping_cart");
    if (saved) {
      const data = JSON.parse(saved);
      this.items = data.items || [];
      this.selectedProducers = data.selectedProducers || {};
    }
  },

  /**
   * Clear cart
   */
  clear() {
    this.items = [];
    this.selectedProducers = {};
    this.save();
    this.updateCartUI();
  },

  /**
   * Update cart UI elements
   */
  updateCartUI() {
    const cartBadge = document.getElementById("cartItemCount");
    if (cartBadge) {
      const count = this.items.reduce((sum, i) => sum + i.quantity, 0);
      cartBadge.textContent = count;
      cartBadge.style.display = count > 0 ? "inline" : "none";
    }
  },
};

/**
 * Show toast notification for cart actions
 */
function showCartToast(message) {
  const toast = document.createElement("div");
  toast.className = "cart-toast";
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: var(--bg-success, #22c55e);
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideOut 0.3s ease-out";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Show shopping cart modal
 */
function showCartModal() {
  const modal = document.getElementById("cartModal");
  if (!modal) {
    console.warn("Cart modal not found in HTML");
    return;
  }

  modal.classList.add("show");
  modal.style.display = "flex";
  updateCartModalDisplay();
}

/**
 * Close shopping cart modal
 */
function closeCartModal() {
  const modal = document.getElementById("cartModal");
  if (modal) {
    modal.classList.remove("show");
    modal.style.display = "none";
  }
}

/**
 * Update cart modal display with current items
 */
function updateCartModalDisplay() {
  const itemsContainer = document.getElementById("cartItemsList");
  if (!itemsContainer) return;

  if (shoppingCart.items.length === 0) {
    itemsContainer.innerHTML =
      "<p style='text-align: center; padding: 20px;'>Your cart is empty</p>";
    return;
  }

  const html = shoppingCart.items
    .map(
      (item) => `
    <div class="cart-item">
      <div class="cart-item-info">
        <h4>${item.product.name}</h4>
        <p class="cart-item-designer">Designer: ${item.product.designerName}</p>
        <p class="cart-item-price">$${item.product.price.toFixed(2)} each</p>
      </div>
      <div class="cart-item-quantity">
        <button onclick="shoppingCart.updateQuantity('${item.productId}', ${item.quantity - 1})">−</button>
        <input type="number" value="${item.quantity}" onchange="shoppingCart.updateQuantity('${item.productId}', parseInt(this.value))" min="1" />
        <button onclick="shoppingCart.updateQuantity('${item.productId}', ${item.quantity + 1})">+</button>
      </div>
      <div class="cart-item-total">$${(item.product.price * item.quantity).toFixed(2)}</div>
      <button class="btn-remove" onclick="shoppingCart.removeItem('${item.productId}')">🗑️</button>
    </div>
  `
    )
    .join("");

  itemsContainer.innerHTML = html;

  // Update totals
  const { subtotal, tax, shipping, total } = shoppingCart.calculateTotals();
  const totalsContainer = document.getElementById("cartTotals");
  if (totalsContainer) {
    totalsContainer.innerHTML = `
      <div class="cart-total-row">
        <span>Subtotal:</span>
        <span>$${subtotal.toFixed(2)}</span>
      </div>
      <div class="cart-total-row">
        <span>Tax (8%):</span>
        <span>$${tax.toFixed(2)}</span>
      </div>
      <div class="cart-total-row">
        <span>Shipping:</span>
        <span>$${shipping.toFixed(2)}</span>
      </div>
      <div class="cart-total-row total">
        <span><strong>Total:</strong></span>
        <span><strong>$${total.toFixed(2)}</strong></span>
      </div>
    `;
  }
}

/**
 * Proceed to checkout
 */
function proceedToCheckout() {
  if (shoppingCart.items.length === 0) {
    alert("Your cart is empty");
    return;
  }

  // Check if user is logged in
  if (!window.authService || !window.authService.isAuthenticated()) {
    alert("Please sign in to proceed with checkout");
    showLoginModal();
    return;
  }

  closeCartModal();
  showCheckoutModal();
}

/**
 * Show checkout modal
 */
function showCheckoutModal() {
  const modal = document.getElementById("checkoutModal");
  if (!modal) {
    console.warn("Checkout modal not found in HTML");
    return;
  }

  modal.classList.add("show");
  modal.style.display = "flex";
  updateCheckoutModalDisplay();
  loadCheckoutPaymentMethods();
}

/**
 * Load saved payment methods for checkout
 */
async function loadCheckoutPaymentMethods() {
  const container = document.getElementById("checkoutPaymentMethods");
  if (!container) return;

  const isAuthed = window.authService ? window.authService.isAuthenticated() : false;
  if (!isAuthed) {
    container.innerHTML = '<p style="color:var(--error);">Please sign in to view payment methods.</p>';
    return;
  }

  try {
    const resp = await apiFetch("/v1/payments/methods");
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.error || "Failed to load payment methods");

    const methods = data.paymentMethods || [];
    let html = "";

    if (methods.length > 0) {
      methods.forEach((pm, i) => {
        html += `
          <label style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:6px;margin-bottom:8px;cursor:pointer;">
            <input type="radio" name="checkoutPM" value="${escapeHtml(pm.id)}" ${i === 0 ? "checked" : ""} onchange="document.getElementById('stripeNewCardContainer').style.display='none';">
            <span>${escapeHtml(pm.brand.toUpperCase())} •••• ${escapeHtml(pm.last4)} (${pm.expMonth}/${pm.expYear})</span>
          </label>`;
      });
    }

    html += `
      <label style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:6px;cursor:pointer;">
        <input type="radio" name="checkoutPM" value="new_card" ${methods.length === 0 ? "checked" : ""} onchange="mountCheckoutCard();">
        <span>➕ Use a new card</span>
      </label>`;

    container.innerHTML = html;

    // If no saved methods, auto-mount Stripe Elements for new card
    if (methods.length === 0) {
      mountCheckoutCard();
    }
  } catch (err) {
    console.error("Load payment methods error:", err);
    container.innerHTML = `<p style="color:var(--error);">Failed to load payment methods. <a href="#" onclick="loadCheckoutPaymentMethods();return false;">Retry</a></p>`;
  }
}

let checkoutCardElement = null;

/**
 * Mount Stripe card element for new card entry
 */
function mountCheckoutCard() {
  const wrapper = document.getElementById("stripeNewCardContainer");
  if (wrapper) wrapper.style.display = "block";

  if (checkoutCardElement) return; // already mounted

  if (!stripeInstance) {
    console.warn("Stripe not initialized yet");
    return;
  }

  const elements = stripeInstance.elements();
  checkoutCardElement = elements.create("card", {
    style: {
      base: { fontSize: "16px", color: "#424770" },
      invalid: { color: "#9e2146" },
    },
  });
  checkoutCardElement.mount("#checkout-card-element");
  checkoutCardElement.on("change", (event) => {
    const errEl = document.getElementById("checkout-card-errors");
    if (errEl) errEl.textContent = event.error ? event.error.message : "";
  });
}

/**
 * Close checkout modal
 */
function closeCheckoutModal() {
  const modal = document.getElementById("checkoutModal");
  if (modal) {
    modal.classList.remove("show");
    modal.style.display = "none";
  }
}

/**
 * Update checkout modal with order review
 */
function updateCheckoutModalDisplay() {
  // Update order summary
  const { subtotal, tax, shipping, total } = shoppingCart.calculateTotals();
  const summaryContainer = document.getElementById("checkoutOrderSummary");
  if (summaryContainer) {
    summaryContainer.innerHTML = `
      <div class="checkout-items">
        ${shoppingCart.items
          .map(
            (item) => `
          <div class="checkout-item">
            <span>${item.product.name} x${item.quantity}</span>
            <span>$${(item.product.price * item.quantity).toFixed(2)}</span>
          </div>
        `
          )
          .join("")}
      </div>
      <div class="checkout-totals">
        <div>Subtotal: $${subtotal.toFixed(2)}</div>
        <div>Tax: $${tax.toFixed(2)}</div>
        <div>Shipping: $${shipping.toFixed(2)}</div>
        <div class="checkout-total"><strong>Total: $${total.toFixed(2)}</strong></div>
      </div>
    `;
  }
}

/**
 * Process order (create order in backend)
 */
async function processOrder() {
  const isAuthed = window.authService ? window.authService.isAuthenticated() : false;
  if (!isAuthed) {
    alert("Session expired. Please sign in again.");
    showLoginModal();
    return;
  }

  if (shoppingCart.items.length === 0) {
    alert("Your cart is empty");
    closeCheckoutModal();
    showCartModal();
    return;
  }

  // Get shipping address (for now, use first address or require user to specify)
  const shippingAddressId = document.getElementById("checkoutShippingAddress")?.value;
  if (!shippingAddressId) {
    alert("Please select a shipping address");
    return;
  }

  // Build order payload
  const orderPayload = {
    items: shoppingCart.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      selectedProducerId: shoppingCart.selectedProducers[item.productId] || null,
    })),
    shippingAddressId,
    billingAddressId: document.getElementById("checkoutBillingAddress")?.value || shippingAddressId,
    idempotencyKey: `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };

  // Determine selected payment method
  const selectedPM = document.querySelector('input[name="checkoutPM"]:checked');
  if (!selectedPM) {
    alert("Please select a payment method");
    return;
  }
  const paymentMethodId = selectedPM.value;

  // Show loading state
  const button = event?.target;
  if (button) {
    button.disabled = true;
    button.textContent = "Processing...";
  }

  try {
    // Step 1: Create order
    const orderResp = await apiFetch("/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    const orderData = await orderResp.json();

    if (!orderResp.ok) {
      throw new Error(orderData.error || "Failed to create order");
    }

    // Step 2: Create payment intent for the order total
    const { total } = shoppingCart.calculateTotals();
    const piResp = await apiFetch("/v1/payments/create-payment-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(total * 100), // cents
        currency: "usd",
        orderId: orderData.order.id,
      }),
    });

    const piData = await piResp.json();

    if (!piResp.ok) {
      throw new Error(piData.error || "Failed to create payment intent");
    }

    // Step 3: Confirm payment with Stripe
    let confirmResult;
    if (paymentMethodId === "new_card" && checkoutCardElement) {
      // Use new card from Stripe Elements
      confirmResult = await stripeInstance.confirmCardPayment(piData.clientSecret, {
        payment_method: { card: checkoutCardElement },
      });
    } else {
      // Use saved payment method
      confirmResult = await stripeInstance.confirmCardPayment(piData.clientSecret, {
        payment_method: paymentMethodId,
      });
    }

    if (confirmResult.error) {
      throw new Error(confirmResult.error.message || "Payment failed");
    }

    // Payment succeeded

    // Clear cart
    shoppingCart.clear();

    // Show confirmation
    showOrderConfirmation(orderData.order);

    // Close checkout
    closeCheckoutModal();
  } catch (error) {
    console.error("Order processing error:", error);
    alert(`Error: ${error.message}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Complete Purchase";
    }
  }
}

/**
 * Show order confirmation
 */
function showOrderConfirmation(order) {
  const modal = document.getElementById("orderConfirmationModal");
  if (!modal) {
    console.warn("Order confirmation modal not found");
    return;
  }

  const confirmationContent = document.getElementById("orderConfirmationContent");
  if (confirmationContent) {
    confirmationContent.innerHTML = `
      <div class="confirmation-header">
        <h2>✅ Order Confirmed!</h2>
        <p>Order #${order.orderNumber}</p>
      </div>
      <div class="confirmation-details">
        <p><strong>Total Amount:</strong> $${order.totalAmount.toFixed(2)}</p>
        <p><strong>Items:</strong> ${order.itemCount}</p>
        <p><strong>Status:</strong> ${order.status}</p>
        <p><strong>Next Step:</strong> ${order.nextStep === "awaiting_bids" ? "Awaiting producer bids..." : "Ready for payment"}</p>
        <p style="font-size: 12px; color: var(--text-secondary); margin-top: 12px;">
          Confirmation email sent to your inbox. You can track your order in your dashboard.
        </p>
      </div>
      <div class="confirmation-actions">
        <button class="btn-primary" onclick="closeOrderConfirmation(); showSection('dashboard-section');">View My Orders</button>
        <button class="btn-secondary" onclick="closeOrderConfirmation(); showSection('marketplace-products-tab');">Continue Shopping</button>
      </div>
    `;
  }

  modal.classList.add("show");
  modal.style.display = "flex";
}

/**
 * Close order confirmation
 */
function closeOrderConfirmation() {
  const modal = document.getElementById("orderConfirmationModal");
  if (modal) {
    modal.classList.remove("show");
    modal.style.display = "none";
  }
}

/**
 * Initialize cart on page load
 */
function initializeCart() {
  shoppingCart.load();
  shoppingCart.updateCartUI();
}

/**
 * Add product to cart from product card (called from onClick)
 */
function addProductToCart(product) {
  shoppingCart.addItem(product, 1);
  showCartModal();
}

// --- Vite module exports (attach to window for HTML event handler compat) ---
window.shoppingCart = shoppingCart;
window.showCartModal = showCartModal;
window.closeCartModal = closeCartModal;
window.proceedToCheckout = proceedToCheckout;
window.showCheckoutModal = showCheckoutModal;
window.closeCheckoutModal = closeCheckoutModal;
window.processOrder = processOrder;
window.initializeCart = initializeCart;
window.addProductToCart = addProductToCart;
window.showCartToast = showCartToast;
window.closeOrderConfirmation = closeOrderConfirmation;
window.showOrderConfirmation = showOrderConfirmation;
