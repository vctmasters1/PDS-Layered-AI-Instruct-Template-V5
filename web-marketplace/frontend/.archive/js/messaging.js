/**
 * Messaging Module
 * Handles user-to-user messaging and conversation interface
 */

let currentConversationUserId = null;
let currentConversationMessages = [];
let currentConversationFeeInfo = null; // { feeApplies, feeAmount, waived }

/**
 * Load all conversations for the current user
 */
async function loadConversations() {
  try {
    const response = await apiFetch("/v1/messaging/conversations");

    if (!response.ok) {
      console.error("Failed to load conversations");
      return [];
    }

    const data = await response.json();
    return data.conversations || [];
  } catch (error) {
    console.error("Error loading conversations:", error);
    return [];
  }
}

/**
 * Display conversations in the UI
 */
async function displayConversations() {
  const conversations = await loadConversations();
  const container = document.getElementById("conversationsList");

  if (!container) return;

  if (conversations.length === 0) {
    container.innerHTML =
      '<p class="empty-state">No conversations yet. Start a new message!</p>';
    return;
  }

  container.innerHTML = conversations
    .map(
      (conv) => `
    <div class="conversation-item" onclick="messagingModule.openConversation('${conv.otherUser.id}', '${conv.otherUser.firstName} ${conv.otherUser.lastName}')">
      <div class="conversation-header">
        <div class="conversation-user">
          <strong>${conv.otherUser.firstName} ${conv.otherUser.lastName}</strong>
          ${conv.unreadCount > 0 ? `<span class="badge">${conv.unreadCount}</span>` : ""}
        </div>
        <small>${new Date(conv.lastMessage.createdAt).toLocaleDateString()}</small>
      </div>
      <div class="conversation-preview">${conv.lastMessage.content.substring(0, 60)}...</div>
    </div>
  `
    )
    .join("");
}

/**
 * Open a conversation with a specific user
 */
async function openConversation(userId, userName) {
  currentConversationUserId = userId;
  // Load messages + fee status in parallel to reduce burst timing
  await Promise.all([
    loadConversationMessages(userId),
    checkFeeStatus(userId),
  ]);
  displayConversationView(userName);
}

/**
 * Check if a messaging fee applies for the current recipient
 */
async function checkFeeStatus(recipientId) {
  try {
    const response = await apiFetch(`/v1/messaging/fees/check/${recipientId}`);
    if (response.ok) {
      const data = await response.json();
      currentConversationFeeInfo = data;
    } else {
      currentConversationFeeInfo = { feeApplies: true, feeAmount: "1.00", waived: false };
    }
  } catch (error) {
    console.error("Error checking fee status:", error);
    currentConversationFeeInfo = { feeApplies: true, feeAmount: "1.00", waived: false };
  }
}

/**
 * Load messages from a specific conversation
 */
async function loadConversationMessages(userId, limit = 50, offset = 0) {
  try {
    const response = await apiFetch(
      `/v1/messaging/with/${userId}?limit=${limit}&offset=${offset}`
    );

    if (!response.ok) {
      console.error("Failed to load conversation messages");
      return [];
    }

    const data = await response.json();
    currentConversationMessages = data.conversation.messages || [];
    return currentConversationMessages;
  } catch (error) {
    console.error("Error loading conversation messages:", error);
    return [];
  }
}

/**
 * Display the conversation view
 */
