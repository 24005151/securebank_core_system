# SecureBank Core System — Changelog & GitHub Upload Guide

---

## What Was Changed (This Update)

This update is a major overhaul covering security hardening, new features, UI/UX redesign, accessibility improvements, and role-based access control.

---

## Files to Upload to GitHub

### New Files (not yet tracked)
| File | Purpose |
|---|---|
| `.env.example` | Template for environment variables — safe to commit, contains no secrets |
| `app/limiter.py` | Isolated rate-limiter module (avoids circular imports) |
| `app/utils.py` | Shared utility: `get_client_ip()` helper |
| `CHANGELOG.md` | This file |

### Modified Files
| File | What Changed |
|---|---|
| `requirements.txt` | Added `python-dotenv`, `slowapi` |
| `app/models.py` | Added `must_change_password` column to `StaffUser`; replaced deprecated `datetime.utcnow` |
| `app/schemas.py` | Added `StaffUserCreate`, `PasswordChangeRequest`; added `must_change_password` to response; `superadmin` role allowed |
| `app/crud.py` | Full rewrite — pagination, search guard, staff create/unlock/password-change, CSV audit trail, audit log purge, superadmin unlock rules, seeded `admin2` and `sysadmin` users |
| `app/security.py` | Timing-safe API key check, CSRF token generation/validation, per-request DB session re-validation, `superadmin` role, `require_superadmin_or_api_key` dependency |
| `app/main.py` | `load_dotenv()`, `SESSION_SECRET_KEY` from env, `HTTPS_ONLY` env var, `SecurityHeadersMiddleware` (CSP, X-Frame-Options, etc.), rate limiter registration |
| `app/routes/auth.py` | Rate-limited login, session stores `id`+`role`+`must_change_password`, CSRF token issued on login, `/api/auth/csrf-token` endpoint |
| `app/routes/api.py` | Pagination on all list endpoints, CSRF protection on all mutating endpoints, staff create/unlock/change-password endpoints, CSV export with audit trail, audit log purge endpoint, superadmin enforcement |
| `app/static/css/style.css` | Full redesign — fintech aesthetic, SVG icon support, compact data rows, metric card icons, login page layout, dark mode, reduced-motion, print styles, `superadmin` role pill |
| `app/static/js/app.js` | CSRF fetch interceptor, pagination, 30s auto-refresh, staff create/password-change forms, accessibility (aria, keyboard nav, focus management), new compact row renderers, `isPrivileged()`/`isSuperadmin()` helpers, first-login password-change redirect |
| `app/templates/base.html` | SVG nav icons, user avatar initials, sign-out icon, `body_class` block for login page |
| `app/templates/index.html` | Metric cards with icon wrappers, improved form labels, audit purge section, `loading-overlay` moved inside block |
| `app/templates/login.html` | Full-screen gradient layout, branded header, role access info panel, hides sidebar/topbar via `login-page` body class |

### Do NOT Upload
| File | Reason |
|---|---|
| `.env` | Contains your real `API_KEY` and `SESSION_SECRET_KEY` — **never commit this** |
| `securebank.db` | SQLite database — contains user data, not source code |
| `venv/` | Python virtual environment — recreated with `pip install -r requirements.txt` |
| `__pycache__/` | Python bytecode — auto-generated |

---

## Summary of All Improvements Made

