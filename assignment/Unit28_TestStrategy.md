# Test Strategy and Planning Document
## SecureBank Core System — Unit 28 Portfolio Evidence (Appendix C)

**Student:** Gareth Bisley
**Date:** April 2026
**Project:** SecureBank Core System

---

## 1. Executive Summary

This document defines the risk-based test strategy and detailed test plan for the SecureBank Core System, a FastAPI-based web banking application managing customer accounts, financial transactions, and staff access control. The application is subject to GDPR and PCI DSS compliance requirements due to the personal and financial data it processes.

A risk-first sequential testing strategy was adopted. Twenty risks were identified across four categories — security, financial, technical, and compliance — and scored using the formula r(f) = P(f) × C(f). Six risks received Critical scores (≥15) and were addressed in the first test cycle. Eleven High risks (scores 10–14) were addressed in the second cycle. Three Medium risks (scores 5–8) were addressed in the third cycle.

Seventy-two automated tests were written and executed using pytest and the FastAPI TestClient. All tests passed following remediation of eighteen identified faults. The combined pre-mitigation risk score of 246 was reduced to 48 — an 80% reduction in overall risk exposure.

| Metric | Value |
|---|---|
| Total risks identified | 20 |
| Critical risks | 6 |
| High risks | 11 |
| Medium risks | 3 |
| Automated tests written | 72 |
| Tests passed | 72 |
| Faults found | 18 |
| Faults resolved | 18 |
| Pre-mitigation risk score | 246 |
| Post-mitigation risk score | 48 |
| Risk reduction | 80% |

---

## 2. Risk Assessment Methodology

**2.1 Risk Identification Process**

Risks were identified through a structured layer-by-layer review of the SecureBank application:

1. **Data model review** — `app/models.py` examined for data integrity constraints, missing validation, and sensitive field exposure
2. **API endpoint review** — all 30 endpoints in `app/routes/endpoints/` reviewed for authentication enforcement, input validation, and CSRF protection
3. **Authentication system review** — `app/routes/auth.py` and `app/security.py` reviewed for brute-force protection, session management, and token security
4. **Frontend review** — `app/static/js/app.js` reviewed for CSRF token handling, currency conversion, and role-based UI gating
5. **Template review** — all 15 HTML templates reviewed for inline event handlers, role string consistency, and CSP compliance
6. **Compliance review** — audit trail coverage and transaction risk flagging assessed against GDPR and PCI DSS requirements

**2.2 Risk Scoring**

Each identified risk was assigned:
- **P(f) — Probability of failure (1–5):** Based on the likelihood of the failure occurring given the current implementation. A probability of 4 or 5 indicates the failure is either already occurring or is trivially exploitable.
- **C(f) — Consequence of failure (1–5):** Based on the impact on users, data integrity, financial accuracy, and regulatory compliance.
- **r(f) = P(f) × C(f):** The risk score used to prioritise testing effort.

**2.3 Risk Prioritisation**

| Priority | Score | Action |
|---|---|---|
| Critical | 15–25 | Must be mitigated before any functional testing proceeds |
| High | 10–14 | Must be mitigated before release |
| Medium | 5–9 | Should be mitigated; acceptable as known risk if documented |
| Low | 1–4 | Monitor; mitigate in next release cycle |

**2.4 Risk Evaluation Matrix**

| Risk ID | Risk Name | Category | P(f) | C(f) | r(f) | Priority | Status |
|---|---|---|---|---|---|---|---|
| R002 | Brute Force Attack | Security | 4 | 5 | 20 | Critical | Resolved |
| R016 | CSRF Token Not Initialised | Technical | 4 | 4 | 16 | Critical | Resolved |
| R012 | Currency Display Error | Technical | 4 | 4 | 16 | Critical | Resolved |
| R001 | Authentication Bypass | Security | 3 | 5 | 15 | Critical | Resolved |
| R006 | CSRF Attack | Security | 3 | 5 | 15 | Critical | Resolved |
| R009 | Insufficient Funds Handling | Financial | 3 | 5 | 15 | Critical | Resolved |
| R003 | Username Enumeration | Security | 4 | 3 | 12 | High | Resolved |
| R004 | XSS via Inline Handlers | Security | 3 | 4 | 12 | High | Resolved |
| R005 | Clickjacking | Security | 3 | 4 | 12 | High | Resolved |
| R013 | Privilege Escalation | Security | 3 | 4 | 12 | High | Resolved |
| R014 | Role Name Inconsistency | Technical | 3 | 4 | 12 | High | Resolved |
| R019 | API Attribute Error | Technical | 3 | 4 | 12 | High | Resolved |
| R007 | Session Hijacking | Security | 2 | 5 | 10 | High | Resolved |
| R008 | Hardcoded Credentials | Security | 2 | 5 | 10 | High | Resolved |
| R015 | Incomplete Audit Trail | Compliance | 2 | 5 | 10 | High | Resolved |
| R018 | Risk Flag Accuracy | Compliance | 2 | 5 | 10 | High | Resolved |
| R020 | Weak Session Secret | Security | 2 | 5 | 10 | High | Resolved |
| R011 | Input Validation Bypass | Technical | 3 | 3 | 9 | Medium | Resolved |
| R010 | Self-Transfer | Financial | 2 | 4 | 8 | Medium | Resolved |
| R017 | Inactive Account Transactions | Financial | 2 | 4 | 8 | Medium | Resolved |

