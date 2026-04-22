"""
SecureBank — financial transaction tests.

I verify:
    - Deposits credit the account balance correctly.
    - Withdrawals debit the account balance correctly.
    - Transfers move funds between two accounts atomically.
    - Insufficient funds are rejected before any balance is changed.
    - Transactions on inactive accounts are rejected.
    - Transactions >= £1,000 are automatically risk-flagged.
    - Self-transfers (same account) are rejected.
    - All transaction types appear in the transaction list.

Risk Register mapping:
    R011 — Insufficient fund handling  (test_withdraw_insufficient_funds)
    R012 — Duplicate / invalid txns    (test_self_transfer_rejected)
    R013 — Risk flag accuracy          (test_large_deposit_sets_risk_flag)
    R014 — Inactive account controls (test_deposit_inactive_account_rejected)
"""

import pytest


# ---------------------------------------------------------------------------
# Fixture: a fresh active customer with a known balance
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def test_account(client, api_headers):
    """Create a dedicated test customer with £5,000 opening balance.

    I use scope='module' so the same account is reused across all
    transaction tests in this file, avoiding repeated API calls.
    """
    response = client.post(
        "/api/customers",
        json={
            "full_name": "Transaction Test Customer",
            "email": "txntest.main@example.com",
            "balance": 5000
        },
        headers=api_headers
    )
    assert response.status_code == 200
    return response.json()


@pytest.fixture(scope="module")
def second_account(client, api_headers):
    """Create a second customer to use as a transfer recipient."""
    response = client.post(
        "/api/customers",
        json={
            "full_name": "Transfer Recipient",
            "email": "txntest.recipient@example.com",
            "balance": 0
        },
        headers=api_headers
    )
    assert response.status_code == 200
    return response.json()


# ---------------------------------------------------------------------------
# Deposits
# ---------------------------------------------------------------------------

def test_deposit_increases_balance(client, api_headers, test_account):
    """A deposit must credit the stated amount to the account balance."""
    account_number = test_account["account_number"]

    before = client.get(
        f"/api/customers/{test_account['id']}", headers=api_headers
    ).json()["balance"]

    response = client.post(
        "/api/transactions/deposit",
        json={
            "account_number": account_number,
            "amount": 250,
            "description": "Test deposit"
        },
        headers=api_headers
    )
    assert response.status_code == 200

    after = client.get(
        f"/api/customers/{test_account['id']}", headers=api_headers
    ).json()["balance"]

    assert after == before + 250


def test_deposit_returns_transaction_record(client, api_headers, test_account):
    """Deposit response must include the created transaction details."""
    response = client.post(
        "/api/transactions/deposit",
        json={
            "account_number": test_account["account_number"],
            "amount": 100,
            "description": "Record check"
        },
        headers=api_headers
    )
    data = response.json()
    assert data["transaction_type"] == "deposit"
    assert data["amount"] == 100


def test_large_deposit_sets_risk_flag(client, api_headers, test_account):
    """Deposits >= £1,000 must be automatically risk-flagged (R013)."""
    response = client.post(
        "/api/transactions/deposit",
        json={
            "account_number": test_account["account_number"],
            "amount": 1000,
            "description": "Large deposit test"
        },
        headers=api_headers
    )
    assert response.status_code == 200
    assert response.json()["risk_flag"] is True


def test_small_deposit_not_risk_flagged(client, api_headers, test_account):
    """Deposits below £1,000 must not be risk-flagged."""
    response = client.post(
        "/api/transactions/deposit",
        json={
            "account_number": test_account["account_number"],
            "amount": 999,
            "description": "Small deposit test"
        },
        headers=api_headers
    )
    assert response.status_code == 200
    assert response.json()["risk_flag"] is False


def test_deposit_nonexistent_account_rejected(client, api_headers):
    """Deposit to a non-existent account number must return 400."""
    response = client.post(
        "/api/transactions/deposit",
        json={
            "account_number": "SB00000000",
            "amount": 100,
            "description": "Bad account"
        },
        headers=api_headers
    )
    assert response.status_code == 400


