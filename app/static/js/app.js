const API_KEY = "Devilcat1988";
const ORIGINAL_FETCH = window.fetch.bind(window);

window.fetch = (input, init = {}) => {
    const requestUrl = typeof input === "string" ? input : input.url;

    const shouldAttachApiKey =
        requestUrl.startsWith("/api/") ||
        requestUrl.startsWith("/api") ||
        requestUrl.includes("/api/");

    if (!shouldAttachApiKey) {
        return ORIGINAL_FETCH(input, init);
    }

    const headers = new Headers(init.headers || {});
    headers.set("X-API-Key", API_KEY);

    return ORIGINAL_FETCH(input, {
        ...init,
        headers
    });
};

const customerForm = document.getElementById("customer-form");
const editCustomerForm = document.getElementById("edit-customer-form");
const depositForm = document.getElementById("deposit-form");
const withdrawForm = document.getElementById("withdraw-form");
const transferForm = document.getElementById("transfer-form");
const loginForm = document.getElementById("login-form");

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

window.currentUserRole = "staff";
let confirmAction = null;
let cachedCustomers = [];
let customerChart = null;
let transactionChart = null;

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
}

function showMessage(message, isError = false) {
    if (!messageBox) return;
    messageBox.textContent = message;
    messageBox.style.color = isError ? "crimson" : "green";
    showToast(message, isError);
    setTimeout(() => {
        messageBox.textContent = "";
    }, 3000);
}

function showEditMessage(message, isError = false) {
    if (!editMessageBox) return;
    editMessageBox.textContent = message;
    editMessageBox.style.color = isError ? "crimson" : "green";
    showToast(message, isError);
    setTimeout(() => {
        editMessageBox.textContent = "";
    }, 3000);
}

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
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function openConfirmModal(title, message, onConfirm) {
    if (!confirmModal) return;
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    confirmAction = onConfirm;
    confirmModal.classList.remove("hidden");
}

function closeConfirmModal() {
    if (!confirmModal) return;
    confirmModal.classList.add("hidden");
    confirmAction = null;
}

modalConfirm?.addEventListener("click", async () => {
    if (confirmAction) {
        await confirmAction();
    }
    closeConfirmModal();
});

modalCancel?.addEventListener("click", closeConfirmModal);

confirmModal?.addEventListener("click", (event) => {
    if (event.target === confirmModal) {
        closeConfirmModal();
    }
});

async function handleJsonResponse(response) {
    let data;
    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        if (response.status === 401) {
            const detail = data.detail || "Request failed.";
            if (detail !== "Invalid username or password." &&
                detail !== "Account locked after repeated failed login attempts." &&
                detail !== "Invalid or missing API key.") {
                window.location.href = "/login";
            }
        }
        throw new Error(data.detail || "Request failed.");
    }

    return data;
}

async function fetchCurrentUser() {
    try {
        const response = await fetch("/api/auth/me");
        const user = await handleJsonResponse(response);
        window.currentUserRole = user.role || "staff";
    } catch (_) {
        window.currentUserRole = "staff";
    }
}

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
        const element = document.getElementById(id);
        if (element) element.textContent = value;
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
                datasets: [{
                    data: [data.customer_status.active, data.customer_status.inactive]
                }]
            }
        });
    }

    if (transactionCanvas) {
        transactionChart = new Chart(transactionCanvas, {
            type: "bar",
            data: {
                labels: ["Deposit", "Withdraw", "Transfer"],
                datasets: [{
                    data: [
                        data.transaction_types.deposit,
                        data.transaction_types.withdraw,
                        data.transaction_types.transfer
                    ]
                }]
            },
            options: {
                plugins: { legend: { display: false } }
            }
        });
    }
}

async function fetchDashboardSummary() {
    try {
        const response = await fetch("/api/dashboard-summary");
        const summary = await handleJsonResponse(response);
        renderDashboardSummary(summary);
    } catch (error) {
        showMessage(error.message, true);
    }
}

async function fetchChartData() {
    try {
        const response = await fetch("/api/chart-data");
        const data = await handleJsonResponse(response);
        renderCharts(data);
    } catch (error) {
        showMessage(error.message, true);
    }
}

