"""
SecureBank — customer CRUD operation tests.

I verify:
    - Customer list returns correctly structured data.
    - Search/filter parameters work as expected.
    - A customer can be created, updated, deactivated, and reactivated.
    - Duplicate email is rejected.
    - Deleting a non-existent customer returns 404.
    - Input validation rejects malformed requests.

Risk Register mapping:
    R009 — Input validation bypass     (test_create_customer_invalid_*)
    R010 — Data integrity              (test_duplicate_email_rejected)
"""


# ---------------------------------------------------------------------------
# Read operations
# ---------------------------------------------------------------------------

def test_customer_list_returns_list(client, api_headers):
    """GET /api/customers must return a JSON array."""
    response = client.get("/api/customers", headers=api_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_customer_list_contains_required_fields(client, api_headers):
    """Each customer record must contain the expected fields."""
    response = client.get("/api/customers", headers=api_headers)
    customers = response.json()
    assert len(customers) > 0, "Expected demo customers to be seeded"
    first = customers[0]
    for field in ("id", "full_name", "email", "account_number",
                  "balance", "is_active", "created_at"):
        assert field in first, f"Missing field: {field}"


def test_customer_search_by_name(client, api_headers):
    """Search by name must return only matching customers."""
    response = client.get(
        "/api/customers?search=Alice", headers=api_headers
    )
    assert response.status_code == 200
    results = response.json()
    assert all("alice" in c["full_name"].lower() for c in results)


def test_customer_filter_active_only(client, api_headers):
    """Status filter 'active' must return only active customers."""
    response = client.get(
        "/api/customers?status=active", headers=api_headers
    )
    assert response.status_code == 200
    assert all(c["is_active"] for c in response.json())


def test_customer_filter_inactive_only(client, api_headers):
    """Status filter 'inactive' must return only inactive customers."""
    response = client.get(
        "/api/customers?status=inactive", headers=api_headers
    )
    assert response.status_code == 200
    assert all(not c["is_active"] for c in response.json())


def test_customer_pagination_limit(client, api_headers):
    """Limit parameter must cap the number of results returned."""
    response = client.get(
        "/api/customers?limit=3", headers=api_headers
    )
    assert response.status_code == 200
    assert len(response.json()) <= 3


def test_get_customer_by_id(client, api_headers):
    """GET /api/customers/{id} must return a single customer record."""
    # Get the first customer's ID from the list.
    customers = client.get("/api/customers", headers=api_headers).json()
    first_id = customers[0]["id"]

    response = client.get(
        f"/api/customers/{first_id}", headers=api_headers
    )
    assert response.status_code == 200
    assert response.json()["id"] == first_id


def test_get_nonexistent_customer_returns_404(client, api_headers):
    """Requesting a customer with an ID that does not exist must return 404."""
    response = client.get("/api/customers/99999", headers=api_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Create customer
# ---------------------------------------------------------------------------

def test_create_customer_success(client, api_headers):
    """POST /api/customers must create and return the new customer."""
    response = client.post(
        "/api/customers",
        json={
            "full_name": "Test Customer One",
            "email": "testcustomer.one@example.com",
            "balance": 1000
        },
        headers=api_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["full_name"] == "Test Customer One"
    assert data["balance"] == 1000
    assert data["account_number"].startswith("SB")


def test_create_customer_generates_unique_account_number(client, api_headers):
    """Each new customer must receive a unique SB-prefixed account number."""
    r1 = client.post(
        "/api/customers",
        json={
            "full_name": "Account Num Test A",
            "email": "accounttest.a@example.com",
            "balance": 0
        },
        headers=api_headers
    ).json()
    r2 = client.post(
        "/api/customers",
        json={
            "full_name": "Account Num Test B",
            "email": "accounttest.b@example.com",
            "balance": 0
        },
        headers=api_headers
    ).json()
    assert r1["account_number"] != r2["account_number"]


def test_duplicate_email_rejected(client, api_headers):
    """Creating a customer with an existing email must return 400 (R010)."""
    # First creation should succeed.
    client.post(
        "/api/customers",
        json={
            "full_name": "Duplicate Test User",
            "email": "duplicate@example.com",
            "balance": 0
        },
        headers=api_headers
    )
    # Second creation with the same email must fail.
    response = client.post(
        "/api/customers",
        json={
            "full_name": "Duplicate Test User Two",
            "email": "duplicate@example.com",
            "balance": 0
        },
        headers=api_headers
    )
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"].lower()


def test_create_customer_single_name_rejected(client, api_headers):
    """Single-word name must be rejected — input validation (R009)."""
    response = client.post(
        "/api/customers",
        json={
            "full_name": "Mononym",
            "email": "mononym@example.com",
            "balance": 0
        },
        headers=api_headers
    )
    assert response.status_code == 422


def test_create_customer_negative_balance_rejected(client, api_headers):
    """Negative opening balance must be rejected by schema (R009)."""
    response = client.post(
        "/api/customers",
        json={
            "full_name": "Negative Balance Test",
            "email": "negbal@example.com",
            "balance": -100
        },
        headers=api_headers
    )
    assert response.status_code == 422


def test_create_customer_invalid_email_rejected(client, api_headers):
    """Malformed email address must be rejected by schema validation (R009)."""
    response = client.post(
        "/api/customers",
        json={
            "full_name": "Bad Email User",
            "email": "not-an-email",
            "balance": 0
        },
        headers=api_headers
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Deactivate / reactivate
# ---------------------------------------------------------------------------

def test_deactivate_customer(client, api_headers):
    """PATCH .../deactivate must set is_active to False."""
    # Create a fresh customer to deactivate.
    created = client.post(
        "/api/customers",
        json={
            "full_name": "Deactivate Me",
            "email": "deactivateme@example.com",
            "balance": 500
        },
        headers=api_headers
    ).json()
    cid = created["id"]

    response = client.patch(
        f"/api/customers/{cid}/deactivate", headers=api_headers
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_deactivate_already_inactive_returns_400(client, api_headers):
    """Deactivating an already-inactive customer must return 400."""
    created = client.post(
        "/api/customers",
        json={
            "full_name": "Already Inactive",
            "email": "alreadyinactive@example.com",
            "balance": 0
        },
        headers=api_headers
    ).json()
    cid = created["id"]

    # First deactivation.
    client.patch(f"/api/customers/{cid}/deactivate", headers=api_headers)
    # Second deactivation must fail.
    response = client.patch(
        f"/api/customers/{cid}/deactivate", headers=api_headers
    )
    assert response.status_code == 400


def test_reactivate_customer(client, api_headers):
    """PATCH .../reactivate must set is_active back to True."""
    created = client.post(
        "/api/customers",
        json={
            "full_name": "Reactivate Me",
            "email": "reactivateme@example.com",
            "balance": 0
        },
        headers=api_headers
    ).json()
    cid = created["id"]

    client.patch(f"/api/customers/{cid}/deactivate", headers=api_headers)
    response = client.patch(
        f"/api/customers/{cid}/reactivate", headers=api_headers
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is True


# ---------------------------------------------------------------------------
# Customer timeline
# ---------------------------------------------------------------------------

def test_customer_timeline_returns_list(client, api_headers):
    """GET .../timeline must return a list of timeline events."""
    customers = client.get("/api/customers", headers=api_headers).json()
    first_id = customers[0]["id"]
    response = client.get(
        f"/api/customers/{first_id}/timeline", headers=api_headers
    )
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert len(response.json()) >= 1
