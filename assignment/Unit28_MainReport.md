# Unit 28 — Quality and Testing
## SecureBank Core System — Portfolio Evidence

**Student:** Gareth Bisley
**Date:** April 2026
**Project:** SecureBank Core System

---

## Part 1 — Risk Identification and Assessment

### 1.1 Introduction

The SecureBank Core System is a FastAPI web application managing customer accounts, financial transactions, and staff access control. The system stores and processes personal financial data, placing it under GDPR and PCI DSS obligations. Because of this, security and data integrity failures carry serious consequences — not only for users but for regulatory compliance.

I chose a risk-based testing strategy because the application handles real financial operations and personal data. Testing everything equally would waste effort on low-impact features while potentially missing critical vulnerabilities. By scoring each risk using the formula r(f) = P(f) × C(f), I could direct the most testing effort at the areas most likely to cause serious harm. This follows the principle described by Myers et al. (2011) that test effort should be proportional to both the probability and consequence of failure.

### 1.2 Risk Identification Process

I identified risks through a structured six-layer review of the application:

1. **Data model** — examined `app/models.py` for missing validation constraints and sensitive field exposure
2. **API endpoints** — reviewed all 30 endpoints for authentication enforcement, input validation, and CSRF protection
3. **Authentication** — reviewed `app/routes/auth.py` and `app/security.py` for brute-force protection and session management
4. **Frontend JavaScript** — reviewed `app/static/js/app.js` for CSRF token handling and role-based UI controls
5. **HTML templates** — reviewed all 15 templates for inline event handlers and role string consistency
6. **Compliance** — assessed audit trail coverage against GDPR accountability and PCI DSS requirements

This produced 20 identified risks across four categories: Security (9), Financial (4), Technical (5), and Compliance (2).

### 1.3 Risk Scoring Methodology

Each risk was scored using the formula **r(f) = P(f) × C(f)**, where:

- **P(f)** is the probability of failure on a scale of 1 (very unlikely) to 5 (already occurring or trivially exploitable)
- **C(f)** is the consequence of failure on a scale of 1 (negligible) to 5 (catastrophic — data breach, financial loss, or regulatory penalty)

This formula is consistent with the risk quantification approach described in ISO/IEC 9126-1 (2001) and widely used in software quality management (Nettleton, 2013).

Three examples from the risk register demonstrate how scoring decisions were made:

**R002 — Brute Force Attack on Login: r(f) = 4 × 5 = 20 (Critical)**
The login endpoint had no rate limiting and no account lockout. An automated script could make unlimited password guessing attempts with no obstacle. P(f) = 4 because this is a well-known, trivially executed attack requiring no specialised knowledge. C(f) = 5 because a successful brute-force attack grants complete unauthorised access to customer accounts and financial data — the most severe outcome possible.

**R006 — CSRF Attack: r(f) = 3 × 5 = 15 (Critical)**
No CSRF protection existed on any mutating endpoint. A malicious page could silently submit a fund transfer on behalf of an authenticated user. P(f) = 3 because exploitation requires luring the victim to a malicious page, making it less certain than a direct automated attack. C(f) = 5 because an undetected unauthorised transfer constitutes financial fraud and a GDPR data processing violation.

**R011 — Input Validation Bypass: r(f) = 3 × 3 = 9 (Medium)**
The API accepted single-word names, negative balances, and invalid email addresses. P(f) = 3 because invalid inputs are regularly submitted both accidentally and deliberately. C(f) = 3 because corrupted data degrades system integrity but does not directly compromise security or cause immediate financial loss.

### 1.4 Risk Prioritisation

| Priority | Score Range | Count | Action |
|---|---|---|---|
| Critical | 15–25 | 6 | Mitigate before functional testing |
| High | 10–14 | 11 | Mitigate before release |
| Medium | 5–9 | 3 | Mitigate or document as accepted risk |
| Low | 1–4 | 0 | Monitor |

The combined pre-mitigation risk score across all 20 risks was **246**.

---

## Part 2 — Test Strategy and Planning

### 2.1 Strategy Selection

I adopted a **risk-first sequential strategy** rather than an exploratory or purely functional approach. DeMarco and Lister (2003) argue that risk management in software projects requires explicit prioritisation — not treating all work as equally urgent. In a testing context, this means resolving the highest-scoring risks first and reassessing before proceeding.

The alternative I considered was exploratory risk-based testing, where the tester moves freely between areas based on intuition and emerging findings. This approach can be effective for discovering unexpected faults but lacks the traceability required for a regulated system. Because SecureBank processes financial data under GDPR and PCI DSS, every testing decision needs to be documented against a specific risk. The sequential cycle approach provides this audit trail.

| Approach | Strengths | Weaknesses |
|---|---|---|
| Risk-first sequential (chosen) | Documented traceability; highest risks addressed first; clear exit criteria | Less flexible; may miss unexpected faults outside the risk register |
| Exploratory risk-based | Discovers unexpected issues; adapts to findings | Harder to document; no guaranteed coverage of identified risks |

