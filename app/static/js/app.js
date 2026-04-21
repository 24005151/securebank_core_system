/**
 * SecureBank — main frontend logic (app.js)
 *
 * I handle all client-side behaviour for the dashboard:
 *   - CSRF token injection on every mutating fetch request.
 *   - DOM references and module-level state.
 *   - UI helpers (toast, loading overlay, confirm modal).
 *   - Dashboard stats and chart rendering.
 *   - Customer list with search, sorting, and pagination.
 *   - Customer detail panel with rich stats and quick actions.
 *   - Transaction list with pagination.
 *   - Audit log list.
 *   - Staff user list with unlock and create.
 *   - All form submission handlers.
 *   - Event delegation for all button actions (required by
 *     the Content-Security-Policy that blocks inline onclick).
 *   - Customer detail panel live search.
 *
 * I use event delegation on list containers instead of adding
 * onclick attributes to individual elements.  This complies
 * with the strict CSP (script-src 'self') applied by the
 * SecurityHeadersMiddleware in main.py.
 */

// ---------------------------------------------------------------------------
// CSRF: intercept all mutating fetch calls and inject the token
// ---------------------------------------------------------------------------

/**
 * I keep a reference to the real window.fetch so I can call it
 * from inside my wrapper without infinite recursion.
 */
const ORIGINAL_FETCH = window.fetch.bind(window);

/** Module-level CSRF token — populated by fetchCsrfToken(). */
let csrfToken = null;

/**
 * I replace window.fetch with a wrapper that automatically adds
 * the X-CSRF-Token header on every POST, PUT, PATCH, and DELETE
 * request once the token has been fetched.
 *
 * GET requests are left unchanged because they do not need CSRF
 * protection (they have no side effects).
 */
window.fetch = (input, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    if (csrfToken && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        const headers = new Headers(init.headers || {});
        headers.set("X-CSRF-Token", csrfToken);
        init = { ...init, headers };
    }
    return ORIGINAL_FETCH(input, init);
};

/**
 * Fetch the CSRF token from the server and store it in csrfToken.
 *
 * I call this once on page load (inside the init IIFE below).
 * I use ORIGINAL_FETCH so this request itself is not subject to
 * the CSRF-injection wrapper (it is a GET and needs no token).
 * Errors are silently swallowed — on the login page there is
 * no active session so the endpoint returns 401, which is fine.
 */
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
// Dark mode — initialised immediately so it runs before anything else
// and cannot be blocked by a later runtime error.
// ---------------------------------------------------------------------------

(function initDarkMode() {
    const DARK_VARS = {
        "--bg":           "#0f172a",
        "--card":         "#1e293b",
        "--sidebar":      "#070f1d",
        "--text":         "#e2e8f0",
        "--muted":        "#94a3b8",
        "--border":       "#334155",
        "--border-strong":"#475569",
        "--primary":      "#3b82f6",
        "--primary-dark": "#2563eb",
        "--primary-light":"rgba(59,130,246,0.12)",
        "--success-light":"rgba(22,163,74,0.15)",
        "--warning-light":"rgba(234,88,12,0.15)",
        "--danger-light": "rgba(220,38,38,0.15)",
        "--info-light":   "rgba(8,145,178,0.15)",
        "--purple-light": "rgba(124,58,237,0.15)",
        "--shadow":       "0 1px 3px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.2)",
        "--shadow-hover": "0 4px 16px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.2)",
        "--shadow-lg":    "0 10px 30px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)",
    };
    const LIGHT_VARS = {
        "--bg":           "#f1f5f9",
        "--card":         "#ffffff",
        "--sidebar":      "#0f172a",
        "--text":         "#0f172a",
        "--muted":        "#64748b",
        "--border":       "#e2e8f0",
        "--border-strong":"#cbd5e1",
        "--primary":      "#2563eb",
        "--primary-dark": "#1d4ed8",
        "--primary-light":"#eff6ff",
        "--success-light":"#f0fdf4",
        "--warning-light":"#fff7ed",
        "--danger-light": "#fef2f2",
        "--info-light":   "#ecfeff",
        "--purple-light": "#f5f3ff",
        "--shadow":       "0 1px 3px rgba(15,23,42,0.06), 0 4px 12px rgba(15,23,42,0.05)",
        "--shadow-hover": "0 4px 16px rgba(15,23,42,0.1), 0 1px 4px rgba(15,23,42,0.05)",
        "--shadow-lg":    "0 10px 30px rgba(15,23,42,0.12), 0 2px 8px rgba(15,23,42,0.06)",
    };

    function applyVars(vars) {
        const root = document.documentElement;
        for (const [prop, val] of Object.entries(vars)) {
            root.style.setProperty(prop, val);
        }
    }

    function applyDarkMode(enabled) {
        document.body.classList.toggle("dark-mode", enabled);
        applyVars(enabled ? DARK_VARS : LIGHT_VARS);
        if (enabled) {
            document.body.style.background = "linear-gradient(180deg, #0b1120 0%, #0f172a 100%)";
        } else {
            document.body.style.background = "";
        }
        const darkIcon    = document.getElementById("dark-icon");
        const lightIcon   = document.getElementById("light-icon");
        const label       = document.getElementById("dark-mode-label");
        if (darkIcon)  darkIcon.style.display  = enabled ? "none" : "";
        if (lightIcon) lightIcon.style.display = enabled ? "" : "none";
        if (label)     label.textContent        = enabled ? "Light mode" : "Dark mode";
        localStorage.setItem("darkMode", String(enabled));
    }

    // Expose for the button listener wired below.
    window._applyDarkMode = applyDarkMode;

    // Apply preference immediately on load.
    const saved = localStorage.getItem("darkMode");
    if (saved !== null) {
        applyDarkMode(saved === "true");
    } else {
        applyDarkMode(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }

    // Wire by ID, class, or delegated footer click — whichever finds it.
    const btn = document.getElementById("dark-mode-toggle")
             || document.querySelector(".footer-dark-btn");
    if (btn) {
        btn.addEventListener("click", () => {
            applyDarkMode(!document.body.classList.contains("dark-mode"));
        });
    } else {
        // Last-resort: delegate from document so it works regardless of
        // when the button enters the DOM.
        document.addEventListener("click", (e) => {
            if (e.target.closest("#dark-mode-toggle, .footer-dark-btn")) {
                applyDarkMode(!document.body.classList.contains("dark-mode"));
            }
        });
    }
})();

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

/* --- Forms --- */
const customerForm         = document.getElementById("customer-form");
const editCustomerForm     = document.getElementById("edit-customer-form");
const depositForm          = document.getElementById("deposit-form");
const withdrawForm         = document.getElementById("withdraw-form");
const transferForm         = document.getElementById("transfer-form");
const loginForm            = document.getElementById("login-form");
const createStaffForm      = document.getElementById("create-staff-form");
const changePasswordForm   = document.getElementById("change-password-form");

/* --- List panels — populated by render* functions --- */
const customerList              = document.getElementById("customer-list");
const transactionList           = document.getElementById("transaction-list");
const auditList                 = document.getElementById("audit-list");
const staffUserList             = document.getElementById("staff-user-list");
const customerDetailPanel       = document.getElementById("customer-detail-panel");
const customerTransactionsPanel = document.getElementById("customer-transactions-panel");
const customerTimelinePanel     = document.getElementById("customer-timeline-panel");
const recentActivityPanel       = document.getElementById("recent-activity-panel");

/* --- Inline message boxes (next to their own form) --- */
const messageBox              = document.getElementById("message");
const editMessageBox          = document.getElementById("edit-message");
const loginMessageBox         = document.getElementById("login-message");
const createStaffMessageBox   = document.getElementById("create-staff-message");
const changePasswordMessageBox = document.getElementById("change-password-message");

/* --- Action buttons --- */
const refreshBtn              = document.getElementById("refresh-btn");
const searchCustomersBtn      = document.getElementById("search-customers-btn");
const refreshTransactionsBtn  = document.getElementById("refresh-transactions-btn");
const filterTransactionsBtn   = document.getElementById("filter-transactions-btn");
const refreshAuditBtn         = document.getElementById("refresh-audit-btn");
const logoutBtn               = document.getElementById("logout-btn");
const exportCustomersBtn      = document.getElementById("export-customers-btn");
const exportTransactionsBtn   = document.getElementById("export-transactions-btn");

/* --- Search / filter inputs --- */
const customerSearchInput  = document.getElementById("customer-search");
const customerStatusFilter = document.getElementById("customer-status-filter");
const customerSortFilter   = document.getElementById("customer-sort-filter");
const suggestionsBox       = document.getElementById("customer-search-suggestions");

const auditActorFilter  = document.getElementById("audit-actor-filter");
const auditEventFilter  = document.getElementById("audit-event-filter");
const auditResultFilter = document.getElementById("audit-result-filter");
const auditDateFrom     = document.getElementById("audit-date-from");
const auditDateTo       = document.getElementById("audit-date-to");

/* --- Confirm modal elements --- */
const confirmModal  = document.getElementById("confirm-modal");
const modalTitle    = document.getElementById("modal-title");
const modalMessage  = document.getElementById("modal-message");
const modalConfirm  = document.getElementById("modal-confirm");
const modalCancel   = document.getElementById("modal-cancel");

/* --- Toast container and loading overlay --- */
const toastContainer  = document.getElementById("toast-container");
const loadingOverlay  = document.getElementById("loading-overlay");

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/**
 * Current user's role — set by fetchCurrentUser() after login.
 * I default to 'staff' (least privilege) so the UI is safe
 * even if the role fetch fails.
 */
window.currentUserRole = "staff";

/** Callback stored by openConfirmModal and executed on confirm. */
let confirmAction = null;

/**
 * In-memory copy of the most recently fetched customer list.
 * I use this to filter suggestions client-side without a
 * round-trip for every keystroke.
 */
let cachedCustomers = [];

/** Chart.js instances — destroyed and recreated on each refresh. */
let customerChart       = null;
let transactionChart    = null;
let balanceHistoryChart = null;

/** Number of records per page for all paginated lists. */
const PAGE_SIZE = 50;

/** Zero-based current page indices for the two paginated lists. */
let customersPage    = 0;
let transactionsPage = 0;

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

/**
 * Display a brief toast notification at the bottom of the page.
 *
 * @param {string}  message  - Text to display.
 * @param {boolean} isError  - True for red error styling.
 */
function showToast(message, isError = false) {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast ${isError ? "toast-error" : "toast-success"}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    // Auto-remove after 3 seconds.
    setTimeout(() => toast.remove(), 3000);
}

/**
 * Show or hide the full-page loading overlay.
 * I also set aria-busy on the body so screen readers announce
 * that content is loading.
 *
 * @param {boolean} show - True to show the overlay.
 */
function setLoading(show) {
    if (!loadingOverlay) return;
    loadingOverlay.classList.toggle("hidden", !show);
    document.body.setAttribute("aria-busy", show ? "true" : "false");
}

/**
 * Display a message in a form's inline status box.
 * I also fire a toast so the message is visible even if the
 * user has scrolled away from the form.
 *
 * @param {HTMLElement|null} box      - The status <p> element.
 * @param {string}           message  - Text to display.
 * @param {boolean}          isError  - True for red error styling.
 */
function _showStatusMessage(box, message, isError) {
    if (!box) return;
    box.textContent = message;
    box.style.color = isError ? "crimson" : "green";
    box.setAttribute("role", isError ? "alert" : "status");
    showToast(message, isError);
    setTimeout(() => { box.textContent = ""; }, 3000);
}

/** Show a message in the customer-create form's status box. */
function showMessage(message, isError = false) {
    _showStatusMessage(messageBox, message, isError);
}

/** Show a message in the customer-edit form's status box. */
function showEditMessage(message, isError = false) {
    _showStatusMessage(editMessageBox, message, isError);
}

/** Show a message in the create-staff form's status box. */
function showCreateStaffMessage(message, isError = false) {
    _showStatusMessage(createStaffMessageBox, message, isError);
}

/**
 * Open the shared detail/info modal with arbitrary HTML content.
 * Used for click-to-expand rows (transactions, audit logs, staff).
 *
 * @param {string} title       - Modal heading.
 * @param {string} contentHtml - Safe HTML to render in the body.
 */
function openDetailModal(title, contentHtml) {
    const modal = document.getElementById("detail-modal");
    const titleEl = document.getElementById("detail-modal-title");
    const bodyEl  = document.getElementById("detail-modal-body");
    if (!modal || !titleEl || !bodyEl) return;
    titleEl.textContent = title;
    bodyEl.innerHTML    = contentHtml;
    modal.classList.remove("hidden");
    document.getElementById("detail-modal-close")?.focus();
}

/** Close the detail modal. */
function closeDetailModal() {
    document.getElementById("detail-modal")?.classList.add("hidden");
}

// Wire the close button and backdrop click for the detail modal.
document.getElementById("detail-modal-close")?.addEventListener("click", closeDetailModal);
document.getElementById("detail-modal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeDetailModal();
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetailModal();
});

/** Show a message in the change-password form's status box. */
function showChangePasswordMessage(message, isError = false) {
    _showStatusMessage(changePasswordMessageBox, message, isError);
}

/**
 * Display a message on the login page.
 * The login page does not use a toast — it writes directly to
 * the inline message element which is announced by aria-live.
 *
 * @param {string}  message  - Text to display.
 * @param {boolean} isError  - True for red error styling.
 */
function showLoginMessage(message, isError = false) {
    if (!loginMessageBox) return;
    loginMessageBox.textContent = message;
    loginMessageBox.style.color = isError ? "crimson" : "green";
    showToast(message, isError);
}

