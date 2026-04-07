// ---------------------------------------------------------------------------
// CSRF: fetch the session token once, then inject it on all mutating requests
// ---------------------------------------------------------------------------
const ORIGINAL_FETCH = window.fetch.bind(window);
let csrfToken = null;

window.fetch = (input, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    if (csrfToken && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        const headers = new Headers(init.headers || {});
        headers.set("X-CSRF-Token", csrfToken);
        init = { ...init, headers };
    }
    return ORIGINAL_FETCH(input, init);
};

async function fetchCsrfToken() {
    try {
        const response = await ORIGINAL_FETCH("/api/auth/csrf-token");
        if (response.ok) {
            const data = await response.json();
            csrfToken = data.csrf_token;
        }
    } catch (_) { /* not on login page or unauthenticated — ignore */ }
}

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const customerForm = document.getElementById("customer-form");
const editCustomerForm = document.getElementById("edit-customer-form");
const depositForm = document.getElementById("deposit-form");
const withdrawForm = document.getElementById("withdraw-form");
const transferForm = document.getElementById("transfer-form");
const loginForm = document.getElementById("login-form");
const createStaffForm = document.getElementById("create-staff-form");
const changePasswordForm = document.getElementById("change-password-form");

const customerList = document.getElementById("customer-list");
const transactionList = document.getElementById("transaction-list");
const auditList = document.getElementById("audit-list");
const staffUserList = document.getElementById("staff-user-list");
const customerDetailPanel = document.getElementById("customer-detail-panel");
const customerTransactionsPanel = document.getElementById("customer-transactions-panel");
const customerTimelinePanel = document.getElementById("customer-timeline-panel");
const recentActivityPanel = document.getElementById("recent-activity-panel");

const messageBox = document.getElementById("message");
const editMessageBox = document.getElementById("edit-message");
const loginMessageBox = document.getElementById("login-message");
const createStaffMessageBox = document.getElementById("create-staff-message");
const changePasswordMessageBox = document.getElementById("change-password-message");

const refreshBtn = document.getElementById("refresh-btn");
const searchCustomersBtn = document.getElementById("search-customers-btn");
const refreshTransactionsBtn = document.getElementById("refresh-transactions-btn");
const filterTransactionsBtn = document.getElementById("filter-transactions-btn");
const refreshAuditBtn = document.getElementById("refresh-audit-btn");
const logoutBtn = document.getElementById("logout-btn");
const exportCustomersBtn = document.getElementById("export-customers-btn");
const exportTransactionsBtn = document.getElementById("export-transactions-btn");

const customerSearchInput = document.getElementById("customer-search");
const customerStatusFilter = document.getElementById("customer-status-filter");
const customerSortFilter = document.getElementById("customer-sort-filter");
const suggestionsBox = document.getElementById("customer-search-suggestions");

const auditActorFilter = document.getElementById("audit-actor-filter");
const auditEventFilter = document.getElementById("audit-event-filter");
const auditResultFilter = document.getElementById("audit-result-filter");

const confirmModal = document.getElementById("confirm-modal");
const modalTitle = document.getElementById("modal-title");
const modalMessage = document.getElementById("modal-message");
const modalConfirm = document.getElementById("modal-confirm");
const modalCancel = document.getElementById("modal-cancel");

const toastContainer = document.getElementById("toast-container");
const loadingOverlay = document.getElementById("loading-overlay");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
window.currentUserRole = "staff";
let confirmAction = null;
let cachedCustomers = [];
let customerChart = null;
let transactionChart = null;