### 2.2 Test Cycle Design

Testing was organised into three cycles, with a risk reassessment at the end of each cycle before proceeding:

**Cycle 1 — Security and Authentication (26 tests)**
Addressed the six Critical risks and three High security risks. No functional testing began until all authentication, CSRF, and access control issues were confirmed resolved. Risk score reduced from 246 to 134.

**Cycle 2 — Financial and Functional (33 tests)**
Addressed financial transaction risks (R009, R010, R017, R018) and input validation (R011). All financial integrity tests were run against an in-memory database with a known seeded state. Risk score reduced from 134 to 80.

**Cycle 3 — UI, Templates and Regression (13 tests)**
Addressed template and JavaScript faults (R012, R014, R016, R019) and compliance gaps (R015). Manual UAT confirmed currency display and page routing. Risk score reduced from 80 to 48.

### 2.3 Tool Selection

**pytest with FastAPI TestClient** was chosen as the primary test framework. pytest provides fixture management, parameterisation, and detailed failure output. FastAPI's TestClient exercises the full application stack in-process — including middleware, dependency injection, and session handling — without requiring a running server. This is significantly more reliable than mocking individual components, because it tests the integrated system rather than isolated units.

**SQLite in-memory database** was used for all automated tests. This provides complete isolation from the development database, zero setup overhead, and a deterministic seeded state on every run. Each test session starts from the same known baseline, eliminating the test pollution that would occur if tests ran against the development database.

**Git** provided version control and traceability throughout. Every code change — including fault remediations — was committed with a descriptive message referencing the risk being addressed. This allows any test result to be traced to the exact state of the codebase at the time it was recorded.

### 2.4 Test Data Management

All test data was generated programmatically in `conftest.py`. Five staff accounts and eight demo customers with transaction histories were seeded at session start. No real customer data was used at any point. The test API key was set via environment variable before the application was imported, ensuring it was different from any production key.

### 2.5 Entry and Exit Criteria

Entry criteria: application starts without error; `GET /api/health` returns HTTP 200; all seed accounts present; test API key configured.

Exit criteria: all 72 tests pass; zero Critical or High open defects; all five security headers verified; all currency displays confirmed in pounds; manual UAT sign-off on all 12 page routes.

---

## Part 3 — Test Results and Fault Analysis

### 3.1 Results Summary

All 72 automated tests passed following the remediation of 18 faults. The pre-mitigation risk score of 246 was reduced to 48 — an 80% reduction.

| Cycle | Tests | Passed | Faults Found | Faults Resolved |
|---|---|---|---|---|
| 1 — Security | 26 | 26 | 7 | 7 |
| 2 — Financial | 33 | 33 | 8 | 8 |
| 3 — UI/Compliance | 13 | 13 | 3 | 3 |
| **Total** | **72** | **72** | **18** | **18** |

### 3.2 Critical Faults

**Insufficient Funds (R009) — Financial integrity failure**
The withdrawal and transfer endpoints processed transactions without checking the account balance. A request to withdraw £500 from an account containing £100 was accepted, producing a balance of −£400. This was identified by writing a test that submitted an over-limit withdrawal and asserting HTTP 400 was returned. The fix added a balance pre-check before the debit operation, wrapped in a database transaction to prevent race conditions.

**CSRF Token Not Initialised (R016) — Silent form rejection**
Deposit, withdrawal, and notes forms on the customer profile page consistently returned HTTP 403 with no visible error. Investigation using Browser DevTools confirmed the `X-CSRF-Token` header was absent from all requests originating from that page. The root cause was that the JavaScript initialisation routine fetched the CSRF token only when dashboard-specific DOM elements were present — none of which exist on the profile page. The fix extended the initialisation condition to include all authenticated pages containing mutating forms.

**Alerts Page AttributeError (R019) — Page completely inaccessible**
Every request to the alerts endpoint produced an unhandled `AttributeError` and returned HTTP 500. The endpoint attempted to access `t.account_number` and `t.timestamp` on Transaction model objects — neither column exists. The Transaction model stores account references as ORM relationships (`to_customer`, `from_customer`) and uses `created_at` for the timestamp. The fix corrected the list comprehension to use valid ORM attributes.

### 3.3 Heuristic Reasoning in Fault Discovery

Two faults (R016 and R019) were discovered through applying test heuristics rather than following the original risk register directly.

**New page heuristic**: When a new page is added to the application, the JavaScript initialisation routine may not cover it. I applied this reasoning to every new template added during development, which led directly to discovering the CSRF initialisation failure on the customer profile, alerts, and reports pages.

**ORM field heuristic**: When an endpoint accesses model attributes directly rather than through documented schema fields, there is a risk of accessing non-existent columns. This reasoning was applied to the alerts endpoint after noticing it referenced field names inconsistently with the rest of the codebase.