function renderSuggestions(matches) {
    if (!suggestionsBox) return;
    if (!matches.length) {
        suggestionsBox.innerHTML = "";
        suggestionsBox.classList.add("hidden");
        return;
    }

    suggestionsBox.innerHTML = matches.map((customer) => `
        <button type="button" class="suggestion-item" data-id="${customer.id}">
            ${escapeHtml(customer.full_name)} - ${escapeHtml(customer.account_number)}
        </button>
    `).join("");

    suggestionsBox.classList.remove("hidden");

    suggestionsBox.querySelectorAll(".suggestion-item").forEach((button) => {
        button.addEventListener("click", async () => {
            const customerId = Number(button.dataset.id);
            suggestionsBox.classList.add("hidden");
            await viewCustomer(customerId);
        });
    });
}

function updateSuggestions() {
    if (!customerSearchInput) return;
    const query = customerSearchInput.value.trim().toLowerCase();
    if (!query) {
        renderSuggestions([]);
        return;
    }

    const matches = cachedCustomers
        .filter((customer) =>
            customer.full_name.toLowerCase().includes(query) ||
            customer.email.toLowerCase().includes(query) ||
            customer.account_number.toLowerCase().includes(query)
        )
        .slice(0, 6);

    renderSuggestions(matches);
}

function renderCustomers(customers) {
    if (!customerList) return;

    cachedCustomers = customers;

    if (!customers.length) {
        customerList.innerHTML = `<div class="customer-item"><p class="muted-text">No customer records found.</p></div>`;
        return;
    }

    const managerActions = window.currentUserRole === "manager";

    customerList.innerHTML = customers.map((customer) => `
        <div class="customer-item ${customer.is_active ? "" : "inactive"}">
            <h3>${escapeHtml(customer.full_name)}</h3>
            <p class="customer-meta"><strong>Email:</strong> ${escapeHtml(customer.email)}</p>
            <p class="customer-meta"><strong>Account Number:</strong> ${escapeHtml(customer.account_number)}</p>
            <p class="customer-meta"><strong>Balance:</strong> £${customer.balance}</p>
            <p class="customer-meta"><strong>Status:</strong>
                <span class="status-pill ${customer.is_active ? "status-active" : "status-inactive"}">
                    ${customer.is_active ? "Active" : "Inactive"}
                </span>
            </p>
            <p class="customer-meta"><strong>Created:</strong> ${escapeHtml(formatDateTime(customer.created_at))}</p>
            <div class="customer-actions">
                <button type="button" onclick="viewCustomer(${customer.id})">View</button>
                ${managerActions ? `<button type="button" onclick="startEditCustomer(${customer.id})">Edit</button>` : ""}
                ${managerActions && customer.is_active ? `<button type="button" class="danger-btn" onclick="deactivateCustomer(${customer.id})">Deactivate</button>` : ""}
                ${managerActions && !customer.is_active ? `<button type="button" onclick="reactivateCustomer(${customer.id})">Activate</button>` : ""}
                ${managerActions ? `<button type="button" class="danger-btn" onclick="deleteCustomer(${customer.id})">Delete</button>` : ""}
            </div>
        </div>
    `).join("");
}

async function fetchCustomers() {
    if (!customerList) return;

    const search = customerSearchInput?.value.trim() || "";
    const status = customerStatusFilter?.value || "";
    const sortBy = customerSortFilter?.value || "";

    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status) params.append("status", status);
    if (sortBy) params.append("sort_by", sortBy);

    const url = params.toString() ? `/api/customers?${params.toString()}` : "/api/customers";

    try {
        const response = await fetch(url);
        const customers = await handleJsonResponse(response);
        renderCustomers(customers);
    } catch (error) {
        showMessage(error.message, true);
    }
}

