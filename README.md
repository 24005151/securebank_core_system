# SecureBank Core System

A secure banking operations web application built with **FastAPI**, **SQLAlchemy**, **SQLite**, and **HTML/CSS/JavaScript**. Designed for internal staff use, the system manages customer accounts, financial transactions, and staff access control with full audit logging and role-based access control.

---

## Features

- Role-based staff login (staff / manager / superadmin)
- Customer management — create, edit, deactivate, reactivate, delete
- Transaction processing — deposit, withdraw, transfer between accounts
- Automatic risk flagging on transactions of £1,000 or more
- Full audit log with filtering by actor, event type, and date range
- Staff user management — create accounts, unlock, change password
- CSV export for customers and transactions (logged to audit trail)
- Live dashboard with real-time stats and charts
- Alerts page — risk-flagged transactions and locked accounts
- Reports page — monthly volumes, top customers, transaction type breakdown
- Pagination on all data lists
- Dark mode with persistent preference
- Accessibility — keyboard navigable, skip links, ARIA labels

---

## Security

- API key and session secret loaded from `.env` (never hardcoded in source)
- CSRF double-submit token protection on all mutating endpoints (POST, PUT, PATCH, DELETE)
- Account lockout after 3 consecutive failed login attempts
- Rate-limited login — 10 attempts per minute per IP address
- Security response headers on every request:
  - `Content-Security-Policy: default-src 'self'; script-src 'self'`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-XSS-Protection: 1; mode=block`
- Per-request session re-validation — locked accounts are ejected immediately
- Timing-safe credential comparison to prevent timing attacks
- Role hierarchy enforcement — only superadmin can unlock manager and superadmin accounts
- Input validation on all create and update operations via Pydantic schemas

---

## Requirements

- Python 3.10 or higher
- pip (included with Python)
- Git

---

## Installation

### Windows

**1. Install Python**

Download and install Python 3.10+ from [https://www.python.org/downloads/](https://www.python.org/downloads/).
During installation, check the box **"Add Python to PATH"**.

**2. Open Command Prompt or PowerShell and clone the repository**

```bat
git clone https://github.com/24005151/securebank_core_system.git
cd securebank_core_system
```

**3. Create and activate a virtual environment**

```bat
python -m venv venv
venv\Scripts\activate
```

**4. Install dependencies**

```bat
pip install -r requirements.txt
```

**5. Set up environment variables**

```bat
copy .env.example .env
```

Open `.env` in Notepad and fill in the values. Generate secrets by running:

```bat
python -c "import secrets; print(secrets.token_hex(32))"
```

**6. Start the server**

```bat
uvicorn app.main:app --reload
```

**7. Open in browser:** [http://localhost:8000](http://localhost:8000)

---

### macOS

**1. Install Python**

macOS does not include Python 3 by default on all versions. Install it from [https://www.python.org/downloads/](https://www.python.org/downloads/) or via Homebrew:

```bash
brew install python3
```

**2. Clone the repository**

```bash
git clone https://github.com/24005151/securebank_core_system.git
cd securebank_core_system
```

**3. Create and activate a virtual environment**

```bash
python3 -m venv venv
source venv/bin/activate
```

**4. Install dependencies**

```bash
pip install -r requirements.txt
```

**5. Set up environment variables**

```bash
cp .env.example .env
```

Open `.env` in any text editor and fill in the values. Generate secrets with:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

**6. Start the server**

```bash
uvicorn app.main:app --reload
```

**7. Open in browser:** [http://localhost:8000](http://localhost:8000)

---

### Linux

**1. Install Python and venv**

Most Linux distributions include Python 3, but you may need to install the venv module separately:

```bash
# Debian / Ubuntu
sudo apt update
sudo apt install python3 python3-pip python3-venv git

# Fedora / RHEL
sudo dnf install python3 python3-pip git

# Arch Linux
sudo pacman -S python python-pip git
```

**2. Clone the repository**

```bash
git clone https://github.com/24005151/securebank_core_system.git
cd securebank_core_system
```

**3. Create and activate a virtual environment**

```bash
python3 -m venv venv
source venv/bin/activate
```

**4. Install dependencies**

```bash
pip install -r requirements.txt
```

**5. Set up environment variables**

```bash
cp .env.example .env
```

Open `.env` in a text editor and fill in the values. Generate secrets with:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

**6. Start the server**

```bash
uvicorn app.main:app --reload
```

**7. Open in browser:** [http://localhost:8000](http://localhost:8000)

---

## Environment Variables

| Variable | Description |
|---|---|
| `API_KEY` | Random hex string for API key authentication |
| `SESSION_SECRET_KEY` | Random hex string for signing session cookies |
| `DATABASE_URL` | SQLAlchemy database URL (default: `sqlite:///./securebank.db`) |
| `HTTPS_ONLY` | Set to `true` in production behind TLS (default: `false`) |

