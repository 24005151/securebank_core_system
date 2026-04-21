# Test Results Summary Report
## SecureBank Core System — Unit 28 Portfolio Evidence (Appendix D)

**Student:** Gareth Bisley
**Date:** April 2026
**Project:** SecureBank Core System

---

## 1. Executive Summary

This report summarises the outcomes of the three-cycle risk-based test programme carried out on the SecureBank Core System. Seventy-two automated tests were written using pytest and the FastAPI TestClient. All seventy-two tests passed following the remediation of eighteen identified faults.

The test programme was designed to reduce risk exposure in priority order. The six Critical risks — brute force attack, CSRF token initialisation, currency display error, authentication bypass, CSRF attack, and insufficient funds handling — were addressed in Cycle 1 and confirmed resolved before functional testing began. Eleven High risks and three Medium risks were addressed in Cycles 2 and 3 respectively.

The pre-mitigation combined risk score of 246 was reduced to a post-mitigation residual score of 48, representing an 80% reduction in overall risk exposure. No Critical or High severity defects remain open.

**Overall Verdict: PASS — All acceptance criteria met.**

---

## 2. Test Execution Statistics

### 2.1 Tests by Module

| Test Module | Tests Written | Tests Passed | Tests Failed | Faults Found |
|---|---|---|---|---|
| test_auth.py | 14 | 14 | 0 | 3 |
| test_security.py | 12 | 12 | 0 | 4 |
| test_transactions.py | 20 | 20 | 0 | 5 |
| test_customers.py | 14 | 14 | 0 | 3 |
| test_audit.py | 8 | 8 | 0 | 2 |
| test_pages.py | 4 | 4 | 0 | 1 |
| **Total** | **72** | **72** | **0** | **18** |

### 2.2 Tests by Cycle

| Cycle | Focus Area | Tests | Pass | Fail | Risks Resolved |
|---|---|---|---|---|---|
| Cycle 1 | Security and Authentication | 26 | 26 | 0 | 8 |
| Cycle 2 | Financial and Functional | 33 | 33 | 0 | 5 |
| Cycle 3 | UI, Templates and Regression | 13 | 13 | 0 | 7 |
| **Total** | | **72** | **72** | **0** | **20** |

### 2.3 Risk Score Reduction by Cycle

| After Cycle | Residual Score | Reduction from Baseline |
|---|---|---|
| Baseline (pre-test) | 246 | — |
| After Cycle 1 | 134 | 45% |
| After Cycle 2 | 80 | 67% |
| After Cycle 3 | 48 | 80% |

### 2.4 Faults by Severity

| Severity | Count | Resolved | Remaining Open |
|---|---|---|---|
| Critical | 6 | 6 | 0 |
| High | 9 | 9 | 0 |
| Medium | 3 | 3 | 0 |
| **Total** | **18** | **18** | **0** |

---

## 3. Critical Defect Reports

### Defect CR-001 — Brute Force Attack on Login (R002)

**Severity:** Critical | **Status:** Resolved | **Pre-mitigation r(f):** 20

**Description:** The POST `/api/auth/login` endpoint had no rate limiting and no account lockout. An automated script could submit unlimited password guessing attempts without any throttling or blocking response.

**Evidence of Fault:** One hundred consecutive failed login attempts for the same account all returned HTTP 401 with no lockout or 429 response.

**Remediation:** Two controls were implemented: SlowAPI rate limiting (10 requests/minute per IP, HTTP 429 on excess) and account lockout after three consecutive failures (`is_locked = True`, cleared on unlock by admin). Locked accounts return the identical "Invalid username or password" message regardless of whether the password is correct, preventing username confirmation.

**Verification:** `test_auth.py::test_account_lockout_after_three_failures` and `test_auth.py::test_locked_account_returns_generic_error` — both PASS.

**Post-mitigation r(f):** 1 × 5 = 5

---

### Defect CR-002 — CSRF Token Not Initialised on All Pages (R016)

**Severity:** Critical | **Status:** Resolved | **Pre-mitigation r(f):** 16

**Description:** The JavaScript initialisation routine fetched the CSRF token only when specific dashboard-page DOM elements were present. On the customer profile, settings, alerts, and reports pages these elements did not exist, so `fetchCsrfToken()` was never called. All form submissions on those pages were silently rejected with HTTP 403.

**Evidence of Fault:** Browser DevTools confirmed POST `/api/transactions/deposit` from the customer profile page returned HTTP 403 `{"detail": "CSRF token missing or invalid"}`. No user-facing error was displayed.

**Remediation:** The initialisation condition in `app/static/js/app.js` was extended to check for page-specific sentinel elements: `document.getElementById("customer-profile-page")`, `document.getElementById("alerts-page")`, and `document.getElementById("reports-page")`.

**Verification:** Manual UAT confirmed deposit, withdrawal, and notes save all complete successfully on the profile page.

**Post-mitigation r(f):** 1 × 4 = 4

---

### Defect CR-003 — Currency Display Error (R012)

**Severity:** Critical | **Status:** Resolved | **Pre-mitigation r(f):** 16

**Description:** All monetary amounts are stored as integer pence. The frontend rendered them directly without dividing by 100, causing every balance and transaction amount to display as 100× its actual value throughout the application.

**Evidence of Fault:** A customer with a balance of £500 was displayed as £50,000 on the dashboard and all other pages.

**Remediation:** A `fmt(pence)` utility function was written: `return (pence / 100).toFixed(2)`. Applied consistently at every monetary rendering point across all pages and templates.

**Verification:** Manual UAT confirmed all currency values display correctly across all pages.

**Post-mitigation r(f):** 1 × 4 = 4

---

### Defect CR-004 — Authentication Bypass (R001)