/**
 * Safely HTML-encode a string for injection into innerHTML.
 * I route all user-supplied data through this before rendering
 * it in the DOM to prevent XSS.
 *
 * @param   {*}      text - Value to encode (coerced to string).
 * @returns {string}      - HTML-safe string.
 */
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}

/**
 * Format an ISO-8601 datetime string for display.
 * I use the user's local locale with a consistent format:
 * "07 Apr 2026, 14:30".
 *
 * @param   {string|null} value - ISO datetime string or null.
 * @returns {string}            - Formatted string or "-".
 */
function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

/**
 * Format a pence integer as a pounds-and-pence string with £ symbol.
 * Always shows two decimal places, e.g. fmt(4100) → "£41.00".
 *
 * @param {number} pence - Integer amount in pence.
 * @returns {string}
 */
function fmt(pence) {
    return `£${(pence / 100).toLocaleString("en-GB", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

// ---------------------------------------------------------------------------
// Confirm modal
// ---------------------------------------------------------------------------

/**
 * Tracks the element that was focused before the modal opened
 * so I can restore focus when it closes (WCAG 2.1 requirement).
 */
let _modalPreviousFocus = null;

/**
 * Open the confirmation modal with a custom title and message.
 *
 * @param {string}   title     - Modal heading text.
 * @param {string}   message   - Confirmation question text.
 * @param {Function} onConfirm - Async callback to run on confirm.
 */
function openConfirmModal(title, message, onConfirm) {
    if (!confirmModal) return;
    _modalPreviousFocus = document.activeElement;
    modalTitle.textContent   = title;
    modalMessage.textContent = message;
    confirmAction = onConfirm;
    confirmModal.classList.remove("hidden");
    // Move focus into the modal — default to Cancel for safety.
    modalCancel?.focus();
}

/**
 * Close the confirmation modal and restore focus to the element
 * that triggered it.
 */
function closeConfirmModal() {
    if (!confirmModal) return;
    confirmModal.classList.add("hidden");
    confirmAction = null;
    if (_modalPreviousFocus &&
            typeof _modalPreviousFocus.focus === "function") {
        _modalPreviousFocus.focus();
    }
    _modalPreviousFocus = null;
}

/* Wire up modal button and backdrop-click handlers. */
modalConfirm?.addEventListener("click", async () => {
    if (confirmAction) await confirmAction();
    closeConfirmModal();
});
modalCancel?.addEventListener("click", closeConfirmModal);
// Click outside the modal card to dismiss.
confirmModal?.addEventListener("click", (event) => {
    if (event.target === confirmModal) closeConfirmModal();
});

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

/**
 * Parse a fetch Response as JSON and throw on HTTP errors.
 *
 * I redirect to the login page on 401 responses, except for
 * the login endpoint itself (which legitimately returns 401 for
 * bad credentials).
 *
 * @param   {Response} response - The fetch Response object.
 * @returns {*}                 - Parsed JSON body.
 * @throws  {Error}             - With the API's detail message.
 */
async function handleJsonResponse(response) {
    let data;
    try { data = await response.json(); } catch { data = {}; }

    if (!response.ok) {
        if (response.status === 401) {
            const detail = data.detail || "Request failed.";
            // Do not redirect for expected 401s from the login
            // endpoint — the error is shown inline instead.
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

/**
 * Fetch the current session user from /api/auth/me and update
 * role-dependent UI elements.
 *
 * I set window.currentUserRole so the isPrivileged() and
 * isSuperadmin() helpers work correctly throughout the page.
 * I also populate the change-password user-id field and add
 * the superadmin role option to the create-staff form if
 * the current user has superadmin role.
 */
async function fetchCurrentUser() {
    try {
        const response = await fetch("/api/auth/me");
        const user = await handleJsonResponse(response);
        window.currentUserRole = user.role || "staff";

        // Pre-fill the hidden user-id field so the change-
        // password form knows which account to update.
        const cpUserId = document.getElementById("change-password-user-id");
        if (cpUserId && user.id) cpUserId.value = user.id;

        // Superadmins get an extra role option in the
        // create-staff form — only add it once.
        if (isSuperadmin()) {
            const roleSelect = document.getElementById("new-staff-role");
            if (roleSelect &&
                    !roleSelect.querySelector("option[value='superadmin']")) {
                const opt = document.createElement("option");
                opt.value       = "superadmin";
                opt.textContent = "Superadmin";
                roleSelect.appendChild(opt);
            }
        }
    } catch (_) {
        // Not authenticated or page is the login page — safe
        // to default to staff (least privilege).
        window.currentUserRole = "staff";
    }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/**
 * Render dashboard metric values into their respective elements.
 * I map stat IDs to values from the API summary object.
 *
 * @param {Object} summary - DashboardSummaryResponse from the API.
 */
function renderDashboardSummary(summary) {
    const values = {
        "stat-total-customers":       summary.total_customers,
        "stat-active-customers":      summary.active_customers,
        "stat-inactive-customers":    summary.inactive_customers,
        "stat-suspicious-transactions": summary.suspicious_transactions,
        "stat-low-balance-customers": summary.low_balance_customers,
        "stat-total-transactions":    summary.total_transactions,
        "stat-total-balance":         fmt(summary.total_balance)
    };
    Object.entries(values).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    });
}

/**
 * Render or re-render the two Chart.js charts.
 * I destroy existing instances before creating new ones to
 * prevent canvas memory leaks.
 *
 * @param {Object} data - ChartDataResponse from the API.
 */
function renderCharts(data) {
    // Chart.js is loaded via CDN — bail out if it failed to load.
    if (typeof Chart === "undefined") return;

    const customerCanvas    = document.getElementById("customerStatusChart");
    const transactionCanvas = document.getElementById("transactionTypeChart");

    // Destroy existing instances before redrawing.
    if (customerChart)    customerChart.destroy();
    if (transactionChart) transactionChart.destroy();

    if (customerCanvas) {
        customerChart = new Chart(customerCanvas, {
            type: "doughnut",
            data: {
                labels: ["Active", "Inactive"],
                datasets: [{
                    data: [
                        data.customer_status.active,
                        data.customer_status.inactive
                    ]
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
            options: { plugins: { legend: { display: false } } }
        });
    }
}

/**
 * Compute and render a balance-over-time line chart for a customer.
 *
 * I derive historical balances by starting from the customer's
 * current balance and working backwards through their transactions
 * (oldest first after reversing the newest-first API order).
 * Each step reconstructs what the balance was before that transaction.
 *
 * @param {Object} customer     - CustomerResponse object.
 * @param {Array}  transactions - TransactionResponse array, newest first.
 */
function renderBalanceHistory(customer, transactions) {
    if (typeof Chart === "undefined") return;
    const canvas  = document.getElementById("balanceHistoryChart");
    const section = document.getElementById("balance-history-section");
    if (!canvas || !section) return;

    if (!transactions.length) {
        section.style.display = "none";
        return;
    }

    // Build balance series working backwards from current balance.
    const chronological = [...transactions].reverse(); // oldest first
    let balance = customer.balance;
    const points = [];

    // Walk backwards to derive balance before each transaction.
    for (let i = chronological.length - 1; i >= 0; i--) {
        const t = chronological[i];
        const isOut = t.transaction_type === "withdraw"
            || (t.transaction_type === "transfer"
                && t.from_customer_id === customer.id);
        const isIn  = t.transaction_type === "deposit"
            || (t.transaction_type === "transfer"
                && t.to_customer_id === customer.id);
        points.unshift({
            x: new Date(t.created_at).toLocaleDateString([], { day: "numeric", month: "short" }),
            y: balance / 100  // convert pence to pounds
        });
        // Undo the transaction to get the balance before it.
        if (isOut) balance += t.amount;
        if (isIn)  balance -= t.amount;
    }
    // Add opening point (balance before all transactions).
    points.unshift({
        x: new Date(customer.created_at).toLocaleDateString([], { day: "numeric", month: "short" }) + " (open)",
        y: balance / 100
    });

    if (balanceHistoryChart) balanceHistoryChart.destroy();
    balanceHistoryChart = new Chart(canvas, {
        type: "line",
        data: {
            labels: points.map(p => p.x),
            datasets: [{
                label: `${customer.full_name} — Balance (£)`,
                data: points.map(p => p.y),
                borderColor: "#2563eb",
                backgroundColor: "rgba(37,99,235,0.08)",
                tension: 0.3,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    ticks: { callback: v => `£${Number(v).toLocaleString("en-GB", {minimumFractionDigits:2, maximumFractionDigits:2})}` },
                    beginAtZero: false
                }
            }
        }
    });
    section.style.display = "";
}

/** Fetch dashboard summary stats and update metric cards. */
async function fetchDashboardSummary() {
    try {
        const response = await fetch("/api/dashboard-summary");
        const summary  = await handleJsonResponse(response);
        renderDashboardSummary(summary);
    } catch (error) { showMessage(error.message, true); }
}

/** Fetch chart data and re-render both dashboard charts. */
async function fetchChartData() {
    try {
        const response = await fetch("/api/chart-data");
        const data     = await handleJsonResponse(response);
        renderCharts(data);
    } catch (error) { showMessage(error.message, true); }
}

/**
 * Fetch the 10 most recent transactions across all accounts
 * and render them in the dashboard feed panel.
 */
async function fetchRecentTransactions() {
    const panel = document.getElementById("recent-transactions-panel");
    if (!panel) return;
    try {
        const txns = await handleJsonResponse(
            await fetch("/api/transactions?limit=10")
        );
        if (!txns.length) {
            panel.innerHTML = `<div class="customer-item"><p class="muted-text">No transactions recorded yet.</p></div>`;
            return;
        }
        panel.innerHTML = txns.map((t) => {
            const typeColour = t.transaction_type === "deposit"
                ? "var(--success)"
                : t.transaction_type === "withdraw"
                    ? "var(--warning)"
                    : "var(--info)";
            const sign = t.transaction_type === "deposit" ? "+" : "-";
            return `
            <div class="transaction-row">
                <div class="txn-type-dot" style="background:${typeColour};" aria-hidden="true"></div>
                <div class="txn-body">
                    <div class="txn-type">${escapeHtml(t.transaction_type)}</div>
                    <div class="txn-desc">${escapeHtml(t.description || "—")}</div>
                </div>
                <div class="txn-right">
                    <div class="txn-amount" style="color:${typeColour};">${sign}${fmt(t.amount)}</div>
                    <div class="txn-date">${escapeHtml(formatDateTime(t.created_at))}</div>
                    ${t.risk_flag ? `<span class="status-pill status-risk" title="Risk flagged">⚠ Risk</span>` : ""}
                </div>
            </div>`;
        }).join("");
    } catch (error) { panel.innerHTML = `<div class="customer-item"><p class="muted-text">${escapeHtml(error.message)}</p></div>`; }
}

// ---------------------------------------------------------------------------
// Customers (with pagination)
// ---------------------------------------------------------------------------

/**
 * Render the search suggestion dropdown below the customer
 * search input.
 *
 * @param {Array} matches - Customer objects to show as suggestions.
 */
function renderSuggestions(matches) {
    if (!suggestionsBox) return;
    if (!matches.length) {
        suggestionsBox.innerHTML = "";
        suggestionsBox.classList.add("hidden");
        if (customerSearchInput) {
            customerSearchInput.setAttribute("aria-expanded", "false");
        }
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
    if (customerSearchInput) {
        customerSearchInput.setAttribute("aria-expanded", "true");
    }
    // Wire each suggestion item to open the customer detail view.
    suggestionsBox.querySelectorAll(".suggestion-item").forEach((btn) => {
        btn.addEventListener("click", async () => {
            suggestionsBox.classList.add("hidden");
            if (customerSearchInput) {
                customerSearchInput.setAttribute("aria-expanded", "false");
            }
            await viewCustomer(Number(btn.dataset.id));
        });
    });
}

/**
 * Filter cachedCustomers by the current search input value and
 * render matching suggestions.
 * I search client-side against the cached list to avoid a
 * round-trip on every keystroke.
 */
function updateSuggestions() {
    if (!customerSearchInput) return;
    const query = customerSearchInput.value.trim().toLowerCase();
    if (!query) { renderSuggestions([]); return; }
    const matches = cachedCustomers
        .filter((c) =>
            c.full_name.toLowerCase().includes(query) ||
            c.email.toLowerCase().includes(query) ||
            c.account_number.toLowerCase().includes(query)
        )
        .slice(0, 6);
    renderSuggestions(matches);
}

/**
 * Extract up to two initials from a full name.
 * e.g. "Alice Johnson" → "AJ", "Bob" → "B"
 *
 * @param   {string} name - Full name string.
 * @returns {string}      - One or two uppercase initials.
 */
function initials(name) {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join("");
}

/**
 * Render the customer list panel.
 * I update cachedCustomers so the suggestion filter can work
 * against the latest data without an extra API call.
 * Buttons use data-action / data-id attributes instead of
 * onclick= so they comply with the strict CSP.
 *
 * @param {Array} customers - CustomerResponse objects from the API.
 */
function renderCustomers(customers) {
    if (!customerList) return;
    cachedCustomers = customers;

    if (!customers.length) {
        customerList.innerHTML =
            `<div class="customer-item"><p class="muted-text">No customer records found.</p></div>`;
        return;
    }
    const mgr = isPrivileged();
    customerList.innerHTML = customers.map((c) => `
        <div class="customer-row ${c.is_active ? "" : "inactive"}" data-customer-id="${c.id}">
            <div class="customer-avatar" aria-hidden="true">${escapeHtml(initials(c.full_name))}</div>
            <div class="customer-main">
                <div class="customer-name">${escapeHtml(c.full_name)}</div>
                <div class="customer-sub">${escapeHtml(c.account_number)} &middot; ${escapeHtml(c.email)}</div>
                <div class="customer-actions" style="margin-top:8px;">
                    <button type="button" class="ghost-btn" data-action="view" data-id="${c.id}">View</button>
                    ${mgr ? `<button type="button" class="ghost-btn" data-action="edit" data-id="${c.id}">Edit</button>` : ""}
                    ${mgr && c.is_active  ? `<button type="button" class="danger-btn"  data-action="deactivate" data-id="${c.id}">Deactivate</button>` : ""}
                    ${mgr && !c.is_active ? `<button type="button" class="success-btn" data-action="activate"   data-id="${c.id}">Activate</button>` : ""}
                    ${mgr ? `<button type="button" class="danger-btn" data-action="delete" data-id="${c.id}">Delete</button>` : ""}
                </div>
            </div>
            <div class="customer-right">
                <div class="customer-balance">${fmt(c.balance)}</div>
                <span class="status-pill ${c.is_active ? "status-active" : "status-inactive"}">
                    ${c.is_active ? "Active" : "Inactive"}
                </span>
            </div>
        </div>
    `).join("");
}

// ---------------------------------------------------------------------------
// Dedicated Customers page — full list with inline notes
// ---------------------------------------------------------------------------

/** Zero-based page index for the dedicated customers page. */
let customersFullPage = 0;

/**
 * Render the full customer list on the dedicated /customers page.
 * Each row shows notes inline and links "View Profile" to /customers/{id}.
 *
 * @param {Array} customers - CustomerResponse objects from the API.
 */
function renderCustomersFull(customers) {
    const list = document.getElementById("customers-full-list");
    if (!list) return;

    if (!customers.length) {
        list.innerHTML =
            `<div class="customer-item"><p class="muted-text">No customers match your search.</p></div>`;
        return;
    }

    const mgr = isPrivileged();
    list.innerHTML = customers.map((c) => `
        <div class="customer-row ${c.is_active ? "" : "inactive"}" data-customer-id="${c.id}">
            <div class="customer-avatar" aria-hidden="true">${escapeHtml(initials(c.full_name))}</div>
            <div class="customer-main" style="flex:1;min-width:0;">
                <div class="customer-name">${escapeHtml(c.full_name)}</div>
                <div class="customer-sub">
                    <span style="font-family:ui-monospace,monospace;">${escapeHtml(c.account_number)}</span>
                    &middot; ${escapeHtml(c.email)}
                </div>
                ${c.notes ? `
                <div style="margin-top:6px;padding:6px 10px;background:var(--primary-light);border-left:3px solid var(--primary);border-radius:4px;font-size:12px;line-height:1.5;color:var(--text);white-space:pre-wrap;">${escapeHtml(c.notes)}</div>
                ` : ""}
                <div class="customer-actions" style="margin-top:8px;">
                    <a href="/customers/${c.id}" class="ghost-btn" style="text-decoration:none;">View Profile</a>
                    ${mgr &&  c.is_active ? `<button type="button" class="danger-btn"  data-cf-action="deactivate" data-id="${c.id}">Deactivate</button>` : ""}
                    ${mgr && !c.is_active ? `<button type="button" class="success-btn" data-cf-action="activate"   data-id="${c.id}">Activate</button>` : ""}
                    ${mgr ? `<button type="button" class="danger-btn" data-cf-action="delete" data-id="${c.id}">Delete</button>` : ""}
                </div>
            </div>
            <div class="customer-right" style="flex-shrink:0;text-align:right;">
                <div class="customer-balance">${fmt(c.balance)}</div>
                <span class="status-pill ${c.is_active ? "status-active" : "status-inactive"}">
                    ${c.is_active ? "Active" : "Inactive"}
                </span>
                ${c.notes ? `<div style="margin-top:4px;"><span class="panel-badge" style="font-size:10px;">Has notes</span></div>` : ""}
            </div>
        </div>
    `).join("");
}

/**
 * Fetch and render a page of customers on the dedicated /customers page.
 *
 * @param {boolean} resetPage - If true jump back to page 0.
 */
async function fetchCustomersFull(resetPage = false) {
    const list = document.getElementById("customers-full-list");
    if (!list) return;
    if (resetPage) customersFullPage = 0;

    const search = document.getElementById("cf-search")?.value.trim()  || "";
    const status = document.getElementById("cf-status")?.value         || "";
    const sortBy = document.getElementById("cf-sort")?.value           || "";

    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status) params.append("status", status);
    if (sortBy) params.append("sort_by", sortBy);
    params.append("limit",  PAGE_SIZE);
    params.append("offset", customersFullPage * PAGE_SIZE);

    setLoading(true);
    try {
        const customers = await handleJsonResponse(
            await fetch(`/api/customers?${params.toString()}`)
        );
        renderCustomersFull(customers);
        updatePaginationInfo("cf-page-info", customersFullPage, customers.length);

        const prevBtn = document.getElementById("cf-prev-btn");
        const nextBtn = document.getElementById("cf-next-btn");
        if (prevBtn) prevBtn.disabled = customersFullPage === 0;
        if (nextBtn) nextBtn.disabled = customers.length < PAGE_SIZE;
    } catch (err) {
        showToast(err.message, true);
    } finally {
        setLoading(false);
    }
}

/**
 * Update the pagination info text for a paginated list.
 *
 * @param {string} pageInfoId - ID of the <span> element.
 * @param {number} page       - Zero-based current page index.
 * @param {number} count      - Number of records on this page.
 */
function updatePaginationInfo(pageInfoId, page, count) {
    const el = document.getElementById(pageInfoId);
    if (el) {
        el.textContent =
            `Page ${page + 1}${count < PAGE_SIZE ? " (last)" : ""}`;
    }
}

/**
 * Fetch a page of customers from the API and render them.
 * I read the current search, status, and sort values from the
 * filter controls and build the query string from them.
 *
 * @param {boolean} resetPage - If true, jump back to page 0.
 */
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
    params.append("limit",  PAGE_SIZE);
    params.append("offset", customersPage * PAGE_SIZE);

    try {
        const response  = await fetch(`/api/customers?${params.toString()}`);
        const customers = await handleJsonResponse(response);
        renderCustomers(customers);
        updatePaginationInfo(
            "customers-page-info", customersPage, customers.length
        );

        // Disable prev on page 0; disable next when we got fewer
        // records than the page size (signals last page).
        const prevBtn = document.getElementById("customers-prev-btn");
        const nextBtn = document.getElementById("customers-next-btn");
        if (prevBtn) prevBtn.disabled = customersPage === 0;
        if (nextBtn) nextBtn.disabled = customers.length < PAGE_SIZE;
    } catch (error) { showMessage(error.message, true); }
}

// ---------------------------------------------------------------------------
// Customer detail
// ---------------------------------------------------------------------------

/**
 * Render the full customer detail panel, including a rich header,
 * info grid, transaction summary, and quick-action buttons.
 *
 * I compute deposit/withdrawal/transfer totals and the flagged-
 * transaction count from the pre-fetched transactions array so
 * no extra API call is needed.
 *
 * Quick-action buttons inside the panel are wired via
 * addEventListener (not onclick=) after the HTML is written, to
 * comply with the Content-Security-Policy.
 *
 * @param {Object} customer     - CustomerResponse from the API.
 * @param {Array}  transactions - TransactionResponse array (may be empty).
 */
function renderCustomerDetail(customer, transactions = []) {
    if (!customerDetailPanel) return;

    // Compute transaction totals from the passed array.
    const totalDeposits  = transactions
        .filter(t => t.transaction_type === "deposit")
        .reduce((s, t) => s + t.amount, 0);
    const totalWithdraws = transactions
        .filter(t => t.transaction_type === "withdraw")
        .reduce((s, t) => s + t.amount, 0);
    const totalTransfers = transactions
        .filter(t => t.transaction_type === "transfer")
        .reduce((s, t) => s + t.amount, 0);
    const flagged = transactions.filter(t => t.risk_flag).length;
    const lastTxn = transactions.length
        ? formatDateTime(transactions[0].created_at)
        : "None";

    const mgr          = isPrivileged();
    const statusClass  = customer.is_active ? "status-active" : "status-inactive";
    const statusLabel  = customer.is_active ? "Active" : "Inactive";
    // Use warning colour for low balances, success for healthy ones.
    const balanceColour = customer.balance < 25000
        ? "var(--warning)" : "var(--success)";

    customerDetailPanel.innerHTML = `
        <!-- Header: avatar, name, account, balance, status -->
        <div style="display:flex;align-items:center;gap:14px;padding:16px;border-bottom:1px solid var(--border);">
            <div class="customer-avatar" style="width:56px;height:56px;font-size:20px;flex-shrink:0;" aria-hidden="true">${escapeHtml(initials(customer.full_name))}</div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:17px;font-weight:700;margin-bottom:2px;">${escapeHtml(customer.full_name)}</div>
                <div style="font-size:13px;color:var(--muted);">
                    <span style="font-family:ui-monospace,monospace;">${escapeHtml(customer.account_number)}</span>
                    &nbsp;&middot;&nbsp;${escapeHtml(customer.email)}
                </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
                <div style="font-size:22px;font-weight:800;color:${balanceColour};">${fmt(customer.balance)}</div>
                <span class="status-pill ${statusClass}" style="margin-top:4px;">${statusLabel}</span>
            </div>
        </div>

        <!-- Info grid: 2-column metadata cells -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid var(--border);">
            <div style="padding:10px 16px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);">
                <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:3px;">Customer ID</div>
                <div style="font-weight:600;">#${customer.id}</div>
            </div>
            <div style="padding:10px 16px;border-bottom:1px solid var(--border);">
                <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:3px;">Account Status</div>
                <div style="font-weight:600;">${statusLabel}</div>
            </div>
            <div style="padding:10px 16px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);">
                <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:3px;">Account Opened</div>
                <div style="font-weight:600;">${escapeHtml(formatDateTime(customer.created_at))}</div>
            </div>
            <div style="padding:10px 16px;border-bottom:1px solid var(--border);">
                <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:3px;">Last Updated</div>
                <div style="font-weight:600;">${escapeHtml(formatDateTime(customer.updated_at))}</div>
            </div>
            <div style="padding:10px 16px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);">
                <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:3px;">Last Transaction</div>
                <div style="font-weight:600;">${escapeHtml(lastTxn)}</div>
            </div>
            <div style="padding:10px 16px;border-bottom:1px solid var(--border);">
                <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:3px;">Flagged Transactions</div>
                <div style="font-weight:600;color:${flagged ? "var(--danger)" : "inherit"};">${flagged > 0 ? `⚠ ${flagged}` : "None"}</div>
            </div>
        </div>

        <!-- Transaction summary: totals by type -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid var(--border);">
            <div style="padding:10px 14px;text-align:center;border-right:1px solid var(--border);">
                <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--success);margin-bottom:3px;">Total Deposited</div>
                <div style="font-size:15px;font-weight:700;color:var(--success);">${fmt(totalDeposits)}</div>
            </div>
            <div style="padding:10px 14px;text-align:center;border-right:1px solid var(--border);">
                <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--warning);margin-bottom:3px;">Total Withdrawn</div>
                <div style="font-size:15px;font-weight:700;color:var(--warning);">${fmt(totalWithdraws)}</div>
            </div>
            <div style="padding:10px 14px;text-align:center;">
                <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--info);margin-bottom:3px;">Total Transferred</div>
                <div style="font-size:15px;font-weight:700;color:var(--info);">${fmt(totalTransfers)}</div>
            </div>
        </div>

        <!-- Notes — shown only when a note exists -->
        ${customer.notes ? `
        <div style="padding:10px 16px;border-bottom:1px solid var(--border);">
            <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:4px;">Notes</div>
            <div style="font-size:13px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(customer.notes)}</div>
        </div>` : ""}

        <!-- Quick actions for manager+ users -->
        <div style="padding:12px 16px;display:flex;gap:8px;flex-wrap:wrap;">
            ${mgr && customer.is_active  ? `<button type="button" class="danger-btn"  data-action="deactivate" data-id="${customer.id}">Deactivate Account</button>` : ""}
            ${mgr && !customer.is_active ? `<button type="button" class="success-btn" data-action="activate"   data-id="${customer.id}">Activate Account</button>` : ""}
            ${mgr ? `<button type="button" class="ghost-btn" data-action="edit" data-id="${customer.id}">Edit Details</button>` : ""}
            ${mgr ? `<button type="button" class="ghost-btn" data-action="export-csv" data-id="${customer.id}">Export CSV</button>` : ""}
            ${mgr ? `<button type="button" class="danger-btn" data-action="delete" data-id="${customer.id}">Delete Customer</button>` : ""}
        </div>
    `;

    // Wire the quick-action buttons using addEventListener after
    // the HTML has been written to the DOM.  I cannot use onclick=
    // because the CSP blocks inline event handlers.
    customerDetailPanel.querySelectorAll("button[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const action = btn.dataset.action;
            const id     = parseInt(btn.dataset.id, 10);
            if (action === "deactivate")  deactivateCustomer(id);
            if (action === "activate")    reactivateCustomer(id);
            if (action === "edit")        startEditCustomer(id);
            if (action === "delete")      deleteCustomer(id);
            if (action === "export-csv")  exportCustomerTransactions(id, customer.full_name);
        });
    });
}

/**
 * Trigger a CSV download of all transactions for a single customer.
 *
 * Uses a direct navigation to the export endpoint so the browser
 * handles the file-download prompt without requiring a Blob/URL
 * workaround.  The endpoint requires manager+ auth which is already
 * enforced server-side; the session cookie is sent automatically.
 *
 * @param {number} customerId  - The customer's numeric ID.
 * @param {string} fullName    - Used to build a readable filename.
 */
function exportCustomerTransactions(customerId, fullName) {
    const safe = fullName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    exportFile(
        `/api/export/customers/${customerId}/transactions`,
        `${safe}_transactions.csv`
    ).then(() => {
        showToast(`Exported transactions for ${fullName}.`);
    }).catch(() => {
        showToast("Export failed — check your permissions.", "error");
    });
}

// ---------------------------------------------------------------------------
// Transactions (with pagination)
// ---------------------------------------------------------------------------

/**
 * Return the CSS class name for a transaction type status pill.
 *
 * @param   {string} type - 'deposit', 'withdraw', or 'transfer'.
 * @returns {string}      - CSS class name.
 */
function transactionStatusClass(type) {
    if (type === "deposit")  return "status-deposit";
    if (type === "withdraw") return "status-withdraw";
    if (type === "transfer") return "status-transfer";
    return "status-active";
}

/**
 * Render a list of transactions into a target container element.
 * I use this for both the global transaction list and the
 * per-customer transactions panel inside the detail view.
 *
 * @param {Array}           transactions  - TransactionResponse array.
 * @param {HTMLElement|null} targetElement - Container to write into.
 * @param {string}          emptyText     - Text shown when list is empty.
 */
function renderTransactions(
    transactions,
    targetElement = transactionList,
    emptyText = "No transactions found."
) {
    if (!targetElement) return;
    if (!transactions.length) {
        targetElement.innerHTML =
            `<div class="customer-item"><p class="muted-text">${emptyText}</p></div>`;
        return;
    }
    targetElement.innerHTML = transactions.map((t) => {
        const type = t.transaction_type;
        const dotClass = type === "deposit"  ? "txn-deposit"  :
                         type === "withdraw" ? "txn-withdraw" :
                         type === "transfer" ? "txn-transfer" : "txn-default";
        const amtClass = type === "deposit"  ? "deposit"  :
                         type === "withdraw" ? "withdraw" :
                         type === "transfer" ? "transfer" : "";
        const fromTo = [
            t.from_customer_id ? `From #${t.from_customer_id}` : null,
            t.to_customer_id   ? `To #${t.to_customer_id}`     : null
        ].filter(Boolean).join(" → ");
        const riskClass = t.risk_flag ? "risk-flagged" : "";
        // Store minimal fields needed for the detail modal in data attrs.
        const dataJson = escapeHtml(JSON.stringify({
            id: t.id, type, amount: t.amount, description: t.description,
            from_id: t.from_customer_id, to_id: t.to_customer_id,
            created_at: t.created_at, risk_flag: t.risk_flag,
            account_number: t.account_number
        }));
        return `
        <div class="transaction-row clickable ${riskClass}"
             data-txn="${dataJson}" title="Click for details">
            <div class="txn-type-dot ${dotClass}" aria-hidden="true"></div>
            <div class="txn-content">
                <div class="txn-header">
                    <span class="status-pill ${transactionStatusClass(type)}">${escapeHtml(type)}</span>
                    ${t.risk_flag ? '<span class="flag-chip">&#9888; Risk</span>' : ""}
                    <span class="txn-desc">${escapeHtml(t.description || "—")}</span>
                </div>
                <div class="txn-sub">${escapeHtml(fromTo || "—")} &middot; ${escapeHtml(formatDateTime(t.created_at))}</div>
            </div>
            <div class="txn-amount ${amtClass}">${type === "deposit" ? "+" : type === "withdraw" ? "−" : ""}${fmt(t.amount)}</div>
        </div>`;
    }).join("");
}

