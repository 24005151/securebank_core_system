# SecureBank Core System — Changelog

---

## Latest Update (v14)

Fixed several bugs introduced when the customer profile page was split off from the dashboard. The core issue was that the CSRF token and session initialisation only ran on pages that had a customer list or transaction list — so any page without those elements (profile page, alerts, reports) never fetched the token and all mutating requests failed silently.

---

## Bug Fixes — v14

### Customer Profile — Deposit, Withdraw and Notes All Broken
All three forms on the customer profile page were failing because `fetchCsrfToken()` was never called there. The init IIFE only ran when `customerList`, `transactionList`, `auditList`, or `changePasswordForm` were in the DOM — none of which exist on the profile page. Every POST was rejected by the CSRF middleware before it even reached the endpoint.

Fixed by expanding the init condition to also trigger when `depositForm` or `#customer-profile-page` is present.

### Notes Display Not Updating After Save
The edit customer form saved notes correctly to the database, but `refreshCustomerProfile()` was only syncing the edit textarea — it wasn't rebuilding the read-only notes panel (`#cp-notes-display`) that sits at the top of the page. So after saving a note, the display stayed stale until a full page reload. Fixed by adding a DOM rebuild for that panel inside `refreshCustomerProfile()`.

### Alerts Page — 500 Internal Server Error
`/api/alerts` was crashing on every request. The endpoint was accessing `t.account_number` and `t.timestamp` on Transaction objects — neither of those columns exist. Transactions link to customers via `from_customer` and `to_customer` ORM relationships, and the timestamp column is `created_at`. Fixed by deriving the account number from the relationship (`t.to_customer or t.from_customer`) and switching to `t.created_at`.

### Alerts and Reports Pages Missing CSRF Token
Same root cause as the profile page issue — unlock buttons on the alerts page make PATCH requests that need a CSRF token, but the token was never fetched on that page. Added `alerts-page` and `reports-page` to the init IIFE condition.

---

## v13 — Currency, Role Fixes and Code Reorganisation

### All Amounts Now Display in Pounds
Every balance and transaction amount throughout the app was showing pence as pounds (e.g. £4100 instead of £41.00). Added a `fmt(pence)` helper function and applied it to all 16 currency display points across the dashboard, customer list, transaction list, detail modals, and reports. Amount inputs on all forms now accept decimal pounds (e.g. `£23.43`) and convert to pence via `Math.round(parseFloat * 100)` before sending to the API.

### Role Name Fixed Throughout — sysadmin → superadmin
The database stores `superadmin` but templates and routes were checking for `sysadmin` in around a dozen places. This meant superadmin users were silently blocked from all manager-only UI sections — the Staff sidebar link, Reports and Alerts pages, profile action buttons, and staff profile actions. Fixed everywhere: templates, `pages.py` route guards, and the staff filter dropdown.

### Server-Side Route Guards Added
The `/staff`, `/reports`, and `/alerts` page routes were only checking authentication, not role. Any staff member could navigate directly to those URLs. Added `role not in ("manager", "superadmin")` checks that return a 403.

### Password Change Fixed
The change-password form on the settings page was broken — `fetchCurrentUser()` and `fetchCsrfToken()` only ran when list panels were present, so the user ID was never populated and the CSRF token was never fetched. Fixed by adding `changePasswordForm` to the init condition.

### API Reorganised Into Domain Modules
`app/routes/api.py` was a single 815-line file. Split into eight focused modules under `app/routes/endpoints/`:
- `dashboard.py` — health check, dashboard summary, chart data
- `customers.py` — all customer CRUD endpoints
- `transactions.py` — deposit, withdraw, transfer, transaction list
- `audit.py` — audit log fetch and purge
- `staff.py` — staff user management
- `exports.py` — CSV export endpoints
- `reports.py` — reports data
- `alerts.py` — alerts and locked accounts

`api.py` is now a 30-line combiner that includes all the routers.

### Reports Risk Chart Fixed
The risk summary panel was text-only. Added a Chart.js doughnut chart alongside the stats showing flagged vs clean transactions — red for flagged, green for clean.

