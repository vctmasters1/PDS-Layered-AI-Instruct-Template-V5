/**
 * Producer Queue Module
 * Handles browsing available orders and submitting bids for producers
 */

const producerQueueModule = (() => {
  const API_BASE = (import.meta.env.VITE_API_BASE || "") + '/v1/producer-queue';

  /**
   * Load available orders for the producer
   */
  async function loadAvailableOrders() {
    try {
      const response = await fetch(`${API_BASE}/available`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        showToast(`Error loading orders: ${error.error}`, 'error');
        return;
      }

      const data = await response.json();
      displayAvailableOrders(data.items || []);
      
      // Update count
      const countEl = document.getElementById('availableOrdersCount');
      if (countEl) {
        countEl.textContent = `${data.availableCount || 0} order${data.availableCount !== 1 ? 's' : ''}`;
      }
    } catch (error) {
      console.error('Error loading available orders:', error);
      showToast('Failed to load available orders', 'error');
    }
  }

  /**
   * Display available orders in the queue
   */
  function displayAvailableOrders(items) {
    const listEl = document.getElementById('producerQueueList');
    if (!listEl) return;

    if (!items || items.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 40px; grid-column: 1/-1; color: var(--text-secondary);">
          <p>📭 No available orders at this time</p>
          <p style="font-size: 14px; margin-top: 10px;">Check back soon for new production opportunities!</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = items.map((order) => generateOrderCard(order)).join('');
  }

  /**
   * Generate HTML card for an order in the queue
   */
  function generateOrderCard(order) {
    const hasExistingBid = !!order.existingBidId;
    const statusColor = {
      pending: 'var(--warning)',
      accepted: 'var(--success)',
      in_production: 'var(--primary)',
    };

    // Calculate constraint warnings
    let constraintWarnings = '';
    let allConstraintsOk = true;
    
    for (const constraint of order.constraints) {
      const exceedsLimit = constraint.quantity > constraint.maxOrderQuantity;
      const insufficientStock =
        constraint.fulfilledBy === 'self' &&
        (constraint.availableStock === null ||
          constraint.availableStock < constraint.quantity);

      if (exceedsLimit || insufficientStock) {
        allConstraintsOk = false;
        if (exceedsLimit) {
          constraintWarnings += `
            <div style="color: var(--warning); font-size: 12px; margin-top: 5px;">
              ⚠️ ${constraint.productName}: Order (${constraint.quantity}) exceeds max (${constraint.maxOrderQuantity})
            </div>
          `;
        }
        if (insufficientStock) {
          constraintWarnings += `
            <div style="color: var(--danger); font-size: 12px; margin-top: 5px;">
              ❌ ${constraint.productName}: Insufficient stock (${constraint.availableStock} available, ${constraint.quantity} needed)
            </div>
          `;
        }
      }
    }

    return `
      <div style="
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 16px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        transition: all 0.3s ease;
      ">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
            <h4 style="margin: 0; font-size: 16px;">${order.orderNumber}</h4>
            <span style="
              font-size: 12px;
              padding: 4px 8px;
              border-radius: 4px;
              background: ${statusColor[order.status] || 'var(--border)'};
              color: white;
            ">
              ${order.status.toUpperCase().replace('_', ' ')}
            </span>
          </div>

          <p style="margin: 8px 0; color: var(--text-secondary); font-size: 14px;">
            👤 Buyer: ${order.buyerName}
          </p>

          <p style="margin: 8px 0; font-weight: 500;">
            📦 ${order.totalQuantity} unit${order.totalQuantity !== 1 ? 's' : ''} | 💰 $${order.orderTotal.toFixed(2)}
          </p>

          <div style="margin: 10px 0; font-size: 13px;">
            ${order.constraints
              .map(
                (c) =>
                  `<div style="margin: 4px 0; padding: 6px; background: var(--bg); border-radius: 4px;">
                  <strong>${c.productName}</strong>: ${c.quantity} units
                  ${c.fulfilledBy === 'self' ? `(${c.availableStock}/${c.availableStock + c.quantity} in stock)` : '(producer-fulfilled)'}
                </div>`
              )
              .join('')}
          </div>

          ${constraintWarnings}

          <p style="margin: 8px 0; font-size: 12px; color: var(--text-secondary);">
            🕐 Posted: ${new Date(order.createdAt).toLocaleDateString()}
          </p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; min-width: 140px;">
          ${
            hasExistingBid
              ? `
              <button 
                class="btn-secondary" 
                onclick="producerQueueModule.openBidDetailsModal('${order.orderId}')"
                style="width: 100%;"
              >
                ✏️ View Bid
              </button>
              <p style="
                font-size: 12px;
                text-align: center;
                color: var(--success);
                margin: 0;
                background: rgba(76, 175, 80, 0.1);
                padding: 4px;
                border-radius: 4px;
              ">
                Bid submitted
              </p>
            `
              : `
              <button 
                class="btn-primary"
                onclick="producerQueueModule.openBidSubmissionModal('${order.orderId}', '${order.orderNumber}', ${order.totalQuantity}, '${escapeHtml(order.constraints[0]?.productName || 'Product')}')"
                style="width: 100%;"
              >
                💬 Submit Quote
              </button>
              <p style="font-size: 11px; text-align: center; color: var(--text-secondary); margin: 0;">
                Ready to bid?
              </p>
            `
          }
        </div>
      </div>
    `;
  }

  /**
   * Open bid submission modal
   */
  function openBidSubmissionModal(orderId, orderNumber, quantity, productName) {
    // Store order ID for submission
    document.getElementById('bidSubmissionForm').dataset.orderId = orderId;

    // Populate order info
    document.getElementById('bidOrderNumber').textContent = orderNumber;
    document.getElementById('bidQuantity').textContent = quantity;
    document.getElementById('bidProductName').textContent = productName;

    // Clear form
    document.getElementById('bidPriceInput').value = '';
    document.getElementById('bidLeadTimeInput').value = '';
    document.getElementById('bidDetailsTextarea').value = '';
    document.getElementById('bidNotesTextarea').value = '';
    document.getElementById('bidSubmissionError').style.display = 'none';

    // Show modal
    const modal = document.getElementById('bidSubmissionModal');
    if (modal) {
      modal.classList.add('show');
      modal.style.display = 'flex';
    }
  }

  /**
   * Close bid submission modal
   */
  function closeBidSubmissionModal() {
    const modal = document.getElementById('bidSubmissionModal');
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
    }
  }

  /**
   * Handle bid form submission
   */
  async function handleBidSubmit(event) {
    event.preventDefault();

    const orderId = document.getElementById('bidSubmissionForm').dataset.orderId;
    const quotedPrice = parseFloat(document.getElementById('bidPriceInput').value);
    const leadTimeDays = parseInt(document.getElementById('bidLeadTimeInput').value);
    const productionDetails = document.getElementById('bidDetailsTextarea').value;
    const notes = document.getElementById('bidNotesTextarea').value;

    // Validation
    if (!quotedPrice || quotedPrice <= 0) {
      showBidError('Please enter a valid price');
      return;
    }
    if (!leadTimeDays || leadTimeDays <= 0) {
      showBidError('Please enter a valid lead time');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/submit-bid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          orderId,
          quotedPrice,
          leadTimeDays,
          productionDetails,
          notes,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        showBidError(error.error || 'Failed to submit bid');
        return;
      }

      const result = await response.json();
      showToast('Quote submitted successfully!', 'success');
      closeBidSubmissionModal();

      // Reload queue
      loadAvailableOrders();
      loadMyBids();
    } catch (error) {
      console.error('Error submitting bid:', error);
      showBidError('Failed to submit bid. Please try again.');
    }
  }

  /**
   * Show error in bid submission modal
   */
  function showBidError(message) {
    const errorEl = document.getElementById('bidSubmissionError');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }

  /**
   * Load producer's submitted bids
   */
  async function loadMyBids() {
    try {
      const response = await fetch(`${API_BASE}/my-bids`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        showToast(`Error loading bids: ${error.error}`, 'error');
        return;
      }

      const data = await response.json();
      displayMyBids(data.bids || []);

      // Update count
      const countEl = document.getElementById('myBidsCount');
      if (countEl) {
        countEl.textContent = `${data.totalBids || 0} bid${data.totalBids !== 1 ? 's' : ''}`;
      }
    } catch (error) {
      console.error('Error loading my bids:', error);
      showToast('Failed to load your bids', 'error');
    }
  }

  /**
   * Display producer's submitted bids
   */
  function displayMyBids(bids) {
    const listEl = document.getElementById('myBidsList');
    if (!listEl) return;

    if (!bids || bids.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 40px; grid-column: 1/-1; color: var(--text-secondary);">
          <p>📭 No bids submitted yet</p>
          <p style="font-size: 14px; margin-top: 10px;">Browse available orders and submit your quotes!</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = bids.map((bid) => generateBidCard(bid)).join('');
  }

  /**
   * Generate HTML card for a bid
   */
  function generateBidCard(bid) {
    const statusColor = {
      pending: 'var(--warning)',
      accepted: 'var(--success)',
      in_production: 'var(--primary)',
      ready_to_ship: 'var(--primary)',
      shipped: 'var(--info)',
      delivered: 'var(--success)',
      completed: 'var(--success)',
      rejected: 'var(--danger)',
      withdrawn: 'var(--danger)',
      expired: 'var(--danger)',
    };

    const statusLabel = {
      pending: '⏳ Awaiting Response',
      accepted: '✅ Accepted',
      in_production: '🏭 In Production',
      ready_to_ship: '📦 Ready to Ship',
      shipped: '🚚 Shipped',
      delivered: '🎉 Delivered',
      completed: '✅ Completed',
      rejected: '❌ Rejected',
      withdrawn: '↩️ Withdrawn',
      expired: '⏰ Expired',
    };

    const canWithdraw = bid.status === 'pending';

    return `
      <div style="
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 16px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
      ">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
            <h4 style="margin: 0; font-size: 16px;">${bid.orderNumber}</h4>
            <span style="
              font-size: 12px;
              padding: 4px 8px;
              border-radius: 4px;
              background: ${statusColor[bid.status] || 'var(--border)'};
              color: white;
            ">
              ${statusLabel[bid.status] || bid.status}
            </span>
          </div>

          <p style="margin: 8px 0; color: var(--text-secondary); font-size: 14px;">
            👤 Order: ${bid.orderId.substring(0, 8)}...
          </p>

          <div style="margin: 10px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
            <div>
              <strong>Your Quote:</strong> $${bid.quotedPrice.toFixed(2)}
            </div>
            <div>
              <strong>Lead Time:</strong> ${bid.leadTimeDays} days
            </div>
            <div>
              <strong>Items:</strong> ${bid.totalQuantity} units
            </div>
            <div>
              <strong>Buyer:</strong> ${bid.buyerEmail}
            </div>
          </div>

          ${
            bid.productionDetails
              ? `<p style="margin: 8px 0; font-size: 12px; color: var(--text-secondary);">
              📝 ${bid.productionDetails.substring(0, 60)}${bid.productionDetails.length > 60 ? '...' : ''}
            </p>`
              : ''
          }

          <p style="margin: 8px 0; font-size: 12px; color: var(--text-secondary);">
            🕐 Submitted: ${new Date(bid.createdAt).toLocaleDateString()}
            ${bid.acceptedAt ? ` | Accepted: ${new Date(bid.acceptedAt).toLocaleDateString()}` : ''}
          </p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; min-width: 120px;">
          ${
            canWithdraw
              ? `
              <button 
                class="btn-secondary"
                onclick="producerQueueModule.handleWithdrawBid('${bid.bidId}')"
                style="width: 100%; font-size: 12px;"
              >
                ↩️ Withdraw
              </button>
            `
              : ''
          }
          <button 
            class="btn-tertiary"
            onclick="producerQueueModule.openBidDetailsModal('${bid.bidId}')"
            style="width: 100%; font-size: 12px;"
          >
            👁️ Details
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Open bid details modal
   */
  async function openBidDetailsModal(bidId) {
    // Placeholder - would fetch and display full bid details
    showToast('Bid details view coming soon!', 'info');
  }

  /**
   * Handle bid withdrawal
   */
  async function handleWithdrawBid(bidId) {
    if (!confirm('Are you sure you want to withdraw this bid?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/${bidId}/withdraw`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        showToast(`Error: ${error.error}`, 'error');
        return;
      }

      showToast('Bid withdrawn successfully', 'success');
      loadMyBids();
      loadAvailableOrders();
    } catch (error) {
      console.error('Error withdrawing bid:', error);
      showToast('Failed to withdraw bid', 'error');
    }
  }

  // Public API
  return {
    loadAvailableOrders,
    loadMyBids,
    openBidSubmissionModal,
    closeBidSubmissionModal,
    handleBidSubmit,
    handleWithdrawBid,
    openBidDetailsModal,
  };
})();

// --- Vite module exports (attach to window for HTML event handler compat) ---
window.producerQueueModule = producerQueueModule;
window.closeBidSubmissionModal = producerQueueModule.closeBidSubmissionModal;
