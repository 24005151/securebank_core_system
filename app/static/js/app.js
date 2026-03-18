const customerForm = document.getElementById("customer-form");
const editCustomerForm = document.getElementById("edit-customer-form");
const depositForm = document.getElementById("deposit-form");
const withdrawForm = document.getElementById("withdraw-form");
const transferForm = document.getElementById("transfer-form");
const loginForm = document.getElementById("login-form");

const customerList = document.getElementById("customer-list");
const transactionList = document.getElementById("transaction-list");
const auditList = document.getElementById("audit-list");
const customerDetailPanel = document.getElementById("customer-detail-panel");
const customerTransactionsPanel = document.getElementById("customer-transactions-panel");
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

const confirmModal = document.getElementById("confirm-modal");
const modalTitle = document.getElementById("modal-title");
const modalMessage = document.getElementById("modal-message");
const modalConfirm = document.getElementById("modal-confirm");
const modalCancel = document.getElementById("modal-cancel");

let confirmAction = null;
window.currentUserRole = "staff";

function showMessage(message, isError = false) {
    if (!messageBox) return;
    messageBox.textContent = message;
    messageBox.style.color = isError ? "crimson" : "green";
    setTimeout(() => {
        messageBox.textContent = "";
    }, 3000);
}

function showEditMessage(message, isError = false) {
    if (!editMessageBox) return;
    editMessageBox.textContent = message;
    editMessageBox.style.color = isError ? "crimson" : "green";
    setTimeout(() => {
        editMessageBox.textContent = "";
    }, 3000);
}

