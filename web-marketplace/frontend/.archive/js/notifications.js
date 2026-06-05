/**
 * Notifications Module
 * Handles notification display, preferences, and management
 */

let unreadCount = 0;
let allNotifications = [];
let userPreferences = null;

/**
 * Load unread notification count
 */
async function loadUnreadCount() {
  try {
    if (!localStorage.getItem("pds_token")) return 0; // Don't poll if not logged in
    const response = await apiFetch("/v1/notifications/count/unread");

    if (!response.ok) {
      // If rate-limited, skip silently — next poll will retry
      if (response.status === 429) return unreadCount;
      return 0;
    }

    const data = await response.json();
    unreadCount = data.unreadCount || 0;
    updateNotificationBadge();
    return unreadCount;
  } catch (error) {
    console.error("Error loading unread count:", error);
    return 0;
  }
}

/**
 * Update notification badge in UI
 */
function updateNotificationBadge() {
  const badge = document.getElementById("notificationBadge");
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 9 ? "9+" : unreadCount;
      badge.style.display = "block";
    } else {
      badge.style.display = "none";
    }
  }
}

/**
 * Load all notifications
 */
async function loadNotifications(limit = 20, offset = 0, typeFilter = null) {
  try {
    let url = `/v1/notifications?limit=${limit}&offset=${offset}`;
    if (typeFilter) {
      url += `&type=${typeFilter}`;
    }

    const response = await apiFetch(url);

    if (!response.ok) {
      console.error("Failed to load notifications");
      return [];
    }

    const data = await response.json();
    allNotifications = data.notifications || [];
    return allNotifications;
  } catch (error) {
    console.error("Error loading notifications:", error);
    return [];
  }
}

/**
 * Handle notification action button click — routes SPA-aware navigation
 */
function handleNotificationAction(notifId, actionUrl) {
  // Mark as read automatically when clicking the action
  notificationsModule.markAsRead(notifId);

  // MESSAGE_RECEIVED: /messaging?with=<userId>  → Dashboard > Messages > open conversation
  const messagingMatch = actionUrl.match(/^\/messaging\?with=(.+)$/);
  if (messagingMatch) {
    const userId = messagingMatch[1];
    if (typeof showSection === 'function') showSection('dashboard-section');
    setTimeout(() => {
      if (typeof showDashboardTab === 'function') showDashboardTab('messaging');
      setTimeout(() => {
        if (typeof messagingModule !== 'undefined' && messagingModule.openConversation) {
          messagingModule.openConversation(userId, '');
        }
      }, 300);
    }, 200);
    return;
  }

  // ORDER notifications: /producer-queue → Dashboard > Producer Queue tab
  if (actionUrl === '/producer-queue') {
    if (typeof showSection === 'function') showSection('dashboard-section');
    setTimeout(() => {
      if (typeof showDashboardTab === 'function') showDashboardTab('producer-queue');
    }, 200);
    return;
  }

  // Fallback: try SPA section navigation for any other path
  console.warn('Unhandled notification actionUrl:', actionUrl);
}

/**
 * Display notifications in the center
 */
async function displayNotifications() {
  await loadNotifications();

  const container = document.getElementById("notificationsList");
  if (!container) return;

  if (allNotifications.length === 0) {
    container.innerHTML =
      '<p class="empty-state">No notifications</p>';
    return;
  }

  // Group by type
  const grouped = groupNotificationsByType(allNotifications);

  let html = "";
  for (const [type, notifications] of Object.entries(grouped)) {
    html += `<div class="notification-group">
      <h4>${formatNotificationType(type)}</h4>`;

    html += notifications
      .map(
        (notif) => `
      <div class="notification-item ${notif.read ? "read" : "unread"}" id="notif-${notif.id}">
        <div class="notification-icon">${getNotificationIcon(notif.type)}</div>
        <div class="notification-content">
          <h5>${escapeHtml(notif.title)}</h5>
          <p>${escapeHtml(notif.message)}</p>
          <small>${new Date(notif.createdAt).toLocaleString()}</small>
        </div>
        <div class="notification-actions">
          ${!notif.read ? `<button onclick="notificationsModule.markAsRead('${notif.id}')" class="mark-read">Mark Read</button>` : ""}
          ${notif.actionUrl && notif.actionUrl.startsWith('/') ? `<button onclick="notificationsModule.handleAction('${notif.id}', '${notif.actionUrl}')" class="action-btn">${escapeHtml(notif.actionLabel || "View")}</button>` : ""}
          <button onclick="notificationsModule.archiveNotification('${notif.id}')" class="delete-btn">×</button>
        </div>
      </div>
    `
      )
      .join("");

    html += "</div>";
  }

  container.innerHTML = html;
}