---

## 3. Test Prioritisation Framework

**3.1 Prioritisation Criteria**

Test execution order was determined by three criteria applied in sequence:
1. **Risk score** — higher score = earlier execution
2. **Risk category** — Security risks executed before Financial, Technical, and Compliance at equal scores
3. **Dependency** — tests for authentication must pass before tests for role-based access

**3.2 Test Execution Order by Risk**

| Order | Risk ID | Risk Name | Score | Test File |
|---|---|---|---|---|
| 1 | R002 | Brute Force | 20 | test_auth.py |
| 2 | R016 | CSRF Not Initialised | 16 | test_security.py |
| 3 | R012 | Currency Display | 16 | Manual UAT |
| 4 | R001 | Auth Bypass | 15 | test_auth.py |
| 5 | R006 | CSRF Attack | 15 | test_security.py |
| 6 | R009 | Insufficient Funds | 15 | test_transactions.py |
| 7–17 | R003–R020 | High risks | 10–12 | Various |
| 18–20 | R010, R011, R017 | Medium risks | 8–9 | Various |

**3.3 Risk-Based Test Cycle Design**

```
CYCLE 1 — Security and Authentication
  ├── Authenticate with valid/invalid credentials
  ├── Verify lockout after 3 failed attempts
  ├── Verify CSRF 403 on all mutating endpoints without token
  ├── Verify all 5 security response headers
  ├── Verify API key acceptance and rejection
  ├── Verify role-based endpoint access
  └── RISK REASSESSMENT → R001, R002, R003, R006, R007, R008, R013, R020 resolved
      Residual score reduced from 246 to 134

CYCLE 2 — Financial and Functional
  ├── Deposit increases balance by exact amount
  ├── Withdrawal decreases balance by exact amount
  ├── Insufficient funds rejected, balance unchanged
  ├── Transfer atomic — both accounts updated
  ├── Self-transfer rejected
  ├── Zero-value deposit rejected (schema)
  ├── Inactive account transactions rejected
  ├── Large transaction risk flag applied
  └── RISK REASSESSMENT → R009, R010, R011, R017, R018 resolved
      Residual score reduced from 134 to 80

CYCLE 3 — UI, Templates and Regression
  ├── All currency displays show pounds (divide by 100)
  ├── All 12 page routes return correct content for role
  ├── Dark mode applies across all pages
  ├── Notes save and display correctly after edit
  ├── Alerts page loads without 500 error
  ├── Deposit/withdraw forms work on profile page
  └── RISK REASSESSMENT → R004, R012, R014, R015, R016, R019 resolved
      Residual score reduced to 48
```

---

## 4. Security Testing Approach

**4.1 Authentication Testing**

Authentication tests verified that the system correctly rejects invalid credentials, applies account lockout after three consecutive failures, and returns identical error messages for wrong passwords, unknown usernames, and locked accounts to prevent username enumeration. All tests used the FastAPI TestClient against the in-memory test database.

| Test | Method | Expected Result | Risk Covered |
|---|---|---|---|
| Valid login returns role | POST /api/auth/login with correct credentials | HTTP 200, role in response | R001 |
| Wrong password rejected | POST with wrong password | HTTP 401 | R001 |
| Unknown user rejected | POST with non-existent username | HTTP 401, identical message | R003 |
| Account locks after 3 failures | 3× wrong, then correct | HTTP 401 on 4th attempt | R002 |
| Locked account returns generic error | POST with correct password to locked account | "Invalid username or password" | R003 |
| Logout clears session | POST /api/auth/logout, then GET /api/auth/me | HTTP 401 | R007 |

**4.2 CSRF Protection Testing**

CSRF tests verified that all POST, PUT, PATCH, and DELETE endpoints return HTTP 403 when the X-CSRF-Token header is absent from a session-authenticated request, and that API key authenticated requests correctly bypass the CSRF requirement.

