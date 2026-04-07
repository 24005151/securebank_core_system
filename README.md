# SecureBank Core System

A secure banking operations web application built with **FastAPI**, **SQLite**, **HTML/CSS/JavaScript**.

## Features

- Role-based staff login (staff / manager / superadmin)
- Customer management — create, edit, deactivate, reactivate, delete
- Transaction processing — deposit, withdraw, transfer between accounts
- Full audit log with filtering
- Staff user management — create, unlock, change password
- CSV export for customers and transactions (with audit trail)
- Live dashboard with auto-refreshing stats and charts
- Pagination on all data lists
- Dark mode and accessibility (WCAG 2.1 AA)

## Security

- API key and session secret loaded from `.env` (never hardcoded)
- CSRF double-submit token protection on all mutating endpoints
- Rate-limited login (10 attempts/minute per IP)
- Security headers — CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- Per-request session re-validation (locked accounts ejected immediately)
- Timing-safe credential comparison (prevents timing attacks)
- Superadmin role — only superadmin can unlock manager/superadmin accounts

## User Accounts

| Username | Password | Role |
|---|---|---|
| `admin` | `Admin123` | manager |
| `staff1` | `Staff123` | staff |
| `admin2` | `Watford88` | manager |
| `sysadmin` | `Sysadmin1` | superadmin |

> `admin`, `staff1`, and `sysadmin` are prompted to change their password on first login.

## Setup & Run

```bash
# 1. Copy and fill in environment variables
cp .env.example .env
# Generate secrets:
# python3 -c "import secrets; print(secrets.token_hex(32))"

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start the server
uvicorn app.main:app --reload

# 4. Open http://localhost:8000
```

## Environment Variables

See `.env.example` for all required variables and generation instructions.

| Variable | Description |
|---|---|
| `API_KEY` | Random hex string for API key authentication |
| `SESSION_SECRET_KEY` | Random hex string for signing session cookies |
| `HTTPS_ONLY` | Set to `true` in production behind TLS (default: `false`) |

## Project Structure

```
app/
├── main.py           # FastAPI app, middleware, startup
├── database.py       # SQLAlchemy engine and session
├── models.py         # Database models
├── schemas.py        # Pydantic request/response schemas
├── crud.py           # Database operations
├── security.py       # Auth dependencies, CSRF, role checks
├── limiter.py        # Rate limiter (isolated to avoid circular imports)
├── utils.py          # Shared utilities (IP extraction)
├── routes/
│   ├── api.py        # All API endpoints
│   ├── auth.py       # Login, logout, CSRF token
│   └── pages.py      # HTML page routes
├── templates/
│   ├── base.html     # Layout shell with sidebar and navigation
│   ├── index.html    # Main dashboard
│   └── login.html    # Login page
└── static/
    ├── css/style.css # Full UI stylesheet
    └── js/app.js     # Frontend logic
.env.example          # Environment variable template
requirements.txt      # Python dependencies
CHANGELOG.md          # Full change history
```

## Known Limitations

- **SQLite race condition** — balance updates are not row-locked; use PostgreSQL with `SELECT FOR UPDATE` in production
- **No HTTPS in dev** — set `HTTPS_ONLY=true` when deploying behind TLS
- **Audit log retention** — use `DELETE /api/audit-logs?days=N` (manager/superadmin only) to purge old records