const PAGE_SIZE = 50;
let customersPage = 0;
let transactionsPage = 0;

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
function showToast(message, isError = false) {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast ${isError ? "toast-error" : "toast-success"}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function setLoading(show) {
    if (!loadingOverlay) return;
    loadingOverlay.classList.toggle("hidden", !show);
    document.body.setAttribute("aria-busy", show ? "true" : "false");
}

function _showStatusMessage(box, message, isError) {
    if (!box) return;
    box.textContent = message;
    box.style.color = isError ? "crimson" : "green";
    box.setAttribute("role", isError ? "alert" : "status");
    showToast(message, isError);
    setTimeout(() => { box.textContent = ""; }, 3000);
}

function showMessage(message, isError = false) { _showStatusMessage(messageBox, message, isError); }
function showEditMessage(message, isError = false) { _showStatusMessage(editMessageBox, message, isError); }
function showCreateStaffMessage(message, isError = false) { _showStatusMessage(createStaffMessageBox, message, isError); }
function showChangePasswordMessage(message, isError = false) { _showStatusMessage(changePasswordMessageBox, message, isError); }

function showLoginMessage(message, isError = false) {
    if (!loginMessageBox) return;
    loginMessageBox.textContent = message;
    loginMessageBox.style.color = isError ? "crimson" : "green";
    showToast(message, isError);
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

// ---------------------------------------------------------------------------
// Confirm modal
// ---------------------------------------------------------------------------
let _modalPreviousFocus = null;

function openConfirmModal(title, message, onConfirm) {
    if (!confirmModal) return;
    _modalPreviousFocus = document.activeElement;
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    confirmAction = onConfirm;
    confirmModal.classList.remove("hidden");
    modalCancel?.focus();
}

function closeConfirmModal() {
    if (!confirmModal) return;
    confirmModal.classList.add("hidden");
    confirmAction = null;
    if (_modalPreviousFocus && typeof _modalPreviousFocus.focus === "function") {
        _modalPreviousFocus.focus();
    }
    _modalPreviousFocus = null;
}

modalConfirm?.addEventListener("click", async () => {
    if (confirmAction) await confirmAction();
    closeConfirmModal();
});
modalCancel?.addEventListener("click", closeConfirmModal);
confirmModal?.addEventListener("click", (event) => {
    if (event.target === confirmModal) closeConfirmModal();
});

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------
async function handleJsonResponse(response) {
    let data;
    try { data = await response.json(); } catch { data = {}; }

    if (!response.ok) {
        if (response.status === 401) {
            const detail = data.detail || "Request failed.";
            if (detail !== "Invalid username or password." &&
                detail !== "Invalid or missing API key.") {
                window.location.href = "/login";
            }
        }
        throw new Error(data.detail || "Request failed.");
    }
    return data;
}

// ---------------------------------------------------------------------------
// Current user
// ---------------------------------------------------------------------------
async function fetchCurrentUser() {
    try {
        const response = await fetch("/api/auth/me");
        const user = await handleJsonResponse(response);
        window.currentUserRole = user.role || "staff";

        // Populate the change-password form with current user's ID
        const cpUserId = document.getElementById("change-password-user-id");
        if (cpUserId && user.id) cpUserId.value = user.id;

        // Show superadmin role option in the create-staff form if the current user is superadmin
        if (isSuperadmin()) {
            const roleSelect = document.getElementById("new-staff-role");
            if (roleSelect && !roleSelect.querySelector("option[value='superadmin']")) {
                const opt = document.createElement("option");
                opt.value = "superadmin";
                opt.textContent = "Superadmin";
                roleSelect.appendChild(opt);
            }
        }
    } catch (_) {
        window.currentUserRole = "staff";
    }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
function renderDashboardSummary(summary) {
    const values = {
        "stat-total-customers": summary.total_customers,
        "stat-active-customers": summary.active_customers,
        "stat-inactive-customers": summary.inactive_customers,
        "stat-suspicious-transactions": summary.suspicious_transactions,
        "stat-low-balance-customers": summary.low_balance_customers,
        "stat-total-transactions": summary.total_transactions,
        "stat-total-balance": `£${summary.total_balance}`
    };
    Object.entries(values).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    });
}

function renderCharts(data) {
    if (typeof Chart === "undefined") return;
    const customerCanvas = document.getElementById("customerStatusChart");
    const transactionCanvas = document.getElementById("transactionTypeChart");

    if (customerChart) customerChart.destroy();
    if (transactionChart) transactionChart.destroy();

    if (customerCanvas) {
        customerChart = new Chart(customerCanvas, {
            type: "doughnut",
            data: {
                labels: ["Active", "Inactive"],
                datasets: [{ data: [data.customer_status.active, data.customer_status.inactive] }]
            }
        });
    }
    if (transactionCanvas) {
        transactionChart = new Chart(transactionCanvas, {
            type: "bar",
            data: {
                labels: ["Deposit", "Withdraw", "Transfer"],
                datasets: [{ data: [data.transaction_types.deposit, data.transaction_types.withdraw, data.transaction_types.transfer] }]
            },
            options: { plugins: { legend: { display: false } } }
        });
    }
}

async function fetchDashboardSummary() {
    try {
        const response = await fetch("/api/dashboard-summary");
        const summary = await handleJsonResponse(response);
        renderDashboardSummary(summary);
    } catch (error) { showMessage(error.message, true); }
}

async function fetchChartData() {
    try {
        const response = await fetch("/api/chart-data");
        const data = await handleJsonResponse(response);
        renderCharts(data);
    } catch (error) { showMessage(error.message, true); }
}

// ---------------------------------------------------------------------------
// Customers (with pagination)
// ---------------------------------------------------------------------------
function renderSuggestions(matches) {
    if (!suggestionsBox) return;
    if (!matches.length) {
        suggestionsBox.innerHTML = "";
        suggestionsBox.classList.add("hidden");
        if (customerSearchInput) customerSearchInput.setAttribute("aria-expanded", "false");
        return;
    }
    suggestionsBox.setAttribute("role", "listbox");
    suggestionsBox.id = "customer-suggestions-listbox";
    suggestionsBox.innerHTML = matches.map((c) => `
        <button type="button" class="suggestion-item" role="option" data-id="${c.id}">
            ${escapeHtml(c.full_name)} - ${escapeHtml(c.account_number)}
        </button>
    `).join("");
    suggestionsBox.classList.remove("hidden");
    if (customerSearchInput) customerSearchInput.setAttribute("aria-expanded", "true");
    suggestionsBox.querySelectorAll(".suggestion-item").forEach((btn) => {
        btn.addEventListener("click", async () => {
            suggestionsBox.classList.add("hidden");
            if (customerSearchInput) customerSearchInput.setAttribute("aria-expanded", "false");
            await viewCustomer(Number(btn.dataset.id));
        });
    });
}

function updateSuggestions() {
    if (!customerSearchInput) return;
    const query = customerSearchInput.value.trim().toLowerCase();
    if (!query) { renderSuggestions([]); return; }
    const matches = cachedCustomers
        .filter((c) => c.full_name.toLowerCase().includes(query) ||
                       c.email.toLowerCase().includes(query) ||
                       c.account_number.toLowerCase().includes(query))
        .slice(0, 6);
    renderSuggestions(matches);
}

function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

function renderCustomers(customers) {
    if (!customerList) return;
    cachedCustomers = customers;

    if (!customers.length) {
        customerList.innerHTML = `<div class="customer-item"><p class="muted-text">No customer records found.</p></div>`;
        return;
    }
    const mgr = isPrivileged();
    customerList.innerHTML = customers.map((c) => `
        <div class="customer-row ${c.is_active ? "" : "inactive"}">
            <div class="customer-avatar" aria-hidden="true">${escapeHtml(initials(c.full_name))}</div>
            <div class="customer-main">
                <div class="customer-name">${escapeHtml(c.full_name)}</div>
                <div class="customer-sub">${escapeHtml(c.account_number)} &middot; ${escapeHtml(c.email)}</div>
            </div>
            <div class="customer-right">
                <div class="customer-balance">£${c.balance.toLocaleString()}</div>
                <span class="status-pill ${c.is_active ? "status-active" : "status-inactive"}">
                    ${c.is_active ? "Active" : "Inactive"}
                </span>
                <div class="customer-actions">
                    <button type="button" class="ghost-btn" onclick="viewCustomer(${c.id})">View</button>
                    ${mgr ? `<button type="button" class="ghost-btn" onclick="startEditCustomer(${c.id})">Edit</button>` : ""}
                    ${mgr && c.is_active ? `<button type="button" class="danger-btn" onclick="deactivateCustomer(${c.id})">Deactivate</button>` : ""}
                    ${mgr && !c.is_active ? `<button type="button" class="success-btn" onclick="reactivateCustomer(${c.id})">Activate</button>` : ""}
                    ${mgr ? `<button type="button" class="danger-btn" onclick="deleteCustomer(${c.id})">Delete</button>` : ""}
                </div>
            </div>
        </div>
    `).join("");
}

function updatePaginationInfo(pageInfoId, page, count) {
    const el = document.getElementById(pageInfoId);
    if (el) el.textContent = `Page ${page + 1}${count < PAGE_SIZE ? " (last)" : ""}`;
}

async function fetchCustomers(resetPage = false) {
    if (!customerList) return;
    if (resetPage) customersPage = 0;

    const search = customerSearchInput?.value.trim() || "";
    const status = customerStatusFilter?.value || "";
    const sortBy = customerSortFilter?.value || "";

    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status) params.append("status", status);
    if (sortBy) params.append("sort_by", sortBy);
    params.append("limit", PAGE_SIZE);
    params.append("offset", customersPage * PAGE_SIZE);

    try {
        const response = await fetch(`/api/customers?${params.toString()}`);
        const customers = await handleJsonResponse(response);
        renderCustomers(customers);
        updatePaginationInfo("customers-page-info", customersPage, customers.length);

        const prevBtn = document.getElementById("customers-prev-btn");
        const nextBtn = document.getElementById("customers-next-btn");
        if (prevBtn) prevBtn.disabled = customersPage === 0;
        if (nextBtn) nextBtn.disabled = customers.length < PAGE_SIZE;
    } catch (error) { showMessage(error.message, true); }
}

