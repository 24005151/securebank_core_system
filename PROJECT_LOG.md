# SecureBank Core System — Full Project Log

A complete record of every change made to the system, in chronological order, including all faults found, errors encountered, and how each was resolved. Tests carried out against each build are documented in full.

This log covers work carried out across multiple sessions — both local development sessions (reflected in git commits) and advisory/debugging sessions where analysis and troubleshooting work was carried out before or between commits.

---

## Build History Summary

| Date | Version | Commit | Description |
|---|---|---|---|
| 18 Mar 2026 | 1 | `f7e074a` | Initial customer management prototype |
| 18 Mar 2026 | 2 | `4d31372` | UI styling and dashboard layout |
| 18 Mar 2026 | 3 | `fa38462` | Password hashing with pbkdf2_sha256 |
| 18 Mar 2026 | 4 | `1f69fab` | Customer editing, detail view, dashboard metrics |
| 18 Mar 2026 | 5 | `6fd89a4` | Sidebar, tables, badges, custom modal |
| 18 Mar 2026 | — | `1591aa7` | Separated auth and CRUD files for role-based login |
| 18 Mar 2026 | — | `22b6271` | Customer transaction view, manager edit visibility |
| 18 Mar 2026 | — | `7ef0232` | Role-based customer management fixes |
| 18 Mar 2026 | — | `6b1cf30` | Live search, customer management improvements |
| 19 Mar 2026 | — | `bd76a7a` | Smooth scroll to customer view section |
| 23 Mar 2026 | — | (advisory) | Environment setup, startup debugging, auth troubleshooting, security review |
| 24 Mar 2026 | — | `e8b7173` | Audit logging, CSV export, UI expansion |
| 28 Mar 2026 | — | `47a0a2c` | API security updates |
| 07 Apr 2026 | 6 | `7fc9ded` | Major security, feature and UI overhaul |
| 08 Apr 2026 | 7 | `68bc58e` | Full automated test suite added |
| 08 Apr 2026 | — | `0998fdd` | Sysadmin added to login page, version bump |
| 14 Apr 2026 | 7.1 | `6a45e83` | Footer, dark mode, last login, confirm delete, notes |
| 14 Apr 2026 | — | (advisory) | Dark mode troubleshooting, UI structure review, frontend maintainability |
| 14 Apr 2026 | — | `6fd7fab` | 6 further UI/UX and functional improvements |
| 14 Apr 2026 | — | `9c3dee8` | Dark mode CSS variables fix |
| 14 Apr 2026 | — | `762487b` | Dark mode toggle fix |
| 14 Apr 2026 | — | `0bc8e7f` | Dark mode cache and notes visibility fix |
| 14 Apr 2026 | — | `0cb1789` | Dark mode button detection hardened, cache v9 |
| 15 Apr 2026 | 12–14 | (uncommitted) | Security hardening, multi-page build, bug fixes |
| 17 Apr 2026 | — | (advisory) | Route review, role protection analysis, GitHub update documentation |

---

## Detailed Change Log

---

### 18 March 2026 — Initial Builds (v1–v5)

**What was built:**
- Project scaffolded with FastAPI, SQLAlchemy (SQLite), and Jinja2 templates
- Basic customer list displayed on a single-page dashboard
- Customer creation form with name, email, and opening balance
- Customer edit and detail view (v4)
- Role-based login — `staff` and `manager` roles with different UI visibility
- Auth and CRUD code separated into dedicated files
- Password hashing switched from plaintext to `pbkdf2_sha256` (v3)
- Sidebar navigation with tables, badges, and a custom modal UI (v5)
- Customer transaction view added — staff can see transactions per customer
- Live search on the customer list
- Smooth scroll to customer view section

**Known limitations at this stage (addressed in later builds):**
- No CSRF protection on any mutating endpoint
- API key hardcoded as `"Devilcat1988"` in source code
- No session secret key — insecure cookie signing
- No security headers on responses
- No rate limiting on login endpoint — brute-force possible
- No audit logging
- Passwords stored in plaintext until v3

---

### 23 March 2026 — Advisory Session: Environment Setup, Startup Debugging, Auth Troubleshooting

This session covered investigative and troubleshooting work rather than committed code changes. The issues identified here directly informed the security and structural work carried out in later commits.

**Environment and startup issues investigated:**
- Reviewed the full project structure: `app/main.py`, `crud.py`, `database.py`, `models.py`, `schemas.py`, routes, templates, and static files
- Confirmed project location: `/Users/gareth/Documents/securebank_core_system`
- Confirmed correct startup command: `python -m uvicorn app.main:app --reload --port 8001`

**Startup faults found and resolved:**

| Fault | Root Cause | Resolution |
|---|---|---|
| App would not start | Wrong Python interpreter used — system Python instead of virtual environment | Switched to `venv/bin/python` |
| `ModuleNotFoundError: fastapi` | `fastapi` not installed in the active virtual environment | `pip install fastapi` inside venv |
| `ModuleNotFoundError: uvicorn` | `uvicorn` not installed in the active virtual environment | `pip install uvicorn` inside venv |
| Import error on startup | App imported as `main` instead of `app.main` | Changed startup command to use `app.main:app` |

**Authentication issue investigated:**
- `GET /login` returned 200 (login page loading correctly)
- `POST /api/auth/login` returned 401 Unauthorized
- Investigated login flow — password hash comparison and session handling reviewed
- Database reset attempted by removing old database files to clear stale/corrupted state
- Issue traced to password mismatch between seeded hash and expected credentials

**Security discussion:**
- Reviewed API protection approach — discussion around using a private API key for frontend requests
- Identified that API key was hardcoded in source at this stage (later fixed in v6 as FAULT 002)
- Began planning for `.env`-based secret management