function displayConversationView(userName) {
  const container = document.getElementById("conversationsContainer");
  if (!container) return;

  const messagesHtml = currentConversationMessages
    .map(
      (msg) => `
    <div class="message ${msg.senderId === localStorage.getItem("userId") ? "sent" : "received"}">
      <div class="message-content">
        <p>${escapeHtml(msg.content)}</p>
        <small>${new Date(msg.createdAt).toLocaleTimeString()}</small>
      </div>
    </div>
  `
    )
    .join("");

  // Use the server's fee check to determine role (more reliable than local message check)
  const fee = currentConversationFeeInfo || {};
  const isResponder = !!fee.isResponder;
  const iAmInitiator = !isResponder;
  const hasGrantedWaiver = !!fee.grantedWaiverToThem;
  const theyWaivedForMe = !!fee.waived;
  const responderHasReplied = !!fee.responderHasReplied;
  const allFeesFree = theyWaivedForMe || (isResponder && hasGrantedWaiver);

  // Fee indicator badge
  let feeHtml;
  if (allFeesFree || (theyWaivedForMe && isResponder)) {
    feeHtml = `<div class="msg-fee-badge msg-fee-waived">✅ All fees waived — free messaging</div>`;
  } else if (theyWaivedForMe) {
    feeHtml = `<div class="msg-fee-badge msg-fee-waived">✅ Fees waived for you</div>`;
  } else if (isResponder && hasGrantedWaiver) {
    feeHtml = `<div class="msg-fee-badge msg-fee-waived">✅ Fees waived both ways — free messaging</div>`;
  } else if (isResponder) {
    if (responderHasReplied) {
      feeHtml = `<div class="msg-fee-badge msg-fee-waived">✅ Replies are free · Earning $0.33 per incoming message</div>`;
    } else {
      feeHtml = `<div class="msg-fee-badge msg-fee-waived">✅ Replies are free · Reply to start earning $0.33 per message</div>`;
    }
  } else {
    feeHtml = `<div class="msg-fee-badge msg-fee-active">💰 $1.00 per message · Billed every 24 hrs</div>`;
  }

  // Waiver toggle — only show to the responder
  const waiverToggleHtml = iAmInitiator ? '' : `
    <div class="msg-waiver-controls">
      <button class="btn-sm" onclick="messagingModule.toggleWaiver('${currentConversationUserId}', '${escapeHtml(userName)}')" title="Waive or restore messaging fees for this user">
        🎫 Manage Fee Waiver
      </button>
    </div>
  `;

  // Send button & fee notice
  let sendBtnLabel, feeNoticeHtml;
  if (allFeesFree || theyWaivedForMe || (isResponder && hasGrantedWaiver)) {
    sendBtnLabel = 'Send';
    feeNoticeHtml = '<span style="color: var(--success);">✅ No fees — free messaging</span>';
  } else if (isResponder) {
    sendBtnLabel = 'Reply';
    feeNoticeHtml = responderHasReplied
      ? '<span style="color: var(--success);">✅ Replies are free. Earning <strong>$0.33</strong> per incoming message.</span>'
      : '<span style="color: var(--success);">✅ Replies are free. Reply to start earning <strong>$0.33</strong> per incoming message.</span>';
  } else {
    sendBtnLabel = 'Send ($1.00)';
    feeNoticeHtml = '<span>💰 Sending costs <strong>$1.00</strong> per message. After Stripe fees, $0.34 → PipeDream, $0.33 → recipient.</span>';
  }

  container.innerHTML = `
    <div class="conversation-view">
      <div class="conversation-header">
        <div style="flex: 1;">
          <h3>${userName}</h3>
          ${feeHtml}
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${waiverToggleHtml}
          <button onclick="showReportModal('user', '${currentConversationUserId}', '${currentConversationUserId}')" class="btn-sm" title="Report this user" style="color: var(--text-secondary);" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--text-secondary)'">\ud83d\udea9</button>
          <button onclick="messagingModule.closeConversation()" class="close-btn" title="Back to conversations">✕</button>
        </div>
      </div>
      <div class="messages-container" id="messagesContainer">
        ${messagesHtml}
      </div>
      <div class="message-input-form">
        <div class="msg-fee-notice" id="sendFeeNotice">
          ${feeNoticeHtml}
        </div>
        <textarea id="messageContent" placeholder="Type your message..." rows="3"></textarea>
        <div class="form-actions">
          <button onclick="messagingModule.sendMessage()">
            ${sendBtnLabel}
          </button>
          <button onclick="messagingModule.closeConversation()" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;

  // Scroll to bottom
  const messagesContainer = document.getElementById("messagesContainer");
  if (messagesContainer) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

/**
 * Send a message to the current conversation
 */
async function sendMessage() {
  if (!currentConversationUserId) {
    alert("No conversation selected");
    return;
  }

  const contentField = document.getElementById("messageContent");
  const content = contentField.value.trim();

  if (!content) {
    alert("Message cannot be empty");
    return;
  }

  // Fee confirmation — only for initiator when fees apply
  const fee = currentConversationFeeInfo || {};
  const isResponder = !!fee.isResponder;
  const allFree = !!fee.waived || (isResponder && !!fee.grantedWaiverToThem);

  if (!isResponder && !allFree && fee.feeApplies) {
    const confirmed = confirm(
      `💰 This message costs $1.00.\n\nAfter Stripe processing ($0.33), the remaining $0.67 is split:\n  • PipeDream: $0.34\n  • Recipient: $0.33\n\n(Recipient earns their share only after they respond.)\n\nFees are billed at the end of each 24-hour period.\n\nSend this message?`
    );
    if (!confirmed) return;
  }

  try {
    const response = await apiFetch("/v1/messaging/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipientId: currentConversationUserId,
        subject: "Message",
        content,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Failed to send message: ${error.error}`);
      return;
    }

    const result = await response.json();

    // Show fee toast
    if (result.fee && !result.fee.waived) {
      showFeeToast(`💰 $${result.fee.amount.toFixed(2)} fee added · ${result.fee.note}`);
    }

    // Clear input and reload conversation + fee status in parallel (reduces burst timing)
    contentField.value = "";
    await Promise.all([
      loadConversationMessages(currentConversationUserId),
      checkFeeStatus(currentConversationUserId),
    ]);
    displayConversationView(
      document.querySelector(".conversation-view h3")?.textContent || "User"
    );

    // Refresh the fee summary banner so pending totals update immediately (fire-and-forget)
    loadFeeSummary();
  } catch (error) {
    console.error("Error sending message:", error);
    alert("Failed to send message");
  }
}