/**
 * Group notifications by type
 */
function groupNotificationsByType(notifications) {
  return notifications.reduce((acc, notif) => {
    if (!acc[notif.type]) {
      acc[notif.type] = [];
    }
    acc[notif.type].push(notif);
    return acc;
  }, {});
}

/**
 * Get emoji icon for notification type
 */
function getNotificationIcon(type) {
  const icons = {
    ORDER_CREATED: "📦",
    ORDER_CONFIRMED: "✅",
    ORDER_SHIPPED: "🚚",
    ORDER_DELIVERED: "📬",
    BID_RECEIVED: "💼",
    BID_ACCEPTED: "🎉",
    BID_REJECTED: "❌",
    PAYMENT_DUE: "💰",
    PAYMENT_RECEIVED: "✅",
    DISPUTE_FILED: "⚠️",
    DISPUTE_RESOLVED: "✔️",
    MESSAGE_RECEIVED: "💬",
    ACCOUNT_VERIFIED: "🔐",
  };
  return icons[type] || "🔔";
}

/**
 * Format notification type for display
 */
function formatNotificationType(type) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Mark notification as read
 */
async function markAsRead(notificationId) {
  try {
    const response = await apiFetch(`/v1/notifications/${notificationId}/read`, {
      method: "PATCH",
    });

    if (response.ok) {
      // Update UI
      const notifElement = document.getElementById(`notif-${notificationId}`);
      if (notifElement) {
        notifElement.classList.add("read");
        notifElement.classList.remove("unread");
      }

      // Reload count
      await loadUnreadCount();
    }
  } catch (error) {
    console.error("Error marking notification as read:", error);
  }
}

/**
 * Archive notification
 */