/**
 * Fetch a page of transactions with optional filters and render them.
 *
 * @param {boolean} resetPage - If true, reset to page 0.
 */
async function fetchTransactions(resetPage = false) {
    if (!transactionList) return;
    if (resetPage) transactionsPage = 0;

    const account    = document.getElementById("transaction-account-filter")?.value.trim() || "";
    const type       = document.getElementById("transaction-type-filter")?.value || "";
    const risk       = document.getElementById("transaction-risk-filter")?.value || "";
    const amountMin  = document.getElementById("transaction-amount-min")?.value || "";
    const amountMax  = document.getElementById("transaction-amount-max")?.value || "";
    const dateFrom   = document.getElementById("transaction-date-from")?.value || "";
    const dateTo     = document.getElementById("transaction-date-to")?.value || "";

    const params = new URLSearchParams();
    if (account)   params.append("account_number",    account);
    if (type)      params.append("transaction_type",  type);
    if (risk)      params.append("risk_flag",         risk);
    if (amountMin) params.append("amount_min",        amountMin);
    if (amountMax) params.append("amount_max",        amountMax);
    if (dateFrom)  params.append("date_from",         dateFrom);
    if (dateTo)    params.append("date_to",           dateTo);
    params.append("limit",  PAGE_SIZE);
    params.append("offset", transactionsPage * PAGE_SIZE);

    try {
        const response     = await fetch(`/api/transactions?${params.toString()}`);
        const transactions = await handleJsonResponse(response);
        renderTransactions(transactions);
        updatePaginationInfo(
            "transactions-page-info", transactionsPage, transactions.length
        );

        const prevBtn = document.getElementById("transactions-prev-btn");
        const nextBtn = document.getElementById("transactions-next-btn");
        if (prevBtn) prevBtn.disabled = transactionsPage === 0;
        if (nextBtn) nextBtn.disabled = transactions.length < PAGE_SIZE;
    } catch (error) { showMessage(error.message, true); }
}

