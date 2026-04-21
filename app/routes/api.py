"""
SecureBank — API router (entry point).

All endpoints are implemented in domain-specific modules under
``app/routes/endpoints/`` and combined here into a single router
that ``main.py`` includes.

Domain modules:
    endpoints/dashboard.py     — health check, dashboard stats, chart data
    endpoints/customers.py     — customer CRUD and timeline
    endpoints/transactions.py  — deposit, withdraw, transfer, list
    endpoints/audit.py         — audit log list and purge
    endpoints/staff.py         — staff user management and password change
    endpoints/exports.py       — CSV downloads
    endpoints/reports.py       — aggregated reporting data
    endpoints/alerts.py        — risk flags and locked accounts
"""

from fastapi import APIRouter

from app.routes.endpoints import (
    alerts,
    audit,
    customers,
    dashboard,
    exports,
    reports,
    staff,
    transactions,
)

router = APIRouter(tags=["SecureBank"])

router.include_router(dashboard.router)
router.include_router(customers.router)
router.include_router(transactions.router)
router.include_router(audit.router)
router.include_router(staff.router)
router.include_router(exports.router)
router.include_router(reports.router)
router.include_router(alerts.router)
