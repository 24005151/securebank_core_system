const customerForm = document.getElementById("customer-form");
const customerList = document.getElementById("customer-list");
const messageBox = document.getElementById("message");
const refreshBtn = document.getElementById("refresh-btn");

function showMessage(message, isError = false) {
    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.style.color = isError ? "crimson" : "green";

    setTimeout(() => {
        messageBox.textContent = "";
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function renderCustomers(customers) {
    if (!customerList) return;

    if (customers.length === 0) {
        customerList.innerHTML = "<p>No customer records found.</p>";
        return;
    }

    customerList.innerHTML = customers.map(customer => `
        <div class="customer-item">
            <h3>${escapeHtml(customer.full_name)}</h3>
            <p class="customer-meta"><strong>Email:</strong> ${escapeHtml(customer.email)}</p>
            <p class="customer-meta"><strong>Account Number:</strong> ${escapeHtml(customer.account_number)}</p>
            <p class="customer-meta"><strong>Balance:</strong> £${customer.balance}</p>
            <p class="customer-meta"><strong>Status:</strong> ${customer.is_active ? "Active" : "Inactive"}</p>
        </div>
    `).join("");
}

async function fetchCustomers() {
    try {
        const response = await fetch("/api/customers/");
        const customers = await response.json();
        renderCustomers(customers);
    } catch (error) {
        showMessage("Failed to load customer records.", true);
    }
}

customerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const full_name = document.getElementById("full_name").value.trim();
    const email = document.getElementById("email").value.trim();
    const account_number = document.getElementById("account_number").value.trim();
    const balance = parseInt(document.getElementById("balance").value, 10);

    if (!full_name || !email || !account_number || Number.isNaN(balance)) {
        showMessage("All fields are required.", true);
        return;
    }

    try {
        const response = await fetch("/api/customers/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                full_name,
                email,
                account_number,
                balance
            })
        });

        const data = await response.json();

        if (!response.ok) {
            showMessage(data.detail || "Failed to create customer.", true);
            return;
        }

        customerForm.reset();
        document.getElementById("balance").value = 0;
        showMessage("Customer created successfully.");
        fetchCustomers();
    } catch (error) {
        showMessage("An error occurred while creating the customer.", true);
    }
});

refreshBtn?.addEventListener("click", fetchCustomers);

fetchCustomers();