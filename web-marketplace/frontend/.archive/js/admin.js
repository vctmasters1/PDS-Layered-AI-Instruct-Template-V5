/**
 * Admin Dashboard Module
 * Handles all admin marketplace management operations
 */

let currentTab = "users";
let adminStats = {};
let _adminModalResolve = null;

/**
 * Show a custom modal (replaces native alert/prompt/confirm)
 * @param {'alert'|'prompt'|'confirm'} type
 * @param {string} title
 * @param {string} message
 * @param {string} [defaultValue] - default value for prompt
 * @returns {Promise<string|boolean|null>}
 */
function showAdminModal(type, title, message, defaultValue = "") {
  return new Promise((resolve) => {
    _adminModalResolve = resolve;
    const modal = document.getElementById("adminModal");
    document.getElementById("adminModalTitle").textContent = title;
    document.getElementById("adminModalBody").innerHTML = `<p>${message}</p>`;

    const inputWrap = document.getElementById("adminModalInput");
    const inputField = document.getElementById("adminModalInputField");
    const cancelBtn = document.getElementById("adminModalCancel");
    const okBtn = document.getElementById("adminModalOk");

    if (type === "prompt") {
      inputWrap.style.display = "block";
      inputField.value = defaultValue;
      inputField.type = title.toLowerCase().includes("password") ? "password" : "text";
      cancelBtn.style.display = "block";
      okBtn.textContent = "Submit";
      okBtn.onclick = () => { closeAdminModal(); resolve(inputField.value); };
      cancelBtn.onclick = () => { closeAdminModal(); resolve(null); };
    } else if (type === "confirm") {
      inputWrap.style.display = "none";
      cancelBtn.style.display = "block";
      okBtn.textContent = "Confirm";
      okBtn.onclick = () => { closeAdminModal(); resolve(true); };
      cancelBtn.onclick = () => { closeAdminModal(); resolve(false); };
    } else {
      inputWrap.style.display = "none";
      cancelBtn.style.display = "none";
      okBtn.textContent = "OK";
      okBtn.onclick = () => { closeAdminModal(); resolve(true); };
    }

    modal.classList.add("show");
    modal.style.display = "flex";
    if (type === "prompt") inputField.focus();
  });
}

function closeAdminModal() {
  const modal = document.getElementById("adminModal");
  if (modal) { modal.classList.remove("show"); modal.style.display = "none"; }
  if (_adminModalResolve) { _adminModalResolve = null; }
}

/**
 * Check if current user is admin — verified server-side, not from localStorage.
 */