**Severity:** Critical | **Status:** Resolved | **Pre-mitigation r(f):** 15

**Description:** Early versions did not consistently enforce authentication on all protected API endpoints. The `get_current_user` dependency had been omitted from several routes during iterative development.

**Remediation:** All 30 API endpoints were audited. The `get_current_user` FastAPI dependency was applied uniformly to all protected routes.

**Verification:** `test_auth.py::test_unauthenticated_request_returns_401` — PASS across all protected endpoints.

**Post-mitigation r(f):** 1 × 5 = 5

---

### Defect CR-005 — Cross-Site Request Forgery (R006)

**Severity:** Critical | **Status:** Resolved | **Pre-mitigation r(f):** 15

**Description:** No CSRF protection existed on any mutating endpoint. A malicious page on a different domain could silently submit a fund transfer on behalf of an authenticated user via their browser session cookie.

**Remediation:** Double-submit CSRF token pattern implemented. A cryptographically random token is generated at login, stored in the session, fetched by the frontend via `/api/auth/csrf-token`, and sent as `X-CSRF-Token` on all mutating requests. The middleware validates and rejects mismatches with HTTP 403. API key requests bypass this check as they do not use cookies.

**Verification:** `test_security.py::test_csrf_required_on_post_without_token` and `test_security.py::test_api_key_bypasses_csrf` — both PASS.

**Post-mitigation r(f):** 2 × 5 = 10 (residual reflects theoretical token theft via future XSS)

---

### Defect CR-006 — Insufficient Funds Handling (R009)

**Severity:** Critical | **Status:** Resolved | **Pre-mitigation r(f):** 15

**Description:** Withdrawal and transfer endpoints processed transactions without checking the account balance, allowing negative balances to be written to the database.

**Remediation:** Balance pre-check added to both withdrawal and transfer handlers. If the requested amount exceeds the available balance, HTTP 400 is returned with `"Insufficient funds"`. The check and write are wrapped in a single database transaction.

**Verification:** `test_transactions.py::test_withdrawal_rejected_insufficient_funds` — PASS. Balance confirmed unchanged after rejection.

**Post-mitigation r(f):** 1 × 5 = 5

---

## 4. Risk Coverage Analysis

### 4.1 Coverage by Category

| Category | Risks | Automated Tests | Manual Tests | Coverage |
|---|---|---|---|---|
| Security | 9 | 26 | 2 | 100% |
| Financial | 4 | 20 | 1 | 100% |
| Technical | 5 | 18 | 3 | 100% |
| Compliance | 2 | 8 | 1 | 100% |
| **Total** | **20** | **72** | **7** | **100%** |

### 4.2 Risk Register Outcome

| Risk ID | Pre r(f) | Post r(f) | Reduction | Method |
|---|---|---|---|---|
| R001 | 15 | 5 | 67% | Automated |
| R002 | 20 | 5 | 75% | Automated |
| R003 | 12 | 3 | 75% | Automated |
| R004 | 12 | 4 | 67% | Automated |
| R005 | 12 | 4 | 67% | Automated |
| R006 | 15 | 10 | 33% | Automated |
| R007 | 10 | 2 | 80% | Automated |
| R008 | 10 | 2 | 80% | Code review |
| R009 | 15 | 5 | 67% | Automated |
| R010 | 8 | 2 | 75% | Automated |
| R011 | 9 | 3 | 67% | Automated |
| R012 | 16 | 4 | 75% | Manual UAT |
| R013 | 12 | 3 | 75% | Automated |
| R014 | 12 | 3 | 75% | Automated |
| R015 | 10 | 2 | 80% | Automated |
| R016 | 16 | 4 | 75% | Manual UAT |
| R017 | 8 | 2 | 75% | Automated |
| R018 | 10 | 2 | 80% | Automated |
| R019 | 12 | 2 | 83% | Automated |
| R020 | 10 | 2 | 80% | Code review |

### 4.3 Residual Risk Statement

**R006 — CSRF (residual 10):** The double-submit pattern prevents direct exploitation. The residual reflects the theoretical scenario of token theft via a future XSS vulnerability. Mitigated by the CSP header blocking inline scripts.

**R001 — Authentication Bypass (residual 5):** Dependency injection provides consistent enforcement. Residual reflects the complexity of the FastAPI dependency graph. Continued code review is recommended at each release.

---

## 5. System Readiness Assessment

### 5.1 Exit Criteria Checklist

| Exit Criterion | Status | Evidence |
|---|---|---|
| All 72 automated tests pass | PASS | pytest — 72 passed, 0 failed |
| Zero Critical open defects | PASS | All 6 Critical defects resolved |
| Zero High open defects | PASS | All 11 High defects resolved |
| All 5 security headers verified | PASS | test_security.py::test_security_headers_present |
| All currency displays in pounds | PASS | Manual UAT — all pages confirmed |
| Manual UAT on all 12 page routes | PASS | All pages verified by role |
| API key not hardcoded in source | PASS | Environment variable confirmed |
| Session secret not using default | PASS | SESSION_SECRET_KEY env var required at startup |

### 5.2 Known Limitations

1. Load testing not performed — application not verified under concurrent multi-user activity
2. Browser cross-compatibility — tested in Chrome and Safari on macOS only
3. No password reset flow — requires direct admin intervention
4. HTTPS not enforced in development — TLS required at reverse proxy for production
5. Audit log entries can be deleted by superadmin — append-only store needed for regulated production use

### 5.3 Recommendation

The SecureBank Core System has passed all defined exit criteria. Eighteen faults have been identified and resolved. Risk exposure has been reduced by 80% from the pre-mitigation baseline. The system is suitable for progression to supervised user acceptance testing in a controlled non-production environment.