### Security
- **API key hardened** — removed hardcoded `"Devilcat1988"`, now loaded from `.env` via `API_KEY` env var
- **Session secret hardened** — `SESSION_SECRET_KEY` loaded from `.env`, app refuses to start if missing
- **Timing-safe comparison** — `hmac.compare_digest` used for API key and CSRF token checks (prevents timing attacks)
- **CSRF protection** — double-submit token pattern on all mutating endpoints (POST/PUT/PATCH/DELETE); skipped for API key auth
- **Rate limiting** — `slowapi` limits login to 10 attempts per minute per IP
- **Security headers** — `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `X-XSS-Protection` added via middleware
- **Session re-validation** — every authenticated request re-checks the database; locked accounts are immediately ejected
- **Username enumeration fixed** — locked accounts return the same generic error as invalid credentials
- **IP spoofing hardened** — `get_client_ip()` uses `request.client.host` only, ignores `X-Forwarded-For`
- **HTTPS support** — `HTTPS_ONLY` env var controls secure cookie flag for production deployments
- **Session stored user ID** — fixes password-change ownership check that was previously broken

### Features Added
- **Pagination** — all list endpoints support `limit`/`offset`; Prev/Next buttons in the UI
- **Staff user management** — create staff users, change passwords (with strength validation), unlock locked accounts
- **Superadmin role** — new role above manager; only superadmin can unlock manager/superadmin accounts
- **Must-change-password flag** — new staff and seeded demo accounts are flagged; UI redirects to password form on first login
- **CSV export audit trail** — exporting customers/transactions now logs an audit entry
- **Audit log purge** — manager-only endpoint to delete logs older than N days
- **Auto-refresh** — dashboard stats and charts refresh every 30 seconds
- **30s CSRF token fetch** — token fetched on page load and injected automatically into all mutating requests

### Data Protection
- **Credentials in `.env`** — API key and session secret moved out of source code
- **`.env.example`** — documents required variables with generation instructions; safe to commit
- **Documented limitations** — SQLite race condition (TOCTOU on balances) and demo password risks documented in `.env.example`

### UI / Visual Redesign
- **Fintech aesthetic** — clean white cards, consistent spacing, multi-layer shadows, hover lifts
- **SVG icons** — all sidebar navigation links have inline SVG icons
- **Metric cards** — icon wrappers in colour-coded rounded squares replace the old static progress bars
- **Compact data rows** — customers, transactions, audit logs, and staff users are now horizontal rows (avatar → details → status/actions) instead of stacked paragraphs
- **Transaction amounts** — colour-coded with +/− prefix (green deposits, orange withdrawals, teal transfers)
- **Audit log rows** — monospace event name, result dot, actor/IP/time on one line, result chip
- **Login page** — full-screen gradient, hides sidebar entirely, branded header with role access info panel
- **Hero panel** — gradient banner with decorative background circles
- **Dark mode** — full dark palette updated to match all new components
- **Reduced motion** — all animations disabled via `prefers-reduced-motion` media query
- **Print styles** — sidebar hidden, cards borderless

### Accessibility (WCAG 2.1 AA)
- **Skip link** — "Skip to main content" visible on focus
- **Focus rings** — `:focus-visible` with 2.5px solid blue outline; mouse users unaffected
- **ARIA roles** — `role="dialog"`, `aria-modal`, `aria-labelledby` on modal; `aria-live` on toast container and login message
- **Touch targets** — all buttons minimum 44×44px
- **Keyboard navigation** — suggestion dropdown supports ArrowUp/ArrowDown/Escape
- **`aria-busy`** — set on `<body>` during loading
- **Semantic HTML** — `<main>`, `<nav>`, `<header>`, `<aside>` used correctly; heading hierarchy fixed
- **Form attributes** — `autocomplete`, `aria-required`, `aria-describedby` on login fields

### User Accounts (seeded)
| Username | Password | Role | Notes |
|---|---|---|---|
| `admin` | `Admin123` | manager | Must change password on first login |
| `staff1` | `Staff123` | staff | Must change password on first login |
| `admin2` | `Watford88` | manager | No forced password change |
| `sysadmin` | `Sysadmin1` | superadmin | Must change password on first login |

---

## How to Run

```bash
# 1. Copy environment template and fill in values
cp .env.example .env
# Edit .env — generate secrets with:
# python3 -c "import secrets; print(secrets.token_hex(32))"

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start the application
uvicorn app.main:app --reload

# 4. Open in browser
# http://localhost:8000
```

---

## Known Limitations (Documented)

| Issue | Severity | Notes |
|---|---|---|
| SQLite race condition on balance | Medium | Two simultaneous withdrawals may both succeed; use PostgreSQL with `SELECT FOR UPDATE` in production |
| Demo passwords are predictable | High | `admin`/`staff1`/`sysadmin` are flagged `must_change_password=True`; change immediately in any real deployment |
| No HTTPS in dev mode | — | Set `HTTPS_ONLY=true` in `.env` when running behind TLS in production |
| No GDPR erasure on audit logs | Low | Use the audit log purge endpoint (`DELETE /api/audit-logs?days=N`) to manage retention |