function renderCustomerDetail(customer) {
    if (!customerDetailPanel) return;

    customerDetailPanel.innerHTML = `
        <div class="customer-item ${customer.is_active ? "" : "inactive"}">
            <h3>${escapeHtml(customer.full_name)}</h3>
            <p class="customer-meta"><strong>Customer ID:</strong> ${customer.id}</p>
            <p class="customer-meta"><strong>Email:</strong> ${escapeHtml(customer.email)}</p>
            <p class="customer-meta"><strong>Account Number:</strong> ${escapeHtml(customer.account_number)}</p>
            <p class="customer-meta"><strong>Balance:</strong> £${customer.balance}</p>
            <p class="customer-meta"><strong>Status:</strong>
                <span class="status-pill ${customer.is_active ? "status-active" : "status-inactive"}">
                    ${customer.is_active ? "Active" : "Inactive"}
                </span>
            </p>
            <p class="customer-meta"><strong>Created:</strong> ${escapeHtml(formatDateTime(customer.created_at))}</p>
            <p class="customer-meta"><strong>Updated:</strong> ${escapeHtml(formatDateTime(customer.updated_at))}</p>
        </div>
    `;
}

function transactionStatusClass(type) {
    if (type === "deposit") return "status-deposit";
    if (type === "withdraw") return "status-withdraw";
    if (type === "transfer") return "status-transfer";
    return "status-active";
}

function renderTransactions(transactions, targetElement = transactionList, emptyText = "No transactions found.") {
    if (!targetElement) return;

    if (!transactions.length) {
        targetElement.innerHTML = `<div class="transaction-item"><p class="muted-text">${emptyText}</p></div>`;
        return;
    }

    targetElement.innerHTML = transactions.map((transaction) => `
        <div class="transaction-item">
            <h3>
                <span class="status-pill ${transactionStatusClass(transaction.transaction_type)}">
                    ${escapeHtml(transaction.transaction_type).toUpperCase()}
                </span>
                ${transaction.risk_flag ? '<span class="status-pill status-inactive">Flagged</span>' : ""}
            </h3>
            <p class="transaction-meta"><strong>Amount:</strong> £${transaction.amount}</p>
            <p class="transaction-meta"><strong>Description:</strong> ${escapeHtml(transaction.description || "")}</p>
            <p class="transaction-meta"><strong>From Customer ID:</strong> ${transaction.from_customer_id ?? "-"}</p>
            <p class="transaction-meta"><strong>To Customer ID:</strong> ${transaction.to_customer_id ?? "-"}</p>
            <p class="transaction-meta"><strong>Created:</strong> ${escapeHtml(formatDateTime(transaction.created_at))}</p>
        </div>
    `).join("");
}

async function fetchTransactions() {
    if (!transactionList) return;

    const account = document.getElementById("transaction-account-filter")?.value.trim() || "";
    const type = document.getElementById("transaction-type-filter")?.value || "";

    const params = new URLSearchParams();
    if (account) params.append("account_number", account);
    if (type) params.append("transaction_type", type);

    const url = params.toString() ? `/api/transactions?${params.toString()}` : "/api/transactions";

    try {
        const response = await fetch(url);
        const transactions = await handleJsonResponse(response);
        renderTransactions(transactions);
    } catch (error) {
        showMessage(error.message, true);
    }
}

async function fetchTransactionsForCustomer(accountNumber) {
    try {
        const response = await fetch(`/api/transactions?account_number=${encodeURIComponent(accountNumber)}`);
        const transactions = await handleJsonResponse(response);
        renderTransactions(
            transactions,
            customerTransactionsPanel,
            `No transactions found for account ${accountNumber}.`
        );
    } catch (error) {
        showMessage(error.message, true);
    }
}

function renderTimeline(items) {
    if (!customerTimelinePanel) return;

    if (!items.length) {
        customerTimelinePanel.innerHTML = `<div class="transaction-item"><p class="muted-text">No timeline events found.</p></div>`;
        return;
    }

    customerTimelinePanel.innerHTML = items.map((item) => `
        <div class="transaction-item">
            <h3>${escapeHtml(String(item.event_type).replaceAll("_", " ").toUpperCase())}</h3>
            <p class="transaction-meta"><strong>Description:</strong> ${escapeHtml(item.description)}</p>
            <p class="transaction-meta"><strong>Created:</strong> ${escapeHtml(formatDateTime(item.created_at))}</p>
        </div>
    `).join("");
}

