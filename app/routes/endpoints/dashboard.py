"""
Health check and dashboard aggregate endpoints.

    GET /api/health              — unauthenticated liveness probe.
    GET /api/dashboard-summary   — aggregate stats (any auth).
    GET /api/chart-data          — chart counts (any auth).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import crud, schemas
from app.database import get_db
from app.security import require_session_or_api_key

router = APIRouter()

_session_or_key = [Depends(require_session_or_api_key)]


@router.get("/api/health")
def health_check():
    """Return application health status.

    Unauthenticated so load balancers and integration tests can
    confirm the service is running before executing authenticated
    test cases.
    """
    from datetime import datetime, timezone
    return {
        "status": "ok",
        "application": "SecureBank Core System",
        "version": "7.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "security_features": [
            "CSRF double-submit token protection",
            "Rate-limited login (10/min per IP)",
            "Account lockout after 3 failed attempts",
            "Role-based access control (staff/manager/superadmin)",
            "Session re-validation on every request",
            "Content-Security-Policy headers",
            "Timing-safe credential comparison",
            "Full audit trail on all mutations",
        ]
    }


@router.get(
    "/api/dashboard-summary",
    response_model=schemas.DashboardSummaryResponse,
    dependencies=_session_or_key,
)
def read_dashboard_summary(db: Session = Depends(get_db)):
    """Return aggregate statistics for the dashboard metric cards."""
    return crud.get_dashboard_summary(db)


@router.get(
    "/api/chart-data",
    response_model=schemas.ChartDataResponse,
    dependencies=_session_or_key,
)
def read_chart_data(db: Session = Depends(get_db)):
    """Return data for the customer-status and transaction-type charts."""
    return crud.get_chart_data(db)