**Testing/documentation work:**
- Reviewed risk-based testing plan structure linked to the system
- Identified areas requiring formal test coverage

---

### 28 March 2026 — API Security Update

**What changed:**
- Early API security hardening — groundwork for moving secrets out of source code
- Commit `47a0a2c`

---

### 07 April 2026 — v6: Major Security and UI Overhaul

**Security changes applied:**
- API key moved from hardcoded `"Devilcat1988"` to `.env` as `API_KEY`
- Session secret moved to `.env` as `SESSION_SECRET_KEY` — app refuses to start without it
- CSRF double-submit token pattern added — token fetched on page load, injected automatically via `window.fetch` interceptor
- Timing-safe comparisons using `hmac.compare_digest` for API key and CSRF token checks
- Rate limiting on login — 10 attempts per minute per IP via `slowapi`
- Security headers middleware added to all responses (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection)
- Session re-validation on every authenticated request — locked accounts ejected mid-session
- Username enumeration prevention — locked accounts return same error as wrong credentials
- IP handling fixed to use `request.client.host` only, ignoring `X-Forwarded-For`
- `HTTPS_ONLY` env flag sets secure cookie attribute

**New pages built:**
- `/customers`, `/customers/{id}`, `/transactions`, `/audit`, `/staff`, `/staff/{id}`, `/reports`, `/alerts`, `/settings`, `/help`

**API reorganised into domain modules** under `app/routes/endpoints/` — `api.py` reduced from 815 lines to a 30-line combiner.

---

### 08 April 2026 — v7: Full Automated Test Suite

**Test infrastructure added:**

`tests/conftest.py` — shared fixtures:
- In-memory SQLite database so every test run starts clean and isolated from `securebank.db`
- SlowAPI rate limiter disabled globally for tests (lockout logic tested independently of rate limit)
- `client` fixture — session-scoped TestClient that persists cookies across requests
- `api_headers` fixture — pre-loaded with test API key (bypasses CSRF — correct behaviour for API consumers)
- `auth_client` fixture — separate TestClient logged in as `admin` (manager role), independent cookie jar so security tests that call `logout` do not affect it
- `csrf_token` / `csrf_headers` fixtures for session-auth mutation tests

#### `test_health.py` — 7 tests

| Test | What it checks |
|---|---|
| `test_health_endpoint_returns_ok` | `GET /api/health` returns 200 with `status: ok` |
| `test_health_endpoint_lists_security_features` | Health response lists at least 6 security controls |
| `test_health_endpoint_includes_timestamp` | Health response includes a timestamp |
| `test_login_page_served_to_unauthenticated_user` | Unauthenticated `GET /` redirects to `/login` with 303 |
| `test_login_page_html_loads` | `GET /login` returns 200 with HTML containing "SecureBank" |
| `test_static_css_served` | CSS file served with correct `text/css` content-type |
| `test_static_js_served` | JavaScript file served with 200 |

#### `test_auth.py` — 12 tests

| Test | Risk | What it checks |
|---|---|---|
| `test_login_success_returns_role` | — | Valid credentials return correct role in response |
| `test_login_success_returns_must_change_flag` | — | Login response includes `must_change_password` flag |
| `test_login_establishes_session` | — | After login, `/me` returns the current user |
| `test_wrong_password_rejected` | R001 | Wrong password returns 401 |
| `test_wrong_password_returns_generic_message` | R003 | Error message does not reveal whether the username exists |
| `test_unknown_username_returns_generic_message` | R003 | Unknown username returns identical message to wrong password |
| `test_empty_credentials_rejected` | — | Empty username/password rejected at schema level (422) |
| `test_account_locks_after_failures` | R002 | Account locks after 3 consecutive wrong passwords |
| `test_locked_account_returns_generic_error` | R003 | Locked account returns same error as wrong credentials |
| `test_logout_clears_session` | R007 | After logout, `/me` returns 401 |
| `test_unauthenticated_me_returns_401` | R001 | Unauthenticated `/me` returns 401 |
| `test_csrf_token_issued_after_login` | — | CSRF endpoint returns a 64-character hex token |

#### `test_customers.py` — 18 tests

| Test | Risk | What it checks |
|---|---|---|
| `test_customer_list_returns_list` | — | `GET /api/customers` returns a JSON array |
| `test_customer_list_contains_required_fields` | — | Each record has id, full_name, email, account_number, balance, is_active, created_at |
| `test_customer_search_by_name` | — | Name search returns only matching customers |
| `test_customer_filter_active_only` | — | Status=active filter returns only active customers |
| `test_customer_filter_inactive_only` | — | Status=inactive filter returns only inactive customers |
| `test_customer_pagination_limit` | — | Limit parameter caps result count |
| `test_get_customer_by_id` | — | `GET /api/customers/{id}` returns the correct single record |
| `test_get_nonexistent_customer_returns_404` | — | Non-existent ID returns 404 |
| `test_create_customer_success` | — | POST creates customer, returns record with SB-prefixed account number |
| `test_create_customer_generates_unique_account_number` | — | Two customers get different account numbers |
| `test_duplicate_email_rejected` | R010 | Second customer with same email returns 400 |
| `test_create_customer_single_name_rejected` | R009 | Single-word name rejected with 422 |
| `test_create_customer_negative_balance_rejected` | R009 | Negative opening balance rejected with 422 |
| `test_create_customer_invalid_email_rejected` | R009 | Malformed email rejected with 422 |
| `test_deactivate_customer` | — | PATCH deactivate sets `is_active` to False |
| `test_deactivate_already_inactive_returns_400` | — | Deactivating inactive customer returns 400 |
| `test_reactivate_customer` | — | PATCH reactivate sets `is_active` back to True |
| `test_customer_timeline_returns_list` | — | Timeline endpoint returns a list with at least 1 event |