/**
 * Fetch and render transactions for a specific account number
 * in the customer transactions panel.
 * This function is kept for convenience but is not used directly
 * in the current viewCustomer flow (transactions are fetched
 * there and passed to renderTransactions directly).
 *
 * @param {string} accountNumber - Customer account number to filter by.
 */
async function fetchTransactionsForCustomer(accountNumber) {
    try {
        const response = await fetch(
            `/api/transactions?account_number=${encodeURIComponent(accountNumber)}&limit=${PAGE_SIZE}`
        );
        const transactions = await handleJsonResponse(response);
        renderTransactions(
            transactions,
            customerTransactionsPanel,
            `No transactions found for account ${accountNumber}.`
        );
    } catch (error) { showMessage(error.message, true); }
}

// ---------------------------------------------------------------------------
// Customer timeline
// ---------------------------------------------------------------------------

/**
 * Render the customer activity timeline panel.
 *
 * @param {Array} items - CustomerTimelineItem objects from the API.
 */
function renderTimeline(items) {
    if (!customerTimelinePanel) return;
    if (!items.length) {
        customerTimelinePanel.innerHTML =
            `<div class="transaction-item"><p class="muted-text">No timeline events found.</p></div>`;
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

/**
 * Fetch the activity timeline for a customer and render it.
 *
 * @param {number} customerId - Customer primary key.
 */
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

/**
 * Render the audit log list and the recent-activity panel.
 * I also update recentActivityPanel (shown at the top of the
 * dashboard) with the six most recent log entries.
 *
 * @param {Array} logs - AuditLogResponse objects from the API.
 */
function renderAuditLogs(logs) {
    if (!auditList) return;
    if (!logs.length) {
        auditList.innerHTML =
            `<div class="audit-item"><p class="muted-text">No audit logs found.</p></div>`;
        return;
    }
    auditList.innerHTML = logs.map((log) => {
        const isSuccess = log.result === "success";
        const isFailure = log.result === "failure";
        const dotClass  = isSuccess ? "audit-result-success" :
                          isFailure ? "audit-result-failure"  : "audit-result-other";
        const chipClass = isSuccess ? "chip-success" :
                          isFailure ? "chip-failure"  : "chip-other";
        const dataJson = escapeHtml(JSON.stringify({
            id: log.id, event_type: log.event_type, actor: log.actor,
            details: log.details, result: log.result,
            ip_address: log.ip_address, created_at: log.created_at
        }));
        return `
        <div class="audit-row clickable" data-audit="${dataJson}" title="Click for full details">
            <div class="audit-result-dot ${dotClass}" aria-hidden="true"></div>
            <div class="audit-content">
                <div class="audit-event">${escapeHtml(log.event_type)}</div>
                <div class="audit-detail">${escapeHtml(log.details)}</div>
                <div class="audit-sub">${escapeHtml(log.actor)} &middot; ${escapeHtml(log.ip_address || "—")} &middot; ${escapeHtml(formatDateTime(log.created_at))}</div>
            </div>
            <span class="audit-result-chip ${chipClass}">${escapeHtml(log.result)}</span>
        </div>`;
    }).join("");

    // Populate the dashboard recent-activity panel with the
    // first six entries from the current log fetch.
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

/**
 * Fetch audit logs with the current filter values and render them.
 * Staff-role users receive a 403 — I show a friendly message
 * instead of an error toast in that case.
 */
async function fetchAuditLogs() {
    if (!auditList) return;
    const params = new URLSearchParams();
    if (auditActorFilter?.value.trim())
        params.append("actor",      auditActorFilter.value.trim());
    if (auditEventFilter?.value.trim())
        params.append("event_type", auditEventFilter.value.trim());
    if (auditResultFilter?.value)
        params.append("result",     auditResultFilter.value);
    if (auditDateFrom?.value)
        params.append("date_from",  auditDateFrom.value);
    if (auditDateTo?.value)
        params.append("date_to",    auditDateTo.value);

    const url = params.toString()
        ? `/api/audit-logs?${params.toString()}`
        : "/api/audit-logs";
    try {
        const response = await fetch(url);
        const logs     = await handleJsonResponse(response);
        renderAuditLogs(logs);
    } catch (error) {
        if (isPrivileged()) {
            showMessage(error.message, true);
        } else {
            // Staff users — show a non-alarming message.
            auditList.innerHTML =
                `<div class="audit-item"><p class="muted-text">Audit log is restricted to manager accounts.</p></div>`;
        }
    }
}

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------

/**
 * Return true if the current user has manager or superadmin role.
 * I use this to conditionally render edit/delete/deactivate
 * buttons and manager-only form sections.
 *
 * @returns {boolean}
 */
function isPrivileged() {
    return ["manager", "superadmin"].includes(window.currentUserRole);
}

/**
 * Return true if the current user has the superadmin role.
 * I use this to show the superadmin role option in the
 * create-staff form.
 *
 * @returns {boolean}
 */
function isSuperadmin() {
    return window.currentUserRole === "superadmin";
}

// ---------------------------------------------------------------------------
// Staff users
// ---------------------------------------------------------------------------

/**
 * Return an HTML status pill element for a staff user's role.
 *
 * @param   {string} role - 'staff', 'manager', or 'superadmin'.
 * @returns {string}      - HTML string for the pill element.
 */
function rolePill(role) {
    const cls = role === "superadmin" ? "status-superadmin" :
                role === "manager"    ? "status-manager"    : "status-staff";
    return `<span class="status-pill ${cls}">${escapeHtml(role)}</span>`;
}

/**
 * Render the staff user list panel.
 * I show an "Unlock" button only for accounts that are locked
 * AND can be unlocked by the current user (superadmin required
 * for manager/superadmin accounts).
 *
 * @param {Array} users - StaffUserResponse objects from the API.
 */
function renderStaffUsers(users) {
    if (!staffUserList) return;
    if (!isPrivileged()) {
        staffUserList.innerHTML =
            `<div class="customer-item"><p class="muted-text">Manager access required.</p></div>`;
        return;
    }
    if (!users.length) {
        staffUserList.innerHTML =
            `<div class="customer-item"><p class="muted-text">No staff users found.</p></div>`;
        return;
    }
    // Sort locked accounts to the top so they are immediately visible.
    const sortedUsers = [...users].sort(
        (a, b) => (b.is_locked ? 1 : 0) - (a.is_locked ? 1 : 0)
    );
    staffUserList.innerHTML = sortedUsers.map((user) => {
        const targetIsPrivileged = ["manager", "superadmin"].includes(user.role);
        // This manager CAN unlock: target is staff, or actor is superadmin.
        const canUnlock = user.is_locked && (isSuperadmin() || !targetIsPrivileged);
        // Show a note when the account is locked but the current
        // user does not have sufficient privilege to unlock it.
        const unlockBlockedMsg = user.is_locked && targetIsPrivileged && !isSuperadmin()
            ? `<span class="warning-inline" title="Only superadmin can unlock this account">Locked — superadmin required</span>`
            : "";
        // Small lock-icon badge overlaid on the avatar for locked accounts.
        const lockOverlay = user.is_locked ? `
            <div class="staff-avatar-lock" aria-hidden="true">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none"
                     stroke="white" stroke-width="3"
                     stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
            </div>` : "";
        return `
        <div class="staff-row${user.is_locked ? " locked" : ""}">
            <div class="staff-avatar-wrap">
                <div class="staff-avatar" aria-hidden="true">${escapeHtml(user.username.slice(0, 2).toUpperCase())}</div>
                ${lockOverlay}
            </div>
            <div class="staff-info">
                <div class="staff-name">
                    <a href="/staff/${user.id}" style="color:inherit;text-decoration:none;font-weight:700;">
                        ${escapeHtml(user.username)}
                    </a>
                </div>
                <div class="staff-sub">
                    Joined ${escapeHtml(formatDateTime(user.created_at))}
                    ${user.failed_login_attempts > 0 ? `&middot; ${user.failed_login_attempts} failed attempt${user.failed_login_attempts !== 1 ? "s" : ""}` : ""}
                    ${user.last_login_at ? `&middot; Last login ${escapeHtml(formatDateTime(user.last_login_at))}` : ""}
                    ${user.must_change_password ? "&middot; <em>password change required</em>" : ""}
                </div>
            </div>
            <div class="staff-right">
                ${rolePill(user.role)}
                ${user.is_locked ? `<span class="status-pill status-locked">Locked</span>` : ""}
                ${canUnlock ? `<button type="button" class="success-btn" data-action="unlock-staff" data-id="${user.id}">Unlock</button>` : ""}
                ${unlockBlockedMsg}
                <a href="/staff/${user.id}" class="ghost-btn"
                   style="text-decoration:none;padding:6px 12px;font-size:13px;min-height:0;">View</a>
            </div>
        </div>`;
    }).join("");
}

/**
 * Fetch all staff users and render the list.
 * I skip the request entirely if the current user is not
 * privileged to avoid an unnecessary 403 response.
 */
async function fetchStaffUsers() {
    if (!staffUserList || !isPrivileged()) return;
    try {
        const response = await fetch("/api/staff-users");
        let users = await handleJsonResponse(response);

        // Client-side filter using the staff page toolbar controls (if present).
        const searchVal = document.getElementById("staff-search-input")?.value.trim().toLowerCase() || "";
        const roleVal   = document.getElementById("staff-role-filter")?.value  || "";
        const lockVal   = document.getElementById("staff-lock-filter")?.value  || "";

        if (searchVal) users = users.filter(u => u.username.toLowerCase().includes(searchVal));
        if (roleVal)   users = users.filter(u => u.role === roleVal);
        if (lockVal === "locked") users = users.filter(u => u.is_locked);
        if (lockVal === "active") users = users.filter(u => !u.is_locked);

        renderStaffUsers(users);
    } catch (error) { showMessage(error.message, true); }
}

// Wire staff filter buttons (only on the staff page — guard with element check).
document.getElementById("staff-filter-btn")?.addEventListener("click", () => fetchStaffUsers());
document.getElementById("staff-clear-btn")?.addEventListener("click", () => {
    const si = document.getElementById("staff-search-input");
    const rf = document.getElementById("staff-role-filter");
    const lf = document.getElementById("staff-lock-filter");
    if (si) si.value = "";
    if (rf) rf.value = "";
    if (lf) lf.value = "";
    fetchStaffUsers();
});
document.getElementById("staff-search-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") fetchStaffUsers();
});

/**
 * Show a confirmation modal then unlock the given staff account.
 *
 * @param {number} userId - Primary key of the account to unlock.
 */
async function unlockStaffUser(userId) {
    openConfirmModal(
        "Unlock User",
        "Unlock this staff account?",
        async () => {
            try {
                const response = await fetch(
                    `/api/staff-users/${userId}/unlock`,
                    { method: "PATCH" }
                );
                await handleJsonResponse(response);
                showToast("Staff user unlocked successfully.");
                fetchStaffUsers();
                fetchAuditLogs();
            } catch (error) { showToast(error.message, true); }
        }
    );
}

// ---------------------------------------------------------------------------
// CSV export helper
// ---------------------------------------------------------------------------

/**
 * Download a CSV file from ``url`` using a temporary anchor element.
 * I create a Blob URL, click it programmatically, then revoke it
 * to avoid memory leaks.
 *
 * @param {string} url      - API endpoint that returns CSV text.
 * @param {string} filename - Suggested filename for the download.
 */
async function exportFile(url, filename) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Export failed.");
    const text    = await response.text();
    const blob    = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const blobUrl = URL.createObjectURL(blob);
    const link    = document.createElement("a");
    link.href     = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
}