async function fetchCustomerTimeline(customerId) {
    try {
        const response = await fetch(`/api/customers/${customerId}/timeline`);
        const timeline = await handleJsonResponse(response);
        renderTimeline(timeline);
    } catch (error) {
        showMessage(error.message, true);
    }
}

function renderAuditLogs(logs) {
    if (!auditList) return;

    if (!logs.length) {
        auditList.innerHTML = `<div class="audit-item"><p class="muted-text">No audit logs found.</p></div>`;
        return;
    }

    auditList.innerHTML = logs.map((log) => `
        <div class="audit-item">
            <h3>${escapeHtml(log.event_type)}</h3>
            <p class="audit-meta"><strong>Actor:</strong> ${escapeHtml(log.actor)}</p>
            <p class="audit-meta"><strong>Details:</strong> ${escapeHtml(log.details)}</p>
            <p class="audit-meta"><strong>Result:</strong> ${escapeHtml(log.result)}</p>
            <p class="audit-meta"><strong>IP:</strong> ${escapeHtml(log.ip_address || "-")}</p>
            <p class="audit-meta"><strong>Created:</strong> ${escapeHtml(formatDateTime(log.created_at))}</p>
        </div>
    `).join("");

    if (recentActivityPanel) {
        recentActivityPanel.innerHTML = logs.slice(0, 5).map((log) => `
            <div class="activity-item">
                <div class="activity-title">${escapeHtml(log.event_type)}</div>
                <div class="muted-text">${escapeHtml(log.details)}</div>
                <div class="muted-text">${escapeHtml(formatDateTime(log.created_at))}</div>
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
        if (window.currentUserRole === "manager") {
            showMessage(error.message, true);
        } else {
            auditList.innerHTML = `<div class="audit-item"><p class="muted-text">Audit log is restricted to manager accounts.</p></div>`;
        }
    }
}

function renderStaffUsers(users) {
    if (!staffUserList) return;

    if (window.currentUserRole !== "manager") {
        staffUserList.innerHTML = `<div class="transaction-item"><p class="muted-text">Manager access required.</p></div>`;
        return;
    }

    if (!users.length) {
        staffUserList.innerHTML = `<div class="transaction-item"><p class="muted-text">No staff users found.</p></div>`;
        return;
    }

    staffUserList.innerHTML = users.map((user) => `
        <div class="transaction-item">
            <h3>${escapeHtml(user.username)}</h3>
            <p class="transaction-meta"><strong>Role:</strong> ${escapeHtml(user.role)}</p>
            <p class="transaction-meta"><strong>Locked:</strong> ${user.is_locked ? "Yes" : "No"}</p>
            <p class="transaction-meta"><strong>Failed Attempts:</strong> ${user.failed_login_attempts}</p>
            <p class="transaction-meta"><strong>Created:</strong> ${escapeHtml(formatDateTime(user.created_at))}</p>
            ${user.is_locked ? `<button type="button" onclick="unlockStaffUser(${user.id})">Unlock Account</button>` : ""}
        </div>
    `).join("");
}

async function fetchStaffUsers() {
    if (!staffUserList || window.currentUserRole !== "manager") return;

    try {
        const response = await fetch("/api/staff-users");
        const users = await handleJsonResponse(response);
        renderStaffUsers(users);
    } catch (error) {
        showMessage(error.message, true);
    }
}

async function unlockStaffUser(userId) {
    openConfirmModal("Unlock User", "Unlock this staff account?", async () => {
        try {
            const response = await fetch(`/api/staff-users/${userId}/unlock`, {
                method: "PATCH"
            });
            await handleJsonResponse(response);
            showToast("Staff user unlocked successfully.");
            fetchStaffUsers();
            fetchAuditLogs();
        } catch (error) {
            showToast(error.message, true);
        }
    });
}

async function exportFile(url, filename) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Export failed.");
    }
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

        const detailSection = document.getElementById("customer-view-section");
        if (detailSection) {
            detailSection.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    } catch (error) {
        showMessage(error.message, true);
    }
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
    } catch (error) {
        showEditMessage(error.message, true);
    }
}

async function deactivateCustomer(customerId) {
    openConfirmModal("Deactivate Customer", "Deactivate this customer account?", async () => {
        try {
            const response = await fetch(`/api/customers/${customerId}/deactivate`, {
                method: "PATCH"
            });
            await handleJsonResponse(response);
            showMessage("Customer deactivated successfully.");
            fetchCustomers();
            fetchAuditLogs();
            fetchDashboardSummary();
            fetchChartData();
        } catch (error) {
            showMessage(error.message, true);
        }
    });
}

async function reactivateCustomer(customerId) {
    openConfirmModal("Activate Customer", "Reactivate this customer account?", async () => {
        try {
            const response = await fetch(`/api/customers/${customerId}/reactivate`, {
                method: "PATCH"
            });
            await handleJsonResponse(response);
            showMessage("Customer activated successfully.");
            fetchCustomers();
            fetchAuditLogs();
            fetchDashboardSummary();
            fetchChartData();
        } catch (error) {
            showMessage(error.message, true);
        }
    });
}

async function deleteCustomer(customerId) {
    openConfirmModal("Delete Customer", "Delete this customer record?", async () => {
        try {
            const response = await fetch(`/api/customers/${customerId}`, {
                method: "DELETE"
            });
            await handleJsonResponse(response);
            showMessage("Customer deleted successfully.");
            fetchCustomers();
            fetchAuditLogs();
            fetchDashboardSummary();
            fetchChartData();

            if (customerDetailPanel) {
                customerDetailPanel.innerHTML = `<p class="muted-text">Select “View” on a customer to see their stored data.</p>`;
            }
            if (customerTransactionsPanel) {
                customerTransactionsPanel.innerHTML = `<div class="transaction-item"><p class="muted-text">Select “View” on a customer to load transactions.</p></div>`;
            }
            if (customerTimelinePanel) {
                customerTimelinePanel.innerHTML = `<div class="transaction-item"><p class="muted-text">Select “View” on a customer to load timeline events.</p></div>`;
            }

            const editId = document.getElementById("edit-customer-id");
            const editName = document.getElementById("edit-full-name");
            const editEmail = document.getElementById("edit-email");

            if (editId) editId.value = "";
            if (editName) editName.value = "";
            if (editEmail) editEmail.value = "";
        } catch (error) {
            showMessage(error.message, true);
        }
    });
}

customerSearchInput?.addEventListener("input", updateSuggestions);

document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-wrapper")) {
        suggestionsBox?.classList.add("hidden");
    }
});

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
        const response = await fetch("/api/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ full_name, email, balance })
        });

        const createdCustomer = await handleJsonResponse(response);
        customerForm.reset();
        document.getElementById("balance").value = 0;
        showMessage(`Customer created successfully. Account Number: ${createdCustomer.account_number}`);
        fetchCustomers();
        fetchAuditLogs();
        fetchDashboardSummary();
        fetchChartData();
    } catch (error) {
        showMessage(error.message, true);
    } finally {
        setLoading(false);
    }
});

editCustomerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const customerId = document.getElementById("edit-customer-id").value;
    const full_name = document.getElementById("edit-full-name").value.trim();
    const email = document.getElementById("edit-email").value.trim();

    if (!customerId) {
        showEditMessage("Select a customer first using the Edit button.", true);
        return;
    }

    if (!full_name || !email) {
        showEditMessage("Full name and email are required.", true);
        return;
    }

    try {
        setLoading(true);
        const response = await fetch(`/api/customers/${customerId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ full_name, email })
        });

        await handleJsonResponse(response);
        showEditMessage("Customer updated successfully.");
        fetchCustomers();
        fetchAuditLogs();
        fetchDashboardSummary();
        await viewCustomer(customerId);
    } catch (error) {
        showEditMessage(error.message, true);
    } finally {
        setLoading(false);
    }
});

depositForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const account_number = document.getElementById("deposit-account").value.trim();
    const amount = parseInt(document.getElementById("deposit-amount").value, 10);
    const description = document.getElementById("deposit-description").value.trim();

    try {
        setLoading(true);
        const response = await fetch("/api/transactions/deposit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_number, amount, description })
        });

        await handleJsonResponse(response);
        depositForm.reset();
        showMessage("Deposit completed successfully.");
        fetchCustomers();
        fetchTransactions();
        fetchAuditLogs();
        fetchDashboardSummary();
        fetchChartData();
    } catch (error) {
        showMessage(error.message, true);
    } finally {
        setLoading(false);
    }
});

withdrawForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const account_number = document.getElementById("withdraw-account").value.trim();
    const amount = parseInt(document.getElementById("withdraw-amount").value, 10);
    const description = document.getElementById("withdraw-description").value.trim();

    try {
        setLoading(true);
        const response = await fetch("/api/transactions/withdraw", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_number, amount, description })
        });

        await handleJsonResponse(response);
        withdrawForm.reset();
        showMessage("Withdrawal completed successfully.");
        fetchCustomers();
        fetchTransactions();
        fetchAuditLogs();
        fetchDashboardSummary();
        fetchChartData();
    } catch (error) {
        showMessage(error.message, true);
    } finally {
        setLoading(false);
    }
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
                const response = await fetch("/api/transactions/transfer", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        from_account_number,
                        to_account_number,
                        amount,
                        description
                    })
                });

                await handleJsonResponse(response);
                transferForm.reset();
                showMessage("Transfer completed successfully.");
                fetchCustomers();
                fetchTransactions();
                fetchAuditLogs();
                fetchDashboardSummary();
                fetchChartData();
            } catch (error) {
                showMessage(error.message, true);
            } finally {
                setLoading(false);
            }
        }
    );
});

loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;

    try {
        setLoading(true);
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        const data = await handleJsonResponse(response);
        window.currentUserRole = data.role || "staff";
        showLoginMessage(`Login successful. Role: ${window.currentUserRole}`);
        setTimeout(() => {
            window.location.href = "/";
        }, 500);
    } catch (error) {
        showLoginMessage(error.message, true);
    } finally {
        setLoading(false);
    }
});

logoutBtn?.addEventListener("click", async () => {
    try {
        const response = await fetch("/api/auth/logout", { method: "POST" });
        await handleJsonResponse(response);
        window.location.href = "/login";
    } catch (error) {
        showMessage(error.message, true);
    }
});

refreshBtn?.addEventListener("click", fetchCustomers);
searchCustomersBtn?.addEventListener("click", fetchCustomers);
refreshTransactionsBtn?.addEventListener("click", fetchTransactions);
filterTransactionsBtn?.addEventListener("click", fetchTransactions);
refreshAuditBtn?.addEventListener("click", fetchAuditLogs);

exportCustomersBtn?.addEventListener("click", async () => {
    try {
        await exportFile("/api/export/customers", "customers.csv");
        showToast("Customers exported successfully.");
    } catch (error) {
        showMessage(error.message, true);
    }
});

exportTransactionsBtn?.addEventListener("click", async () => {
    try {
        await exportFile("/api/export/transactions", "transactions.csv");
        showToast("Transactions exported successfully.");
    } catch (error) {
        showMessage(error.message, true);
    }
});

(async () => {
    if (customerList || transactionList || auditList) {
        await fetchCurrentUser();
    }

    if (customerList) {
        fetchDashboardSummary();
        fetchCustomers();
        fetchChartData();
    }
    if (transactionList) {
        fetchTransactions();
    }
    if (auditList) {
        fetchAuditLogs();
    }
    if (staffUserList) {
        fetchStaffUsers();
    }
})();

window.viewCustomer = viewCustomer;
window.startEditCustomer = startEditCustomer;
window.deactivateCustomer = deactivateCustomer;
window.reactivateCustomer = reactivateCustomer;
window.deleteCustomer = deleteCustomer;
window.unlockStaffUser = unlockStaffUser;