// ---------------------------------------------------------------------------
// Customer detail
// ---------------------------------------------------------------------------
function renderCustomerDetail(customer) {
    if (!customerDetailPanel) return;
    customerDetailPanel.innerHTML = `
        <div class="customer-row ${customer.is_active ? "" : "inactive"}" style="flex-wrap:wrap;gap:12px;">
            <div class="customer-avatar" style="width:52px;height:52px;font-size:18px;" aria-hidden="true">${escapeHtml(initials(customer.full_name))}</div>
            <div class="customer-main">
                <div class="customer-name" style="font-size:16px;">${escapeHtml(customer.full_name)}</div>
                <div class="customer-sub">${escapeHtml(customer.account_number)}</div>
                <div class="customer-sub">${escapeHtml(customer.email)}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;min-width:120px;">
                <div class="customer-balance" style="font-size:20px;">£${customer.balance.toLocaleString()}</div>
                <span class="status-pill ${customer.is_active ? "status-active" : "status-inactive"}">
                    ${customer.is_active ? "Active" : "Inactive"}
                </span>
            </div>
        </div>
        <div style="padding:12px 16px;display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">
            <div><strong style="color:#0f172a;">ID</strong><br>#${customer.id}</div>
            <div><strong style="color:#0f172a;">Created</strong><br>${escapeHtml(formatDateTime(customer.created_at))}</div>
            <div><strong style="color:#0f172a;">Updated</strong><br>${escapeHtml(formatDateTime(customer.updated_at))}</div>
        </div>
    `;
}

