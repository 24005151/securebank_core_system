# Evidence Portfolio
## SecureBank Core System — Unit 28 Portfolio Evidence (Appendix E)

**Student:** Gareth Bisley
**Date:** April 2026
**Project:** SecureBank Core System

---

## Part 1 — Screenshot Evidence Guide

### Screenshot 1 — pytest Output (All 72 Tests Passing)

Run `pytest tests/ -v` in the project root. Screenshot the terminal output showing all 72 tests and the summary line `72 passed`.

Annotate:
- Arrow to `72 passed` → "All 72 automated tests pass — exit criterion met"
- Arrow to test module names → "Organised by risk category, not alphabetically — reflects risk-first execution order"
- Arrow to session duration → "In-memory SQLite — full suite completes in under 3 seconds"

---

### Screenshot 2 — Security Headers in Browser DevTools

Open Chrome DevTools, Network tab. Navigate to `http://localhost:8000/api/health`. Click the request, click Headers, scroll to Response Headers.

Annotate:
- `X-Frame-Options: DENY` → "Prevents clickjacking — mitigates R005"
- `Content-Security-Policy: default-src 'self'; script-src 'self'` → "Blocks inline scripts — mitigates R004"
- `X-Content-Type-Options: nosniff` → "Prevents MIME sniffing"
- `X-XSS-Protection: 1; mode=block` → "Legacy XSS filter"
- `Referrer-Policy: strict-origin-when-cross-origin` → "Limits referrer leakage"

---

### Screenshot 3 — Customer Profile (Deposit and Notes Working)

Log in as `admin` / `Admin123`. Navigate to any customer profile. Submit a deposit and screenshot the updated balance. Enter notes and screenshot the saved notes panel.

Annotate:
- Updated balance → "Balance stored as pence, displayed in pounds via fmt() function"
- Notes panel → "Notes save correctly after CSRF token initialisation fix — R016 resolved"

---

### Screenshot 4 — Alerts Page (Previously HTTP 500)

Log in as `admin`, navigate to Alerts page.

Annotate:
- Transaction list → "Page now loads — previously returned HTTP 500 on every request (R019)"
- Account number column → "Retrieved via ORM relationship, not a non-existent direct column"
- Date column → "Uses t.created_at — corrected from t.timestamp which does not exist"

---

### Screenshot 5 — Risk Assessment Matrix

Create a 5×5 grid. X axis = Impact (1–5), Y axis = Probability (1–5). Plot all 20 risks using coordinates from the Risk Register. Colour code: Red = Security, Orange = Financial, Blue = Technical, Purple = Compliance. Draw the risk tolerance line at score 10 (diagonal between P=2,C=5 and P=5,C=2).

Annotate:
- Top-right cluster → "Critical zone — r(f) ≥ 15, mitigated before Cycle 2"
- R002 at (5,4) → "Highest risk score: 20"
- Tolerance line → "r(f) = 10 — risks above require immediate action"

---

## Part 2 — Formal Defect Reports

### Defect Report DR-001

| Field | Detail |
|---|---|
| Report ID | DR-001 |
| Date Raised | March 2026 |
| Severity | Critical |
| Status | Closed — Resolved |
| Risk ID | R009 — Insufficient Funds Handling |
| Risk Score | r(f) = 15 (P=3, C=5) |

**Summary:** Withdrawal and transfer endpoints process transactions without checking the account balance, permitting negative balances.

**Steps to Reproduce:**
1. Create a test customer with opening balance £100.00 (stored as 10000 pence)
2. Authenticate as manager
3. POST `/api/transactions/withdraw` with `{"customer_id": <id>, "amount": 50000}`
4. Observe HTTP 200 returned and balance updated to -40000 pence

**Expected:** HTTP 400, message "Insufficient funds", balance unchanged.

**Actual:** HTTP 200, balance updated to -40000 pence, transaction written to audit log.

**Root Cause:** The withdrawal handler applied the debit directly with no pre-condition balance check at the API layer.

**Fix:**
```python
if customer.balance < amount:
    raise HTTPException(status_code=400, detail="Insufficient funds")
```
Wrapped in database transaction to prevent race conditions.

**Verification:** `test_transactions.py::test_withdrawal_rejected_insufficient_funds` — PASS

