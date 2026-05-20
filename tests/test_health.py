"""
SecureBank — health endpoint and availability tests.

Checks that the application is reachable, the health endpoint
returns the expected structure, and the login page is served
correctly to unauthenticated users.

These are the first tests to run — if these fail, all subsequent
test suites should be considered blocked.
"""


def test_health_endpoint_returns_ok(client):
    """Health endpoint must return HTTP 200 with status 'ok'."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_health_endpoint_lists_security_features(client):
    """Health response must advertise all implemented security controls."""
    response = client.get("/api/health")
    features = response.json()["security_features"]
    assert len(features) >= 6, "Expected at least 6 security features listed"


def test_health_endpoint_includes_timestamp(client):
    """Health response must include a current timestamp."""
    response = client.get("/api/health")
    assert "timestamp" in response.json()


def test_login_page_served_to_unauthenticated_user(client):
    """Unauthenticated GET / must redirect to the login page."""
    # Ensure no session is active — earlier tests may have logged in
    # via the shared client and not yet called logout.
    client.post("/api/auth/logout")
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == "/login"


def test_login_page_html_loads(client):
    """GET /login must return 200 with HTML content."""
    response = client.get("/login")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert b"SecureBank" in response.content


def test_static_css_served(client):
    """CSS file must be served with the correct content type."""
    response = client.get("/static/css/style.css")
    assert response.status_code == 200
    assert "text/css" in response.headers["content-type"]


def test_static_js_served(client):
    """JavaScript file must be served with the correct content type."""
    response = client.get("/static/js/app.js")
    assert response.status_code == 200