async function checkAdminAccess() {
  try {
    const response = await apiFetch("/v1/admin/analytics");
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Load admin dashboard
 */
async function loadAdminDashboard() {
  const isAdmin = await checkAdminAccess();
  if (!isAdmin) {
    alert("Admin access required");
    return;
  }

  loadAnalytics();
  switchAdminTab('users');
}

/**
 * Load analytics data
 */
async function loadAnalytics() {
  try {
    const response = await apiFetch("/v1/admin/analytics");

    if (!response.ok) {
      console.error("Failed to load analytics");
      return;
    }

    const data = await response.json();
    adminStats = data.analytics;

    // Update UI
    document.getElementById("statUsers").textContent = adminStats.users?.total || 0;
    document.getElementById("statActiveUsers").textContent =
      adminStats.users?.active || 0;
    document.getElementById("statOrders").textContent = adminStats.orders?.total || 0;
    document.getElementById("statRevenue").textContent = `$${(
      adminStats.revenue?.total || 0
    ).toLocaleString()}`;
  } catch (error) {
    console.error("Error loading analytics:", error);
  }
}

/**
 * Switch admin tabs
 */
async function switchAdminTab(tabName) {
  currentTab = tabName;

  // Hide all admin tab contents
  document.querySelectorAll('[id$="TabContent"]').forEach((tab) => {
    if (tab.id.match(/^(users|orders|disputes|settings)TabContent$/)) {
      tab.style.display = 'none';
    }
  });

  // Hide create user form if open
  const formContainer = document.getElementById("createUserFormContainer");
  if (formContainer) formContainer.style.display = "none";

  // Update tab button styles
  document.querySelectorAll('.dashboard-tab-btn').forEach((btn) => {
    btn.style.background = 'transparent';
    btn.style.border = '1px solid var(--border)';
    btn.style.color = 'var(--text-dark)';
  });

  // Show selected tab content
  const tabContent = document.getElementById(tabName + 'TabContent');
  if (tabContent) {
    tabContent.style.display = 'block';
  }

  // Highlight selected tab button
  const tabButtons = document.querySelectorAll('.dashboard-tab-btn');
  const selectedBtn = Array.from(tabButtons).find(btn => 
    btn.textContent.toLowerCase().includes(
      tabName === 'users' ? 'users' : 
      tabName === 'orders' ? 'orders' : 
      tabName === 'disputes' ? 'disputes' : 'settings'
    )
  );
  if (selectedBtn) {
    selectedBtn.style.background = 'var(--primary)';
    selectedBtn.style.color = 'white';
    selectedBtn.style.border = 'none';
  }

  // Load data for tab
  if (tabName === 'users') {
    loadUsers();
  } else if (tabName === 'orders') {
    loadOrders();
  } else if (tabName === 'disputes') {
    loadDisputes();
  } else if (tabName === 'settings') {
    loadSettings();
  }
}

/**
 * Load users list
 */
async function loadUsers() {
  try {
    const role = document.getElementById("userRoleFilter")?.value || "";

    let url = "/v1/admin/users?limit=50";
    if (role) {
      url += `&role=${role}`;
    }

    const response = await apiFetch(url);

    if (!response.ok) {
      console.error("Failed to load users");
      return;
    }

    const data = await response.json();
    displayUsers(data.users || []);
  } catch (error) {
    console.error("Error loading users:", error);
  }
}

/**
 * Display users in table
 * Stores users globally for client-side sort & search.
 */
let _allUsers = [];
let _userSortKey = 'createdAt';
let _userSortDir = 'desc'; // 'asc' | 'desc'

function displayUsers(users) {
  _allUsers = users;
  renderUsersTable();
}

function renderUsersTable() {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;

  // Filter first
  const q = (document.getElementById("userSearchBox")?.value || "").toLowerCase().trim();
  let list = _allUsers;
  if (q) {
    list = list.filter(u =>
      (u.email || "").toLowerCase().includes(q) ||
      ((u.firstName || "") + " " + (u.lastName || "")).toLowerCase().includes(q) ||
      (u.role || "").toLowerCase().includes(q)
    );
  }

  // Sort
  const dir = _userSortDir === 'asc' ? 1 : -1;
  list = [...list].sort((a, b) => {
    let va, vb;
    switch (_userSortKey) {
      case 'email': va = (a.email || '').toLowerCase(); vb = (b.email || '').toLowerCase(); break;
      case 'name': va = ((a.firstName || '') + ' ' + (a.lastName || '')).toLowerCase(); vb = ((b.firstName || '') + ' ' + (b.lastName || '')).toLowerCase(); break;
      case 'role': va = a.role || ''; vb = b.role || ''; break;
      case 'commissionRate': va = Number(a.commissionRate || 0); vb = Number(b.commissionRate || 0); break;
      case 'verified': va = a.verified ? 1 : 0; vb = b.verified ? 1 : 0; break;
      case 'status': va = a.suspended ? 2 : (a.active ? 0 : 1); vb = b.suspended ? 2 : (b.active ? 0 : 1); break;
      case 'createdAt': va = a.createdAt || ''; vb = b.createdAt || ''; break;
      default: va = ''; vb = '';
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });

  // Update sort arrows in header
  document.querySelectorAll('#usersTable .sortable-th .sort-arrow').forEach(el => { el.textContent = ''; });
  const activeArrow = document.querySelector(`#usersTable .sortable-th[data-sort="${_userSortKey}"] .sort-arrow`);
  if (activeArrow) activeArrow.textContent = _userSortDir === 'asc' ? ' ▲' : ' ▼';

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;">${q ? 'No matching users' : 'No users found'}</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map(
      (user) => {
        const signupDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
        return `
    <tr>
      <td style="white-space:nowrap;font-size:12px;">${signupDate}</td>
      <td>${escapeHtml(user.email)}</td>
      <td>${escapeHtml(user.firstName || "")} ${escapeHtml(user.lastName || "")}</td>
      <td><span class="badge badge-${user.role}">${user.role}</span></td>
      <td>${user.commissionRate || 0}%</td>
      <td>
        <button onclick="togglePostingFeeWaiver('${user.id}', '${escapeHtml(user.email)}', ${!!user.postingFeesWaived})" class="btn-small" style="background:${user.postingFeesWaived ? 'var(--success,#10b981)' : 'var(--text-secondary,#6b7280)'};color:white;font-size:11px;" title="${user.postingFeesWaived ? 'Posting fees WAIVED — click to reinstate' : 'Posting fees active — click to waive'}">${user.postingFeesWaived ? '✓ Waived' : '$ Active'}</button>
      </td>
      <td>${user.verified ? "✓" : "✗"}</td>
      <td>${user.suspended ? '<span style="color:var(--danger)">Suspended</span>' : user.active ? '<span style="color:var(--success)">Active</span>' : '<span style="color:var(--text-secondary)">Inactive</span>'}</td>
      <td style="white-space: nowrap;">
        <button onclick="viewUserDetail('${user.id}')" class="btn-small" title="View full user details and activity">View</button>
        <button onclick="changeUserRolePrompt('${user.id}', '${escapeHtml(user.email)}', '${user.role}')" class="btn-small" style="background:var(--primary);color:white;" title="Change this user's role (designer, producer, etc.)">👤</button>
        <button onclick="editCommissionPrompt('${user.id}', '${escapeHtml(user.email)}', ${user.commissionRate || 0})" class="btn-small" style="background:var(--secondary-blue,#4A90D9);color:white;" title="Set commission rate for this user's sales">💰</button>
        <button onclick="resetPasswordPrompt('${user.id}', '${escapeHtml(user.email)}')" class="btn-small" style="background:var(--warning,#f0ad4e);color:white;" title="Send a password reset to this user">🔑</button>
        ${!user.verified ? `<button onclick="verifyUser('${user.id}')" class="btn-small btn-success" title="Manually verify this user's identity">Verify</button>` : ""}
        ${!user.suspended ? `<button onclick="suspendUserPrompt('${user.id}')" class="btn-small btn-danger" title="Suspend this user — they won't be able to log in">Suspend</button>` : `<button onclick="unsuspendUser('${user.id}')" class="btn-small btn-warning" title="Restore this user's access">Unsuspend</button>`}
        <button onclick="deleteUserPrompt('${user.id}', '${escapeHtml(user.email)}')" class="btn-small" style="background:var(--danger,#d9534f);color:white;" title="Permanently delete this user account (cannot be undone)">🗑️</button>
      </td>
    </tr>
  `;
      }
    )
    .join("");
}

/**
 * Sort users table by column key (toggle asc/desc)
 */
function sortUsersTable(key) {
  if (_userSortKey === key) {
    _userSortDir = _userSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _userSortKey = key;
    _userSortDir = 'asc';
  }
  renderUsersTable();
}

/**
 * Filter users table by search box text
 */
function filterUsersTable() {
  renderUsersTable();
}

/**
 * Load orders list
 */
async function loadOrders() {
  try {
    const status = document.getElementById("orderStatusFilter")?.value || "";

    let url = "/v1/admin/orders?limit=50";
    if (status) {
      url += `&status=${status}`;
    }

    const response = await apiFetch(url);

    if (!response.ok) {
      console.error("Failed to load orders");
      return;
    }

    const data = await response.json();
    displayOrders(data.orders || []);
  } catch (error) {
    console.error("Error loading orders:", error);
  }
}

/**
 * Display orders in table
 */
function displayOrders(orders) {
  const tbody = document.getElementById("ordersTableBody");
  if (!tbody) return;

  tbody.innerHTML = orders
    .map(
      (order) => `
    <tr>
      <td>${order.orderNumber}</td>
      <td>${escapeHtml(order.buyerName)}</td>
      <td>$${order.totalAmount.toLocaleString()}</td>
      <td><span class="badge badge-${order.status}">${order.status}</span></td>
      <td>${new Date(order.createdAt).toLocaleDateString()}</td>
      <td><button onclick="viewOrderDetail('${order.id}')" class="btn-small">View</button></td>
    </tr>
  `
    )
    .join("");
}

/**
 * Load disputes list
 */
async function loadDisputes() {
  try {
    const status = document.getElementById("disputeStatusFilter")?.value || "";

    let url = "/v1/admin/disputes?limit=50";
    if (status) {
      url += `&status=${status}`;
    }

    const response = await apiFetch(url);

    if (!response.ok) {
      console.error("Failed to load disputes");
      return;
    }

    const data = await response.json();
    displayDisputes(data.disputes || []);
  } catch (error) {
    console.error("Error loading disputes:", error);
  }
}

/**
 * Display disputes in table
 */
function displayDisputes(disputes) {
  const tbody = document.getElementById("disputesTableBody");
  if (!tbody) return;

  tbody.innerHTML = disputes
    .map(
      (dispute) => `
    <tr>
      <td>${escapeHtml(dispute.orderNumber)}</td>
      <td>${escapeHtml(dispute.failureType)}</td>
      <td>$${dispute.amount.toLocaleString()}</td>
      <td><span class="badge badge-${escapeHtml(dispute.status)}">${escapeHtml(dispute.status)}</span></td>
      <td>${new Date(dispute.createdAt).toLocaleDateString()}</td>
      <td><button onclick="viewDisputeDetail('${dispute.id}')" class="btn-small">Review</button></td>
    </tr>
  `
    )
    .join("");
}

/**
 * Load site settings
 */
async function loadSettings() {
  try {
    const response = await apiFetch("/v1/admin/settings");

    if (!response.ok) {
      console.error("Failed to load settings");
      return;
    }

    const data = await response.json();
    displaySettings(data.settings);
  } catch (error) {
    console.error("Error loading settings:", error);
  }
}

/**
 * Display settings form
 */
function displaySettings(settings) {
  const form = document.getElementById("settingsForm");
  if (!form) return;

  form.innerHTML = `
    <h4 style="color: var(--primary); margin-top: 0; margin-bottom: 20px;">💳 Payment Terms</h4>
    <div class="form-group">
      <label>Upfront Payment %</label>
      <input type="number" id="settingUpfront" value="${settings.paymentUpfrontPercent || 40}" min="0" max="100">
      <small style="color: var(--text-secondary);">Held in escrow when bid accepted</small>
    </div>
    <div class="form-group">
      <label>Shipping Payment %</label>
      <input type="number" id="settingShipping" value="${settings.paymentShippingPercent || 30}" min="0" max="100">
      <small style="color: var(--text-secondary);">Released when seller confirms shipment ready</small>
    </div>
    <div class="form-group">
      <label>Delivery Payment %</label>
      <input type="number" id="settingDelivery" value="${settings.paymentDeliveryPercent || 30}" min="0" max="100">
      <small style="color: var(--text-secondary);">Released on delivery completion</small>
    </div>

    <h4 style="color: var(--primary); margin-top: 30px; margin-bottom: 20px;">💰 Fees & Charges</h4>
    <div class="form-group">
      <label>Platform Commission %</label>
      <input type="number" id="settingFee" value="${settings.platformFeePercent || 12.5}" min="0" max="100" step="0.1">
      <small style="color: var(--text-secondary);">Percentage of successful order total</small>
    </div>
    <div class="form-group">
      <label>Posting Fee per Request ($)</label>
      <input type="number" id="settingPostingFee" value="${settings.postingFeePerRequest || 1.00}" min="0" step="0.01">
      <small style="color: var(--text-secondary);">Fixed fee for posting custom bid request</small>
    </div>

    <h4 style="color: var(--primary); margin-top: 30px; margin-bottom: 20px;">🧾 Taxes & Withholding</h4>
    <div class="form-group">
      <label>Sales Tax Withholding %</label>
      <input type="number" id="settingTaxWithholding" value="${settings.salesTaxWithholdingPercent || 0}" min="0" max="100" step="0.1">
      <small style="color: var(--text-secondary);">Percentage withheld for sales tax (varies by state)</small>
    </div>

    <h4 style="color: var(--primary); margin-top: 30px; margin-bottom: 20px;">⏱️ Dispute Resolution</h4>
    <div class="form-group">
      <label>Dispute Response Days</label>
      <input type="number" id="settingDisputeDays" value="${settings.disputeResponseDays || 7}" min="1">
      <small style="color: var(--text-secondary);">Days responder has to respond to dispute</small>
    </div>

    <button onclick="saveSettings()" class="btn-primary" style="margin-top: 30px; width: 100%;">Save All Settings</button>
  `;
}

/**
 * Save settings
 */
async function saveSettings() {
  try {
    const updates = {
      paymentUpfrontPercent: parseInt(document.getElementById("settingUpfront").value),
      paymentShippingPercent: parseInt(
        document.getElementById("settingShipping").value
      ),
      paymentDeliveryPercent: parseInt(document.getElementById("settingDelivery").value),
      platformFeePercent: parseFloat(document.getElementById("settingFee").value),
      postingFeePerRequest: parseFloat(document.getElementById("settingPostingFee").value),
      salesTaxWithholdingPercent: parseFloat(document.getElementById("settingTaxWithholding").value),
      disputeResponseDays: parseInt(document.getElementById("settingDisputeDays").value),
    };

    // Validate percentages sum to 100
    const paymentTotal =
      updates.paymentUpfrontPercent +
      updates.paymentShippingPercent +
      updates.paymentDeliveryPercent;
    if (Math.abs(paymentTotal - 100) > 0.01) {
      alert("Payment percentages must sum to 100%");
      return;
    }

    const response = await apiFetch("/v1/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (response.ok) {
      alert("Settings saved successfully!");
    } else {
      alert("Failed to save settings");
    }
  } catch (error) {
    console.error("Error saving settings:", error);
    alert("Error saving settings");
  }
}

/**
 * View user detail (enhanced)
 */
async function viewUserDetail(userId) {
  try {
    const response = await apiFetch(`/v1/admin/users/${userId}`);

    if (!response.ok) {
      alert("Failed to load user details");
      return;
    }

    const data = await response.json();
    const user = data.user;

    // Show detail in a nicer modal-like alert
    const details = [
      `📧 Email: ${user.email}`,
      `👤 Name: ${user.firstName || ''} ${user.lastName || ''}`,
      `📞 Phone: ${user.phone || 'N/A'}`,
      `🏷️ Role: ${user.role}`,
      `👔 Staff: ${user.isStaff ? `Yes (${user.staffRole || 'general'})` : 'No'}`,
      `✅ Verified: ${user.verified ? 'Yes' : 'No'}`,
      `📬 Email Verified: ${user.emailVerified ? 'Yes' : 'No'}`,
      `🟢 Active: ${user.active ? 'Yes' : 'No'}`,
      `🚫 Suspended: ${user.suspended ? `Yes - ${user.suspendedReason || 'No reason'} (until ${new Date(user.suspendedUntil).toLocaleDateString()})` : 'No'}`,
      `📅 Created: ${new Date(user.createdAt).toLocaleDateString()}`,
      `\n📍 Shipping: ${[user.shippingAddress?.street, user.shippingAddress?.city, user.shippingAddress?.state, user.shippingAddress?.zip].filter(Boolean).join(', ') || 'N/A'}`,
    ].join('\n');

    alert(details);
  } catch (error) {
    console.error("Error loading user detail:", error);
  }
}

/**
 * Admin: Create a new user
 */
async function showCreateUserForm() {
  // Hide all tab contents and show the create user form inline
  document.querySelectorAll('[id$="TabContent"]').forEach((tab) => {
    if (tab.id.match(/^(users|orders|disputes|settings)TabContent$/)) {
      tab.style.display = 'none';
    }
  });

  const content = document.getElementById("adminDashboardContent");
  if (!content) return;

  // Create a temporary container for the form
  let formContainer = document.getElementById("createUserFormContainer");
  if (!formContainer) {
    formContainer = document.createElement("div");
    formContainer.id = "createUserFormContainer";
    content.appendChild(formContainer);
  }
  formContainer.style.display = "block";

  formContainer.innerHTML = `
    <div style="max-width: 500px; margin: 0 auto;">
      <h3 style="margin-top: 0;">➕ Create New User</h3>
      <div id="createUserError" style="display:none; color:var(--danger); margin-bottom:15px; padding:10px; background:#fee; border-radius:4px;"></div>
      <div id="createUserSuccess" style="display:none; color:var(--success); margin-bottom:15px; padding:10px; background:#efe; border-radius:4px;"></div>
      
      <div class="form-group">
        <label>Email *</label>
        <input type="email" id="newUserEmail" required style="width:100%;padding:8px;border:1px solid var(--border);border-radius:4px;">
      </div>
      <div class="form-group">
        <label>Password *</label>
        <input type="password" id="newUserPassword" required minlength="8" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:4px;">
      </div>
      <div style="display:flex;gap:10px;">
        <div class="form-group" style="flex:1;">
          <label>First Name</label>
          <input type="text" id="newUserFirstName" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:4px;">
        </div>
        <div class="form-group" style="flex:1;">
          <label>Last Name</label>
          <input type="text" id="newUserLastName" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:4px;">
        </div>
      </div>
      <div class="form-group">
        <label>Roles (select all that apply)</label>
        <div id="newUserRoles" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px;">
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" name="newUserRole" value="buyer" checked> Buyer</label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" name="newUserRole" value="designer"> Designer</label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" name="newUserRole" value="producer"> Producer</label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" name="newUserRole" value="service_provider"> Service Provider</label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" name="newUserRole" value="author"> Author</label>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" name="newUserRole" value="admin"> Admin</label>
        </div>
      </div>
      <div class="form-group">
        <label>Commission Rate (%)</label>
        <input type="number" id="newUserCommission" value="10" min="0" max="100" step="0.1" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:4px;">
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:10px;">
        <input type="checkbox" id="newUserIsStaff">
        <label for="newUserIsStaff" style="margin:0;">Staff Member</label>
      </div>
      
      <div style="display:flex;gap:10px;margin-top:20px;">
        <button onclick="submitCreateUser()" class="btn-primary" style="flex:1;padding:10px;">Create User</button>
        <button onclick="cancelCreateUser()" class="btn-secondary" style="flex:1;padding:10px;">Cancel</button>
      </div>
    </div>
  `;
}

async function submitCreateUser() {
  const errorDiv = document.getElementById("createUserError");
  const successDiv = document.getElementById("createUserSuccess");
  errorDiv.style.display = "none";
  successDiv.style.display = "none";

  const selectedRoles = Array.from(document.querySelectorAll('input[name="newUserRole"]:checked')).map(cb => cb.value);

  const data = {
    email: document.getElementById("newUserEmail").value,
    password: document.getElementById("newUserPassword").value,
    firstName: document.getElementById("newUserFirstName").value,
    lastName: document.getElementById("newUserLastName").value,
    roles: selectedRoles,
    commissionRate: parseFloat(document.getElementById("newUserCommission").value) || 0,
    isStaff: document.getElementById("newUserIsStaff").checked,
  };

  if (!data.email || !data.password) {
    errorDiv.textContent = "Email and password are required";
    errorDiv.style.display = "block";
    return;
  }

  if (!data.roles || data.roles.length === 0) {
    errorDiv.textContent = "At least one role must be selected";
    errorDiv.style.display = "block";
    return;
  }

  try {
    const response = await apiFetch("/v1/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      errorDiv.textContent = result.error || "Failed to create user";
      errorDiv.style.display = "block";
      return;
    }

    successDiv.textContent = `User ${data.email} created successfully!`;
    successDiv.style.display = "block";

    // Return to users list after 1.5s
    setTimeout(() => {
      switchAdminTab("users");
    }, 1500);
  } catch (error) {
    errorDiv.textContent = "Failed to create user";
    errorDiv.style.display = "block";
  }
}

function cancelCreateUser() {
  const formContainer = document.getElementById("createUserFormContainer");
  if (formContainer) {
    formContainer.style.display = "none";
  }
  switchAdminTab("users");
}

/**
 * Admin: Reset user password
 */
async function resetPasswordPrompt(userId, email) {
  const newPassword = await showAdminModal("prompt", "Reset Password", `Enter new password for <strong>${escapeHtml(email)}</strong><br>(min 8 characters)`);
  if (!newPassword) return;
  if (newPassword.length < 8) {
    await showAdminModal("alert", "Validation Error", "Password must be at least 8 characters");
    return;
  }
  resetUserPassword(userId, email, newPassword);
}

async function resetUserPassword(userId, email, newPassword) {
  try {
    const response = await apiFetch(`/v1/admin/users/${userId}/reset-password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });

    if (response.ok) {
      alert(`✅ Password reset for ${email}`);
    } else {
      const err = await response.json();
      alert(`Failed: ${err.error}`);
    }
  } catch (error) {
    console.error("Error resetting password:", error);
    alert("Failed to reset password");
  }
}

/**
 * Admin: Change user role
 */
async function changeUserRolePrompt(userId, email, currentRole) {
  const roles = ['admin', 'designer', 'producer', 'service_provider', 'author', 'buyer'];
  
  // Build a select-based modal
  const existingModal = document.getElementById('changeRoleModal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'changeRoleModal';
  modal.className = 'modal show';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 420px;">
      <span class="close" onclick="document.getElementById('changeRoleModal').remove()">&times;</span>
      <h3>👤 Change User Role</h3>
      <p style="margin-bottom: 12px;">User: <strong>${escapeHtml(email)}</strong></p>
      <p style="margin-bottom: 12px;">Current role: <span class="badge badge-${currentRole}">${currentRole}</span></p>
      <div class="form-group">
        <label>New Role:</label>
        <select id="newRoleSelect" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px;">
          ${roles.map(r => `<option value="${r}" ${r === currentRole ? 'selected' : ''}>${r.replace('_', ' ')}</option>`).join('')}
        </select>
      </div>
      <div style="display: flex; gap: 10px; margin-top: 16px;">
        <button class="btn-secondary" style="flex:1;" onclick="document.getElementById('changeRoleModal').remove()">Cancel</button>
        <button class="btn-primary" style="flex:1;" id="confirmRoleChangeBtn">Save Role</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('confirmRoleChangeBtn').addEventListener('click', async () => {
    const newRole = document.getElementById('newRoleSelect').value;
    if (newRole === currentRole) {
      document.getElementById('changeRoleModal').remove();
      return;
    }
    try {
      const resp = await apiFetch(`/v1/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!resp.ok) {
        const d = await resp.json();
        throw new Error(d.error || 'Failed to change role');
      }
      document.getElementById('changeRoleModal').remove();
      if (typeof showToast === 'function') showToast(`Role changed to ${newRole}`, 'success');
      loadUsers();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });
}

/**
 * Admin: Edit commission rate
 */
async function editCommissionPrompt(userId, email, currentRate) {
  const newRate = await showAdminModal(
    "prompt",
    "Edit Commission Rate",
    `Set commission rate for <strong>${escapeHtml(email)}</strong><br>Current: ${currentRate}%<br><br>Enter new rate (0-100):`,
    String(currentRate)
  );
  if (newRate === null) return;
  
  const rate = parseFloat(newRate);
  if (isNaN(rate) || rate < 0 || rate > 100) {
    await showAdminModal("alert", "Validation Error", "Commission rate must be between 0 and 100");
    return;
  }
  updateCommission(userId, email, rate);
}

async function updateCommission(userId, email, commissionRate) {
  try {
    const response = await apiFetch(`/v1/admin/commissions/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionRate }),
    });

    if (response.ok) {
      alert(`✅ Commission for ${email} set to ${commissionRate}%`);
      loadUsers();
    } else {
      const err = await response.json();
      alert(`Failed: ${err.error}`);
    }
  } catch (error) {
    console.error("Error updating commission:", error);
    alert("Failed to update commission");
  }
}

/**
 * Admin: Toggle posting fee waiver for a user
 */
async function togglePostingFeeWaiver(userId, email, currentlyWaived) {
  const newState = !currentlyWaived;
  const action = newState ? "WAIVE posting fees" : "REINSTATE posting fees";
  const confirmed = await showAdminModal(
    "confirm",
    "Posting Fee Waiver",
    `${action} for <strong>${escapeHtml(email)}</strong>?`
  );
  if (!confirmed) return;

  try {
    const response = await apiFetch(`/v1/admin/users/${userId}/posting-fee-waiver`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waived: newState }),
    });

    if (response.ok) {
      alert(`✅ Posting fees ${newState ? "WAIVED" : "reinstated"} for ${email}`);
      loadUsers();
    } else {
      const err = await response.json();
      alert(`Failed: ${err.error}`);
    }
  } catch (error) {
    console.error("Error toggling posting fee waiver:", error);
    alert("Failed to update posting fee waiver");
  }
}

/**
 * Admin: Delete user
 */
async function deleteUserPrompt(userId, email) {
  const confirmed = await showAdminModal("confirm", "⚠️ Delete User", `Permanently delete <strong>${escapeHtml(email)}</strong>?<br><br>This will remove the user and all their data.<br><strong>This action cannot be undone.</strong>`);
  if (!confirmed) return;
  deleteUser(userId, email);
}

async function deleteUser(userId, email) {
  try {
    const response = await apiFetch(`/v1/admin/users/${userId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      alert(`✅ User ${email} deleted`);
      loadUsers();
    } else {
      const err = await response.json();
      alert(`Failed: ${err.error}`);
    }
  } catch (error) {
    console.error("Error deleting user:", error);
    alert("Failed to delete user");
  }
}

/**
 * Admin: Purge all data
 */
async function purgeAllData() {
  const step1 = await showAdminModal("confirm", "⚠️ DANGER: Purge All Data", "This will delete <strong>ALL data</strong> except admin accounts.<br><br>Products, orders, users, messages — everything will be permanently deleted.<br><br>Are you absolutely sure?");
  if (!step1) return;
  
  const confirmPhrase = await showAdminModal("prompt", "Confirm Purge", 'Type <strong>PURGE_ALL_DATA</strong> to confirm:');
  if (confirmPhrase !== "PURGE_ALL_DATA") {
    await showAdminModal("alert", "Cancelled", "Purge cancelled — confirmation phrase did not match.");
    return;
  }

  try {
    const response = await apiFetch("/v1/admin/purge-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmPhrase: "PURGE_ALL_DATA" }),
    });

    const result = await response.json();
    if (response.ok) {
      alert(`✅ Data purged!\n\nCleared tables:\n${result.purgedTables.join(', ')}`);
      loadAnalytics();
      loadUsers();
    } else {
      alert(`Failed: ${result.error}`);
    }
  } catch (error) {
    console.error("Error purging data:", error);
    alert("Failed to purge data");
  }
}

/**
 * Verify user
 */
async function verifyUser(userId) {
  try {
    const response = await apiFetch(`/v1/admin/users/${userId}/verify`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified: true }),
    });

    if (response.ok) {
      alert("User verified!");
      loadUsers();
    } else {
      alert("Failed to verify user");
    }
  } catch (error) {
    console.error("Error verifying user:", error);
  }
}