// ---------------------------------------------------------------------------
// Transactions (with pagination)
// ---------------------------------------------------------------------------
function transactionStatusClass(type) {
    if (type === "deposit") return "status-deposit";
    if (type === "withdraw") return "status-withdraw";
    if (type === "transfer") return "status-transfer";
    return "status-active";
}

function renderTransactions(transactions, targetElement = transactionList, emptyText = "No transactions found.") {
    if (!targetElement) return;
    if (!transactions.length) {
        targetElement.innerHTML = `<div class="customer-item"><p class="muted-text">${emptyText}</p></div>`;
        return;
    }
    targetElement.innerHTML = transactions.map((t) => {
        const type = t.transaction_type;
        const dotClass = type === "deposit" ? "txn-deposit" : type === "withdraw" ? "txn-withdraw" : type === "transfer" ? "txn-transfer" : "txn-default";
        const amtClass = type === "deposit" ? "deposit" : type === "withdraw" ? "withdraw" : type === "transfer" ? "transfer" : "";
        const fromTo = [
            t.from_customer_id ? `From #${t.from_customer_id}` : null,
            t.to_customer_id   ? `To #${t.to_customer_id}` : null
        ].filter(Boolean).join(" → ");
        return `
        <div class="transaction-row">
            <div class="txn-type-dot ${dotClass}" aria-hidden="true"></div>
            <div class="txn-content">
                <div class="txn-header">
                    <span class="status-pill ${transactionStatusClass(type)}">${escapeHtml(type)}</span>
                    ${t.risk_flag ? '<span class="flag-chip">&#9888; Flagged</span>' : ""}
                    <span class="txn-desc">${escapeHtml(t.description || "—")}</span>
                </div>
                <div class="txn-sub">${escapeHtml(fromTo || "—")} &middot; ${escapeHtml(formatDateTime(t.created_at))}</div>
            </div>
            <div class="txn-amount ${amtClass}">${type === "deposit" ? "+" : type === "withdraw" ? "−" : ""}£${t.amount.toLocaleString()}</div>
        </div>`;
    }).join("");
}

async function fetchTransactions(resetPage = false) {
    if (!transactionList) return;
    if (resetPage) transactionsPage = 0;

    const account = document.getElementById("transaction-account-filter")?.value.trim() || "";
    const type = document.getElementById("transaction-type-filter")?.value || "";

    const params = new URLSearchParams();
    if (account) params.append("account_number", account);
    if (type) params.append("transaction_type", type);
    params.append("limit", PAGE_SIZE);
    params.append("offset", transactionsPage * PAGE_SIZE);

    try {
        const response = await fetch(`/api/transactions?${params.toString()}`);
        const transactions = await handleJsonResponse(response);
        renderTransactions(transactions);
        updatePaginationInfo("transactions-page-info", transactionsPage, transactions.length);

        const prevBtn = document.getElementById("transactions-prev-btn");
        const nextBtn = document.getElementById("transactions-next-btn");
        if (prevBtn) prevBtn.disabled = transactionsPage === 0;
        if (nextBtn) nextBtn.disabled = transactions.length < PAGE_SIZE;
    } catch (error) { showMessage(error.message, true); }
}