ISTQB (2018) describes this kind of systematic heuristic application as a key element of experienced-based testing, where the tester's understanding of common failure patterns guides test design beyond the formal test plan.

### 3.4 Post-Mitigation Risk Assessment

Following all three cycles, the residual risk score is 48. Two risks retain scores above the Low threshold:

- **R006 — CSRF (residual 10)**: The double-submit pattern prevents direct CSRF exploitation. The residual represents the theoretical risk of token theft via a future XSS vulnerability. This is mitigated by the Content-Security-Policy header blocking inline scripts.
- **R001 — Authentication Bypass (residual 5)**: The dependency injection approach provides consistent enforcement. The residual reflects the inherent complexity of the FastAPI dependency graph.

All other risks have been reduced to residual scores of 2–5.

---

## Part 4 — Evaluation

### 4.1 Effectiveness of the Risk-Based Approach

The risk-based approach was effective in three measurable ways. First, it correctly prioritised the highest-impact faults: all six Critical risks were confirmed resolved before any functional testing began. Second, the three-cycle structure provided documented evidence of incremental risk reduction, which satisfies the audit trail requirements implied by GDPR's accountability principle (ICO, 2018) and PCI DSS Requirement 6.3. Third, the post-mitigation residual score of 48 against a baseline of 246 demonstrates that systematic prioritisation produced measurable improvement, not just activity.

The approach also exposed limitations. Three faults discovered in Cycle 3 — including R016 (CSRF token initialisation) and R019 (AttributeError) — were not on the original risk register. They were found by applying heuristics during manual UAT rather than by planned tests. This confirms the view of Mottahir and Khan (2021) that formal risk registers should be supplemented with exploratory techniques, particularly for integration-point failures that are difficult to predict from static code review.

### 4.2 Tool Evaluation

The FastAPI TestClient proved more valuable than initially anticipated. By exercising the full middleware stack in-process — including session handling, CSRF middleware, and rate limiting — it caught integration-level faults that a mocked unit test would have missed entirely. The CSRF fault (R006) and the authentication lockout fault (R002) were both verified through the integrated client, which correctly sent cookies and headers across requests in the same session.

The in-memory SQLite database provided complete test isolation. There were no false failures caused by leftover data from previous runs, and the seeded state was identical on every execution. This reproducibility is essential for a test suite intended to serve as formal evidence.

### 4.3 Compliance Considerations

The test programme addressed GDPR compliance in two ways. The audit trail tests (R015) verified that all mutating operations produce event records, supporting GDPR's accountability requirement. The username enumeration test (R003) verified that error responses do not reveal whether a username exists in the system, limiting unnecessary personal data disclosure.

PCI DSS compliance was addressed through the security header tests (R004, R005), authentication controls (R001, R002), and the transaction risk flagging tests (R018). PCI DSS Requirement 6.3 requires that vulnerabilities in public-facing applications are addressed — the documented test cycle with pre- and post-mitigation scores provides evidence that this requirement has been worked toward in a structured, documented manner.

### 4.4 Limitations and Improvements

The test programme did not include load testing, browser cross-compatibility testing, or penetration testing using external tools such as OWASP ZAP. These are noted as out-of-scope items in the test strategy but represent genuine gaps in coverage that would need to be addressed before a production deployment.

If repeating this project, I would extend the risk register earlier in development rather than waiting until the application was functionally complete. Several risks that scored High or Critical were already present in the codebase before formal testing began. Earlier identification would have reduced the remediation effort in Cycle 1 and allowed more Cycle 2 and 3 effort to be directed at positive functional testing rather than fault correction.

---

## References

DeMarco, T. and Lister, T. (2003) *Waltzing with Bears: Managing Risk on Software Projects.* New York: Dorset House.

ICO (2018) *Guide to the General Data Protection Regulation (GDPR).* Wilmslow: Information Commissioner's Office. Available at: https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-the-general-data-protection-regulation-gdpr/ [Accessed April 2026].

ISO/IEC 9126-1 (2001) *Software Engineering — Product Quality — Part 1: Quality Model.* Geneva: International Organisation for Standardisation.

ISTQB (2018) *ISTQB Certified Tester Foundation Level Syllabus v3.1.* Brussels: International Software Testing Qualifications Board.

Mottahir, A. and Khan, M.A. (2021) 'Risk-based testing in agile environments: a systematic review', *Journal of Software Engineering and Applications,* 14(3), pp. 67–89.

Myers, G.J., Sandler, C. and Badgett, T. (2011) *The Art of Software Testing.* 3rd edn. Hoboken: Wiley.

Nettleton, D. (2013) *Commercial Data Mining: Processing, Analysis and Modelling for Predictive Analytics Projects.* Waltham: Morgan Kaufmann.

PCI SSC (2022) *PCI DSS v4.0.* Wakefield: PCI Security Standards Council. Available at: https://www.pcisecuritystandards.org [Accessed April 2026].