// ---------------------------------------------------------------------------
// Customer actions
// ---------------------------------------------------------------------------

/**
 * Load a customer's full detail view — fetches the customer
 * record and their transactions, then renders all four panels:
 * detail card, transactions, timeline, and pre-fills the
 * edit form for manager users.
 *
 * I wrap each rendering step in its own try/catch so a failure
 * in one panel (e.g. a template error in renderCustomerDetail)
 * does not silently prevent the other panels from rendering.
 *
 * @param {number} customerId - Primary key of the customer.
 */
async function viewCustomer(customerId) {
    try {
        const customer = await handleJsonResponse(
            await fetch(`/api/customers/${customerId}`)
        );
        const transactions = await handleJsonResponse(
            await fetch(
                `/api/transactions?account_number=${encodeURIComponent(customer.account_number)}&limit=200`
            )
        );

        // Render the detail card — isolated catch so a rendering
        // bug here does not block the transactions panel below.
        try { renderCustomerDetail(customer, transactions); }
        catch (e) { console.error("Detail render error:", e); }

        // Render the balance history chart.
        try { renderBalanceHistory(customer, transactions); }
        catch (e) { console.error("Balance chart error:", e); }

        // Always render transactions independently.
        renderTransactions(
            transactions,
            customerTransactionsPanel,
            `No transactions found for ${customer.account_number}.`
        );

        // Fetch the timeline — isolated so network errors here
        // do not cause the rest of the view to disappear.
        try { await fetchCustomerTimeline(customer.id); }
        catch (e) { console.error("Timeline error:", e); }

        // Pre-fill the edit form for manager and superadmin users.
        if (isPrivileged()) {
            const editId    = document.getElementById("edit-customer-id");
            const editName  = document.getElementById("edit-full-name");
            const editEmail = document.getElementById("edit-email");
            const editNotes = document.getElementById("edit-notes");
            if (editId)    editId.value    = customer.id;
            if (editName)  editName.value  = customer.full_name;
            if (editEmail) editEmail.value = customer.email;
            if (editNotes) editNotes.value = customer.notes || "";
        }

        document.getElementById("customer-view-section")?.scrollIntoView({
            behavior: "smooth", block: "start"
        });
        showToast(`Viewing ${customer.full_name}`);
    } catch (error) { showToast(error.message, true); }
}

/**
 * Load a customer record into the edit form.
 * I populate all three edit fields and move focus to the name
 * input so the user can start editing immediately.
 *
 * @param {number} customerId - Primary key of the customer to edit.
 */
async function startEditCustomer(customerId) {
    try {
        const response  = await fetch(`/api/customers/${customerId}`);
        const customer  = await handleJsonResponse(response);
        document.getElementById("edit-customer-id").value    = customer.id;
        document.getElementById("edit-full-name").value      = customer.full_name;
        document.getElementById("edit-email").value          = customer.email;
        const editNotes = document.getElementById("edit-notes");
        if (editNotes) editNotes.value = customer.notes || "";
        showToast(`Loaded ${customer.full_name} into edit form.`);
        document.getElementById("edit-full-name").focus();
    } catch (error) { showToast(error.message, true); }
}

/**
 * Show a confirmation modal and then deactivate a customer.
 * On success I refresh the customer list, audit log, dashboard
 * stats, and charts so all displayed data stays consistent.
 *
 * @param {number} customerId - Primary key of the customer.
 */
async function deactivateCustomer(customerId) {
    openConfirmModal(
        "Deactivate Customer",
        "Deactivate this customer account?",
        async () => {
            try {
                await handleJsonResponse(
                    await fetch(
                        `/api/customers/${customerId}/deactivate`,
                        { method: "PATCH" }
                    )
                );
                showToast("Customer deactivated successfully.");
                fetchCustomers();
                fetchCustomersFull();
                fetchAuditLogs();
                fetchDashboardSummary();
                fetchChartData();
            } catch (error) { showToast(error.message, true); }
        }
    );
}

/**
 * Show a confirmation modal and then reactivate a customer.
 *
 * @param {number} customerId - Primary key of the customer.
 */
async function reactivateCustomer(customerId) {
    openConfirmModal(
        "Activate Customer",
        "Reactivate this customer account?",
        async () => {
            try {
                await handleJsonResponse(
                    await fetch(
                        `/api/customers/${customerId}/reactivate`,
                        { method: "PATCH" }
                    )
                );
                showToast("Customer activated successfully.");
                fetchCustomers();
                fetchCustomersFull();
                fetchAuditLogs();
                fetchDashboardSummary();
                fetchChartData();
            } catch (error) { showToast(error.message, true); }
        }
    );
}

/**
 * Show a confirmation modal and then permanently delete a customer.
 * On success I clear the detail, transactions, and timeline
 * panels and reset the edit form fields.
 *
 * @param {number} customerId - Primary key of the customer.
 */
async function deleteCustomer(customerId) {
    // Look up the customer name from cache so the modal message
    // clearly identifies who is about to be deleted.
    const customer = cachedCustomers.find(c => c.id === customerId);
    const label = customer
        ? `"${customer.full_name}" (${customer.account_number})`
        : `customer #${customerId}`;
    openConfirmModal(
        "Delete Customer",
        `Permanently delete ${label}? This cannot be undone.`,
        async () => {
            try {
                await handleJsonResponse(
                    await fetch(
                        `/api/customers/${customerId}`,
                        { method: "DELETE" }
                    )
                );
                showToast("Customer deleted successfully.");
                fetchCustomers();
                fetchCustomersFull();
                fetchAuditLogs();
                fetchDashboardSummary();
                fetchChartData();

                // Clear the detail panels so stale data is not shown.
                if (customerDetailPanel) {
                    customerDetailPanel.innerHTML =
                        `<p class="muted-text">Select "View" on a customer to see their stored data.</p>`;
                }
                if (customerTransactionsPanel) {
                    customerTransactionsPanel.innerHTML =
                        `<div class="customer-item"><p class="muted-text">Select "View" on a customer to load transactions.</p></div>`;
                }
                if (customerTimelinePanel) {
                    customerTimelinePanel.innerHTML =
                        `<div class="customer-item"><p class="muted-text">Select "View" on a customer to load timeline events.</p></div>`;
                }

                // Reset the edit form so it does not show a deleted ID.
                const editId    = document.getElementById("edit-customer-id");
                const editName  = document.getElementById("edit-full-name");
                const editEmail = document.getElementById("edit-email");
                const editNotes = document.getElementById("edit-notes");
                if (editId)    editId.value    = "";
                if (editName)  editName.value  = "";
                if (editEmail) editEmail.value = "";
                if (editNotes) editNotes.value = "";
            } catch (error) { showMessage(error.message, true); }
        }
    );
}

// ---------------------------------------------------------------------------
// Event listeners — search autocomplete and pagination
// ---------------------------------------------------------------------------

// Set ARIA attributes on the customer search input so screen
// readers announce the autocomplete listbox pattern correctly.
if (customerSearchInput) {
    customerSearchInput.setAttribute("aria-autocomplete", "list");
    customerSearchInput.setAttribute(
        "aria-controls", "customer-suggestions-listbox"
    );
    customerSearchInput.setAttribute("aria-expanded", "false");
}

// Update suggestion list on every keystroke.
customerSearchInput?.addEventListener("input", updateSuggestions);

// Keyboard navigation: ArrowDown from the input moves focus
// into the suggestions list; Escape closes the list.
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

// Keyboard navigation within the suggestion list.
// ArrowDown/ArrowUp moves between items; ArrowUp on the first
// item wraps focus back to the search input.
suggestionsBox?.addEventListener("keydown", (event) => {
    const items   = Array.from(suggestionsBox.querySelectorAll(".suggestion-item"));
    const focused = document.activeElement;
    const idx     = items.indexOf(focused);

    if (event.key === "ArrowDown") {
        event.preventDefault();
        if (idx < items.length - 1) items[idx + 1].focus();
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (idx > 0) {
            items[idx - 1].focus();
        } else {
            // Wrap back to the search input.
            customerSearchInput?.focus();
        }
    } else if (event.key === "Escape") {
        event.preventDefault();
        suggestionsBox.classList.add("hidden");
        if (customerSearchInput) {
            customerSearchInput.setAttribute("aria-expanded", "false");
        }
        customerSearchInput?.focus();
    }
    // Enter is already handled by each button's own click event.
});

// Close the suggestion dropdown when the user clicks anywhere
// outside the search wrapper.
document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-wrapper")) {
        suggestionsBox?.classList.add("hidden");
        if (customerSearchInput) {
            customerSearchInput.setAttribute("aria-expanded", "false");
        }
    }
});

/* Customers pagination buttons */
document.getElementById("customers-prev-btn")?.addEventListener("click", () => {
    if (customersPage > 0) { customersPage--; fetchCustomers(); }
});
document.getElementById("customers-next-btn")?.addEventListener("click", () => {
    customersPage++;
    fetchCustomers();
});

/* Transactions pagination buttons */
document.getElementById("transactions-prev-btn")?.addEventListener("click", () => {
    if (transactionsPage > 0) { transactionsPage--; fetchTransactions(); }
});
document.getElementById("transactions-next-btn")?.addEventListener("click", () => {
    transactionsPage++;
    fetchTransactions();
});

/* Transactions clear-filter button (dedicated transactions page) */
document.getElementById("clear-transactions-btn")?.addEventListener("click", () => {
    ["transaction-account-filter","transaction-type-filter","transaction-risk-filter",
     "transaction-amount-min","transaction-amount-max",
     "transaction-date-from","transaction-date-to"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    fetchTransactions(true);
});

// ---------------------------------------------------------------------------
// Form: create customer
// ---------------------------------------------------------------------------
customerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const full_name = document.getElementById("full_name").value.trim();
    const email     = document.getElementById("email").value.trim();
    const balance   = Math.round(parseFloat(document.getElementById("balance").value) * 100);
    const notes     = document.getElementById("notes")?.value.trim() || null;
    if (!full_name || !email || Number.isNaN(balance)) {
        showMessage("Full name, email, and opening balance are required.", true);
        return;
    }
    try {
        setLoading(true);
        const createdCustomer = await handleJsonResponse(
            await fetch("/api/customers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    full_name, email, balance,
                    notes: notes || null
                })
            })
        );
        customerForm.reset();
        // Reset balance to 0 after form.reset() clears it.
        document.getElementById("balance").value = 0;
        showMessage(`Customer created. Account: ${createdCustomer.account_number}`);
        fetchCustomers(true);
        fetchAuditLogs();
        fetchDashboardSummary();
        fetchChartData();
    } catch (error) { showMessage(error.message, true); }
    finally { setLoading(false); }
});

