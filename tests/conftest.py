"""
SecureBank — pytest fixtures shared across all test modules.

Sets required environment variables before the app is imported
so FastAPI and the session middleware start correctly without a
real .env file in the test environment.

Test isolation strategy:
    - DATABASE_URL points at an in-memory SQLite instance so every
      pytest session starts from a clean, seeded state.  Tests that
      create customers with fixed email addresses won't collide with
      data left over from previous runs.
    - After import, the SlowAPI rate limiter is disabled so
      authentication tests (including the lockout scenario, which
      sends many POST /api/auth/login requests) don't trip the
      10-per-minute limit that is correct for production but would
      cause spurious 429 errors in automated testing.
    - Mutating tests use the X-API-Key header to bypass CSRF checks,
      which is the correct bypass path for non-browser API consumers.
    - Security tests deliberately send invalid / missing credentials to
      verify that rejections work correctly.
"""

import os
import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Environment — must be set before importing app.main
# ---------------------------------------------------------------------------

# Route the app at an in-memory SQLite database so tests are isolated
# from the development database and from one another across runs.
os.environ.setdefault(
    "DATABASE_URL", "sqlite:///:memory:"
)

# Required by SessionMiddleware and the security module.
os.environ.setdefault(
    "SESSION_SECRET_KEY",
    "test-only-secret-key-not-for-production-use"
)
os.environ.setdefault(
    "API_KEY",
    "test-api-key-for-automated-testing-only"
)

# Import the app after env vars are set so database.py and
# security.py pick up the correct configuration values.
from app.main import app  # noqa: E402

# ---------------------------------------------------------------------------
# Disable rate limiting for the test session
# ---------------------------------------------------------------------------
# The login endpoint is limited to 10 requests per minute per IP.
# A full test suite sends more than 10 login requests from the same
# loopback address, so we disable the limiter globally for tests.
# The lockout logic is tested independently of the rate limit.
app.state.limiter.enabled = False


# ---------------------------------------------------------------------------
# Session-scoped fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def client():
    """Return a TestClient that persists session cookies across requests.

    Uses scope='session' so the same TestClient is reused for every
    test, avoiding repeated startup overhead.
    """
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


@pytest.fixture(scope="session")
def api_key():
    """Return the API key configured for the test environment."""
    return os.environ["API_KEY"]


@pytest.fixture(scope="session")
def api_headers(api_key):
    """Return request headers pre-loaded with the API key.

    Used on mutating requests in tests that aren't specifically
    testing session/CSRF behaviour.  The X-API-Key header bypasses
    the CSRF double-submit check by design (API key callers don't
    use cookies so CSRF doesn't apply to them).
    """
    return {"X-API-Key": api_key}


@pytest.fixture(scope="session")
def auth_client():
    """Return a dedicated TestClient logged in as 'admin' (manager role).

    Uses a separate TestClient — not the shared ``client`` — so
    security tests that call ``client.post('/api/auth/logout')``
    don't accidentally log out this manager session.  The cookie
    jars are independent.
    """
    with TestClient(app, raise_server_exceptions=True) as c:
        response = c.post(
            "/api/auth/login",
            json={"username": "admin", "password": "Admin123"}
        )
        assert response.status_code == 200, (
            f"Login failed during fixture setup: {response.json()}"
        )
        yield c


@pytest.fixture(scope="session")
def csrf_token(auth_client):
    """Return the CSRF token for the current manager session."""
    response = auth_client.get("/api/auth/csrf-token")
    assert response.status_code == 200
    return response.json()["csrf_token"]


@pytest.fixture(scope="session")
def csrf_headers(csrf_token):
    """Return session CSRF headers for mutating session-auth requests."""
    return {"X-CSRF-Token": csrf_token}