async function archiveNotification(notificationId) {
  try {
    const response = await apiFetch(`/v1/notifications/${notificationId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      // Remove from UI
      const notifElement = document.getElementById(`notif-${notificationId}`);
      if (notifElement) {
        notifElement.style.animation = "slideOut 0.3s ease-out";
        setTimeout(() => notifElement.remove(), 300);
      }

      // Reload
      await loadNotifications();
      await loadUnreadCount();
    }
  } catch (error) {
    console.error("Error archiving notification:", error);
  }
}

/**
 * Mark all as read
 */
async function markAllAsRead() {
  try {
    const response = await apiFetch("/v1/notifications/mark-all-read", {
      method: "PATCH",
    });

    if (response.ok) {
      await displayNotifications();
      await loadUnreadCount();
    }
  } catch (error) {
    console.error("Error marking all as read:", error);
  }
}

/**
 * Load user notification preferences
 */
async function loadPreferences() {
  try {
    const response = await apiFetch("/v1/notifications/preferences");

    if (!response.ok) return null;

    const data = await response.json();
    userPreferences = data.preferences || {};
    return userPreferences;
  } catch (error) {
    console.error("Error loading preferences:", error);
    return null;
  }
}

/**
 * Display notification preferences UI
 */
async function displayPreferences() {
  if (!userPreferences) {
    await loadPreferences();
  }

  const container = document.getElementById("preferencesContainer");
  if (!container) return;

  container.innerHTML = `
    <div class="preferences-form">
      <h3>Notification Preferences</h3>

      <div class="pref-section">
        <h4>Channels</h4>
        <label>
          <input type="checkbox" id="emailNotif" ${userPreferences.emailNotifications ? "checked" : ""} />
          Email Notifications
        </label>
        <label>
          <input type="checkbox" id="inAppNotif" ${userPreferences.inAppNotifications ? "checked" : ""} />
          In-App Notifications
        </label>
      </div>

      <div class="pref-section">
        <h4>Notification Types</h4>
        <label>
          <input type="checkbox" id="orderNotif" ${userPreferences.orderNotifications ? "checked" : ""} />
          Order Updates
        </label>
        <label>
          <input type="checkbox" id="bidNotif" ${userPreferences.bidNotifications ? "checked" : ""} />
          Bid Activity
        </label>
        <label>
          <input type="checkbox" id="paymentNotif" ${userPreferences.paymentNotifications ? "checked" : ""} />
          Payment Notifications
        </label>
        <label>
          <input type="checkbox" id="disputeNotif" ${userPreferences.disputeNotifications ? "checked" : ""} />
          Dispute Alerts
        </label>
        <label>
          <input type="checkbox" id="messageNotif" ${userPreferences.messageNotifications ? "checked" : ""} />
          Messages
        </label>
        <label>
          <input type="checkbox" id="systemNotif" ${userPreferences.systemNotifications ? "checked" : ""} />
          System Notifications
        </label>
      </div>

      <div class="pref-section">
        <h4>Quiet Hours</h4>
        <label>
          <input type="checkbox" id="quietHours" ${userPreferences.quietHoursEnabled ? "checked" : ""} />
          Enable Quiet Hours
        </label>
        <div id="quietHoursTimes" style="display: ${userPreferences.quietHoursEnabled ? "block" : "none"}">
          <label>
            From: <input type="time" id="quietStart" value="${userPreferences.quietHoursStart || "22:00"}" />
          </label>
          <label>
            To: <input type="time" id="quietEnd" value="${userPreferences.quietHoursEnd || "08:00"}" />
          </label>
        </div>
      </div>

      <div class="form-actions">
        <button onclick="notificationsModule.savePreferences()" class="btn-primary">Save Preferences</button>
      </div>
    </div>
  `;

  // Toggle quiet hours visibility
  document
    .getElementById("quietHours")
    .addEventListener("change", (e) => {
      document.getElementById("quietHoursTimes").style.display = e.target.checked
        ? "block"
        : "none";
    });
}

/**
 * Save notification preferences
 */
async function savePreferences() {
  try {
    const updates = {
      emailNotifications: document.getElementById("emailNotif").checked,
      inAppNotifications: document.getElementById("inAppNotif").checked,
      orderNotifications: document.getElementById("orderNotif").checked,
      bidNotifications: document.getElementById("bidNotif").checked,
      paymentNotifications: document.getElementById("paymentNotif").checked,
      disputeNotifications: document.getElementById("disputeNotif").checked,
      messageNotifications: document.getElementById("messageNotif").checked,
      systemNotifications: document.getElementById("systemNotif").checked,
      quietHoursEnabled: document.getElementById("quietHours").checked,
      quietHoursStart: document.getElementById("quietStart").value,
      quietHoursEnd: document.getElementById("quietEnd").value,
    };

    const response = await apiFetch("/v1/notifications/preferences", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    });

    if (response.ok) {
      alert("Preferences saved successfully!");
      await loadPreferences();
    } else {
      alert("Failed to save preferences");
    }
  } catch (error) {
    console.error("Error saving preferences:", error);
    alert("Error saving preferences");
  }
}

/**
 * Helper: escapeHtml() is now in utils.js (loaded globally before notifications.js)
 */

/**
 * Module export
 */
const notificationsModule = {
  loadUnreadCount,
  updateNotificationBadge,
  loadNotifications,
  displayNotifications,
  markAsRead,
  archiveNotification,
  markAllAsRead,
  loadPreferences,
  displayPreferences,
  savePreferences,
  handleAction: handleNotificationAction,
};

// Initialize: Load unread count on page load (only if authenticated)
let notificationPollInterval = null;
document.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("pds_token")) {
    notificationsModule.loadUnreadCount();
    notificationPollInterval = setInterval(() => {
      if (!localStorage.getItem("pds_token")) {
        clearInterval(notificationPollInterval);
        notificationPollInterval = null;
        return;
      }
      notificationsModule.loadUnreadCount();
    }, 30000);
  }
});

// --- Vite module exports (attach to window for HTML event handler compat) ---
window.notificationsModule = notificationsModule;