// ---------------------------------------------------------------------------
// Form: edit customer
// ---------------------------------------------------------------------------
editCustomerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const customerId = document.getElementById("edit-customer-id").value;
    const full_name  = document.getElementById("edit-full-name").value.trim();
    const email      = document.getElementById("edit-email").value.trim();
    const notes      = document.getElementById("edit-notes")?.value.trim() || null;
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
        await handleJsonResponse(
            await fetch(`/api/customers/${customerId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ full_name, email, notes: notes || null })
            })
        );
        showEditMessage("Customer updated successfully.");
        fetchCustomers();
        fetchAuditLogs();
        fetchDashboardSummary();
        // Reload the detail panel with fresh data.
        if (document.getElementById("customer-profile-page")) {
            refreshCustomerProfile();
        } else {
            await viewCustomer(customerId);
        }
    } catch (error) { showEditMessage(error.message, true); }
    finally { setLoading(false); }
});

// ---------------------------------------------------------------------------
// Forms: deposit / withdraw / transfer
// ---------------------------------------------------------------------------
depositForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const account_number = document.getElementById("deposit-account").value.trim();
    const amount         = Math.round(parseFloat(document.getElementById("deposit-amount").value) * 100);
    const description    = document.getElementById("deposit-description").value.trim();
    try {
        setLoading(true);
        await handleJsonResponse(
            await fetch("/api/transactions/deposit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ account_number, amount, description })
            })
        );
        depositForm.reset();
        showToast("Deposit completed successfully.");
        fetchCustomers();
        fetchTransactions(true);
        fetchAuditLogs();
        fetchDashboardSummary();
        fetchChartData();
        refreshCustomerProfile();
    } catch (error) { showToast(error.message, true); }
    finally { setLoading(false); }
});

withdrawForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const account_number = document.getElementById("withdraw-account").value.trim();
    const amount         = Math.round(parseFloat(document.getElementById("withdraw-amount").value) * 100);
    const description    = document.getElementById("withdraw-description").value.trim();
    try {
        setLoading(true);
        await handleJsonResponse(
            await fetch("/api/transactions/withdraw", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ account_number, amount, description })
            })
        );
        withdrawForm.reset();
        showToast("Withdrawal completed successfully.");
        fetchCustomers();
        fetchTransactions(true);
        fetchAuditLogs();
        fetchDashboardSummary();
        fetchChartData();
        refreshCustomerProfile();
    } catch (error) { showToast(error.message, true); }
    finally { setLoading(false); }
});

transferForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const from_account_number = document.getElementById("from_account_number").value.trim();
    const to_account_number   = document.getElementById("to_account_number").value.trim();
    const amountPounds        = parseFloat(document.getElementById("transfer_amount").value) || 0;
    const amount              = Math.round(amountPounds * 100);
    const description         = document.getElementById("transfer_description").value.trim();
    // Show a confirmation modal before submitting a transfer.
    openConfirmModal(
        "Confirm Transfer",
        `Transfer £${amountPounds.toFixed(2)} from ${from_account_number || "source"} to ${to_account_number || "destination"}?`,
        async () => {
            try {
                setLoading(true);
                await handleJsonResponse(
                    await fetch("/api/transactions/transfer", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            from_account_number,
                            to_account_number,
                            amount,
                            description
                        })
                    })
                );
                transferForm.reset();
                showToast("Transfer completed successfully.");
                fetchCustomers();
                fetchTransactions(true);
                fetchAuditLogs();
                fetchDashboardSummary();
                fetchChartData();
                refreshCustomerProfile();
            } catch (error) { showToast(error.message, true); }
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
        const data = await handleJsonResponse(
            await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            })
        );
        window.currentUserRole = data.role || "staff";
        if (data.must_change_password) {
            // Redirect to the dashboard with a flag that triggers
            // the change-password form scroll on arrival.
            showLoginMessage(
                "Login successful. You must change your default password before continuing."
            );
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
    const role     = document.getElementById("new-staff-role").value;
    try {
        setLoading(true);
        await handleJsonResponse(
            await fetch("/api/staff-users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password, role })
            })
        );
        createStaffForm.reset();
        showCreateStaffMessage(`Staff user "${username}" created successfully.`);
        fetchStaffUsers();
        fetchAuditLogs();
    } catch (error) { showCreateStaffMessage(error.message, true); }
    finally { setLoading(false); }
});

// ---------------------------------------------------------------------------
// Form: change password
// ---------------------------------------------------------------------------
changePasswordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const userId           = document.getElementById("change-password-user-id").value;
    const current_password = document.getElementById("change-password-current").value;
    const new_password     = document.getElementById("change-password-new").value;
    const confirm          = document.getElementById("change-password-confirm").value;

    // Client-side confirmation match check before the API call.
    if (new_password !== confirm) {
        showChangePasswordMessage("New passwords do not match.", true);
        return;
    }
    if (!userId) {
        showChangePasswordMessage(
            "Unable to determine user ID. Please reload the page.", true
        );
        return;
    }
    try {
        setLoading(true);
        await handleJsonResponse(
            await fetch(`/api/staff-users/${userId}/change-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ current_password, new_password })
            })
        );
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
        await handleJsonResponse(
            await fetch("/api/auth/logout", { method: "POST" })
        );
        window.location.href = "/login";
    } catch (error) { showMessage(error.message, true); }
});

// Refresh / search / filter buttons.
refreshBtn?.addEventListener("click",             () => fetchCustomers(true));
searchCustomersBtn?.addEventListener("click",     () => fetchCustomers(true));
refreshTransactionsBtn?.addEventListener("click", () => fetchTransactions(true));
filterTransactionsBtn?.addEventListener("click",  () => fetchTransactions(true));
refreshAuditBtn?.addEventListener("click",        fetchAuditLogs);
document.getElementById("clear-audit-btn")?.addEventListener("click", () => {
    if (auditActorFilter)  auditActorFilter.value  = "";
    if (auditEventFilter)  auditEventFilter.value  = "";
    if (auditResultFilter) auditResultFilter.value = "";
    if (auditDateFrom)     auditDateFrom.value      = "";
    if (auditDateTo)       auditDateTo.value        = "";
    fetchAuditLogs();
});

exportCustomersBtn?.addEventListener("click", async () => {
    try {
        await exportFile("/api/export/customers", "customers.csv");
        showToast("Customers exported.");
    }
    catch (error) { showMessage(error.message, true); }
});
exportTransactionsBtn?.addEventListener("click", async () => {
    try {
        await exportFile("/api/export/transactions", "transactions.csv");
        showToast("Transactions exported.");
    }
    catch (error) { showMessage(error.message, true); }
});

// ---------------------------------------------------------------------------
// Initialisation IIFE — runs once on page load
// ---------------------------------------------------------------------------
(async () => {
    // Fetch auth data whenever a list panel, the change-password form,
    // or the customer profile page is present.  This covers the dashboard,
    // staff, settings, and profile pages — but not the login page.
    if (customerList || transactionList || auditList || changePasswordForm
            || depositForm || document.getElementById("customer-profile-page")
            || document.getElementById("alerts-page")
            || document.getElementById("reports-page")) {
        await fetchCurrentUser();
        await fetchCsrfToken();
    }

    if (customerList) {
        fetchDashboardSummary();
        fetchCustomers();
        fetchChartData();
        fetchRecentTransactions();
        // Auto-refresh dashboard stats every 30 seconds so the
        // metric cards stay up to date without a manual reload.
        setInterval(() => {
            fetchDashboardSummary();
            fetchChartData();
            fetchRecentTransactions();
        }, 30000);
    }
    if (transactionList) fetchTransactions();
    if (auditList)       fetchAuditLogs();
    if (staffUserList)   fetchStaffUsers();

    // After a first-login redirect (?change_password=1) I scroll
    // to the change-password form and show a warning toast.
    if (new URLSearchParams(window.location.search).get("change_password") === "1") {
        const cpSection = document.getElementById("change-password-form");
        if (cpSection) {
            cpSection.scrollIntoView({ behavior: "smooth", block: "center" });
            cpSection.querySelector("input")?.focus();
            showToast("Please change your default password to continue.", true);
        }
        // Remove the query parameter without triggering a reload.
        history.replaceState(null, "", window.location.pathname);
    }
})();

// ---------------------------------------------------------------------------
// Event delegation — customer list (replaces all onclick= handlers)
// ---------------------------------------------------------------------------
/**
 * I use a single delegated listener on the customer list
 * container so that buttons inside dynamically-rendered rows
 * work without re-attaching handlers after each render.
 * This pattern also complies with the CSP (no inline onclick=).
 */
customerList?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = parseInt(btn.dataset.id, 10);
    if (isNaN(id)) return;

    if (action === "view")       viewCustomer(id);
    if (action === "edit")       startEditCustomer(id);
    if (action === "deactivate") deactivateCustomer(id);
    if (action === "activate")   reactivateCustomer(id);
    if (action === "delete")     deleteCustomer(id);
});

/** Delegated listener for the staff user list unlock buttons. */
staffUserList?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = parseInt(btn.dataset.id, 10);
    if (isNaN(id)) return;

    if (action === "unlock-staff") unlockStaffUser(id);
});

// ---------------------------------------------------------------------------
// Click-to-expand: transaction rows → detail modal
// ---------------------------------------------------------------------------

/**
 * Build HTML for a transaction detail panel inside the info modal.
 * @param {Object} t - Parsed transaction data from data-txn attribute.
 * @returns {string} Safe HTML string.
 */
