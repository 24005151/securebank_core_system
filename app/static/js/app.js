const customerForm = document.getElementById("customer-form");
const depositForm = document.getElementById("deposit-form");
const withdrawForm = document.getElementById("withdraw-form");
const transferForm = document.getElementById("transfer-form");
const loginForm = document.getElementById("login-form");

const customerList = document.getElementById("customer-list");
const transactionList = document.getElementById("transaction-list");
const auditList = document.getElementById("audit-list");

const messageBox = document.getElementById("message");
const loginMessageBox = document.getElementById("login-message");

const refreshBtn = document.getElementById("refresh-btn");
const searchCustomersBtn = document.getElementById("search-customers-btn");
const refreshTransactionsBtn = document.getElementById("refresh-transactions-btn");
const filterTransactionsBtn = document.getElementById("filter-transactions-btn");
const refreshAuditBtn = document.getElementById("refresh-audit-btn");
const logoutBtn = document.getElementById("logout-btn");

function showMessage(message, isError = false) {
    if (!messageBox) return;
    messageBox.textContent = message;
    messageBox.style.color = isError ? "crimson" : "green";
    setTimeout(() => {
        messageBox.textContent = "";
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

function renderCustomers(customers) {
    if (!customerList) return;

    if (customers.length === 0) {
        customerList.innerHTML = "<p>No customer records found.</p>";
        return;
    }

    customerList.innerHTML = customers.map((customer) => `
        <div class="customer-item ${customer.is_active ? "" : "inactive"}">
            <h3>${escapeHtml(customer.full_name)}</h3>
            <p class="customer-meta"><strong>Email:</strong> ${escapeHtml(customer.email)}</p>
            <p class="customer-meta"><strong>Account Number:</strong> ${escapeHtml(customer.account_number)}</p>
            <p class="customer-meta"><strong>Balance:</strong> £${customer.balance}</p>
            <p class="customer-meta"><strong>Status:</strong> ${customer.is_active ? "Active" : "Inactive"}</p>
            <div class="customer-actions">
                ${customer.is_active ? `<button class="danger-btn" onclick="deactivateCustomer(${customer.id})">Deactivate</button>` : ""}
            </div>
        </div>
    `).join("");
}

function renderTransactions(transactions) {
    if (!transactionList) return;

    if (transactions.length === 0) {
        transactionList.innerHTML = "<p>No transactions found.</p>";
        return;
    }

    transactionList.innerHTML = transactions.map((transaction) => `
        <div class="transaction-item">
            <h3>${escapeHtml(transaction.transaction_type).toUpperCase()}</h3>
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
        auditList.innerHTML = "<p>No audit logs found.</p>";
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

async function fetchAuditLogs() {
    if (!auditList) return;

    try {
        const response = await fetch("/api/audit-logs");
        const logs = await handleJsonResponse(response);
        renderAuditLogs(logs);
    } catch (error) {
        showMessage(error.message, true);
    }
}

customerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const full_name = document.getElementById("full_name").value.trim();
    const email = document.getElementById("email").value.trim();
    const account_number = document.getElementById("account_number").value.trim();
    const balance = parseInt(document.getElementById("balance").value, 10);

    if (!full_name || !email || !account_number || Number.isNaN(balance)) {
        showMessage("All customer fields are required.", true);
        return;
    }

    try {
        const response = await fetch("/api/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ full_name, email, account_number, balance })
        });

        await handleJsonResponse(response);
        customerForm.reset();
        document.getElementById("balance").value = 0;
        showMessage("Customer created successfully.");
        fetchCustomers();
        fetchAuditLogs();
    } catch (error) {
        showMessage(error.message, true);
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
    } catch (error) {
        showMessage(error.message, true);
    }
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

        await handleJsonResponse(response);
        showLoginMessage("Login successful.");
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

async function deactivateCustomer(customerId) {
    const confirmed = confirm("Deactivate this customer account?");
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/customers/${customerId}/deactivate`, {
            method: "PATCH"
        });

        await handleJsonResponse(response);
        showMessage("Customer deactivated successfully.");
        fetchCustomers();
        fetchAuditLogs();
    } catch (error) {
        showMessage(error.message, true);
    }
}

refreshBtn?.addEventListener("click", fetchCustomers);
searchCustomersBtn?.addEventListener("click", fetchCustomers);
refreshTransactionsBtn?.addEventListener("click", fetchTransactions);
filterTransactionsBtn?.addEventListener("click", fetchTransactions);
refreshAuditBtn?.addEventListener("click", fetchAuditLogs);

if (customerList) {
    fetchCustomers();
}
if (transactionList) {
    fetchTransactions();
}
if (auditList) {
    fetchAuditLogs();
}

window.deactivateCustomer = deactivateCustomer;