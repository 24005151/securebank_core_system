"""
Audit log endpoints.

    GET    /api/audit-logs   — paginated list with filters (manager+).
    DELETE /api/audit-logs   — purge entries older than N days (manager+).
"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app import crud, schemas
from app.database import get_db
from app.security import require_csrf_token, require_manager_or_api_key
from app.utils import get_client_ip

router = APIRouter()

_manager_or_key = [Depends(require_manager_or_api_key)]


@router.get(
    "/api/audit-logs",
    response_model=list[schemas.AuditLogResponse],
    dependencies=_manager_or_key,
)
def read_audit_logs(
    actor: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    result: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Return a filtered, paginated list of audit log entries.

    Restricted to manager and superadmin accounts only.
    ``date_from`` and ``date_to`` accept ISO date strings (YYYY-MM-DD).
    ``date_to`` is treated as end-of-day so all events on that date
    are included.
    """
    return crud.get_all_audit_logs(
        db,
        actor=actor,
        event_type=event_type,
        result=result,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@router.delete(
    "/api/audit-logs",
    dependencies=[Depends(require_csrf_token)],
)
def purge_audit_logs(
    request: Request,
    days: int = Query(default=90, ge=1, le=3650),
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key),
):
    """Delete audit log entries older than ``days`` days (manager+ only).

    The ``days`` parameter defaults to 90 and is capped at 3,650 (10 years).
    A new audit entry is written after the purge recording the deleted count.
    """
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    deleted = crud.purge_audit_logs(
        db, days=days, actor=actor, ip_address=get_client_ip(request)
    )
    return {
        "message": (
            f"Deleted {deleted} audit log entries older than {days} days."
        )
    }
