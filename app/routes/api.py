"""
SecureBank — main data API endpoints.

I group all data-access endpoints in this module:

Dashboard
    GET  /api/dashboard-summary  — aggregate stats (any auth).
    GET  /api/chart-data         — chart counts (any auth).

Customers
    GET    /api/customers             — list with search/filter.
    GET    /api/customers/{id}        — single record.
    GET    /api/customers/{id}/timeline
    POST   /api/customers             — create (any auth + CSRF).
    PUT    /api/customers/{id}        — update (manager + CSRF).
    PATCH  /api/customers/{id}/deactivate
    PATCH  /api/customers/{id}/reactivate
    DELETE /api/customers/{id}

Transactions
    GET  /api/transactions              — list with filters.
    POST /api/transactions/deposit      — (any auth + CSRF).
    POST /api/transactions/withdraw
    POST /api/transactions/transfer

Audit logs
    GET    /api/audit-logs        — list (manager+).
    DELETE /api/audit-logs        — purge old entries (manager+).

Staff users
    GET   /api/staff-users                        — (manager+).
    POST  /api/staff-users                        — create.
    PATCH /api/staff-users/{id}/unlock            — unlock.
    POST  /api/staff-users/{id}/change-password

Exports
    GET /api/export/customers     — CSV download (manager+).
    GET /api/export/transactions  — CSV download (manager+).

All mutating endpoints require a valid CSRF token.
API-key-authenticated requests are exempt from CSRF checks.
"""

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
)
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app import crud, schemas
from app.database import get_db
from app.models import StaffUser
from app.security import (
    require_csrf_token,
    require_manager_or_api_key,
    require_session_or_api_key,
)
from app.utils import get_client_ip

router = APIRouter(tags=["SecureBank"])

# Shorthand dependency lists I reuse across multiple endpoints
# to avoid repeating the same Depends() call every time.
_session_or_key = [Depends(require_session_or_api_key)]
_manager_or_key = [Depends(require_manager_or_api_key)]


# ---------------------------------------------------------------------------
# Health check — unauthenticated, used for integration testing
# ---------------------------------------------------------------------------