See `.env.example` for a full template with generation instructions.

---

## User Accounts

The following demo accounts are created automatically on first startup:

| Username | Password | Role | Notes |
|---|---|---|---|
| `admin` | `Admin123` | manager | Password change required on first login |
| `staff1` | `Staff123` | staff | Password change required on first login |
| `admin2` | `Watford88` | manager | No forced change |
| `sysadmin` | `Sysadmin1` | superadmin | Password change required on first login |
| `Gbisley` | `woLIP2m@ga5r` | superadmin | Password change required on first login |

---

## Running the Tests

The test suite uses an in-memory SQLite database and a test-only API key. The rate limiter is disabled during tests so authentication tests do not trigger the production rate limit.

```bash
# Run all tests
pytest tests/ -v

# Run a specific module
pytest tests/test_security.py -v
```

| Test Module | Tests | Coverage |
|---|---|---|
| `test_auth.py` | 14 | Login, logout, lockout, session management |
| `test_security.py` | 12 | Headers, CSRF, role-based access, privilege escalation |
| `test_transactions.py` | 20 | Deposit, withdraw, transfer, risk flagging, inactive accounts |
| `test_customers.py` | 14 | CRUD, input validation, duplicate detection |
| `test_audit.py` | 8 | Audit log creation on all mutating operations |
| `test_pages.py` | 4 | Page routes, role-gated access |
| **Total** | **72** | |

---

## Project Structure

```
app/
├── main.py               # FastAPI app, middleware, security headers, startup
├── database.py           # SQLAlchemy engine and session factory
├── models.py             # Database models (User, Customer, Transaction, AuditLog)
├── schemas.py            # Pydantic request and response schemas
├── crud.py               # All database operations
├── security.py           # Auth dependencies, CSRF validation, role checks
├── limiter.py            # Rate limiter (isolated to avoid circular imports)
├── utils.py              # Shared utilities (IP extraction)
├── routes/
│   ├── api.py            # API router — registers all endpoint modules
│   ├── auth.py           # Login, logout, CSRF token endpoints
│   ├── pages.py          # HTML page routes with role enforcement
│   └── endpoints/
│       ├── alerts.py     # Risk-flagged transactions and locked accounts
│       ├── audit.py      # Audit log read and purge
│       ├── customers.py  # Customer CRUD endpoints
│       ├── dashboard.py  # Dashboard summary stats
│       ├── exports.py    # CSV export endpoints
│       ├── reports.py    # Financial reports data
│       ├── staff.py      # Staff user management
│       └── transactions.py # Deposit, withdraw, transfer
├── templates/
│   ├── base.html         # Layout shell — sidebar, navigation, dark mode
│   ├── index.html        # Dashboard
│   ├── login.html        # Login page
│   ├── customers.html    # Customer list
│   ├── customer_profile.html  # Individual customer detail
│   ├── transactions.html # Transaction history
│   ├── audit.html        # Audit log
│   ├── staff.html        # Staff user list
│   ├── staff_profile.html # Individual staff detail
│   ├── alerts.html       # Risk alerts
│   ├── reports.html      # Financial reports
│   ├── settings.html     # User settings and password change
│   ├── help.html         # Help and documentation
│   └── errors/
│       ├── 403.html      # Forbidden
│       └── 404.html      # Not found
└── static/
    ├── css/style.css     # Full UI stylesheet with CSS variables and dark mode
    └── js/app.js         # All frontend logic — API calls, rendering, forms
tests/
├── conftest.py           # Shared fixtures, in-memory DB, test client setup
├── test_auth.py
├── test_security.py
├── test_transactions.py
├── test_customers.py
├── test_audit.py
└── test_pages.py
.env.example              # Environment variable template
requirements.txt          # Python dependencies
CHANGELOG.md              # Full version history and change log
PROJECT_LOG.md            # Full development log including faults and resolutions
```

---

## Known Limitations

- **SQLite race condition** — balance updates are not row-locked; use PostgreSQL with `SELECT FOR UPDATE` in production
- **No HTTPS in development** — set `HTTPS_ONLY=true` and deploy behind a TLS-terminating reverse proxy for production use
- **No password reset flow** — forgotten passwords require a superadmin to reset via the staff management page
- **Audit log retention** — use `DELETE /api/audit-logs?days=N` (manager/superadmin only) to manage retention periods
- **Flat role model** — all staff can see all customers; no per-customer or team-based access scoping