async function fetchTransactionsForCustomer(accountNumber) {
    try {
        const response = await fetch(`/api/transactions?account_number=${encodeURIComponent(accountNumber)}&limit=${PAGE_SIZE}`);
        const transactions = await handleJsonResponse(response);
        renderTransactions(transactions, customerTransactionsPanel, `No transactions found for account ${accountNumber}.`);
    } catch (error) { showMessage(error.message, true); }
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
function renderTimeline(items) {
    if (!customerTimelinePanel) return;
    if (!items.length) {
        customerTimelinePanel.innerHTML = `<div class="transaction-item"><p class="muted-text">No timeline events found.</p></div>`;
        return;
    }
    customerTimelinePanel.innerHTML = items.map((item) => `
        <div class="timeline-row">
            <div class="timeline-dot" aria-hidden="true"></div>
            <div class="timeline-content">
                <div class="timeline-event">${escapeHtml(String(item.event_type).replaceAll("_", " "))}</div>
                <div class="timeline-desc">${escapeHtml(item.description)}</div>
                <div class="timeline-time">${escapeHtml(formatDateTime(item.created_at))}</div>
            </div>
        </div>
    `).join("");
}

async function fetchCustomerTimeline(customerId) {
    try {
        const response = await fetch(`/api/customers/${customerId}/timeline`);
        const timeline = await handleJsonResponse(response);
        renderTimeline(timeline);
    } catch (error) { showMessage(error.message, true); }
}

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------
function renderAuditLogs(logs) {
    if (!auditList) return;
    if (!logs.length) {
        auditList.innerHTML = `<div class="audit-item"><p class="muted-text">No audit logs found.</p></div>`;
        return;
    }
    auditList.innerHTML = logs.map((log) => {
        const isSuccess = log.result === "success";
        const isFailure = log.result === "failure";
        const dotClass  = isSuccess ? "audit-result-success" : isFailure ? "audit-result-failure" : "audit-result-other";
        const chipClass = isSuccess ? "chip-success" : isFailure ? "chip-failure" : "chip-other";
        return `
        <div class="audit-row">
            <div class="audit-result-dot ${dotClass}" aria-hidden="true"></div>
            <div class="audit-content">
                <div class="audit-event">${escapeHtml(log.event_type)}</div>
                <div class="audit-detail" title="${escapeHtml(log.details)}">${escapeHtml(log.details)}</div>
                <div class="audit-sub">${escapeHtml(log.actor)} &middot; ${escapeHtml(log.ip_address || "—")} &middot; ${escapeHtml(formatDateTime(log.created_at))}</div>
            </div>
            <span class="audit-result-chip ${chipClass}">${escapeHtml(log.result)}</span>
        </div>`;
    }).join("");

    if (recentActivityPanel) {
        recentActivityPanel.innerHTML = logs.slice(0, 6).map((log) => `
            <div class="activity-item">
                <div class="activity-dot" style="background:${log.result === "failure" ? "var(--danger)" : "var(--primary)"};" aria-hidden="true"></div>
                <div class="activity-body">
                    <div class="activity-title">${escapeHtml(log.event_type.replaceAll("_", " "))}</div>
                    <div class="activity-sub">${escapeHtml(log.actor)} &middot; ${escapeHtml(formatDateTime(log.created_at))}</div>
                </div>
            </div>
        `).join("");
    }
}

async function fetchAuditLogs() {
    if (!auditList) return;
    const params = new URLSearchParams();
    if (auditActorFilter?.value.trim()) params.append("actor", auditActorFilter.value.trim());
    if (auditEventFilter?.value.trim()) params.append("event_type", auditEventFilter.value.trim());
    if (auditResultFilter?.value) params.append("result", auditResultFilter.value);

    const url = params.toString() ? `/api/audit-logs?${params.toString()}` : "/api/audit-logs";
    try {
        const response = await fetch(url);
        const logs = await handleJsonResponse(response);
        renderAuditLogs(logs);
    } catch (error) {
        if (isPrivileged()) {
            showMessage(error.message, true);
        } else {
            auditList.innerHTML = `<div class="audit-item"><p class="muted-text">Audit log is restricted to manager accounts.</p></div>`;
        }
    }
}

function isPrivileged() {
    return ["manager", "superadmin"].includes(window.currentUserRole);
}

function isSuperadmin() {
    return window.currentUserRole === "superadmin";
}

// ---------------------------------------------------------------------------
// Staff users
// ---------------------------------------------------------------------------
function rolePill(role) {
    const cls = role === "superadmin" ? "status-superadmin" : role === "manager" ? "status-manager" : "status-staff";
    return `<span class="status-pill ${cls}">${escapeHtml(role)}</span>`;
}

function renderStaffUsers(users) {
    if (!staffUserList) return;
    if (!isPrivileged()) {
        staffUserList.innerHTML = `<div class="customer-item"><p class="muted-text">Manager access required.</p></div>`;
        return;
    }
    if (!users.length) {
        staffUserList.innerHTML = `<div class="customer-item"><p class="muted-text">No staff users found.</p></div>`;
        return;
    }
    staffUserList.innerHTML = users.map((user) => {
        // Superadmin can unlock anyone; manager can only unlock staff-role accounts
        const targetIsPrivileged = ["manager", "superadmin"].includes(user.role);
        const canUnlock = user.is_locked && (isSuperadmin() || !targetIsPrivileged);
        const unlockBlockedMsg = user.is_locked && targetIsPrivileged && !isSuperadmin()
            ? `<span class="warning-inline" title="Only superadmin can unlock this account">Locked — superadmin required</span>`
            : "";
        return `
        <div class="staff-row">
            <div class="staff-avatar" aria-hidden="true">${escapeHtml(user.username.slice(0, 2).toUpperCase())}</div>
            <div class="staff-info">
                <div class="staff-name">${escapeHtml(user.username)}</div>
                <div class="staff-sub">
                    Joined ${escapeHtml(formatDateTime(user.created_at))}
                    ${user.failed_login_attempts > 0 ? `&middot; ${user.failed_login_attempts} failed attempt${user.failed_login_attempts !== 1 ? "s" : ""}` : ""}
                    ${user.must_change_password ? "&middot; <em>password change required</em>" : ""}
                </div>
            </div>
            <div class="staff-right">
                ${rolePill(user.role)}
                ${user.is_locked ? `<span class="status-pill status-locked">Locked</span>` : ""}
                ${canUnlock ? `<button type="button" class="success-btn" onclick="unlockStaffUser(${user.id})">Unlock</button>` : ""}
                ${unlockBlockedMsg}
            </div>
        </div>`;
    }).join("");
}

async function fetchStaffUsers() {
    if (!staffUserList || !isPrivileged()) return;
    try {
        const response = await fetch("/api/staff-users");
        const users = await handleJsonResponse(response);
        renderStaffUsers(users);
    } catch (error) { showMessage(error.message, true); }
}

async function unlockStaffUser(userId) {
    openConfirmModal("Unlock User", "Unlock this staff account?", async () => {
        try {
            const response = await fetch(`/api/staff-users/${userId}/unlock`, { method: "PATCH" });
            await handleJsonResponse(response);
            showToast("Staff user unlocked successfully.");
            fetchStaffUsers();
            fetchAuditLogs();
        } catch (error) { showToast(error.message, true); }
    });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
async function exportFile(url, filename) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Export failed.");
    const text = await response.text();
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
}

// ---------------------------------------------------------------------------
// Customer actions
// ---------------------------------------------------------------------------
async function viewCustomer(customerId) {
    try {
        const response = await fetch(`/api/customers/${customerId}`);
        const customer = await handleJsonResponse(response);

        renderCustomerDetail(customer);
        await fetchTransactionsForCustomer(customer.account_number);
        await fetchCustomerTimeline(customer.id);

        if (window.currentUserRole === "manager") {
            const editId = document.getElementById("edit-customer-id");
            const editName = document.getElementById("edit-full-name");
            const editEmail = document.getElementById("edit-email");
            if (editId) editId.value = customer.id;
            if (editName) editName.value = customer.full_name;
            if (editEmail) editEmail.value = customer.email;
        }

        document.getElementById("customer-view-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) { showMessage(error.message, true); }
}

async function startEditCustomer(customerId) {
    try {
        const response = await fetch(`/api/customers/${customerId}`);
        const customer = await handleJsonResponse(response);
        document.getElementById("edit-customer-id").value = customer.id;
        document.getElementById("edit-full-name").value = customer.full_name;
        document.getElementById("edit-email").value = customer.email;
        showEditMessage(`Loaded ${customer.full_name} into edit form.`);
        document.getElementById("edit-full-name").focus();
    } catch (error) { showEditMessage(error.message, true); }
}

async function deactivateCustomer(customerId) {
    openConfirmModal("Deactivate Customer", "Deactivate this customer account?", async () => {
        try {
            await handleJsonResponse(await fetch(`/api/customers/${customerId}/deactivate`, { method: "PATCH" }));
            showMessage("Customer deactivated successfully.");
            fetchCustomers(); fetchAuditLogs(); fetchDashboardSummary(); fetchChartData();
        } catch (error) { showMessage(error.message, true); }
    });
}

async function reactivateCustomer(customerId) {
    openConfirmModal("Activate Customer", "Reactivate this customer account?", async () => {
        try {
            await handleJsonResponse(await fetch(`/api/customers/${customerId}/reactivate`, { method: "PATCH" }));
            showMessage("Customer activated successfully.");
            fetchCustomers(); fetchAuditLogs(); fetchDashboardSummary(); fetchChartData();
        } catch (error) { showMessage(error.message, true); }
    });
}

async function deleteCustomer(customerId) {
    openConfirmModal("Delete Customer", "Delete this customer record?", async () => {
        try {
            await handleJsonResponse(await fetch(`/api/customers/${customerId}`, { method: "DELETE" }));
            showMessage("Customer deleted successfully.");
            fetchCustomers(); fetchAuditLogs(); fetchDashboardSummary(); fetchChartData();

            if (customerDetailPanel) customerDetailPanel.innerHTML = `<p class="muted-text">Select "View" on a customer to see their stored data.</p>`;
            if (customerTransactionsPanel) customerTransactionsPanel.innerHTML = `<div class="transaction-item"><p class="muted-text">Select "View" on a customer to load transactions.</p></div>`;
            if (customerTimelinePanel) customerTimelinePanel.innerHTML = `<div class="transaction-item"><p class="muted-text">Select "View" on a customer to load timeline events.</p></div>`;

            const editId = document.getElementById("edit-customer-id");
            const editName = document.getElementById("edit-full-name");
            const editEmail = document.getElementById("edit-email");
            if (editId) editId.value = "";
            if (editName) editName.value = "";
            if (editEmail) editEmail.value = "";
        } catch (error) { showMessage(error.message, true); }
    });
}

// ---------------------------------------------------------------------------
// Event listeners — search / pagination
// ---------------------------------------------------------------------------

// Set ARIA attributes on search input for autocomplete listbox pattern
if (customerSearchInput) {
    customerSearchInput.setAttribute("aria-autocomplete", "list");
    customerSearchInput.setAttribute("aria-controls", "customer-suggestions-listbox");
    customerSearchInput.setAttribute("aria-expanded", "false");
}

customerSearchInput?.addEventListener("input", updateSuggestions);

// Keyboard navigation: ArrowDown from input enters the suggestions list
customerSearchInput?.addEventListener("keydown", (event) => {
    if (!suggestionsBox || suggestionsBox.classList.contains("hidden")) return;
    if (event.key === "ArrowDown") {
        event.preventDefault();
        const first = suggestionsBox.querySelector(".suggestion-item");
        if (first) first.focus();
    } else if (event.key === "Escape") {
        event.preventDefault();
        suggestionsBox.classList.add("hidden");
        customerSearchInput.setAttribute("aria-expanded", "false");
        customerSearchInput.focus();
    }
});

// Keyboard navigation within the suggestions box
suggestionsBox?.addEventListener("keydown", (event) => {
    const items = Array.from(suggestionsBox.querySelectorAll(".suggestion-item"));
    const focused = document.activeElement;
    const idx = items.indexOf(focused);

    if (event.key === "ArrowDown") {
        event.preventDefault();
        if (idx < items.length - 1) items[idx + 1].focus();
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (idx > 0) {
            items[idx - 1].focus();
        } else {
            // Wrap back to input
            customerSearchInput?.focus();
        }
    } else if (event.key === "Escape") {
        event.preventDefault();
        suggestionsBox.classList.add("hidden");
        if (customerSearchInput) customerSearchInput.setAttribute("aria-expanded", "false");
        customerSearchInput?.focus();
    }
    // Enter is already handled by the button's click event
});

document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-wrapper")) {
        suggestionsBox?.classList.add("hidden");
        if (customerSearchInput) customerSearchInput.setAttribute("aria-expanded", "false");
    }
});