| Test | Method | Expected Result | Risk Covered |
|---|---|---|---|
| POST without CSRF token | POST /api/customers (session auth, no token) | HTTP 403 | R006 |
| DELETE without CSRF token | DELETE /api/customers/999 (no token) | HTTP 403 | R006 |
| API key bypasses CSRF | POST /api/customers with X-API-Key | HTTP 200 or 400 (not 403) | R006 |

**4.3 Security Header Verification**

All five required security headers were verified via automated test against the `/api/health` endpoint. The CSP test additionally verified that the `script-src` directive did not contain `unsafe-inline`.

| Header | Expected Value | Risk Covered |
|---|---|---|
| X-Content-Type-Options | nosniff | R008 |
| X-Frame-Options | DENY | R005 |
| Referrer-Policy | strict-origin-when-cross-origin | R008 |
| X-XSS-Protection | 1; mode=block | R004 |
| Content-Security-Policy | default-src 'self'; script-src 'self' | R004 |

**4.4 Role-Based Access Control Testing**

Role tests verified that unauthenticated requests to protected endpoints return HTTP 401, and that manager-only endpoints return HTTP 403 to staff-role sessions.

---

## 5. Test Planning Details

**5.1 Test Scope**

In scope:
- All 30 API endpoints
- All 12 HTML page routes
- Login/logout and CSRF token flow
- Session-based and API key authentication
- All five security response headers
- Customer CRUD operations (create, read, update, deactivate, reactivate, delete)
- Financial transactions (deposit, withdraw, transfer)
- Input validation on all create/update schemas
- Audit log creation on mutating operations
- Role-based access control (staff, manager, superadmin)
- Currency display accuracy
- Transaction risk flagging

Out of scope:
- Mobile native application performance
- Third-party payment gateway integration
- Load and stress testing beyond single-user scenarios
- Penetration testing using external tools
- Browser cross-compatibility testing

**5.2 Test Environment**

| Component | Detail |
|---|---|
| Language | Python 3.13 |
| Framework | FastAPI with Starlette |
| Database (test) | SQLite in-memory |
| Database (dev) | SQLite file (securebank.db) |
| Test framework | pytest with FastAPI TestClient |
| Rate limiter | Disabled for test session |
| Browser | Chrome / Safari for manual UAT |
| Operating system | macOS |

**5.3 Test Data Management**

All test data was generated programmatically. The `conftest.py` seed function created five test accounts and eight demo customers with transaction histories at session start. All data was held in an in-memory SQLite database and destroyed at session end. No real customer data was used at any point. The test API key was different from any production key and was set via environment variable before the app was imported.

**5.4 Entry and Exit Criteria**

Entry criteria:
- Application starts without error
- `GET /api/health` returns HTTP 200 with `status: ok`
- All seed accounts present and correct
- Test API key configured in environment

Exit criteria:
- All 72 automated tests pass
- Zero Critical or High open defects
- All five security headers verified
- All currency displays confirmed in pounds (not pence)
- Manual UAT sign-off on all 12 page routes

---

## 6. Tool Selection, Resources and Timeline

**6.1 Tool Selection and Justification**

| Tool | Purpose | Justification |
|---|---|---|
| pytest | Automated test execution | Industry-standard Python testing framework; fixture management; parameterisation; detailed failure output |
| FastAPI TestClient | HTTP request simulation | Exercises the full application stack in-process without a running server; supports session cookies and custom headers |
| SQLite in-memory | Test database | Provides complete isolation from development data; zero setup overhead; deterministic seeded state |
| Git | Version control and traceability | Every code change is committed with a descriptive message; test results can be traced to specific commits |
| Browser DevTools | Manual header/CSP verification | Confirms security headers on live server responses; validates CSP is blocking inline scripts |

**6.2 Resource Allocation**

| Role | Responsibility | Time Allocation |
|---|---|---|
| Developer / Tester | Risk identification, test writing, remediation | Primary resource throughout |
| QA Review | Independent review of risk register and test results | End of each cycle |

**6.3 Testing Timeline**

| Phase | Activity | Duration |
|---|---|---|
| Risk Analysis | Identify and score all 20 risks; produce risk register and matrix | 1 day |
| Cycle 1 | Write and execute security/authentication tests (26 tests); remediate Critical security faults | 2 days |
| Cycle 2 | Write and execute financial/functional tests (33 tests); remediate remaining High faults | 2 days |
| Cycle 3 | Write remaining tests (13 tests); manual UAT; remediate Medium faults | 1 day |
| Reporting | Compile test results, defect reports, execution log | 1 day |
| **Total** | | **7 days** |
