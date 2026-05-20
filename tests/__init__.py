"""
SecureBank — test suite.

Tests are organised by area:
    conftest.py          — shared fixtures (client, auth helpers)
    test_health.py       — health endpoint and system availability
    test_auth.py         — login, lockout, session, CSRF
    test_security.py     — response headers, role enforcement
    test_customers.py    — customer CRUD operations
    test_transactions.py — deposit, withdraw, transfer, risk flagging

Run all tests:
    pytest tests/ -v

Run a single file:
    pytest tests/test_security.py -v
"""