document.getElementById("customers-prev-btn")?.addEventListener("click", () => {
    if (customersPage > 0) { customersPage--; fetchCustomers(); }
});
document.getElementById("customers-next-btn")?.addEventListener("click", () => {
    customersPage++;
    fetchCustomers();
});
document.getElementById("transactions-prev-btn")?.addEventListener("click", () => {
    if (transactionsPage > 0) { transactionsPage--; fetchTransactions(); }
});
document.getElementById("transactions-next-btn")?.addEventListener("click", () => {
    transactionsPage++;
    fetchTransactions();
});

// ---------------------------------------------------------------------------
// Form: create customer
// ---------------------------------------------------------------------------
customerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const full_name = document.getElementById("full_name").value.trim();
    const email = document.getElementById("email").value.trim();
    const balance = parseInt(document.getElementById("balance").value, 10);
    if (!full_name || !email || Number.isNaN(balance)) {
        showMessage("Full name, email, and opening balance are required.", true);
        return;
    }
    try {
        setLoading(true);
        const createdCustomer = await handleJsonResponse(await fetch("/api/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ full_name, email, balance })
        }));
        customerForm.reset();
        document.getElementById("balance").value = 0;
        showMessage(`Customer created. Account: ${createdCustomer.account_number}`);
        fetchCustomers(true); fetchAuditLogs(); fetchDashboardSummary(); fetchChartData();
    } catch (error) { showMessage(error.message, true); }
    finally { setLoading(false); }
});