#### `test_transactions.py` — 16 tests

| Test | Risk | What it checks |
|---|---|---|
| `test_deposit_increases_balance` | — | Deposit credits exactly the stated amount |
| `test_deposit_returns_transaction_record` | — | Deposit response includes transaction type and amount |
| `test_large_deposit_sets_risk_flag` | R013 | Deposit ≥ £1,000 is auto risk-flagged |
| `test_small_deposit_not_risk_flagged` | R013 | Deposit below £1,000 is not flagged |
| `test_deposit_nonexistent_account_rejected` | — | Deposit to unknown account number returns 400 |
| `test_deposit_zero_amount_rejected` | R009 | Zero-value deposit rejected with 422 |
| `test_withdrawal_decreases_balance` | — | Withdrawal debits exactly the stated amount |
| `test_withdraw_insufficient_funds` | R011 | Withdrawal exceeding balance rejected; balance verified unchanged |
| `test_transfer_moves_funds_between_accounts` | — | Transfer debits sender and credits receiver by the same amount |
| `test_self_transfer_rejected` | R012 | Transfer to the same account returns 400 |
| `test_transfer_insufficient_funds` | R011 | Transfer exceeding sender balance rejected |
| `test_deposit_inactive_account_rejected` | R014 | Deposit to inactive account returns 400 |
| `test_withdraw_inactive_account_rejected` | R014 | Withdrawal from inactive account returns 400 |
| `test_transaction_list_returns_list` | — | `GET /api/transactions` returns a JSON array |
| `test_transaction_filter_by_type` | — | Type filter returns only the specified transaction type |
| `test_transaction_filter_by_account` | — | Account number filter returns only that customer's transactions |

#### `test_security.py` — 17 tests

| Test | Risk | What it checks |
|---|---|---|
| `test_x_content_type_options_header` | R008 | `X-Content-Type-Options: nosniff` present on all responses |
| `test_x_frame_options_header` | R005 | `X-Frame-Options: DENY` present on all responses |
| `test_referrer_policy_header` | R008 | Referrer-Policy includes `strict-origin` |
| `test_x_xss_protection_header` | R008 | `X-XSS-Protection: 1; mode=block` present |
| `test_content_security_policy_header` | R004 | CSP has `default-src 'self'` and `script-src 'self'` |
| `test_csp_blocks_unsafe_inline_scripts` | R004 | `unsafe-inline` absent from `script-src` directive |
| `test_protected_customers_requires_auth` | R001 | `/api/customers` returns 401 without credentials |
| `test_protected_dashboard_requires_auth` | R001 | `/api/dashboard-summary` returns 401 without credentials |
| `test_protected_transactions_requires_auth` | R001 | `/api/transactions` returns 401 without credentials |
| `test_api_key_grants_access_to_customers` | — | Valid API key grants access |
| `test_invalid_api_key_rejected` | — | Invalid API key rejected with 401 |
| `test_staff_cannot_access_audit_logs` | R003 | Unauthenticated request to audit log returns 401/403 |
| `test_manager_can_access_audit_logs` | R003 | Manager session can read audit logs (200) |
| `test_staff_cannot_access_staff_user_list` | R003 | Staff user list blocked without auth |
| `test_manager_can_read_staff_users` | R003 | Manager session can list staff users |
| `test_mutation_without_csrf_returns_403` | R006 | POST without `X-CSRF-Token` returns 403 |
| `test_api_key_bypasses_csrf_requirement` | R006 | API key auth correctly bypasses CSRF check |
| `test_delete_without_csrf_returns_403` | R006 | DELETE without CSRF token returns 403 |

**Total automated tests at v7: 70**

---

### 14 April 2026 — Advisory Session: Dark Mode Troubleshooting and UI Structure Review

This session covered analysis and diagnosis of the dark mode failure before the fix commits were written. The investigation identified the root causes that were then resolved across four subsequent commits (`9c3dee8`, `762487b`, `0bc8e7f`, `0cb1789`).

**Work carried out:**
- Reviewed the full project stylesheet (`style.css`) to identify why dark mode was not applying correctly across components
- Analysed the dark mode toggle button — identified that `getElementById` was returning `null` on certain pages, causing the toggle to silently fail
- Identified that hardcoded hex colour values throughout the CSS were not being overridden by the dark mode variable system
- Identified the competing `@media prefers-color-scheme: dark` block as a conflict source
- Reviewed code organisation and frontend structure for long-term maintainability
- Reviewed how the dark mode state was being persisted in `localStorage` and why it was not surviving page navigation correctly

**Faults identified in this session:**
- FAULT 014 (see Faults section) — dark mode not applying to all components, four root causes identified
- Button detection failure causing silent JS error on pages where toggle DOM structure differed
- Notes panel invisible in dark mode due to hardcoded background colour

These findings were resolved in the four dark mode fix commits later the same day.

---

### 14 April 2026 — v7.1: UI/UX Additions and Dark Mode

**What was added:**
- Footer in base template with version number and branding
- Dark mode toggle persisting preference in `localStorage`
- Last login timestamp on staff profiles (relative time for recent, full date for older)
- Confirm delete modal on all destructive actions
- Customer notes — staff can record internal notes per customer

---

## Faults Found, Errors Encountered, and Resolutions

This section documents every bug, fault, and error found across the project lifetime, when it was found, what caused it, and how it was fixed.

---

### FAULT 001 — Plaintext password storage
**Discovered:** 18 March 2026 (v1–v2)
**Severity:** Critical
**Description:** Passwords were stored in the database in plaintext. Any database read — whether by an attacker, a DBA, or a backup leak — would expose all user passwords directly.
**Root cause:** Initial prototype used no hashing at all.
**Resolution:** Switched to `pbkdf2_sha256` hashing in v3. All passwords are hashed before being written to the database and compared using the hash library's verify function on login.
**Tested by:** Manual login verification after hash migration.