function _txnDetailHtml(t) {
    const sign = t.type === "deposit" ? "+" : t.type === "withdraw" ? "−" : "";
    const amtColor = t.type === "deposit" ? "var(--success)" :
                     t.type === "withdraw" ? "var(--warning)" : "var(--info)";
    return `
        <div style="font-size:28px;font-weight:800;color:${amtColor};text-align:center;padding:12px 0 20px;">
            ${sign}${fmt(t.amount)}
        </div>
        <div class="detail-grid">
            <div class="detail-row"><span class="detail-key">ID</span><span class="detail-val">#${t.id}</span></div>
            <div class="detail-row"><span class="detail-key">Type</span><span class="detail-val">${escapeHtml(t.type)}</span></div>
            ${t.account_number ? `<div class="detail-row"><span class="detail-key">Account</span><span class="detail-val" style="font-family:ui-monospace,monospace;">${escapeHtml(t.account_number)}</span></div>` : ""}
            <div class="detail-row"><span class="detail-key">From ID</span><span class="detail-val">${t.from_id ? `#${t.from_id}` : "—"}</span></div>
            <div class="detail-row"><span class="detail-key">To ID</span><span class="detail-val">${t.to_id ? `#${t.to_id}` : "—"}</span></div>
            <div class="detail-row"><span class="detail-key">Description</span><span class="detail-val">${escapeHtml(t.description || "—")}</span></div>
            <div class="detail-row"><span class="detail-key">Date / Time</span><span class="detail-val">${escapeHtml(formatDateTime(t.created_at))}</span></div>
            <div class="detail-row"><span class="detail-key">Risk Flag</span><span class="detail-val">${t.risk_flag ? '<span class="flag-chip">&#9888; Flagged</span>' : "None"}</span></div>
        </div>`;
}

// Delegated listener: click any transaction row to open detail modal.
// Works on both transactionList (dashboard/transactions page) and
// customer-transactions-panel.
document.addEventListener("click", (e) => {
    const row = e.target.closest(".transaction-row.clickable");
    if (!row || e.target.closest("button")) return;
    try {
        const t = JSON.parse(row.dataset.txn || "null");
        if (!t) return;
        openDetailModal(
            `${t.type.charAt(0).toUpperCase() + t.type.slice(1)} — ${fmt(t.amount)}`,
            _txnDetailHtml(t)
        );
    } catch (_) { /* malformed data — ignore */ }
});

// ---------------------------------------------------------------------------
// Click-to-expand: audit rows → detail modal
// ---------------------------------------------------------------------------

/**
 * Build HTML for an audit detail panel inside the info modal.
 * @param {Object} log - Parsed audit data from data-audit attribute.
 * @returns {string} Safe HTML string.
 */
function _auditDetailHtml(log) {
    const isSuccess = log.result === "success";
    const isFailure = log.result === "failure";
    const chipClass = isSuccess ? "chip-success" : isFailure ? "chip-failure" : "chip-other";
    return `
        <div class="detail-grid">
            <div class="detail-row"><span class="detail-key">Event</span><span class="detail-val" style="font-family:ui-monospace,monospace;font-size:12px;">${escapeHtml(log.event_type)}</span></div>
            <div class="detail-row"><span class="detail-key">Result</span><span class="detail-val"><span class="audit-result-chip ${chipClass}">${escapeHtml(log.result)}</span></span></div>
            <div class="detail-row"><span class="detail-key">Actor</span><span class="detail-val">${escapeHtml(log.actor)}</span></div>
            <div class="detail-row"><span class="detail-key">Details</span><span class="detail-val">${escapeHtml(log.details)}</span></div>
            <div class="detail-row"><span class="detail-key">IP Address</span><span class="detail-val" style="font-family:ui-monospace,monospace;">${escapeHtml(log.ip_address || "—")}</span></div>
            <div class="detail-row"><span class="detail-key">Date / Time</span><span class="detail-val">${escapeHtml(formatDateTime(log.created_at))}</span></div>
        </div>`;
}

// Delegated listener: click any audit row to open detail modal.
document.addEventListener("click", (e) => {
    const row = e.target.closest(".audit-row.clickable");
    if (!row || e.target.closest("button")) return;
    try {
        const log = JSON.parse(row.dataset.audit || "null");
        if (!log) return;
        openDetailModal(`Audit Event — ${log.event_type}`, _auditDetailHtml(log));
    } catch (_) { /* malformed — ignore */ }
});

// ---------------------------------------------------------------------------
// Customer profile page — action buttons
// ---------------------------------------------------------------------------

(function initCustomerProfileActions() {
    const page = document.getElementById("customer-profile-page");
    if (!page) return;
    const customerId = parseInt(page.dataset.customerId, 10);
    if (isNaN(customerId)) return;

    page.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-profile-action]");
        if (!btn) return;
        const action   = btn.dataset.profileAction;
        const fullName = page.dataset.customerName || "this customer";
        if (action === "deactivate") deactivateCustomer(customerId);
        if (action === "reactivate") reactivateCustomer(customerId);
        if (action === "delete")     deleteCustomer(customerId);
        if (action === "export-csv") exportCustomerTransactions(customerId, fullName);
    });
})();

/** Delegated listener for the locked-staff unlock buttons on the Alerts page. */
document.getElementById("locked-staff-list")?.addEventListener("click", (event) => {
    const btn = event.target.closest("button.alerts-unlock-btn");
    if (!btn) return;
    const id = parseInt(btn.dataset.userId, 10);
    if (!isNaN(id)) unlockFromAlerts(id);
});

// ---------------------------------------------------------------------------
// Customer detail panel — live search
// ---------------------------------------------------------------------------

/** DOM refs for the detail-panel search controls. */
const detailSearchInput   = document.getElementById("detail-search-input");
const detailSearchBtn     = document.getElementById("detail-search-btn");
const detailSearchResults = document.getElementById("detail-search-results");

/**
 * Search for customers by name / email / account number and
 * display matching results in the detail search dropdown.
 * Results are shown as clickable buttons that load the full
 * detail view via viewCustomer().
 *
 * @param {string} query - Text to search for.
 */
async function detailSearch(query) {
    if (!query.trim()) return;
    try {
        const params   = new URLSearchParams({ search: query.trim(), limit: 8 });
        const response = await fetch(`/api/customers?${params}`);
        const customers = await handleJsonResponse(response);

        if (!customers.length) {
            detailSearchResults.innerHTML =
                `<div class="suggestion-item" style="color:var(--muted);cursor:default;">No customers found</div>`;
            detailSearchResults.classList.remove("hidden");
            return;
        }

        detailSearchResults.innerHTML = customers.map((c) => `
            <button type="button" class="suggestion-item" data-action="detail-pick" data-id="${c.id}">
                <strong>${escapeHtml(c.full_name)}</strong>
                <span style="color:var(--muted);font-size:12px;margin-left:8px;">${escapeHtml(c.account_number)}</span>
                <span class="status-pill ${c.is_active ? "status-active" : "status-inactive"}" style="margin-left:6px;">${c.is_active ? "Active" : "Inactive"}</span>
            </button>
        `).join("");
        detailSearchResults.classList.remove("hidden");
    } catch (error) {
        showToast(error.message, true);
    }
}

/** Trigger a search when the Find button is clicked. */
detailSearchBtn?.addEventListener("click", () => {
    detailSearch(detailSearchInput?.value || "");
});

/** Trigger search on Enter, close results on Escape. */
detailSearchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        detailSearch(detailSearchInput.value);
    }
    if (e.key === "Escape") {
        detailSearchResults?.classList.add("hidden");
    }
});

/** Auto-search after 2+ characters are typed. */
detailSearchInput?.addEventListener("input", () => {
    const q = detailSearchInput.value.trim();
    if (q.length >= 2) detailSearch(q);
    else detailSearchResults?.classList.add("hidden");
});

/** Delegated listener: clicking a search result opens the detail view. */
detailSearchResults?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action='detail-pick']");
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    if (!isNaN(id)) {
        detailSearchResults.classList.add("hidden");
        detailSearchInput.value = "";
        await viewCustomer(id);
    }
});

// Close the detail search dropdown when clicking outside the
// customer-view-section search form group.
document.addEventListener("click", (event) => {
    if (!event.target.closest("#customer-view-section .form-group")) {
        detailSearchResults?.classList.add("hidden");
    }
});

// Expose unlockStaffUser on window for any legacy callers.
// Event delegation is the primary mechanism — this is a fallback.
window.unlockStaffUser = unlockStaffUser;

// ---------------------------------------------------------------------------
// Session timeout warning
// ---------------------------------------------------------------------------

/**
 * I watch for user activity and warn at 18 minutes of inactivity
 * (2 minutes before the 20-minute server-side session expiry).
 * "Stay logged in" pings the CSRF token endpoint to reset the
 * server session timer, then resets the client timer too.
 */
(function initSessionTimeout() {
    const SESSION_MS  = 20 * 60 * 1000; // 20 minutes — matches server
    const WARN_MS     = 18 * 60 * 1000; // show modal at 18 minutes
    const WARN_PERIOD = SESSION_MS - WARN_MS; // 2-minute countdown

    const sessionModal    = document.getElementById("session-modal");
    const countdownEl     = document.getElementById("session-countdown");
    const stayBtn         = document.getElementById("session-stay-btn");
    const sessionLogoutBtn = document.getElementById("session-logout-btn");

    // Only run on authenticated pages (modal element present + user logged in).
    if (!sessionModal || !document.getElementById("logout-btn")) return;

    let idleTimer      = null;
    let countdownTimer = null;
    let warnStart      = null;

    /** Format remaining seconds as M:SS. */
    function fmtCountdown(ms) {
        const s   = Math.max(0, Math.ceil(ms / 1000));
        const min = Math.floor(s / 60);
        const sec = String(s % 60).padStart(2, "0");
        return `${min}:${sec}`;
    }

    /** Show the warning modal and start the countdown tick. */
    function showWarning() {
        warnStart = Date.now();
        sessionModal.classList.remove("hidden");
        stayBtn?.focus();
        countdownTimer = setInterval(() => {
            const remaining = WARN_PERIOD - (Date.now() - warnStart);
            if (countdownEl) countdownEl.textContent = fmtCountdown(remaining);
            if (remaining <= 0) {
                clearInterval(countdownTimer);
                // Auto-logout when countdown hits zero.
                ORIGINAL_FETCH("/api/auth/logout", { method: "POST" })
                    .finally(() => { window.location.href = "/login"; });
            }
        }, 500);
    }

    /** Hide the modal and cancel the countdown tick. */
    function dismissWarning() {
        sessionModal.classList.add("hidden");
        clearInterval(countdownTimer);
        countdownTimer = null;
        warnStart      = null;
    }

    /** Reset the idle timer on any user activity. */
    function resetIdle() {
        if (countdownTimer) return; // already in warning state — don't reset
        clearTimeout(idleTimer);
        idleTimer = setTimeout(showWarning, WARN_MS);
    }

    // "Stay logged in" — ping the server to refresh the session.
    stayBtn?.addEventListener("click", () => {
        dismissWarning();
        ORIGINAL_FETCH("/api/auth/csrf-token")
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data?.csrf_token) csrfToken = data.csrf_token; });
        resetIdle();
    });

    // "Log out now" — immediate logout.
    sessionLogoutBtn?.addEventListener("click", () => {
        dismissWarning();
        ORIGINAL_FETCH("/api/auth/logout", { method: "POST" })
            .finally(() => { window.location.href = "/login"; });
    });

    // Track mouse, keyboard, touch, and scroll as signs of activity.
    ["mousemove", "keydown", "pointerdown", "scroll", "touchstart"]
        .forEach(evt => document.addEventListener(evt, resetIdle, { passive: true }));

    // Kick off the initial timer.
    resetIdle();
})();

// ---------------------------------------------------------------------------
// Reports page
// ---------------------------------------------------------------------------

/**
 * Fetch aggregated reports data and render charts + tables.
 * Only runs when id="reports-page" is present.
 */
async function fetchReportsData() {
    const sentinel = document.getElementById("reports-page");
    if (!sentinel) return;

    setLoading(true);
    try {
        const data = await handleJsonResponse(
            await fetch("/api/reports")
        );

        // ---- Monthly volumes line chart ----
        const monthlyCtx = document.getElementById("monthly-volumes-chart");
        if (monthlyCtx && data.monthly_volumes) {
            const labels  = data.monthly_volumes.map(r => r.month);
            const amounts = data.monthly_volumes.map(r => r.total / 100);
            const counts  = data.monthly_volumes.map(r => r.count);
            if (window._monthlyChart) window._monthlyChart.destroy();
            window._monthlyChart = new Chart(monthlyCtx, {
                type: "line",
                data: {
                    labels,
                    datasets: [
                        {
                            label: "Volume (£)",
                            data: amounts,
                            borderColor: "#3b82f6",
                            backgroundColor: "rgba(59,130,246,0.08)",
                            yAxisID: "y",
                            tension: 0.3,
                            fill: true,
                        },
                        {
                            label: "Count",
                            data: counts,
                            borderColor: "#10b981",
                            backgroundColor: "rgba(16,185,129,0.08)",
                            yAxisID: "y1",
                            tension: 0.3,
                        }
                    ]
                },
                options: {
                    responsive: true,
                    interaction: { mode: "index", intersect: false },
                    scales: {
                        y:  { type: "linear", position: "left",  title: { display: true, text: "Volume (£)" } },
                        y1: { type: "linear", position: "right", title: { display: true, text: "Count" }, grid: { drawOnChartArea: false } }
                    },
                    plugins: { legend: { position: "top" } }
                }
            });
        }

        // ---- Transaction type doughnut ----
        const typeCtx = document.getElementById("type-breakdown-chart");
        if (typeCtx && data.type_totals) {
            if (window._typeChart) window._typeChart.destroy();
            window._typeChart = new Chart(typeCtx, {
                type: "doughnut",
                data: {
                    labels: data.type_totals.map(r => r.type),
                    datasets: [{
                        data: data.type_totals.map(r => r.total),
                        backgroundColor: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"],
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: "right" } }
                }
            });
        }

        // ---- Top customers table ----
        const topEl = document.getElementById("top-customers-list");
        if (topEl && data.top_customers) {
            topEl.innerHTML = data.top_customers.length === 0
                ? `<div class="customer-item"><p class="muted-text">No data.</p></div>`
                : data.top_customers.map(c => `
                    <div class="customer-item">
                        <div class="customer-info">
                            <strong>${c.full_name || "Unknown"}</strong>
                            <span class="muted-text">${c.account_number}</span>
                        </div>
                        <div style="text-align:right;">
                            <strong>${fmt(Number(c.total_volume))}</strong>
                            <span class="muted-text">${c.tx_count} txns</span>
                        </div>
                    </div>`).join("");
        }

        // ---- Risk summary stats ----
        const riskEl = document.getElementById("risk-summary-box");
        if (riskEl && data.risk_summary) {
            const r = data.risk_summary;
            riskEl.innerHTML = `
                <div class="stat-item">
                    <span class="stat-label">Risk-flagged transactions</span>
                    <span class="stat-value" style="color:var(--danger)">${r.flagged_count}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Total flagged value</span>
                    <span class="stat-value">${fmt(r.flagged_amount || 0)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">% of all transactions</span>
                    <span class="stat-value">${r.flagged_pct ?? "0.0"}%</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Total transactions</span>
                    <span class="stat-value">${r.total_count ?? 0}</span>
                </div>`;
        }

        // ---- Risk doughnut chart ----
        const riskChartCtx = document.getElementById("risk-chart");
        if (riskChartCtx && data.risk_summary) {
            const r = data.risk_summary;
            const safe = (r.total_count || 0) - (r.flagged_count || 0);
            if (window._riskChart) window._riskChart.destroy();
            window._riskChart = new Chart(riskChartCtx, {
                type: "doughnut",
                data: {
                    labels: ["Risk-flagged", "Clean"],
                    datasets: [{
                        data: [r.flagged_count || 0, safe],
                        backgroundColor: ["#ef4444", "#10b981"],
                        borderWidth: 2,
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { position: "bottom" },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => ` ${ctx.label}: ${ctx.parsed} txns`
                            }
                        }
                    }
                }
            });
        }

    } catch (err) {
        showToast(err.message, true);
    } finally {
        setLoading(false);
    }
}

// ---------------------------------------------------------------------------
// Alerts page
// ---------------------------------------------------------------------------

/**
 * Fetch alerts (risk transactions + locked staff) and render the page.
 * Only runs when id="alerts-page" is present.
 */
async function fetchAlerts() {
    const sentinel = document.getElementById("alerts-page");
    if (!sentinel) return;

    setLoading(true);
    try {
        const data = await handleJsonResponse(
            await fetch("/api/alerts")
        );

        // ---- Risk transactions ----
        const riskEl = document.getElementById("risk-transactions-list");
        if (riskEl) {
            if (!data.risk_transactions || data.risk_transactions.length === 0) {
                riskEl.innerHTML = `<div class="customer-item"><p class="muted-text">No risk-flagged transactions.</p></div>`;
            } else {
                riskEl.innerHTML = data.risk_transactions.map(t => `
                    <div class="customer-item">
                        <div class="customer-info">
                            <strong>${t.account_number}</strong>
                            <span class="badge badge-danger">RISK</span>
                            <span class="muted-text">${t.transaction_type.toUpperCase()}</span>
                        </div>
                        <div style="text-align:right;">
                            <strong>${fmt(t.amount)}</strong>
                            <span class="muted-text">${t.timestamp ? new Date(t.timestamp).toLocaleDateString("en-GB") : ""}</span>
                        </div>
                    </div>`).join("");
            }
        }

        // ---- Locked staff ----
        const lockedEl = document.getElementById("locked-staff-list");
        if (lockedEl) {
            if (!data.locked_staff || data.locked_staff.length === 0) {
                lockedEl.innerHTML = `<div class="customer-item"><p class="muted-text">No locked accounts.</p></div>`;
            } else {
                lockedEl.innerHTML = data.locked_staff.map(u => `
                    <div class="customer-item">
                        <div class="customer-info">
                            <strong>${u.username}</strong>
                            <span class="badge badge-warning">${u.role}</span>
                        </div>
                        <div style="text-align:right;">
                            <span class="muted-text">${u.failed_login_attempts} failed attempts</span>
                            <button class="ghost-btn alerts-unlock-btn" data-user-id="${u.id}" style="margin-left:8px;">Unlock</button>
                        </div>
                    </div>`).join("");
            }
        }

        // Update badge counts
        const riskBadge   = document.getElementById("alerts-risk-count");
        const lockedBadge = document.getElementById("alerts-locked-count");
        if (riskBadge)   riskBadge.textContent   = data.risk_transactions.length;
        if (lockedBadge) lockedBadge.textContent = data.locked_staff.length;

    } catch (err) {
        showToast(err.message, true);
    } finally {
        setLoading(false);
    }
}

/**
 * Unlock a staff account from the Alerts page.
 * @param {number} userId
 */
async function unlockFromAlerts(userId) {
    try {
        await handleJsonResponse(
            await fetch(`/api/staff-users/${userId}/unlock`, { method: "PATCH" })
        );
        showToast("Account unlocked.");
        fetchAlerts();
    } catch (err) {
        showToast(err.message, true);
    }
}

// Auto-init reports and alerts pages
if (document.getElementById("reports-page")) fetchReportsData();
if (document.getElementById("alerts-page"))  fetchAlerts();

// ---------------------------------------------------------------------------
// Staff profile page auto-init
// ---------------------------------------------------------------------------

(async function initStaffProfile() {
    const page = document.getElementById("staff-profile-page");
    if (!page) return;

    const userId   = parseInt(page.dataset.userId, 10);
    const username = page.dataset.username || "";
    if (isNaN(userId) || !username) return;

    // ── Login history: audit logs filtered to login events for this user ──
    const loginHistoryEl = document.getElementById("sp-login-history");
    // ── Full audit trail: all actions by this user ──
    const auditListEl    = document.getElementById("sp-audit-list");

    async function loadStaffAudit() {
        try {
            const params = new URLSearchParams({ actor: username, limit: 100 });
            const logs   = await handleJsonResponse(
                await fetch(`/api/audit-logs?${params}`)
            );

            // Login-specific events
            const loginEvents = logs.filter(l =>
                l.event_type === "login_success" || l.event_type === "login_failed"
            ).slice(0, 10);

            if (loginHistoryEl) {
                if (!loginEvents.length) {
                    loginHistoryEl.innerHTML =
                        `<div class="audit-item"><p class="muted-text">No login events found.</p></div>`;
                } else {
                    loginHistoryEl.innerHTML = loginEvents.map((log) => {
                        const ok = log.result === "success";
                        return `
                        <div class="audit-row">
                            <div class="audit-result-dot ${ok ? "audit-result-success" : "audit-result-failure"}" aria-hidden="true"></div>
                            <div class="audit-content">
                                <div class="audit-event">${escapeHtml(log.event_type)}</div>
                                <div class="audit-sub">${escapeHtml(log.ip_address || "—")} &middot; ${escapeHtml(formatDateTime(log.created_at))}</div>
                            </div>
                            <span class="audit-result-chip ${ok ? "chip-success" : "chip-failure"}">${escapeHtml(log.result)}</span>
                        </div>`;
                    }).join("");
                }
            }

            // Full audit trail (all events, clickable for detail)
            if (auditListEl) {
                if (!logs.length) {
                    auditListEl.innerHTML =
                        `<div class="audit-item"><p class="muted-text">No audit events found for this user.</p></div>`;
                } else {
                    auditListEl.innerHTML = logs.map((log) => {
                        const isSuccess = log.result === "success";
                        const isFailure = log.result === "failure";
                        const dotClass  = isSuccess ? "audit-result-success" :
                                          isFailure ? "audit-result-failure"  : "audit-result-other";
                        const chipClass = isSuccess ? "chip-success" :
                                          isFailure ? "chip-failure"  : "chip-other";
                        const dataJson = escapeHtml(JSON.stringify({
                            id: log.id, event_type: log.event_type, actor: log.actor,
                            details: log.details, result: log.result,
                            ip_address: log.ip_address, created_at: log.created_at
                        }));
                        return `
                        <div class="audit-row clickable" data-audit="${dataJson}" title="Click for details">
                            <div class="audit-result-dot ${dotClass}" aria-hidden="true"></div>
                            <div class="audit-content">
                                <div class="audit-event">${escapeHtml(log.event_type)}</div>
                                <div class="audit-detail">${escapeHtml(log.details)}</div>
                                <div class="audit-sub">${escapeHtml(log.ip_address || "—")} &middot; ${escapeHtml(formatDateTime(log.created_at))}</div>
                            </div>
                            <span class="audit-result-chip ${chipClass}">${escapeHtml(log.result)}</span>
                        </div>`;
                    }).join("");
                }
            }
        } catch (err) {
            showToast(err.message, true);
        }
    }

    await loadStaffAudit();

    // Unlock button
    document.getElementById("sp-unlock-btn")?.addEventListener("click", async () => {
        try {
            await handleJsonResponse(
                await fetch(`/api/staff-users/${userId}/unlock`, { method: "PATCH" })
            );
            showToast("Account unlocked.");
            // Reload the page to reflect the updated status.
            window.location.reload();
        } catch (err) {
            showToast(err.message, true);
        }
    });
})();

// ---------------------------------------------------------------------------
// Dedicated Customers page — event wiring
// ---------------------------------------------------------------------------

if (document.getElementById("customers-page")) {
    // New Customer modal open/close
    const ncModal  = document.getElementById("new-customer-modal");
    const openNcModal  = () => { ncModal?.classList.remove("hidden"); document.getElementById("full_name")?.focus(); };
    const closeNcModal = () => ncModal?.classList.add("hidden");
    document.getElementById("new-customer-btn")?.addEventListener("click", openNcModal);
    document.getElementById("nc-modal-close")?.addEventListener("click", closeNcModal);
    document.getElementById("nc-modal-cancel")?.addEventListener("click", closeNcModal);
    ncModal?.addEventListener("click", (e) => { if (e.target === ncModal) closeNcModal(); });

    // After a customer is successfully created, close the modal and refresh.
    // The existing customer-form submit handler calls fetchCustomers() which
    // no-ops here; hook a MutationObserver on the #message element instead.
    const msgEl = document.getElementById("message");
    if (msgEl) {
        new MutationObserver(() => {
            if (msgEl.textContent && !msgEl.style.color.includes("crimson")) {
                closeNcModal();
                fetchCustomersFull();
            }
        }).observe(msgEl, { childList: true, characterData: true, subtree: true });
    }

    // Initial load
    fetchCustomersFull();

    // Search / filter buttons
    document.getElementById("cf-search-btn")?.addEventListener("click", () => fetchCustomersFull(true));
    document.getElementById("cf-clear-btn")?.addEventListener("click", () => {
        const s = document.getElementById("cf-search");
        const st = document.getElementById("cf-status");
        const so = document.getElementById("cf-sort");
        if (s)  s.value  = "";
        if (st) st.value = "";
        if (so) so.value = "";
        fetchCustomersFull(true);
    });
    document.getElementById("cf-export-btn")?.addEventListener("click", () => {
        exportFile("/api/export/customers", "customers.csv")
            .then(() => showToast("Customers exported."))
            .catch(() => showToast("Export failed — check your permissions.", true));
    });

    // Enter key in search box
    document.getElementById("cf-search")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") fetchCustomersFull(true);
    });

    // Pagination
    document.getElementById("cf-prev-btn")?.addEventListener("click", () => {
        if (customersFullPage > 0) { customersFullPage--; fetchCustomersFull(); }
    });
    document.getElementById("cf-next-btn")?.addEventListener("click", () => {
        customersFullPage++; fetchCustomersFull();
    });

    // Delegated action buttons (edit / deactivate / activate / delete)
    document.getElementById("customers-full-list")?.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-cf-action]");
        if (!btn) return;
        const action = btn.dataset.cfAction;
        const id     = parseInt(btn.dataset.id, 10);
        if (isNaN(id)) return;

        if (action === "deactivate") deactivateCustomer(id);
        if (action === "activate")   reactivateCustomer(id);
        if (action === "delete")     deleteCustomer(id);
    });
}

// ---------------------------------------------------------------------------
// Customer profile page auto-init
// ---------------------------------------------------------------------------

(async function initCustomerProfile() {
    const page = document.getElementById("customer-profile-page");
    if (!page) return;

    const customerId = parseInt(page.dataset.customerId, 10);
    if (isNaN(customerId)) return;

    // Fetch the customer record to get the account number, then load
    // transactions (which filter by account number) and the timeline.
    try {
        const customer = await handleJsonResponse(
            await fetch(`/api/customers/${customerId}`)
        );
        fetchTransactionsForCustomer(customer.account_number);
        fetchCustomerTimeline(customerId);
    } catch (err) {
        showToast(err.message, true);
    }
})();

// ---------------------------------------------------------------------------
// Customer profile — live refresh after transactions / edits
// ---------------------------------------------------------------------------

/**
 * Re-fetch the customer record and update the live elements on the
 * customer profile page (balance, edit-form fields, transactions list,
 * timeline).  Safe to call from any page — returns immediately when
 * #customer-profile-page is not present.
 */
async function refreshCustomerProfile() {
    const page = document.getElementById("customer-profile-page");
    if (!page) return;
    const customerId = parseInt(page.dataset.customerId, 10);
    if (isNaN(customerId)) return;
    try {
        const customer = await handleJsonResponse(
            await fetch(`/api/customers/${customerId}`)
        );
        // Update hero balance display
        const balEl = document.getElementById("cp-balance-display");
        if (balEl) {
            balEl.textContent = `£${(customer.balance / 100).toFixed(2)}`;
            balEl.style.color = customer.balance < 25000 ? "var(--warning)" : "var(--success)";
        }
        // Update hero name
        const nameEl = document.getElementById("cp-name-display");
        if (nameEl) nameEl.textContent = customer.full_name;
        // Keep edit form in sync
        const editName  = document.getElementById("edit-full-name");
        const editEmail = document.getElementById("edit-email");
        const editNotes = document.getElementById("edit-notes");
        if (editName)  editName.value  = customer.full_name;
        if (editEmail) editEmail.value = customer.email;
        if (editNotes) editNotes.value = customer.notes || "";
        // Refresh the read-only notes display panel
        const notesDisplay = document.getElementById("cp-notes-display");
        if (notesDisplay) {
            if (customer.notes) {
                notesDisplay.innerHTML = `<div style="background:var(--primary-light);border-left:3px solid var(--primary);
                    border-radius:var(--radius-sm);padding:12px 14px;line-height:1.6;
                    white-space:pre-wrap;font-size:14px;">${customer.notes.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>`;
            } else {
                notesDisplay.innerHTML = `<p class="muted-text" style="padding:8px 0;">No notes recorded for this customer.</p>`;
            }
        }
        // Reload transactions and timeline panels
        fetchTransactionsForCustomer(customer.account_number);
        fetchCustomerTimeline(customerId);
    } catch (_) {
        // Silent — primary action already showed a toast
    }
}

