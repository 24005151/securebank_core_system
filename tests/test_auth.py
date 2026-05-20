"""
SecureBank — authentication tests.

Tests cover:
    - Successful login stores the correct role and flags in the session.
    - Failed logins return a generic error (no username enumeration).
    - Accounts lock after MAX_FAILED_LOGIN_ATTEMPTS failures.
    - Locked accounts return the same error as wrong credentials.
    - Logout clears the session.
    - The /me endpoint returns the current user or 401.
    - The CSRF token endpoint issues a token for authenticated sessions.

Risk Register mapping:
    R001 — Authentication bypass       (test_wrong_password_rejected)
    R002 — Brute force / lockout       (test_account_locks_after_failures)
    R003 — Username enumeration    (test_locked_account_returns_generic_error)
    R007 — Session integrity           (test_logout_clears_session)
"""


# ---------------------------------------------------------------------------
# Login — success
# ---------------------------------------------------------------------------

def test_login_success_returns_role(client):
    """Valid credentials must return the user's role in the response."""
    response = client.post(
        "/api/auth/login",
        json={"username": "admin2", "password": "Watford88"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "manager"
    assert data["username"] == "admin2"


def test_login_success_returns_must_change_flag(client):
    """Login response must include the must_change_password flag."""
    response = client.post(
        "/api/auth/login",
        json={"username": "admin2", "password": "Watford88"}
    )
    assert response.status_code == 200
    assert "must_change_password" in response.json()


def test_login_establishes_session(client):
    """After login the /me endpoint must return the current user."""
    client.post(
        "/api/auth/login",
        json={"username": "admin2", "password": "Watford88"}
    )
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["username"] == "admin2"


# ---------------------------------------------------------------------------
# Login — failure (Risk R001, R003)
# ---------------------------------------------------------------------------

def test_wrong_password_rejected(client):
    """Wrong password must return 401 — authentication bypass test."""
    response = client.post(
        "/api/auth/login",
        json={"username": "admin2", "password": "wrongpassword"}
    )
    assert response.status_code == 401


def test_wrong_password_returns_generic_message(client):
    """Error message must not reveal whether the username exists (R003)."""
    response = client.post(
        "/api/auth/login",
        json={"username": "admin2", "password": "wrongpassword"}
    )
    # The message must be identical for wrong password AND unknown user
    assert response.json()["detail"] == "Invalid username or password."


def test_unknown_username_returns_generic_message(client):
    """Unknown username returns the same message as wrong password (R003)."""
    response = client.post(
        "/api/auth/login",
        json={"username": "nonexistentuser999", "password": "anything"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password."


def test_empty_credentials_rejected(client):
    """Empty username and password must be rejected at schema validation."""
    response = client.post(
        "/api/auth/login",
        json={"username": "", "password": ""}
    )
    # Pydantic min_length=1 rejects empty strings before auth logic runs.
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Account lockout (Risk R002)
# ---------------------------------------------------------------------------

def test_account_locks_after_failures(client):
    """Account must lock after 3 consecutive failed login attempts (R002).

    Uses staff1 because it is a low-privilege account and locking
    it does not affect other tests that require admin access.
    Note: this test may fail if staff1 is already locked from a previous
    run — reset via the unlock endpoint or restart the database.
    """
    wrong_creds = {"username": "staff1", "password": "WrongPassword1"}

    # Make 3 consecutive failures to trigger lockout.
    for attempt in range(3):
        response = client.post("/api/auth/login", json=wrong_creds)
        assert response.status_code == 401, (
            f"Attempt {attempt + 1} should return 401"
        )

    # The 4th attempt — even with the correct password — must fail
    # because the account is now locked.
    response = client.post(
        "/api/auth/login",
        json={"username": "staff1", "password": "Staff123"}
    )
    assert response.status_code == 401


def test_locked_account_returns_generic_error(client):
    """Locked account must return the same error as wrong credentials (R003).

    This prevents an attacker from confirming that an account exists
    by observing a different error message after causing a lockout.
    """
    # staff1 is locked from the previous test.
    response = client.post(
        "/api/auth/login",
        json={"username": "staff1", "password": "Staff123"}
    )
    assert response.json()["detail"] == "Invalid username or password."


# ---------------------------------------------------------------------------
# Logout and session management (Risk R007)
# ---------------------------------------------------------------------------

def test_logout_clears_session(client):
    """After logout, /me must return 401 — session is cleared (R007)."""
    # Ensure we are logged in first.
    client.post(
        "/api/auth/login",
        json={"username": "admin2", "password": "Watford88"}
    )
    assert client.get("/api/auth/me").status_code == 200

    # Logout.
    logout = client.post("/api/auth/logout")
    assert logout.status_code == 200

    # Session must be gone.
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_unauthenticated_me_returns_401(client):
    """Unauthenticated /me request must return 401."""
    # Ensure logged out.
    client.post("/api/auth/logout")
    response = client.get("/api/auth/me")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# CSRF token
# ---------------------------------------------------------------------------

def test_csrf_token_issued_after_login(auth_client):
    """The CSRF token endpoint must return a non-empty token string."""
    response = auth_client.get("/api/auth/csrf-token")
    assert response.status_code == 200
    token = response.json().get("csrf_token", "")
    assert len(token) == 64, "CSRF token should be 32 hex bytes (64 chars)"