/**
 * Show a temporary fee notification toast
 */
function showFeeToast(message) {
  const existing = document.getElementById("feeToast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "feeToast";
  toast.style.cssText = "position: fixed; bottom: 24px; right: 24px; background: var(--card-bg, #fff); border: 1px solid var(--border, #ddd); border-left: 4px solid #f59e0b; padding: 12px 20px; border-radius: 8px; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000; max-width: 400px; animation: slideInRight 0.3s ease;";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

/**
 * Toggle fee waiver for a user in the current conversation
 */
async function toggleWaiver(userId, userName) {
  try {
    // First check current state so we can offer grant or revoke
    const checkRes = await apiFetch(`/v1/messaging/fees/check/${userId}`);
    const checkData = checkRes.ok ? await checkRes.json() : {};
    const alreadyGranted = !!checkData.grantedWaiverToThem;

    if (alreadyGranted) {
      // Already granted — offer to revoke
      const revoke = confirm(
        `🎫 Fee Waiver Active for ${userName}\n\nYou currently waive fees for ${userName}, meaning they message you for free (but you don't earn $0.33 on their messages).\n\nRevoke this waiver? (They'll pay $1.00 per message again, and you'll earn $0.33.)`
      );
      if (revoke) {
        const res = await apiFetch("/v1/messaging/waivers/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        if (res.ok) {
          alert(`Fee waiver revoked for ${userName}. Standard fees apply again.`);
        } else if (res.status === 404) {
          alert("No active waiver to revoke.");
        } else {
          const data = await res.json();
          alert(data.error || "Failed to revoke waiver");
        }
      }
    } else {
      // Not yet granted — offer to grant
      const grant = confirm(
        `🎫 Fee Waiver for ${userName}\n\nWaiving fees means ${userName} can message you for free.\nThis encourages communication but you won't earn the $0.33 recipient share on their messages.\n\nGrant a fee waiver for ${userName}?`
      );
      if (grant) {
        const res = await apiFetch("/v1/messaging/waivers/grant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        const data = await res.json();
        if (res.ok) {
          alert(`✅ Fee waiver granted for ${userName}. They can now message you for free.`);
        } else {
          alert(data.error || "Failed to grant waiver");
        }
      }
    }

    // Refresh everything — reload messages + fee status in parallel, then re-render
    await Promise.all([
      loadConversationMessages(currentConversationUserId),
      checkFeeStatus(currentConversationUserId),
    ]);
    displayConversationView(userName);
  } catch (error) {
    console.error("Error managing waiver:", error);
    alert("Failed to manage fee waiver");
  }
}

/**
 * Close the conversation view
 */
function closeConversation() {
  currentConversationUserId = null;
  currentConversationMessages = [];
  displayConversations();
}

/**
 * Search messages
 */
async function searchMessages(query) {
  if (query.length < 2) {
    alert("Search query must be at least 2 characters");
    return;
  }

  try {
    const response = await apiFetch(`/v1/messaging/search?q=${encodeURIComponent(query)}`);

    if (!response.ok) {
      console.error("Failed to search messages");
      return [];
    }

    const data = await response.json();
    displaySearchResults(data.results || []);
  } catch (error) {
    console.error("Error searching messages:", error);
  }
}

/**
 * Display search results
 */
function displaySearchResults(results) {
  const container = document.getElementById("conversationsList");
  if (!container) return;

  if (results.length === 0) {
    container.innerHTML = '<p class="empty-state">No results found</p>';
    return;
  }

  container.innerHTML = results
    .map(
      (result) => `
    <div class="search-result">
      <p><strong>${escapeHtml(result.subject)}</strong></p>
      <p>${escapeHtml(result.content)}</p>
      <small>${new Date(result.createdAt).toLocaleString()}</small>
    </div>
  `
    )
    .join("");
}

/**
 * Helper: escapeHtml() is now in utils.js (loaded globally before messaging.js)
 */

/**
 * Load fee summary for the messaging tab header banner
 */
async function loadFeeSummary() {
  const container = document.getElementById('feeSummaryContent');
  if (!container) return;

  if (!localStorage.getItem('pds_token')) {
    container.textContent = 'Sign in to view fee summary';
    return;
  }

  try {
    const response = await apiFetch('/v1/messaging/fees/summary');

    if (!response.ok) {
      container.textContent = '$1.00 per message · Billed every 24 hrs';
      return;
    }

    const data = await response.json();
    const fees = data.fees || {};
    const todayCount = Number(fees.todayMessages || 0);
    const todayTotal = parseFloat(fees.todayTotal || '0');
    const unbilledTotal = parseFloat(fees.unbilledTotal || '0');
    const unbilledCount = Number(fees.unbilledCount || 0);
    const earnings = parseFloat(fees.earnings || '0');

    let html = '';

    // Today's pending fees
    if (todayCount > 0) {
      html += `<div>📤 <strong>Today:</strong> ${todayCount} msg${todayCount > 1 ? 's' : ''} sent · <strong>$${todayTotal.toFixed(2)}</strong> pending</div>`;
    } else {
      html += `<div>📤 No messages sent today</div>`;
    }

    // Unbilled total across all periods
    if (unbilledTotal > 0) {
      html += `<div>🧾 Unbilled: $${unbilledTotal.toFixed(2)} (${unbilledCount} msg${unbilledCount > 1 ? 's' : ''})</div>`;
    }

    // Earnings from received messages
    if (earnings > 0) {
      html += `<div>📥 Earned from replies: <strong>$${earnings.toFixed(2)}</strong></div>`;
    }

    // Net balance
    const net = unbilledTotal - earnings;
    if (unbilledTotal > 0 || earnings > 0) {
      const netLabel = net > 0 ? `Net owed: $${net.toFixed(2)}` : net < 0 ? `Net credit: $${Math.abs(net).toFixed(2)}` : 'Net: $0.00';
      html += `<div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #d4a017; font-weight: 600;">${netLabel}</div>`;
    }

    container.innerHTML = html;
  } catch (err) {
    container.textContent = '$1.00 per message · Billed every 24 hrs';
  }
}

/**
 * Module export
 */
const messagingModule = {
  loadConversations,
  displayConversations,
  openConversation,
  loadConversationMessages,
  displayConversationView,
  sendMessage,
  closeConversation,
  searchMessages,
  displaySearchResults,
  checkFeeStatus,
  toggleWaiver,
  showFeeToast,
  loadFeeSummary,
};

// --- Vite module exports (attach to window for HTML event handler compat) ---
window.messagingModule = messagingModule;