/**
 * Suspend user prompt
 */
async function suspendUserPrompt(userId) {
  const reason = await showAdminModal("prompt", "Suspend User", "Enter suspension reason:");
  if (reason) {
    suspendUser(userId, reason);
  }
}

/**
 * Suspend user
 */
async function suspendUser(userId, reason) {
  try {
    const response = await apiFetch(`/v1/admin/users/${userId}/suspend`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, durationDays: 30 }),
    });

    if (response.ok) {
      alert("User suspended!");
      loadUsers();
    } else {
      alert("Failed to suspend user");
    }
  } catch (error) {
    console.error("Error suspending user:", error);
  }
}

/**
 * Unsuspend user
 */
async function unsuspendUser(userId) {
  try {
    const response = await apiFetch(`/v1/admin/users/${userId}/unsuspend`, {
      method: "PATCH",
    });

    if (response.ok) {
      alert("User unsuspended!");
      loadUsers();
    } else {
      alert("Failed to unsuspend user");
    }
  } catch (error) {
    console.error("Error unsuspending user:", error);
  }
}

/**
 * View order detail
 */
async function viewOrderDetail(orderId) {
  try {
    const response = await apiFetch(`/v1/admin/orders/${orderId}`);

    if (!response.ok) {
      alert("Failed to load order details");
      return;
    }

    const data = await response.json();
    const order = data.order;

    alert(`
Order #${order.orderNumber}
Buyer: ${order.buyer.name}
Status: ${order.status}
Amount: $${order.totalAmount.toLocaleString()}
Date: ${new Date(order.createdAt).toLocaleDateString()}
    `);
  } catch (error) {
    console.error("Error loading order detail:", error);
  }
}