**Post-mitigation r(f):** 1 × 5 = 5

---

### Defect Report DR-002

| Field | Detail |
|---|---|
| Report ID | DR-002 |
| Date Raised | March 2026 |
| Severity | Critical |
| Status | Closed — Resolved |
| Risk ID | R002 — Brute Force Attack |
| Risk Score | r(f) = 20 (P=4, C=5) |

**Summary:** Login endpoint has no rate limiting and no account lockout.

**Steps to Reproduce:**
1. Send 50 consecutive POST requests to `/api/auth/login` with incorrect password for `admin`
2. All 50 return HTTP 401 — no throttling, no lockout, no 429

**Expected:** Account locked after 3 failures. HTTP 429 after rate limit exceeded.

**Root Cause:** Login route had no SlowAPI decorator. User model had no lockout fields.

**Fix:**
- Added `@limiter.limit("10/minute")` to login endpoint
- Added `failed_login_count` and `is_locked` fields to User model
- Login handler increments counter on failure, locks at 3, returns identical message whether locked or wrong password

**Verification:** `test_auth.py::test_account_lockout_after_three_failures` — PASS

**Post-mitigation r(f):** 1 × 5 = 5

---

### Defect Report DR-003

| Field | Detail |
|---|---|
| Report ID | DR-003 |
| Date Raised | April 2026 |
| Severity | Critical |
| Status | Closed — Resolved |
| Risk ID | R016 — CSRF Token Not Initialised |
| Risk Score | r(f) = 16 (P=4, C=4) |

**Summary:** CSRF token never fetched on customer profile, settings, alerts, and reports pages — all form submissions silently return HTTP 403.

**Steps to Reproduce:**
1. Log in as manager, navigate to customer profile
2. Enter deposit amount, click Submit
3. DevTools Network: POST `/api/transactions/deposit` returns HTTP 403
4. No user-facing error displayed

**Root Cause:** JavaScript init IIFE called `fetchCsrfToken()` only when dashboard DOM elements were present (`#customer-list`, `#transaction-list`, `#audit-log`). Profile, settings, alerts, and reports pages have none of these elements.

**Fix:**
```javascript
if (customerList || transactionList || auditList || changePasswordForm
        || depositForm
        || document.getElementById("customer-profile-page")
        || document.getElementById("alerts-page")
        || document.getElementById("reports-page")) {
    await fetchCurrentUser();
    await fetchCsrfToken();
}
```

**Verification:** Manual UAT — deposit, withdrawal, notes save all complete successfully on profile page.

**Post-mitigation r(f):** 1 × 4 = 4

---

### Defect Report DR-004

| Field | Detail |
|---|---|
| Report ID | DR-004 |
| Date Raised | April 2026 |
| Severity | High |
| Status | Closed — Resolved |
| Risk ID | R019 — API Attribute Error |
| Risk Score | r(f) = 12 (P=3, C=4) |

**Summary:** Alerts endpoint crashes with AttributeError on every request — page has never loaded successfully.

**Server Error:**
```
AttributeError: 'Transaction' object has no attribute 'account_number'
```

**Root Cause:** The alerts endpoint accessed `t.account_number` (column does not exist — model uses `from_customer_id`/`to_customer_id` FKs and `from_customer`/`to_customer` ORM relationships) and `t.timestamp` (column does not exist — correct field is `created_at`).

**Fix:**
```python
"account_number": (
    (t.to_customer or t.from_customer).account_number
    if (t.to_customer or t.from_customer) else "—"
),
"timestamp": t.created_at.isoformat() if t.created_at else None,
```

**Verification:** `test_pages.py::test_alerts_page_returns_200` — PASS

**Post-mitigation r(f):** 1 × 4 = 4

---

### Defect Report DR-005

| Field | Detail |
|---|---|
| Report ID | DR-005 |
| Date Raised | March 2026 |
| Severity | High |
| Status | Closed — Resolved |
| Risk ID | R014 — Role Name Inconsistency |
| Risk Score | r(f) = 12 (P=3, C=4) |

**Summary:** Templates use role string "sysadmin" while the database stores the superadmin role as "superadmin" — all superadmin users are silently treated as staff.