// ---------------------------------------------------------------------------
// Form: edit customer
// ---------------------------------------------------------------------------
editCustomerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const customerId = document.getElementById("edit-customer-id").value;
    const full_name = document.getElementById("edit-full-name").value.trim();
    const email = document.getElementById("edit-email").value.trim();
    if (!customerId) { showEditMessage("Select a customer first using the Edit button.", true); return; }
    if (!full_name || !email) { showEditMessage("Full name and email are required.", true); return; }
    try {
        setLoading(true);
        await handleJsonResponse(await fetch(`/api/customers/${customerId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ full_name, email })
        }));
        showEditMessage("Customer updated successfully.");
        fetchCustomers(); fetchAuditLogs(); fetchDashboardSummary();
        await viewCustomer(customerId);
    } catch (error) { showEditMessage(error.message, true); }
    finally { setLoading(false); }
});

// ---------------------------------------------------------------------------
// Forms: deposit / withdraw / transfer
// ---------------------------------------------------------------------------
depositForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const account_number = document.getElementById("deposit-account").value.trim();
    const amount = parseInt(document.getElementById("deposit-amount").value, 10);
    const description = document.getElementById("deposit-description").value.trim();
    try {
        setLoading(true);
        await handleJsonResponse(await fetch("/api/transactions/deposit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_number, amount, description })
        }));
        depositForm.reset();
        showMessage("Deposit completed successfully.");
        fetchCustomers(); fetchTransactions(true); fetchAuditLogs(); fetchDashboardSummary(); fetchChartData();
    } catch (error) { showMessage(error.message, true); }
    finally { setLoading(false); }
});

withdrawForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const account_number = document.getElementById("withdraw-account").value.trim();
    const amount = parseInt(document.getElementById("withdraw-amount").value, 10);
    const description = document.getElementById("withdraw-description").value.trim();
    try {
        setLoading(true);
        await handleJsonResponse(await fetch("/api/transactions/withdraw", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_number, amount, description })
        }));
        withdrawForm.reset();
        showMessage("Withdrawal completed successfully.");
        fetchCustomers(); fetchTransactions(true); fetchAuditLogs(); fetchDashboardSummary(); fetchChartData();
    } catch (error) { showMessage(error.message, true); }
    finally { setLoading(false); }
});

transferForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const from_account_number = document.getElementById("from_account_number").value.trim();
    const to_account_number = document.getElementById("to_account_number").value.trim();
    const amount = parseInt(document.getElementById("transfer_amount").value, 10);
    const description = document.getElementById("transfer_description").value.trim();
    openConfirmModal(
        "Confirm Transfer",
        `Transfer £${amount || 0} from ${from_account_number || "source"} to ${to_account_number || "destination"}?`,
        async () => {
            try {
                setLoading(true);
                await handleJsonResponse(await fetch("/api/transactions/transfer", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ from_account_number, to_account_number, amount, description })
                }));
                transferForm.reset();
                showMessage("Transfer completed successfully.");
                fetchCustomers(); fetchTransactions(true); fetchAuditLogs(); fetchDashboardSummary(); fetchChartData();
            } catch (error) { showMessage(error.message, true); }
            finally { setLoading(false); }
        }
    );
});

// ---------------------------------------------------------------------------
// Form: login
// ---------------------------------------------------------------------------
loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    try {
        setLoading(true);
        const data = await handleJsonResponse(await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        }));
        window.currentUserRole = data.role || "staff";
        if (data.must_change_password) {
            showLoginMessage("Login successful. You must change your default password before continuing.");
            setTimeout(() => {
                window.location.href = "/?change_password=1";
            }, 1200);
        } else {
            showLoginMessage(`Login successful. Role: ${window.currentUserRole}`);
            setTimeout(() => { window.location.href = "/"; }, 500);
        }
    } catch (error) { showLoginMessage(error.message, true); }
    finally { setLoading(false); }
});

// ---------------------------------------------------------------------------
// Form: create staff user (manager only)
// ---------------------------------------------------------------------------
createStaffForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.getElementById("new-staff-username").value.trim();
    const password = document.getElementById("new-staff-password").value;
    const role = document.getElementById("new-staff-role").value;
    try {
        setLoading(true);
        await handleJsonResponse(await fetch("/api/staff-users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, role })
        }));
        createStaffForm.reset();
        showCreateStaffMessage(`Staff user "${username}" created successfully.`);
        fetchStaffUsers(); fetchAuditLogs();
    } catch (error) { showCreateStaffMessage(error.message, true); }
    finally { setLoading(false); }
});

// ---------------------------------------------------------------------------
// Form: change password
// ---------------------------------------------------------------------------
changePasswordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const userId = document.getElementById("change-password-user-id").value;
    const current_password = document.getElementById("change-password-current").value;
    const new_password = document.getElementById("change-password-new").value;
    const confirm = document.getElementById("change-password-confirm").value;

    if (new_password !== confirm) {
        showChangePasswordMessage("New passwords do not match.", true);
        return;
    }
    if (!userId) {
        showChangePasswordMessage("Unable to determine user ID. Please reload the page.", true);
        return;
    }
    try {
        setLoading(true);
        await handleJsonResponse(await fetch(`/api/staff-users/${userId}/change-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ current_password, new_password })
        }));
        changePasswordForm.reset();
        showChangePasswordMessage("Password changed successfully.");
        fetchAuditLogs();
    } catch (error) { showChangePasswordMessage(error.message, true); }
    finally { setLoading(false); }
});