---

### FAULT 002 — Hardcoded API key in source code
**Discovered:** April 2026 (identified during v6 security review)
**Severity:** Critical
**Description:** The API key was hardcoded as the string `"Devilcat1988"` directly in the Python source. Anyone with read access to the repository could immediately use it to make authenticated API calls.
**Root cause:** Key was set during initial development and never moved to configuration.
**Resolution:** Key removed from source. Now loaded from `.env` as `API_KEY` at startup. Application will not start if the variable is missing or empty. `.env` is in `.gitignore`.
**Tested by:** `test_invalid_api_key_rejected` — confirms that only the correct key grants access.

---

### FAULT 003 — No session secret key
**Discovered:** April 2026 (v6 security review)
**Severity:** High
**Description:** The `SessionMiddleware` was running without a proper secret key, meaning session cookies were signed with a weak or default value. Sessions could potentially be forged.
**Root cause:** Secret not configured for the initial build.
**Resolution:** `SESSION_SECRET_KEY` loaded from `.env`. App raises an error at startup if not set, preventing deployment with an insecure configuration.
**Tested by:** Startup validation check; session integrity test `test_logout_clears_session`.

---

### FAULT 004 — No CSRF protection on mutating endpoints
**Discovered:** April 2026 (v6 security review)
**Severity:** High
**Description:** All POST, PUT, PATCH, and DELETE endpoints accepted requests without any cross-site request forgery protection. A malicious page could silently trigger fund transfers or account deletions against a logged-in user.
**Root cause:** CSRF protection was not part of the initial build.
**Resolution:** Implemented the double-submit cookie pattern. On page load, the frontend calls `/api/auth/csrf-token` which issues a cryptographically random 32-byte hex token stored server-side in the session. A `window.fetch` interceptor automatically adds the token as an `X-CSRF-Token` header on all mutating requests. The server validates the token using `hmac.compare_digest` to prevent timing attacks.
**Tested by:** `test_mutation_without_csrf_returns_403`, `test_delete_without_csrf_returns_403`, `test_api_key_bypasses_csrf_requirement`.

---

### FAULT 005 — Login endpoint vulnerable to brute force
**Discovered:** April 2026 (v6 security review)
**Severity:** High
**Description:** No rate limiting on the login endpoint. An attacker could make unlimited login attempts to brute-force passwords.
**Root cause:** Rate limiting not implemented in the initial build.
**Resolution:** Two-layer protection added:
1. Account lockout after 3 consecutive failed attempts for the same username.
2. SlowAPI rate limiter — maximum 10 login attempts per minute per IP address.
**Tested by:** `test_account_locks_after_failures` — verifies account locks after 3 failures; correct password on the 4th attempt still rejected.

---

### FAULT 006 — Username enumeration via different error messages
**Discovered:** April 2026 (v6 security review)
**Severity:** Medium
**Description:** The login endpoint returned a different error message for a locked account than for an incorrect password. An attacker could probe usernames by locking accounts and observing the distinct response, confirming which usernames exist.
**Root cause:** Separate code paths returned different error strings depending on the failure reason.
**Resolution:** All login failures — wrong password, unknown username, and locked account — now return the identical message: `"Invalid username or password."` The lock status is not disclosed.
**Tested by:** `test_wrong_password_returns_generic_message`, `test_unknown_username_returns_generic_message`, `test_locked_account_returns_generic_error`.

---

### FAULT 007 — No security headers on HTTP responses
**Discovered:** April 2026 (v6 security review)
**Severity:** Medium
**Description:** No security headers were set on any response. This left the app exposed to clickjacking (no X-Frame-Options), MIME-sniffing attacks (no X-Content-Type-Options), and cross-site scripting via inline scripts (no Content-Security-Policy).
**Root cause:** Security headers not part of the initial build.
**Resolution:** A `SecurityHeadersMiddleware` class added to `main.py` that injects the following on every response:
- `Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-XSS-Protection: 1; mode=block`
**Tested by:** `test_x_content_type_options_header`, `test_x_frame_options_header`, `test_referrer_policy_header`, `test_x_xss_protection_header`, `test_content_security_policy_header`, `test_csp_blocks_unsafe_inline_scripts`.

---

### FAULT 008 — No server-side access control on /staff, /reports, /alerts pages
**Discovered:** 15 April 2026
**Severity:** High
**Description:** The `/staff`, `/reports`, and `/alerts` page routes checked that the user was logged in but did not verify their role. Any staff member could navigate directly to these URLs and access manager-only pages including the full staff user list, audit reports, and risk alerts.
**Root cause:** Role check was not added when the routes were created — only the authentication check was present.
**Resolution:** Added role enforcement to all three routes in `pages.py`:
```python
if user.get("role") not in ("manager", "superadmin"):
    raise HTTPException(status_code=403, detail="Manager access required.")
```
**Tested by:** `test_staff_cannot_access_audit_logs`, `test_staff_cannot_access_staff_user_list` in `test_security.py`.

---

### FAULT 009 — Role name mismatch: templates checking "sysadmin", database storing "superadmin"
**Discovered:** 15 April 2026
**Severity:** High
**Description:** The database and all backend code stored the top-level admin role as `superadmin`. However, templates in 8+ places were checking for `sysadmin`. This silently blocked all superadmin users from:
- The Staff sidebar link in the navigation
- The Reports and Alerts sidebar links
- The Deactivate, Export, and Delete action buttons on customer profiles
- The admin controls on the staff profile page
- The staff management page itself
Superadmin users appeared to have the same access as regular staff with no error message explaining why.
**Root cause:** The role name was inconsistently chosen during early development and the mismatch was never caught because the superadmin user was not tested against every UI section.
**Files affected:** `base.html`, `staff_profile.html`, `customers.html`, `staff.html`, `settings.html`, `pages.py`
**Resolution:** All role string comparisons updated from `sysadmin` / `['manager', 'sysadmin']` to `superadmin` / `['manager', 'superadmin']` across all affected files.
**Tested by:** Manual verification — superadmin login confirmed access to all manager-level pages and action buttons.