**Steps to Reproduce:**
1. Log in as `sysadmin` (role in database: `superadmin`)
2. Staff, Reports, Alerts links not shown in navigation
3. Navigate to `/staff` directly — access denied
4. Customer profile action buttons all hidden

**Root Cause:** Templates and JavaScript checks used `"sysadmin"`. Database seed and User model used `"superadmin"`. String comparison always fails.

**Fix:** All template role checks and JavaScript comparisons updated from `"sysadmin"` to `"superadmin"`. Route guard in `pages.py` also updated.

**Verification:** `test_pages.py::test_superadmin_can_access_staff_page` — PASS

**Post-mitigation r(f):** 1 × 4 = 4

---

## Part 3 — Test Execution Log Extract (Cycle 1)

```
============================= test session starts ==============================
platform darwin -- Python 3.13.0, pytest-8.x
rootdir: /path/to/securebank_core_system
collected 26 items

tests/test_auth.py::test_health_endpoint_returns_200                    PASSED
tests/test_auth.py::test_valid_login_returns_role                       PASSED
tests/test_auth.py::test_wrong_password_returns_401                     PASSED
tests/test_auth.py::test_unknown_user_returns_401                       PASSED
tests/test_auth.py::test_unknown_user_message_matches_wrong_password    PASSED
tests/test_auth.py::test_account_lockout_after_three_failures           PASSED
tests/test_auth.py::test_locked_account_returns_generic_error           PASSED
tests/test_auth.py::test_logout_clears_session                          PASSED
tests/test_auth.py::test_unauthenticated_request_returns_401            PASSED
tests/test_auth.py::test_staff_role_returned_on_login                   PASSED
tests/test_auth.py::test_superadmin_role_returned_on_login              PASSED
tests/test_auth.py::test_login_sets_session_cookie                      PASSED
tests/test_auth.py::test_csrf_token_returned_after_login                PASSED
tests/test_auth.py::test_me_endpoint_returns_user_data                  PASSED

tests/test_security.py::test_security_headers_present                  PASSED
tests/test_security.py::test_x_frame_options_is_deny                   PASSED
tests/test_security.py::test_csp_does_not_contain_unsafe_inline        PASSED
tests/test_security.py::test_csrf_required_on_post_without_token       PASSED
tests/test_security.py::test_csrf_required_on_delete_without_token     PASSED
tests/test_security.py::test_api_key_bypasses_csrf                     PASSED
tests/test_security.py::test_invalid_api_key_rejected                  PASSED
tests/test_security.py::test_csrf_token_endpoint_returns_token         PASSED
tests/test_security.py::test_staff_cannot_access_manager_endpoint      PASSED
tests/test_security.py::test_unauthenticated_cannot_access_customers   PASSED
tests/test_security.py::test_privilege_escalation_blocked              PASSED
tests/test_security.py::test_role_based_access_enforced                PASSED

============== 26 passed in 0.84s ==============

Cycle 1 risk reassessment:
  Risks resolved: R001, R002, R003, R005, R006, R007, R008, R013, R020
  Score reduced from 246 to 134 — proceeding to Cycle 2
```

Cycle 2 and 3 summaries (33 and 13 tests respectively) all passed with zero failures. Full output available on request.

---

## Part 4 — Key Code Changes

### R009 — Insufficient Funds Check

```python
# Before
customer.balance -= amount
db.commit()

# After
if customer.balance < amount:
    raise HTTPException(status_code=400, detail="Insufficient funds")
customer.balance -= amount
db.commit()
```

### R016 — CSRF Initialisation Fix

```javascript
// Before — dashboard only
if (customerList || transactionList || auditList) {
    await fetchCsrfToken();
}

// After — all pages with mutating forms
if (customerList || transactionList || auditList || depositForm
        || document.getElementById("customer-profile-page")
        || document.getElementById("alerts-page")
        || document.getElementById("reports-page")) {
    await fetchCurrentUser();
    await fetchCsrfToken();
}
```

### R019 — Alerts AttributeError Fix

```python
# Before — accessing columns that don't exist
"account_number": t.account_number,
"timestamp": t.timestamp,

# After — using correct ORM attributes
"account_number": (
    (t.to_customer or t.from_customer).account_number
    if (t.to_customer or t.from_customer) else "—"
),
"timestamp": t.created_at.isoformat() if t.created_at else None,
```