function showLoginMessage(message, isError = false) {
    if (!loginMessageBox) return;
    loginMessageBox.textContent = message;
    loginMessageBox.style.color = isError ? "crimson" : "green";
    setTimeout(() => {
        loginMessageBox.textContent = "";
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
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

function renderDashboardSummary(summary) {
    const map = {
        "stat-total-customers": summary.total_customers,
        "stat-active-customers": summary.active_customers,
        "stat-inactive-customers": summary.inactive_customers,
        "stat-total-transactions": summary.total_transactions,
        "stat-total-balance": `£${summary.total_balance}`
    };

    Object.entries(map).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    });

    const safePercent = (value, total) => {
        if (!total || total <= 0) return "12%";
        return `${Math.max(12, Math.min(100, Math.round((value / total) * 100)))}%`;
    };

    const totalCustomers = summary.total_customers || 0;
    const totalTransactions = summary.total_transactions || 0;
    const totalBalance = summary.total_balance || 0;

    const barTotalCustomers = document.getElementById("bar-total-customers");
    const barActiveCustomers = document.getElementById("bar-active-customers");
    const barInactiveCustomers = document.getElementById("bar-inactive-customers");
    const barTotalTransactions = document.getElementById("bar-total-transactions");
    const barTotalBalance = document.getElementById("bar-total-balance");

    if (barTotalCustomers) {
        barTotalCustomers.style.width = safePercent(totalCustomers, Math.max(totalCustomers, 10));
    }
    if (barActiveCustomers) {
        barActiveCustomers.style.width = safePercent(summary.active_customers, totalCustomers || 1);
    }
    if (barInactiveCustomers) {
        barInactiveCustomers.style.width = safePercent(summary.inactive_customers, totalCustomers || 1);
    }
    if (barTotalTransactions) {
        barTotalTransactions.style.width = safePercent(totalTransactions, Math.max(totalTransactions, 10));
    }
    if (barTotalBalance) {
        barTotalBalance.style.width = safePercent(totalBalance, Math.max(totalBalance, 1000));
    }
}

function renderCustomers(customers) {
    if (!customerList) return;

    if (customers.length === 0) {
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
            <div class="customer-actions">
                <button onclick="viewCustomer(${customer.id})">View</button>
                ${managerActions ? `<button onclick="loadCustomerIntoEditForm(${customer.id}, ${JSON.stringify(customer.full_name)}, ${JSON.stringify(customer.email)})">Edit</button>` : ""}
                ${managerActions && customer.is_active ? `<button class="danger-btn" onclick="deactivateCustomer(${customer.id})">Deactivate</button>` : ""}
                ${managerActions ? `<button class="danger-btn" onclick="deleteCustomer(${customer.id})">Delete</button>` : ""}
            </div>
        </div>
    `).join("");
}

function transactionStatusClass(type) {
    if (type === "deposit") return "status-deposit";
    if (type === "withdraw") return "status-withdraw";
    if (type === "transfer") return "status-transfer";
    return "status-active";
}

function renderTransactions(transactions) {
    if (!transactionList) return;

    if (transactions.length === 0) {
        transactionList.innerHTML = `<div class="transaction-item"><p class="muted-text">No transactions found.</p></div>`;
        return;
    }

    transactionList.innerHTML = transactions.map((transaction) => `
        <div class="transaction-item">
            <h3>
                <span class="status-pill ${transactionStatusClass(transaction.transaction_type)}">
                    ${escapeHtml(transaction.transaction_type).toUpperCase()}
                </span>
            </h3>
            <p class="transaction-meta"><strong>Amount:</strong> £${transaction.amount}</p>
            <p class="transaction-meta"><strong>Description:</strong> ${escapeHtml(transaction.description || "")}</p>
            <p class="transaction-meta"><strong>From Customer ID:</strong> ${transaction.from_customer_id ?? "-"}</p>
            <p class="transaction-meta"><strong>To Customer ID:</strong> ${transaction.to_customer_id ?? "-"}</p>
            <p class="transaction-meta"><strong>Created:</strong> ${escapeHtml(transaction.created_at)}</p>
        </div>
    `).join("");
}

function renderCustomerTransactions(transactions, accountNumber) {
    if (!customerTransactionsPanel) return;

    if (transactions.length === 0) {
        customerTransactionsPanel.innerHTML = `
            <div class="transaction-item">
                <p class="muted-text">No transactions found for account ${escapeHtml(accountNumber)}.</p>
            </div>
        `;
        return;
    }

    customerTransactionsPanel.innerHTML = transactions.map((transaction) => `
        <div class="transaction-item">
            <h3>
                <span class="status-pill ${transactionStatusClass(transaction.transaction_type)}">
                    ${escapeHtml(transaction.transaction_type).toUpperCase()}
                </span>
            </h3>
            <p class="transaction-meta"><strong>Amount:</strong> £${transaction.amount}</p>
            <p class="transaction-meta"><strong>Description:</strong> ${escapeHtml(transaction.description || "")}</p>
            <p class="transaction-meta"><strong>From Customer ID:</strong> ${transaction.from_customer_id ?? "-"}</p>
            <p class="transaction-meta"><strong>To Customer ID:</strong> ${transaction.to_customer_id ?? "-"}</p>
            <p class="transaction-meta"><strong>Created:</strong> ${escapeHtml(transaction.created_at)}</p>
        </div>
    `).join("");
}

function renderAuditLogs(logs) {
    if (!auditList) return;

    if (logs.length === 0) {
        auditList.innerHTML = `<div class="audit-item"><p class="muted-text">No audit logs found.</p></div>`;
        return;
    }

    auditList.innerHTML = logs.map((log) => `
        <div class="audit-item">
            <h3>${escapeHtml(log.event_type)}</h3>
            <p class="audit-meta"><strong>Actor:</strong> ${escapeHtml(log.actor)}</p>
            <p class="audit-meta"><strong>Details:</strong> ${escapeHtml(log.details)}</p>
            <p class="audit-meta"><strong>Created:</strong> ${escapeHtml(log.created_at)}</p>
        </div>
    `).join("");

    if (recentActivityPanel) {
        const recent = logs.slice(0, 5);
        recentActivityPanel.innerHTML = recent.map((log) => `
            <div class="activity-item">
                <div class="activity-title">${escapeHtml(log.event_type)}</div>
                <div class="muted-text">${escapeHtml(log.details)}</div>
            </div>
        `).join("");
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
        </div>
    `;
}

async function handleJsonResponse(response) {
    const data = await response.json();

    if (!response.ok) {
        if (response.status === 401) {
            window.location.href = "/login";
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
    } catch (error) {
        window.currentUserRole = "staff";
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

async function fetchCustomers() {
    if (!customerList) return;

    const searchValue = document.getElementById("customer-search")?.value.trim() || "";
    const url = searchValue
        ? `/api/customers?search=${encodeURIComponent(searchValue)}`
        : "/api/customers";

    try {
        const response = await fetch(url);
        const customers = await handleJsonResponse(response);
        renderCustomers(customers);
    } catch (error) {
        showMessage(error.message, true);
    }
}

async function fetchTransactions() {
    if (!transactionList) return;

    const accountValue = document.getElementById("transaction-account-filter")?.value.trim() || "";
    const typeValue = document.getElementById("transaction-type-filter")?.value || "";

    const params = new URLSearchParams();
    if (accountValue) params.append("account_number", accountValue);
    if (typeValue) params.append("transaction_type", typeValue);

    const url = params.toString()
        ? `/api/transactions?${params.toString()}`
        : "/api/transactions";

    try {
        const response = await fetch(url);
        const transactions = await handleJsonResponse(response);
        renderTransactions(transactions);
    } catch (error) {
        showMessage(error.message, true);
    }
}

async function fetchTransactionsForCustomer(accountNumber) {
    if (!customerTransactionsPanel) return;

    try {
        const response = await fetch(`/api/transactions?account_number=${encodeURIComponent(accountNumber)}`);
        const transactions = await handleJsonResponse(response);
        renderCustomerTransactions(transactions, accountNumber);
    } catch (error) {
        showMessage(error.message, true);
    }
}

async function fetchAuditLogs() {
    if (!auditList) return;

    try {
        const response = await fetch("/api/audit-logs");
        const logs = await handleJsonResponse(response);
        renderAuditLogs(logs);
    } catch (error) {
        if (window.currentUserRole === "manager") {
            showMessage(error.message, true);
        } else if (auditList) {
            auditList.innerHTML = `<div class="audit-item"><p class="muted-text">Audit log is restricted to manager accounts.</p></div>`;
        }
        if (recentActivityPanel && window.currentUserRole !== "manager") {
            recentActivityPanel.innerHTML = `<p class="muted-text">Recent audit activity is available to manager accounts only.</p>`;
        }
    }
}

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
    } catch (error) {
        showMessage(error.message, true);
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

    try {
        const response = await fetch(`/api/customers/${customerId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ full_name, email })
        });

        await handleJsonResponse(response);
        showEditMessage("Customer updated successfully.");
        fetchCustomers();
        fetchAuditLogs();
        viewCustomer(customerId);
    } catch (error) {
        showEditMessage(error.message, true);
    }
});

depositForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const account_number = document.getElementById("deposit-account").value.trim();
    const amount = parseInt(document.getElementById("deposit-amount").value, 10);
    const description = document.getElementById("deposit-description").value.trim();

    try {
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
    } catch (error) {
        showMessage(error.message, true);
    }
});

withdrawForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const account_number = document.getElementById("withdraw-account").value.trim();
    const amount = parseInt(document.getElementById("withdraw-amount").value, 10);
    const description = document.getElementById("withdraw-description").value.trim();

    try {
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
    } catch (error) {
        showMessage(error.message, true);
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
            } catch (error) {
                showMessage(error.message, true);
            }
        }
    );
});

loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;

    try {
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

async function viewCustomer(customerId) {
    try {
        const response = await fetch(`/api/customers/${customerId}`);
        const customer = await handleJsonResponse(response);
        renderCustomerDetail(customer);
        fetchTransactionsForCustomer(customer.account_number);
    } catch (error) {
        showMessage(error.message, true);
    }
}

function loadCustomerIntoEditForm(customerId, fullName, email) {
    document.getElementById("edit-customer-id").value = customerId;
    document.getElementById("edit-full-name").value = fullName;
    document.getElementById("edit-email").value = email;
    showEditMessage("Customer loaded into edit form.");
}

async function deactivateCustomer(customerId) {
    openConfirmModal(
        "Deactivate Customer",
        "Deactivate this customer account?",
        async () => {
            try {
                const response = await fetch(`/api/customers/${customerId}/deactivate`, {
                    method: "PATCH"
                });

                await handleJsonResponse(response);
                showMessage("Customer deactivated successfully.");
                fetchCustomers();
                fetchAuditLogs();
                fetchDashboardSummary();
            } catch (error) {
                showMessage(error.message, true);
            }
        }
    );
}

async function deleteCustomer(customerId) {
    openConfirmModal(
        "Delete Customer",
        "Delete this customer record?",
        async () => {
            try {
                const response = await fetch(`/api/customers/${customerId}`, {
                    method: "DELETE"
                });

                await handleJsonResponse(response);
                showMessage("Customer deleted successfully.");
                fetchCustomers();
                fetchAuditLogs();
                fetchDashboardSummary();

                if (customerDetailPanel) {
                    customerDetailPanel.innerHTML = `<p class="muted-text">Select “View” on a customer to see their current stored data.</p>`;
                }

                if (customerTransactionsPanel) {
                    customerTransactionsPanel.innerHTML = `
                        <div class="transaction-item">
                            <p class="muted-text">Select “View” on a customer to load transactions for that customer.</p>
                        </div>
                    `;
                }

                document.getElementById("edit-customer-id").value = "";
                document.getElementById("edit-full-name").value = "";
                document.getElementById("edit-email").value = "";
            } catch (error) {
                showMessage(error.message, true);
            }
        }
    );
}

refreshBtn?.addEventListener("click", fetchCustomers);
searchCustomersBtn?.addEventListener("click", fetchCustomers);
refreshTransactionsBtn?.addEventListener("click", fetchTransactions);
filterTransactionsBtn?.addEventListener("click", fetchTransactions);
refreshAuditBtn?.addEventListener("click", fetchAuditLogs);

(async () => {
    if (customerList || transactionList || auditList) {
        await fetchCurrentUser();
    }

    if (customerList) {
        fetchDashboardSummary();
        fetchCustomers();
    }
    if (transactionList) {
        fetchTransactions();
    }
    if (auditList) {
        fetchAuditLogs();
    }
})();

window.deactivateCustomer = deactivateCustomer;
window.deleteCustomer = deleteCustomer;
window.viewCustomer = viewCustomer;
window.loadCustomerIntoEditForm = loadCustomerIntoEditForm;