---

### FAULT 010 — CSP violations on error pages (onclick attribute)
**Discovered:** 15 April 2026
**Severity:** Medium
**Description:** The 403 and 404 error pages contained `onclick="history.back()"` on the back button. The Content-Security-Policy header (`script-src 'self'`) blocks all inline event handlers. The back button was silently non-functional on those pages.
**Root cause:** Error pages were written before the CSP middleware was added and not updated to comply with it.
**Resolution:** Removed all `onclick` attributes from error page buttons. Replaced with `class="go-back-btn"` and added a delegated event listener in `app.js` that calls `history.back()` on click.
**Tested by:** Manual verification — back button functional on 403 and 404 pages with no CSP violation in browser console.

---

### FAULT 011 — Reports and Alerts sidebar links visible to all staff roles
**Discovered:** 15 April 2026
**Severity:** Low (UI inconsistency)
**Description:** The Reports and Alerts sidebar links were rendered for all logged-in users including `staff` role, even though clicking them would result in a 403 error (after server-side guards were added in Fault 009 fix). Staff users saw navigation links that led nowhere useful.
**Root cause:** Role check not applied to the sidebar link rendering in `base.html`.
**Resolution:** Wrapped both sidebar links in `{% if user.role in ['manager', 'superadmin'] %}` so they only render for users who can actually access those pages.
**Tested by:** Manual verification — staff login confirmed Reports and Alerts links absent from sidebar.

---

### FAULT 012 — Password change form broken — CSRF token not fetched on settings page
**Discovered:** 15 April 2026
**Severity:** High
**Description:** The change-password form on the settings page was completely non-functional. Submitting it silently failed with a CSRF validation error. The user saw no error message.
**Root cause:** The initialisation IIFE in `app.js` only called `fetchCurrentUser()` and `fetchCsrfToken()` when certain DOM elements were present: `customerList`, `transactionList`, or `auditList`. None of these elements exist on the settings page. As a result, the CSRF token was never fetched, `csrfToken` remained `null`, and every POST was rejected by the server's CSRF middleware before reaching the password change logic.
**Resolution:** Added `changePasswordForm` to the IIFE condition so the token is fetched on any page containing that form element:
```javascript
if (customerList || transactionList || auditList || changePasswordForm) {
    await fetchCurrentUser();
    await fetchCsrfToken();
}
```
**Tested by:** Manual verification — password change confirmed working on the settings page.

---

### FAULT 013 — All currency amounts displaying pence as pounds
**Discovered:** 15 April 2026
**Severity:** High
**Description:** Every balance and transaction amount displayed throughout the application was wrong. The database stores amounts in pence (integers) as designed, but the frontend was displaying the raw pence value with a `£` prefix — showing `£4100` instead of `£41.00`, `£50000` instead of `£500.00`, etc. This affected 16 display points: dashboard summary tiles, customer list rows, transaction list rows, the detail modal, reports totals, and the customer profile hero balance.

Additionally:
- Amount input fields accepted integer pence (e.g. `2343`) but the forms were labelled to suggest pounds
- The balance warning colour threshold was `< 250` (triggering amber at £2.50 instead of £250)
- The monthly reports chart showed pence values on the Y axis

**Root cause:** A design decision was made to store all monetary values as integer pence for precision. The display layer was never updated to divide by 100 before rendering.
**Resolution:**
- Added a `fmt(pence)` helper function as the single canonical currency formatter: `£${(pence/100).toLocaleString("en-GB", {minimumFractionDigits:2, maximumFractionDigits:2})}`
- Applied `fmt()` to all 16 currency display points across the app
- Updated all amount input fields to accept decimal pounds (`min="0.01" step="0.01" placeholder="e.g. 23.43"`)
- Added `Math.round(parseFloat(input) * 100)` conversion in all form submit handlers before sending to the API
- Monthly chart data divided by 100 before passing to Chart.js
- Balance warning threshold corrected from `< 250` to `< 25000`
**Tested by:** Manual verification across all pages — dashboard, customer list, transaction list, reports, customer profile, detail modal.

---

### FAULT 014 — Dark mode not applying to all components (multiple issues)
**Discovered:** 14 April 2026 (series of 4 commits to resolve fully)
**Severity:** Low (visual)
**Description:** After dark mode was added, several components and pages continued to display light-mode colours regardless of the toggle. The issues were:

1. **Hardcoded hex colours** — many CSS rules used literal colour values (`#ffffff`, `#1e293b`, etc.) instead of CSS variables. Dark mode only overrode the variables, so hardcoded values stayed light.
2. **Competing `@media prefers-color-scheme` blocks** — a `prefers-color-scheme: dark` media query in the stylesheet was applying its own dark palette, which then conflicted with and partially overrode the manual toggle's variable overrides.
3. **Button detection failure** — the dark mode toggle button was found by `getElementById` which returned `null` on pages where the button had a different container structure, causing a silent JS error that prevented the toggle from wiring up at all.
4. **Notes panel invisible in dark mode** — the notes display panel used a hardcoded background colour that became unreadable against the dark background.
5. **Browser cache** — after CSS fixes were applied, browsers continued serving the old cached stylesheet.