### CSP Violations Fixed in Error Pages
The 403 and 404 error pages had `onclick="history.back()"` which is blocked by the `script-src 'self'` Content-Security-Policy. Replaced with a `class="go-back-btn"` and wired up via delegated event listener in app.js.

### Reports and Alerts Sidebar Gating
The Reports and Alerts sidebar links were visible to all staff but the pages themselves were manager-only. Added `{% if user.role in ['manager', 'superadmin'] %}` checks to the base template so the links only show for the right roles.

### New Superadmin Account — Gbisley
Created a seeded superadmin account for Gbisley with `must_change_password=True`. Will be prompted to set a new password on first login.

---

## v12 — Security Overhaul and Full UI Rebuild

### Customer Profile — Account Actions
Added proper account management to each customer profile page. Previously it was a read-only view. You can now deposit, withdraw, transfer funds, and edit customer details all from the profile. After any transaction or edit, the balance in the hero card updates live without a page reload.

### New Pages
Built dedicated pages for everything rather than cramming it onto the dashboard:
- `/customers` — full customer directory with search, filter, sort, pagination, and a New Customer modal
- `/customers/{id}` — individual customer profile with all account actions
- `/transactions` — full transaction log with click-to-expand detail rows
- `/audit` — audit trail with full event detail modals
- `/staff` — staff management with create user, change password, unlock
- `/staff/{id}` — individual staff profile with login history
- `/reports` — monthly volume chart, transaction type breakdown, top customers, risk summary
- `/alerts` — risk-flagged transactions and locked accounts with unlock buttons
- `/settings` — settings page with password change
- `/help` — accessible without login

### Security Hardening
- API key moved to `.env` (`API_KEY`), removed hardcoded value
- Session secret from `.env` (`SESSION_SECRET_KEY`), app won't start without it
- Timing-safe comparisons via `hmac.compare_digest` for API key and CSRF token
- CSRF double-submit token pattern on all POST/PUT/PATCH/DELETE requests
- Rate limiting on login — 10 attempts per minute per IP via `slowapi`
- Security headers middleware — CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`
- Session re-validation on every authenticated request — locked accounts are ejected immediately
- Username enumeration fixed — locked accounts return the same error as wrong credentials
- IP handling via `request.client.host` only — ignores `X-Forwarded-For` to prevent spoofing

### Other Features
- Pagination on all list endpoints with Prev/Next UI
- Staff management — create, unlock, change passwords with strength validation
- Must-change-password flow — new accounts redirect to the password form on first login
- CSV export with audit log entry
- Audit log purge endpoint
- Auto-refresh on dashboard every 30 seconds

---

## Test Accounts

| Username | Password | Role | Notes |
|---|---|---|---|
| `admin` | `Admin123` | manager | Must change password on first login |
| `staff1` | `Staff123` | staff | Must change password on first login |
| `admin2` | `Watford88` | manager | No forced password change |
| `sysadmin` | `Sysadmin1` | superadmin | Must change password on first login |
| `Gbisley` | `woLIP2m@ga5r` | superadmin | Must change password on first login |

---

## Files — What Not to Commit

| File | Why |
|---|---|
| `.env` | Contains your real `API_KEY` and `SESSION_SECRET_KEY` |
| `securebank.db` | SQLite database — has real user data |
| `venv/` | Python virtual environment |
| `__pycache__/` | Auto-generated bytecode |

The `.env.example` is safe to commit — placeholder values only.

---

## How to Run

```bash
cp .env.example .env
# Fill in API_KEY and SESSION_SECRET_KEY
# Generate with: python3 -c "import secrets; print(secrets.token_hex(32))"

pip install -r requirements.txt
uvicorn app.main:app --reload
# Open http://localhost:8000
```

---

## Known Limitations

| Issue | Severity | Notes |
|---|---|---|
| SQLite race condition on balance | Medium | Two simultaneous withdrawals can both go through. Use PostgreSQL with `SELECT FOR UPDATE` in production |
| Demo passwords are predictable | High | Seed accounts are flagged `must_change_password=True` — change them before deploying |
| No HTTPS in dev | — | Set `HTTPS_ONLY=true` in `.env` when running behind TLS |
| No GDPR erasure on audit logs | Low | Use `DELETE /api/audit-logs?days=N` to manage retention |