// ---------------------------------------------------------------------------
// Last-login timestamp formatting
// ---------------------------------------------------------------------------

/**
 * Format an ISO 8601 date string as a human-readable relative time.
 * Returns strings like "2 hours ago", "Yesterday at 14:30", or a
 * full date for older entries.
 *
 * @param {string} iso - ISO 8601 date string from the server.
 * @returns {string} Human-readable relative time string.
 */
function formatRelativeTime(iso) {
    const date  = new Date(iso);
    const now   = new Date();
    const diffMs = now - date;
    const diffMins  = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays  = Math.floor(diffMs / 86400000);

    if (diffMins < 1)   return "Just now";
    if (diffMins < 60)  return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    if (diffDays === 1) {
        return `Yesterday ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
    return date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

// Populate the last-login span if it exists in the sidebar.
const lastLoginEl = document.getElementById("last-login-ts");
if (lastLoginEl && lastLoginEl.dataset.iso) {
    lastLoginEl.textContent = formatRelativeTime(lastLoginEl.dataset.iso);
}

// ---------------------------------------------------------------------------
// Error page — "Go Back" button (CSP-safe, no inline onclick)
// ---------------------------------------------------------------------------
document.querySelector(".go-back-btn")?.addEventListener("click", () => {
    history.back();
});

// Dark mode is initialised at the top of this file (search for
// initDarkMode) so it runs before any other code can fail.