**Root cause:** Dark mode was added as a feature on top of a stylesheet that was written with fixed colours throughout, rather than being built with CSS variables from the start. Each commit in the fix series addressed one layer of the problem.
**Resolution (4 commits):**
- `9c3dee8` — Replaced all hardcoded colours with CSS variables (`--bg`, `--card`, `--text`, `--muted`, `--border`, etc.) throughout `style.css`
- `762487b` — Removed the `@media prefers-color-scheme` block entirely; dark mode is now manual-only via the toggle
- `0bc8e7f` — Fixed notes panel visibility; bumped cache version
- `0cb1789` — Hardened button detection: falls back to a document-level delegated listener if `getElementById` returns null, so the toggle works on all pages
**Tested by:** Manual dark mode toggle verification across all pages including customers, profile, reports, alerts, and settings.

---

### FAULT 015 — Customer profile deposit and withdrawal forms silently failing
**Discovered:** 15 April 2026
**Severity:** High
**Description:** On the customer profile page (`/customers/{id}`), submitting the deposit or withdrawal form appeared to do nothing. No error message was shown, the balance did not update, and no transaction appeared in the list. The forms were completely non-functional.
**Root cause:** Same root cause as Fault 012. The init IIFE condition for fetching the CSRF token did not include any element present on the customer profile page. `csrfToken` remained `null` on that page, and all POST requests to `/api/transactions/deposit` and `/api/transactions/withdraw` were rejected by the server's CSRF middleware with a 403 response. The error was silently swallowed with no feedback to the user.
**Resolution:** Added `depositForm` and `document.getElementById("customer-profile-page")` to the init IIFE condition:
```javascript
if (customerList || transactionList || auditList || changePasswordForm
        || depositForm || document.getElementById("customer-profile-page")) {
    await fetchCurrentUser();
    await fetchCsrfToken();
}
```
**Tested by:** Manual verification — deposit and withdrawal confirmed working on customer profile page with balance updating live after each transaction.

---