/**
 * View dispute detail
 */
async function viewDisputeDetail(disputeId) {
  try {
    const response = await apiFetch(`/v1/admin/disputes/${disputeId}`);

    if (!response.ok) {
      alert("Failed to load dispute details");
      return;
    }

    const data = await response.json();
    const dispute = data.dispute;

    const resolution = await showAdminModal(
      "prompt",
      "Resolve Dispute",
      `Dispute <strong>#${escapeHtml(dispute.id)}</strong><br><br>Type: ${escapeHtml(dispute.failureType)}<br>Amount: $${dispute.amount}<br>Description: ${escapeHtml(dispute.description)}<br><br>Enter resolution (full_refund, partial_refund, no_refund):`,
      "full_refund"
    );

    if (resolution) {
      resolveDispute(disputeId, resolution);
    }
  } catch (error) {
    console.error("Error loading dispute detail:", error);
  }
}

/**
 * Resolve dispute
 */
async function resolveDispute(disputeId, resolution) {
  try {
    const response = await apiFetch(`/v1/admin/disputes/${disputeId}/resolve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution, resolutionNotes: "Admin decision" }),
    });

    if (response.ok) {
      alert("Dispute resolved!");
      loadDisputes();
    } else {
      alert("Failed to resolve dispute");
    }
  } catch (error) {
    console.error("Error resolving dispute:", error);
  }
}

/**
 * Helper: escapeHtml() is now in utils.js (loaded globally before admin.js)
 */

/**
 * Module export
 */
const adminModule = {
  checkAdminAccess,
  loadAdminDashboard,
  switchAdminTab,
  loadAnalytics,
  loadUsers,
  loadOrders,
  loadDisputes,
  loadSettings,
  saveSettings,
  viewUserDetail,
  verifyUser,
  suspendUser,
  suspendUserPrompt,
  unsuspendUser,
  viewOrderDetail,
  viewDisputeDetail,
  resolveDispute,
  showCreateUserForm,
  submitCreateUser,
  cancelCreateUser,
  resetPasswordPrompt,
  resetUserPassword,
  editCommissionPrompt,
  updateCommission,
  deleteUserPrompt,
  deleteUser,
  purgeAllData,
};

// --- Vite module exports (attach to window for HTML event handler compat) ---
window.adminModule = adminModule;
window.loadUsers = loadUsers;
window.loadOrders = loadOrders;
window.loadDisputes = loadDisputes;
window.closeAdminModal = closeAdminModal;
window.showAdminModal = showAdminModal;
window.switchAdminTab = switchAdminTab;
window.loadSettings = loadSettings;
window.saveSettings = saveSettings;
window.viewUserDetail = viewUserDetail;
window.showCreateUserForm = showCreateUserForm;
window.submitCreateUser = submitCreateUser;
window.cancelCreateUser = cancelCreateUser;
window.resetPasswordPrompt = resetPasswordPrompt;
window.editCommissionPrompt = editCommissionPrompt;
window.togglePostingFeeWaiver = togglePostingFeeWaiver;
window.changeUserRolePrompt = changeUserRolePrompt;
window.deleteUserPrompt = deleteUserPrompt;
window.verifyUser = verifyUser;
window.suspendUserPrompt = suspendUserPrompt;
window.unsuspendUser = unsuspendUser;
window.viewOrderDetail = viewOrderDetail;
window.purgeAllData = purgeAllData;
window.displayUsers = displayUsers;
window.sortUsersTable = sortUsersTable;
window.filterUsersTable = filterUsersTable;
window.displayOrders = displayOrders;
window.displayDisputes = displayDisputes;
window.displaySettings = displaySettings;