def test_deposit_zero_amount_rejected(client, api_headers, test_account):
    """Zero-value deposit must be rejected by schema validation (R009)."""
    response = client.post(
        "/api/transactions/deposit",
        json={
            "account_number": test_account["account_number"],
            "amount": 0,
            "description": "Zero deposit"
        },
        headers=api_headers
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Withdrawals (Risk R011)
# ---------------------------------------------------------------------------

def test_withdrawal_decreases_balance(client, api_headers, test_account):
    """A withdrawal must debit the stated amount from the balance."""
    before = client.get(
        f"/api/customers/{test_account['id']}", headers=api_headers
    ).json()["balance"]

    response = client.post(
        "/api/transactions/withdraw",
        json={
            "account_number": test_account["account_number"],
            "amount": 200,
            "description": "Test withdrawal"
        },
        headers=api_headers
    )
    assert response.status_code == 200

    after = client.get(
        f"/api/customers/{test_account['id']}", headers=api_headers
    ).json()["balance"]

    assert after == before - 200


def test_withdraw_insufficient_funds(client, api_headers, test_account):
    """Withdrawal over balance must be rejected — balance unchanged (R011)."""
    current_balance = client.get(
        f"/api/customers/{test_account['id']}", headers=api_headers
    ).json()["balance"]

    response = client.post(
        "/api/transactions/withdraw",
        json={
            "account_number": test_account["account_number"],
            "amount": current_balance + 10000,
            "description": "Overdraft attempt"
        },
        headers=api_headers
    )
    assert response.status_code == 400
    assert "insufficient" in response.json()["detail"].lower()

    # Balance must be unchanged after the rejection.
    balance_after = client.get(
        f"/api/customers/{test_account['id']}", headers=api_headers
    ).json()["balance"]
    assert balance_after == current_balance


# ---------------------------------------------------------------------------
# Transfers
# ---------------------------------------------------------------------------

def test_transfer_moves_funds_between_accounts(
    client, api_headers, test_account, second_account
):
    """A transfer must debit sender and credit receiver by the same amount."""
    from_acct = test_account["account_number"]
    to_acct = second_account["account_number"]

    from_before = client.get(
        f"/api/customers/{test_account['id']}", headers=api_headers
    ).json()["balance"]
    to_before = client.get(
        f"/api/customers/{second_account['id']}", headers=api_headers
    ).json()["balance"]

    response = client.post(
        "/api/transactions/transfer",
        json={
            "from_account_number": from_acct,
            "to_account_number": to_acct,
            "amount": 300,
            "description": "Test transfer"
        },
        headers=api_headers
    )
    assert response.status_code == 200

    from_after = client.get(
        f"/api/customers/{test_account['id']}", headers=api_headers
    ).json()["balance"]
    to_after = client.get(
        f"/api/customers/{second_account['id']}", headers=api_headers
    ).json()["balance"]

    assert from_after == from_before - 300
    assert to_after == to_before + 300


def test_self_transfer_rejected(client, api_headers, test_account):
    """Transfer to the same account must be rejected (R012)."""
    acct = test_account["account_number"]
    response = client.post(
        "/api/transactions/transfer",
        json={
            "from_account_number": acct,
            "to_account_number": acct,
            "amount": 100,
            "description": "Self transfer attempt"
        },
        headers=api_headers
    )
    assert response.status_code == 400


def test_transfer_insufficient_funds(
    client, api_headers, test_account, second_account
):
    """Transfer exceeding sender balance must be rejected (R011)."""
    sender_balance = client.get(
        f"/api/customers/{test_account['id']}", headers=api_headers
    ).json()["balance"]

    response = client.post(
        "/api/transactions/transfer",
        json={
            "from_account_number": test_account["account_number"],
            "to_account_number": second_account["account_number"],
            "amount": sender_balance + 50000,
            "description": "Overdraft transfer"
        },
        headers=api_headers
    )
    assert response.status_code == 400
    assert "insufficient" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Inactive account controls (Risk R014)
# ---------------------------------------------------------------------------

def test_deposit_inactive_account_rejected(client, api_headers):
    """Deposit to an inactive account must be rejected (R014)."""
    # Create and immediately deactivate a customer.
    created = client.post(
        "/api/customers",
        json={
            "full_name": "Inactive Account Test",
            "email": "inactive.txn@example.com",
            "balance": 500
        },
        headers=api_headers
    ).json()
    client.patch(
        f"/api/customers/{created['id']}/deactivate", headers=api_headers
    )

    response = client.post(
        "/api/transactions/deposit",
        json={
            "account_number": created["account_number"],
            "amount": 100,
            "description": "Deposit to inactive"
        },
        headers=api_headers
    )
    assert response.status_code == 400
    assert "inactive" in response.json()["detail"].lower()


def test_withdraw_inactive_account_rejected(client, api_headers):
    """Withdrawal from an inactive account must be rejected (R014)."""
    created = client.post(
        "/api/customers",
        json={
            "full_name": "Inactive Withdraw Test",
            "email": "inactive.withdraw@example.com",
            "balance": 500
        },
        headers=api_headers
    ).json()
    client.patch(
        f"/api/customers/{created['id']}/deactivate", headers=api_headers
    )

    response = client.post(
        "/api/transactions/withdraw",
        json={
            "account_number": created["account_number"],
            "amount": 100,
            "description": "Withdraw from inactive"
        },
        headers=api_headers
    )
    assert response.status_code == 400
    assert "inactive" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Transaction list
# ---------------------------------------------------------------------------

def test_transaction_list_returns_list(client, api_headers):
    """GET /api/transactions must return a JSON array."""
    response = client.get("/api/transactions", headers=api_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_transaction_filter_by_type(client, api_headers):
    """transaction_type filter must return only the specified type."""
    response = client.get(
        "/api/transactions?transaction_type=deposit", headers=api_headers
    )
    assert response.status_code == 200
    results = response.json()
    assert all(t["transaction_type"] == "deposit" for t in results)


def test_transaction_filter_by_account(client, api_headers, test_account):
    """account_number filter must return only that customer's transactions."""
    response = client.get(
        f"/api/transactions?account_number={test_account['account_number']}",
        headers=api_headers
    )
    assert response.status_code == 200
    txns = response.json()
    assert len(txns) > 0
    # Every returned transaction must involve the test account.
    cid = test_account["id"]
    for txn in txns:
        assert txn["from_customer_id"] == cid or txn["to_customer_id"] == cid