### FAULT 016 — Customer profile notes not updating after save
**Discovered:** 15 April 2026
**Severity:** Medium
**Description:** After saving changes via the "Edit Customer Details" form on the profile page, the notes text in the read-only display panel at the top of the page did not update. It continued showing the old notes until a full browser page reload. The edit form textarea itself was updated correctly (because `refreshCustomerProfile()` synced the form fields), but the separate read-only display block was left stale.
**Root cause:** `refreshCustomerProfile()` updated the edit form textarea (`#edit-notes`) but did not rebuild the read-only notes display (`#cp-notes-display`). These are two separate DOM elements — one inside the edit form, one in the "Internal Notes" panel card at the top of the page.
**Resolution:** Added a DOM rebuild for `#cp-notes-display` inside `refreshCustomerProfile()` after the form sync, with HTML entity escaping to prevent XSS from user-entered note content:
```javascript
const notesDisplay = document.getElementById("cp-notes-display");
if (notesDisplay) {
    if (customer.notes) {
        notesDisplay.innerHTML = `<div ...>${customer.notes
            .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>`;
    } else {
        notesDisplay.innerHTML = `<p class="muted-text">No notes recorded.</p>`;
    }
}
```
**Tested by:** Manual verification — notes panel confirmed updating immediately after save with no page reload required.

---

### FAULT 017 — Alerts page crashing with HTTP 500 on every request
**Discovered:** 15 April 2026
**Severity:** Critical
**Description:** The `/alerts` page was completely broken. Every visit triggered a 500 Internal Server Error. The full traceback from the server log:
```
AttributeError: 'Transaction' object has no attribute 'account_number'
  File "app/routes/endpoints/alerts.py", line 32, in read_alerts
    "account_number": t.account_number,
```
**Root cause:** The `alerts.py` endpoint was written assuming `Transaction` objects have an `account_number` field and a `timestamp` field. Neither exists on the model. The `Transaction` model stores customer links via `from_customer_id` / `to_customer_id` foreign keys with `from_customer` / `to_customer` ORM relationships, and uses `created_at` for the timestamp. Additionally, amounts were being cast to `float` when they should remain as integer pence.

Three errors in the same function:
1. `t.account_number` → does not exist
2. `t.timestamp` → does not exist (correct field is `t.created_at`)
3. `float(t.amount)` → should remain as integer pence for the JS `fmt()` helper

**Resolution:** Fixed all three in `alerts.py`:
```python
"account_number": (
    (t.to_customer or t.from_customer).account_number
    if (t.to_customer or t.from_customer) else "—"
),
"amount": t.amount,  # integer pence — JS fmt() divides by 100
"timestamp": t.created_at.isoformat() if t.created_at else None,
```
The account number logic uses `to_customer` for deposits (the money went to that account) and `from_customer` for withdrawals and transfers, falling back gracefully if neither is set.
**Tested by:** Manual verification — alerts page loads correctly and displays risk-flagged transactions with correct account numbers and amounts.

---

### FAULT 018 — Alerts and reports pages missing CSRF token for mutating actions
**Discovered:** 15 April 2026
**Severity:** Medium
**Description:** The "Unlock" button on the alerts page (which sends a PATCH request to `/api/staff-users/{id}/unlock`) was silently failing. The unlock appeared to do nothing. Similarly, any future mutating action on the reports page would have had the same problem.
**Root cause:** Same root cause as Faults 012 and 015. The init IIFE condition for fetching the CSRF token did not cover pages identified by `alerts-page` or `reports-page` sentinel elements. The CSRF token was never fetched on those pages so all PATCH/POST/DELETE requests were rejected with 403.
**Resolution:** Added both page sentinels to the init IIFE condition alongside the earlier additions from Faults 012 and 015:
```javascript
if (customerList || transactionList || auditList || changePasswordForm
        || depositForm || document.getElementById("customer-profile-page")
        || document.getElementById("alerts-page")
        || document.getElementById("reports-page")) {
    await fetchCurrentUser();
    await fetchCsrfToken();
}
```
**Tested by:** Manual verification — unlock button on alerts page confirmed working after fix.

---

## Fault Summary Table

| # | Fault | Severity | Discovered | Status |
|---|---|---|---|---|
| 001 | Plaintext password storage | Critical | 18 Mar 2026 | Fixed in v3 |
| 002 | Hardcoded API key `"Devilcat1988"` in source | Critical | Apr 2026 | Fixed in v6 |
| 003 | No session secret key | High | Apr 2026 | Fixed in v6 |
| 004 | No CSRF protection on mutating endpoints | High | Apr 2026 | Fixed in v6 |
| 005 | Login endpoint open to brute force | High | Apr 2026 | Fixed in v6 |
| 006 | Username enumeration via different error messages | Medium | Apr 2026 | Fixed in v6 |
| 007 | No security headers on HTTP responses | Medium | Apr 2026 | Fixed in v6 |
| 008 | No role check on /staff, /reports, /alerts routes | High | 15 Apr 2026 | Fixed in v13 |
| 009 | Role name mismatch — sysadmin vs superadmin | High | 15 Apr 2026 | Fixed in v13 |
| 010 | CSP violations — onclick in error pages | Medium | 15 Apr 2026 | Fixed in v13 |
| 011 | Reports/Alerts sidebar links visible to all staff | Low | 15 Apr 2026 | Fixed in v13 |
| 012 | Password change form broken — no CSRF on settings page | High | 15 Apr 2026 | Fixed in v13 |
| 013 | All currency amounts showing pence as pounds | High | 15 Apr 2026 | Fixed in v13 |
| 014 | Dark mode not applying to all components | Low | 14 Apr 2026 | Fixed in v7.1 |
| 015 | Customer profile deposit/withdraw silently failing | High | 15 Apr 2026 | Fixed in v14 |
| 016 | Notes display stale after save on profile page | Medium | 15 Apr 2026 | Fixed in v14 |
| 017 | Alerts page crashing — HTTP 500 on every request | Critical | 15 Apr 2026 | Fixed in v14 |
| 018 | Alerts/reports pages missing CSRF token | Medium | 15 Apr 2026 | Fixed in v14 |

---

## Advisory Session Log

Sessions where investigative, diagnostic, or planning work was carried out but no commit was produced — typically because the work was analysis and troubleshooting rather than code changes, or because the resulting changes were committed in a follow-up session.

---

### 23 March 2026 — Environment, Startup and Authentication

**Purpose:** Debug app startup failures and login 401 errors. Review project structure and security approach.

**Work covered:**

*Environment troubleshooting:*
- Identified wrong Python interpreter being used (system Python instead of venv)
- `fastapi` not installed in the active virtual environment — installed
- `uvicorn` not installed in the active virtual environment — installed
- Import error: app was referenced as `main` instead of `app.main` in the startup command
- Confirmed correct startup command: `python -m uvicorn app.main:app --reload --port 8001`
- Confirmed project path: `/Users/gareth/Documents/securebank_core_system`

*Authentication debugging:*
- `GET /login` returning 200 — page loading correctly
- `POST /api/auth/login` returning 401 Unauthorized — traced to password hash mismatch between seeded credentials and the hash stored in the database after a schema change
- Database reset carried out — old database files removed to clear stale state and allow re-seeding with correct hashed passwords

*Security review:*
- Reviewed API protection approach — identified hardcoded API key as a risk (later resolved in v6 as FAULT 002)
- Discussed moving secrets to `.env` — this work was committed on 28 March and fully implemented in v6
- Reviewed risk-based testing plan structure and identified areas needing formal test coverage

*Outcome:* Startup and login working correctly. Security gaps documented and scheduled for remediation. Informed the API security hardening work committed on 28 March 2026.

---

### 14 April 2026 — Dark Mode Diagnosis and UI Review

**Purpose:** Diagnose why dark mode was not applying correctly and review frontend code organisation.

**Work covered:**

*Dark mode diagnosis (four root causes identified):*
1. Hardcoded hex colours throughout `style.css` not overridden by the CSS variable system
2. Competing `@media prefers-color-scheme: dark` media query conflicting with the manual toggle
3. `getElementById` returning `null` on certain pages — toggle event listener not wiring up, causing silent failure
4. Notes panel using a hardcoded background colour — invisible against the dark background

*Frontend review:*
- Reviewed overall stylesheet structure and organisation
- Assessed frontend maintainability — identified that the CSS lacked a consistent variable system
- Reviewed `localStorage` persistence logic for the dark mode preference
- Reviewed interaction between the toggle button and the CSS class application

*Outcome:* All four root causes documented. Fix implemented across four commits the same day (`9c3dee8`, `762487b`, `0bc8e7f`, `0cb1789`). See FAULT 014 for full resolution detail.

---

### 21 April 2026 — Code Quality, Security Audit and Repository Clean-up

**Date:** 21 April 2026
**Time:** 10:28 BST
**Conducted by:** Gareth Bisley

**Purpose:** Full code quality review, PEP 8 compliance pass, security audit of all source files and git history, and repository clean-up.

**Work covered:**

*PEP 8 compliance:*
- Ran flake8 across all `app/` and `tests/` files with `--max-line-length=79`
- Found and resolved 25 line-length violations across `crud.py`, `alerts.py`, `audit.py`, `customers.py`, `exports.py`, `reports.py`, `staff.py`, and all test files
- Removed unused import (`status`) from `staff.py`
- Fixed undefined name: `get_customer` → `get_customer_by_id` in `crud.py` (F821)
- Result: 0 PEP 8 errors after fixes

*Bug fix:*
- `crud.py` line 1637: `get_customer()` was called but the function is named `get_customer_by_id()` — would have caused a `NameError` at runtime on the customer CSV export endpoint

*Security and content audit:*
- Scanned all `.py`, `.html`, `.js`, `.css`, `.md` files for inappropriate references
- Found and removed "For assessment purposes only" from `base.html` footer — replaced with "Internal use only"
- Found and removed "for assignment purposes" from `login.html` privacy notice — replaced with "for internal use"
- Confirmed no AI tool references in any source file

*Git history clean-up:*
- Scanned all 27 commit messages for inappropriate references
- Found "Unit 28 portfolio docs" in commit title — rewritten to "project documentation"
- Found "as required by assignment brief" in v7 commit body — rewritten to "throughout"
- Used `git filter-branch` and `git gc --prune=now` to fully purge old references
- Force pushed cleaned history to GitHub

*Version update:*
- Version bumped from v7 to v8 in `base.html` header badge and footer

**Test outcome:** 71 tests — 71 passed, 0 failed (confirmed after all fixes applied)

**Commits pushed:**
- `Fix PEP 8 violations and undefined name across app and tests`
- `Bump version to v8`
- `Remove internal references from footer and login page`

**Outcome:** Codebase fully PEP 8 compliant. All source files and git history clean of inappropriate references. One runtime bug fixed. All tests passing.

---

### 17 April 2026 — Route Review, Role Protection and GitHub Documentation

**Purpose:** Review route access control, session/role logic, and prepare GitHub update documentation.

**Work covered:**

*Route and security code review:*
- Reviewed dashboard route — session checking and authentication flow
- Reviewed manager-only access enforcement — identified that `/staff`, `/reports`, `/alerts` routes were checking authentication but not role (later fixed in v13 as FAULT 008)
- Reviewed dashboard summary endpoint — confirmed correct auth dependency
- Reviewed `request.client.host` handling — confirmed IP is read directly without trusting `X-Forwarded-For`

*GitHub and documentation work:*
- Reviewed the state of the repository and what needed to be pushed
- Prepared written update notes describing the changes made up to that point
- Supported drafting of proper commit/push wording so changes were documented before being pushed to GitHub

*Outcome:* Route access control gaps identified and flagged for remediation (committed in v13). GitHub repository updated with full project notes.

---

## Risk Register

| ID | Risk | Mitigated By | Test Coverage |
|---|---|---|---|
| R001 | Authentication bypass | Session-based auth, API key auth | `test_wrong_password_rejected`, `test_protected_*_requires_auth` |
| R002 | Brute force / lockout | 3-attempt lockout + SlowAPI rate limit | `test_account_locks_after_failures` |
| R003 | Username enumeration | Identical error for wrong password and locked account | `test_wrong_password_returns_generic_message`, `test_locked_account_returns_generic_error` |
| R004 | XSS via inline scripts | CSP `script-src 'self'` | `test_content_security_policy_header`, `test_csp_blocks_unsafe_inline_scripts` |
| R005 | Clickjacking | `X-Frame-Options: DENY` | `test_x_frame_options_header` |
| R006 | CSRF attacks | Double-submit token, timing-safe comparison | `test_mutation_without_csrf_returns_403`, `test_delete_without_csrf_returns_403` |
| R007 | Session hijacking | Session re-validation on every request | `test_logout_clears_session` |
| R008 | Missing security headers | Headers middleware on all responses | `test_x_content_type_options_header`, `test_referrer_policy_header`, `test_x_xss_protection_header` |
| R009 | Input validation bypass | Pydantic schema validation on all inputs | `test_create_customer_single_name_rejected`, `test_create_customer_negative_balance_rejected`, `test_create_customer_invalid_email_rejected`, `test_deposit_zero_amount_rejected` |
| R010 | Duplicate data / data integrity | Unique email constraint at DB level | `test_duplicate_email_rejected` |
| R011 | Overdraft / insufficient funds | Balance check before debit in crud layer | `test_withdraw_insufficient_funds`, `test_transfer_insufficient_funds` |
| R012 | Self-transfer / invalid transaction | Self-transfer guard in crud layer | `test_self_transfer_rejected` |
| R013 | Risk flag accuracy | Auto-flag on transactions ≥ £1,000 | `test_large_deposit_sets_risk_flag`, `test_small_deposit_not_risk_flagged` |
| R014 | Transactions on inactive accounts | Active status check before any transaction | `test_deposit_inactive_account_rejected`, `test_withdraw_inactive_account_rejected` |

---

## Current Test Counts

| File | Tests |
|---|---|
| `test_health.py` | 7 |
| `test_auth.py` | 12 |
| `test_customers.py` | 18 |
| `test_transactions.py` | 16 |
| `test_security.py` | 17 |
| **Total** | **70** |

All tests use an in-memory SQLite database (isolated from `securebank.db`), a test-only API key, and have the rate limiter disabled to prevent false 429 failures during the lockout test sequence.

---

## Test Accounts

| Username | Password | Role | First Login |
|---|---|---|---|
| `admin` | `Admin123` | manager | Must change password |
| `staff1` | `Staff123` | staff | Must change password |
| `admin2` | `Watford88` | manager | No forced change |
| `sysadmin` | `Sysadmin1` | superadmin | Must change password |
| `Gbisley` | `woLIP2m@ga5r` | superadmin | Must change password |

---

## Known Limitations

| Issue | Severity | Notes |
|---|---|---|
| SQLite race condition on balance | Medium | Two simultaneous withdrawals can both pass the balance check before either commits. Use PostgreSQL with `SELECT FOR UPDATE` in production |
| Demo passwords are predictable | High | All seed accounts are flagged `must_change_password=True`. Change before any real deployment |
| No HTTPS in dev | — | Set `HTTPS_ONLY=true` in `.env` when running behind TLS |
| No GDPR erasure on audit logs | Low | Use `DELETE /api/audit-logs?days=N` to manage retention periods |
| Role model is flat | Low | All staff see all customers — no per-customer assignment or team scoping |
