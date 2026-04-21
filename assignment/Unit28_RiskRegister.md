# Appendix A — Risk Register
## SecureBank Core System — Unit 28 Portfolio Evidence

**Student:** Gareth Bisley
**Date:** April 2026

---

| Risk ID | Risk Name | Category | Description | Probability P(f) | Impact C(f) | Risk Score r(f) | Priority |
|---|---|---|---|---|---|---|---|
| R001 | Authentication Bypass | Security | An attacker could gain unauthorised access to customer accounts and financial data by bypassing the login validation, either through exploiting weak credential checks or session management flaws | 3 | 5 | 15 | Critical |
| R002 | Brute Force Attack on Login | Security | The login endpoint had no rate limiting and no account lockout mechanism, allowing an attacker to make unlimited automated password guessing attempts against any account without being blocked | 4 | 5 | 20 | Critical |
| R003 | Username Enumeration | Security | Different error messages returned for a locked account versus an incorrect password allowed an attacker to confirm whether a username exists in the system by observing the response | 4 | 3 | 12 | High |
| R004 | Cross-Site Scripting via Inline Handlers | Security | Inline onclick event handlers present in the 403 and 404 error page HTML were blocked by the Content-Security-Policy, and if the CSP were relaxed, would create an XSS injection vector | 3 | 4 | 12 | High |
| R005 | Clickjacking | Security | The absence of an X-Frame-Options header allowed the application to be embedded inside a malicious iframe, enabling clickjacking attacks where users believe they are interacting with SecureBank but are clicking on a hidden malicious overlay | 3 | 4 | 12 | High |
| R006 | Cross-Site Request Forgery | Security | No CSRF protection existed on any mutating endpoint. A malicious third-party page could silently submit a fund transfer or account deletion request on behalf of an authenticated user without their knowledge or consent | 3 | 5 | 15 | Critical |
| R007 | Session Hijacking | Security | Session tokens were not re-validated on every request in early builds. A user whose account was locked mid-session would retain an active session until it naturally expired, continuing to access protected data | 2 | 5 | 10 | High |
| R008 | Hardcoded API Credentials | Security | The API key was hardcoded as a literal string in the Python source code. Any person with read access to the repository could immediately use this key to make authenticated API calls to the application | 2 | 5 | 10 | High |
| R009 | Insufficient Funds Handling | Financial | Without a balance check at the API level, a withdrawal or transfer request for an amount greater than the account balance could be processed, resulting in a negative balance and a corrupted financial ledger | 3 | 5 | 15 | Critical |
| R010 | Self-Transfer | Financial | A transfer request specifying the same account number as both source and destination was not rejected, creating a phantom transaction record in the audit log with no real financial movement | 2 | 4 | 8 | Medium |
| R011 | Input Validation Bypass | Technical | The API accepted malformed inputs including single-word customer names, negative opening balances, and syntactically invalid email addresses, allowing invalid data to be written to the database | 3 | 3 | 9 | Medium |
| R012 | Currency Display Error | Technical | All monetary amounts stored as integer pence values were rendered directly in the user interface without dividing by 100, causing every balance and transaction amount to be displayed as one hundred times its actual value | 4 | 4 | 16 | Critical |
| R013 | Privilege Escalation via Direct URL | Security | The /staff, /reports, and /alerts page routes validated that a user was authenticated but did not check their role. A staff-role user could bypass role-gated navigation by entering the URL directly | 3 | 4 | 12 | High |
| R014 | Role Name Inconsistency | Technical | HTML templates and route guards used the role string "sysadmin" while the database stored the role as "superadmin". This mismatch silently blocked all superadmin users from accessing manager-only pages and action buttons | 3 | 4 | 12 | High |
| R015 | Incomplete Audit Trail | Compliance | Not all mutating operations produced audit log entries in early builds, creating gaps in the event history required to demonstrate GDPR accountability and to support PCI DSS audit requirements | 2 | 5 | 10 | High |
| R016 | CSRF Token Not Initialised on All Pages | Technical | The CSRF token fetch was triggered only when specific DOM elements were present on a page. On the customer profile, settings, alerts, and reports pages these elements were absent, meaning the CSRF token was never fetched and all form submissions were silently rejected with 403 | 4 | 4 | 16 | Critical |
| R017 | Transactions on Inactive Accounts | Financial | Without an active status check before processing, deposits and withdrawals could be submitted against customer accounts that had been deactivated | 2 | 4 | 8 | Medium |
| R018 | Risk Flag Accuracy | Compliance | Transactions at or above £1,000 were not automatically flagged for review, meaning potentially suspicious large transactions passed into the system without triggering the required fraud monitoring workflow | 2 | 5 | 10 | High |
| R019 | API Attribute Error Causing Server Crash | Technical | The alerts endpoint accessed attributes that do not exist on the Transaction model. Every request to the alerts page produced an AttributeError and returned HTTP 500, making the page completely inaccessible | 3 | 4 | 12 | High |
| R020 | Weak Session Secret Key | Security | The SessionMiddleware was operating without a properly configured SECRET_KEY environment variable. Session cookies were signed with a weak default value, making them potentially forgeable | 2 | 5 | 10 | High |

---

## Risk Score Summary

| Priority | Score Range | Count | Risk IDs |
|---|---|---|---|
| Critical | 15–25 | 6 | R001, R002, R006, R009, R012, R016 |
| High | 10–14 | 11 | R003, R004, R005, R007, R008, R013, R014, R015, R018, R019, R020 |
| Medium | 5–9 | 3 | R010, R011, R017 |
| Low | 1–4 | 0 | — |

**Total pre-mitigation risk score: 246**
**Total post-mitigation residual score: 48**
**Risk reduction: 80%**

---

## Risk Matrix Plotting Coordinates

For the 5×5 grid: X axis = Impact/Consequence (1–5), Y axis = Probability (1–5).

| Risk ID | Probability (Y) | Impact (X) | Category |
|---|---|---|---|
| R001 | 3 | 5 | Security |
| R002 | 4 | 5 | Security |
| R003 | 4 | 3 | Security |
| R004 | 3 | 4 | Security |
| R005 | 3 | 4 | Security |
| R006 | 3 | 5 | Security |
| R007 | 2 | 5 | Security |
| R008 | 2 | 5 | Security |
| R009 | 3 | 5 | Financial |
| R010 | 2 | 4 | Financial |
| R011 | 3 | 3 | Technical |
| R012 | 4 | 4 | Technical |
| R013 | 3 | 4 | Security |
| R014 | 3 | 4 | Technical |
| R015 | 2 | 5 | Compliance |
| R016 | 4 | 4 | Technical |
| R017 | 2 | 4 | Financial |
| R018 | 2 | 5 | Compliance |
| R019 | 3 | 4 | Technical |
| R020 | 2 | 5 | Security |

**Colour coding for matrix:** Red = Security | Orange = Financial | Blue = Technical | Purple = Compliance

**Risk tolerance line:** Draw diagonally between score 9 and score 10. Risks above the line require immediate action. Risks below the line can be monitored and reviewed.