@router.get("/api/health")
def health_check():
    """Return application health status.

    I expose this endpoint without authentication so that integration
    tests, load balancers, and monitoring tools can confirm the
    application is running before executing authenticated test cases.
    This also provides a convenient starting point for test evidence
    screenshots showing the API is reachable.
    """
    from datetime import datetime, timezone
    return {
        "status": "ok",
        "application": "SecureBank Core System",
        "version": "5.0",
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


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@router.get(
    "/api/dashboard-summary",
    response_model=schemas.DashboardSummaryResponse,
    dependencies=_session_or_key
)
def read_dashboard_summary(db: Session = Depends(get_db)):
    """Return aggregate statistics for the dashboard metric cards."""
    return crud.get_dashboard_summary(db)


@router.get(
    "/api/chart-data",
    response_model=schemas.ChartDataResponse,
    dependencies=_session_or_key
)
def read_chart_data(db: Session = Depends(get_db)):
    """Return data for the customer-status and transaction-type charts."""
    return crud.get_chart_data(db)


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------

@router.get(
    "/api/customers",
    response_model=list[schemas.CustomerResponse],
    dependencies=_session_or_key
)
def read_customers(
    search: str | None = Query(default=None, max_length=100),
    status: str | None = Query(default=None),
    sort_by: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    """Return a paginated, filtered list of customers.

    The ``search`` parameter matches against full_name, email,
    and account_number (case-insensitive LIKE).
    """
    return crud.get_all_customers(
        db,
        search=search,
        status=status,
        sort_by=sort_by,
        limit=limit,
        offset=offset
    )


@router.get(
    "/api/customers/{customer_id}",
    response_model=schemas.CustomerResponse,
    dependencies=_session_or_key
)
def read_customer_by_id(
    customer_id: int, db: Session = Depends(get_db)
):
    """Return a single customer by primary key."""
    customer = crud.get_customer_by_id(db, customer_id)
    if not customer:
        raise HTTPException(
            status_code=404, detail="Customer not found."
        )
    return customer


@router.get(
    "/api/customers/{customer_id}/timeline",
    response_model=list[schemas.CustomerTimelineItem],
    dependencies=_session_or_key
)
def read_customer_timeline(
    customer_id: int, db: Session = Depends(get_db)
):
    """Return the activity timeline for a single customer."""
    customer = crud.get_customer_by_id(db, customer_id)
    if not customer:
        raise HTTPException(
            status_code=404, detail="Customer not found."
        )
    return crud.get_customer_timeline(db, customer_id)


@router.post(
    "/api/customers",
    response_model=schemas.CustomerResponse,
    dependencies=[Depends(require_csrf_token)]
)
def create_new_customer(
    request: Request,
    customer: schemas.CustomerCreate,
    db: Session = Depends(get_db),
    auth=Depends(require_session_or_api_key)
):
    """Create a new customer record.

    I check for a duplicate email before inserting so the error
    is clear rather than a generic database integrity violation.
    """
    existing_email = crud.get_customer_by_email(
        db, customer.email.strip().lower()
    )
    if existing_email:
        raise HTTPException(
            status_code=400, detail="Email already exists."
        )
    actor = (
        auth["user"]["username"]
        if auth["user"] else "api_key_client"
    )
    return crud.create_customer(
        db, customer, actor=actor,
        ip_address=get_client_ip(request)
    )


@router.put(
    "/api/customers/{customer_id}",
    response_model=schemas.CustomerResponse,
    dependencies=[Depends(require_csrf_token)]
)
def update_customer(
    customer_id: int,
    request: Request,
    payload: schemas.CustomerUpdate,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    """Update a customer's name and email (manager+ only)."""
    actor = (
        auth["user"]["username"]
        if auth["user"] else "api_key_client"
    )
    customer, error = crud.update_customer(
        db, customer_id, payload,
        actor=actor, ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return customer


@router.patch(
    "/api/customers/{customer_id}/deactivate",
    response_model=schemas.CustomerResponse,
    dependencies=[Depends(require_csrf_token)]
)
def deactivate_customer(
    customer_id: int,
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    """Deactivate a customer account (manager+ only)."""
    actor = (
        auth["user"]["username"]
        if auth["user"] else "api_key_client"
    )
    customer, error = crud.deactivate_customer(
        db, customer_id,
        actor=actor, ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return customer


@router.patch(
    "/api/customers/{customer_id}/reactivate",
    response_model=schemas.CustomerResponse,
    dependencies=[Depends(require_csrf_token)]
)
def reactivate_customer(
    customer_id: int,
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    """Reactivate a previously deactivated customer (manager+ only)."""
    actor = (
        auth["user"]["username"]
        if auth["user"] else "api_key_client"
    )
    customer, error = crud.reactivate_customer(
        db, customer_id,
        actor=actor, ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return customer


@router.delete(
    "/api/customers/{customer_id}",
    dependencies=[Depends(require_csrf_token)]
)
def delete_customer(
    customer_id: int,
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    """Permanently delete a customer record (manager+ only)."""
    actor = (
        auth["user"]["username"]
        if auth["user"] else "api_key_client"
    )
    success, error = crud.delete_customer(
        db, customer_id,
        actor=actor, ip_address=get_client_ip(request)
    )
    if not success:
        raise HTTPException(status_code=404, detail=error)
    return {"message": "Customer deleted successfully."}


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

@router.get(
    "/api/transactions",
    response_model=list[schemas.TransactionResponse],
    dependencies=_session_or_key
)
def read_transactions(
    account_number: str | None = Query(default=None),
    transaction_type: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    """Return a paginated, filtered list of transactions.

    Use ``account_number`` to fetch transactions for a specific
    customer (matches either sender or receiver).
    """
    return crud.get_all_transactions(
        db,
        account_number=account_number,
        transaction_type=transaction_type,
        limit=limit,
        offset=offset
    )


@router.post(
    "/api/transactions/deposit",
    response_model=schemas.TransactionResponse,
    dependencies=[Depends(require_csrf_token)]
)
def deposit(
    request: Request,
    payload: schemas.DepositWithdrawRequest,
    db: Session = Depends(get_db),
    auth=Depends(require_session_or_api_key)
):
    """Credit funds to a customer account."""
    actor = (
        auth["user"]["username"]
        if auth["user"] else "api_key_client"
    )
    transaction, error = crud.deposit_money(
        db, payload, actor=actor,
        ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return transaction


@router.post(
    "/api/transactions/withdraw",
    response_model=schemas.TransactionResponse,
    dependencies=[Depends(require_csrf_token)]
)
def withdraw(
    request: Request,
    payload: schemas.DepositWithdrawRequest,
    db: Session = Depends(get_db),
    auth=Depends(require_session_or_api_key)
):
    """Debit funds from a customer account."""
    actor = (
        auth["user"]["username"]
        if auth["user"] else "api_key_client"
    )
    transaction, error = crud.withdraw_money(
        db, payload, actor=actor,
        ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return transaction


@router.post(
    "/api/transactions/transfer",
    response_model=schemas.TransactionResponse,
    dependencies=[Depends(require_csrf_token)]
)
def transfer(
    request: Request,
    payload: schemas.TransferRequest,
    db: Session = Depends(get_db),
    auth=Depends(require_session_or_api_key)
):
    """Transfer funds between two customer accounts."""
    actor = (
        auth["user"]["username"]
        if auth["user"] else "api_key_client"
    )
    transaction, error = crud.transfer_money(
        db, payload, actor=actor,
        ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return transaction


# ---------------------------------------------------------------------------
# Audit logs
# ---------------------------------------------------------------------------

@router.get(
    "/api/audit-logs",
    response_model=list[schemas.AuditLogResponse],
    dependencies=_manager_or_key
)
def read_audit_logs(
    actor: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    result: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    """Return a filtered, paginated list of audit log entries.

    Restricted to manager and superadmin accounts only.
    Staff-role sessions receive a 403 and the UI shows a
    "manager access required" message instead.
    """
    return crud.get_all_audit_logs(
        db,
        actor=actor,
        event_type=event_type,
        result=result,
        limit=limit,
        offset=offset
    )


# ---------------------------------------------------------------------------
# Staff users
# ---------------------------------------------------------------------------

@router.get(
    "/api/staff-users",
    response_model=list[schemas.StaffUserResponse],
    dependencies=_manager_or_key
)
def read_staff_users(db: Session = Depends(get_db)):
    """Return all staff user records (manager+ only)."""
    return crud.get_all_staff_users(db)


@router.post(
    "/api/staff-users",
    response_model=schemas.StaffUserResponse,
    dependencies=[Depends(require_csrf_token)]
)
def create_staff_user(
    request: Request,
    payload: schemas.StaffUserCreate,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    """Create a new staff user account (manager+ only).

    I enforce an additional rule: only superadmin (or API key)
    may create accounts with the superadmin role.  A manager
    trying to create a superadmin account receives a 403.
    """
    session_user = auth.get("user")
    actor = (
        session_user["username"]
        if session_user else "api_key_client"
    )
    # API key callers are treated as superadmin-equivalent.
    actor_role = (
        session_user.get("role", "staff")
        if session_user else "superadmin"
    )

    # Managers cannot self-escalate to superadmin.
    if (payload.role == "superadmin"
            and actor_role != "superadmin"):
        raise HTTPException(
            status_code=403,
            detail="Only a superadmin can create superadmin accounts."
        )

    user, error = crud.create_staff_user(
        db, payload, actor=actor,
        ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return user


@router.patch(
    "/api/staff-users/{user_id}/unlock",
    response_model=schemas.StaffUserResponse,
    dependencies=[Depends(require_csrf_token)]
)
def unlock_staff_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    """Unlock a locked staff account (manager+ only).

    The crud layer enforces that only superadmin (or API key)
    may unlock manager/superadmin accounts.  A 403 is raised
    if the actor lacks the required role.
    """
    session_user = auth.get("user")
    actor = (
        session_user["username"]
        if session_user else "api_key_client"
    )
    # API key is treated as superadmin-equivalent for unlocking.
    actor_role = (
        session_user.get("role", "staff")
        if session_user else "superadmin"
    )
    user, error = crud.unlock_staff_user(
        db, user_id,
        actor=actor, actor_role=actor_role,
        ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=403, detail=error)
    return user


@router.post(
    "/api/staff-users/{user_id}/change-password",
    dependencies=[Depends(require_csrf_token)]
)
def change_staff_password(
    user_id: int,
    request: Request,
    payload: schemas.PasswordChangeRequest,
    db: Session = Depends(get_db),
    auth=Depends(require_session_or_api_key)
):
    """Change a staff user's password.

    Session auth: staff-role users may only change their own
    password.  Managers may change any user's password.

    API key auth: the key holder may change any password but
    must still supply the correct current password, which is
    enforced inside crud.change_staff_password.
    """
    session_user = auth.get("user")
    is_api_key = auth.get("auth_type") == "api_key"

    if not is_api_key:
        # For session users, enforce ownership rules.
        is_manager = session_user.get("role") in (
            "manager", "superadmin"
        )
        target = (
            db.query(StaffUser).filter_by(id=user_id).first()
        )
        if not target:
            raise HTTPException(
                status_code=404, detail="User not found."
            )
        # Non-managers can only change their own password.
        if (not is_manager
                and session_user.get("id") != user_id):
            raise HTTPException(
                status_code=403,
                detail="You can only change your own password."
            )

    actor = (
        session_user["username"]
        if session_user else "api_key_client"
    )
    _, error = crud.change_staff_password(
        db, user_id, payload,
        actor=actor, ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return {"message": "Password changed successfully."}


# ---------------------------------------------------------------------------
# CSV exports
# ---------------------------------------------------------------------------

@router.get("/api/export/customers")
def export_customers(
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    """Export all customer records as a CSV file (manager+ only).

    The export is logged in the audit trail so every download
    is traceable.  The response uses Content-Disposition to
    trigger a file download in the browser.
    """
    actor = (
        auth["user"]["username"]
        if auth["user"] else "api_key_client"
    )
    csv_text = crud.export_customers_csv(
        db, actor=actor, ip_address=get_client_ip(request)
    )
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={
            "Content-Disposition":
                'attachment; filename="customers.csv"'
        }
    )


@router.get("/api/export/transactions")
def export_transactions(
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    """Export all transaction records as a CSV file (manager+ only).

    The export is logged in the audit trail.
    """
    actor = (
        auth["user"]["username"]
        if auth["user"] else "api_key_client"
    )
    csv_text = crud.export_transactions_csv(
        db, actor=actor, ip_address=get_client_ip(request)
    )
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={
            "Content-Disposition":
                'attachment; filename="transactions.csv"'
        }
    )


@router.delete(
    "/api/audit-logs",
    dependencies=[Depends(require_csrf_token)]
)
def purge_audit_logs(
    request: Request,
    days: int = Query(default=90, ge=1, le=3650),
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    """Delete audit log entries older than ``days`` days.

    The ``days`` parameter defaults to 90 and is capped at
    3 650 (10 years).  A new audit entry is written after the
    purge recording the count of deleted rows.
    """
    actor = (
        auth["user"]["username"]
        if auth["user"] else "api_key_client"
    )
    deleted = crud.purge_audit_logs(
        db, days=days,
        actor=actor, ip_address=get_client_ip(request)
    )
    return {
        "message": (
            f"Deleted {deleted} audit log entries "
            f"older than {days} days."
        )
    }