// ---------------------------------------------------------------------------
// Misc button listeners
// ---------------------------------------------------------------------------
logoutBtn?.addEventListener("click", async () => {
    try {
        await handleJsonResponse(await fetch("/api/auth/logout", { method: "POST" }));
        window.location.href = "/login";
    } catch (error) { showMessage(error.message, true); }
});

refreshBtn?.addEventListener("click", () => fetchCustomers(true));
searchCustomersBtn?.addEventListener("click", () => fetchCustomers(true));
refreshTransactionsBtn?.addEventListener("click", () => fetchTransactions(true));
filterTransactionsBtn?.addEventListener("click", () => fetchTransactions(true));
refreshAuditBtn?.addEventListener("click", fetchAuditLogs);

exportCustomersBtn?.addEventListener("click", async () => {
    try { await exportFile("/api/export/customers", "customers.csv"); showToast("Customers exported."); }
    catch (error) { showMessage(error.message, true); }
});
exportTransactionsBtn?.addEventListener("click", async () => {
    try { await exportFile("/api/export/transactions", "transactions.csv"); showToast("Transactions exported."); }
    catch (error) { showMessage(error.message, true); }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
(async () => {
    if (customerList || transactionList || auditList) {
        await fetchCurrentUser();
        await fetchCsrfToken();
    }

    if (customerList) {
        fetchDashboardSummary();
        fetchCustomers();
        fetchChartData();
        // Auto-refresh dashboard stats every 30 seconds
        setInterval(() => { fetchDashboardSummary(); fetchChartData(); }, 30000);
    }
    if (transactionList) fetchTransactions();
    if (auditList) fetchAuditLogs();
    if (staffUserList) fetchStaffUsers();

    // If redirected here after first login, scroll to and highlight the change-password section
    if (new URLSearchParams(window.location.search).get("change_password") === "1") {
        const cpSection = document.getElementById("change-password-form");
        if (cpSection) {
            cpSection.scrollIntoView({ behavior: "smooth", block: "center" });
            cpSection.querySelector("input")?.focus();
            showToast("Please change your default password to continue.", true);
        }
        // Clean the URL without reloading
        history.replaceState(null, "", window.location.pathname);
    }
})();

// ---------------------------------------------------------------------------
// Global exposure for inline onclick handlers
// ---------------------------------------------------------------------------
window.viewCustomer = viewCustomer;
window.startEditCustomer = startEditCustomer;
window.deactivateCustomer = deactivateCustomer;
window.reactivateCustomer = reactivateCustomer;
window.deleteCustomer = deleteCustomer;
window.unlockStaffUser = unlockStaffUser;
