from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app import crud, schemas
from app.database import get_db
from app.models import StaffUser
from app.security import require_csrf_token, require_manager_or_api_key, require_session_or_api_key
from app.utils import get_client_ip

router = APIRouter(tags=["SecureBank"])

# Shorthand dependency combos used on mutating endpoints
_session_or_key = [Depends(require_session_or_api_key)]
_manager_or_key = [Depends(require_manager_or_api_key)]


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@router.get("/api/dashboard-summary", response_model=schemas.DashboardSummaryResponse,
            dependencies=_session_or_key)
def read_dashboard_summary(db: Session = Depends(get_db)):
    return crud.get_dashboard_summary(db)


@router.get("/api/chart-data", response_model=schemas.ChartDataResponse,
            dependencies=_session_or_key)
def read_chart_data(db: Session = Depends(get_db)):
    return crud.get_chart_data(db)


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------

@router.get("/api/customers", response_model=list[schemas.CustomerResponse],
            dependencies=_session_or_key)
def read_customers(
    search: str | None = Query(default=None, max_length=100),
    status: str | None = Query(default=None),
    sort_by: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    return crud.get_all_customers(db, search=search, status=status, sort_by=sort_by, limit=limit, offset=offset)


@router.get("/api/customers/{customer_id}", response_model=schemas.CustomerResponse,
            dependencies=_session_or_key)
def read_customer_by_id(customer_id: int, db: Session = Depends(get_db)):
    customer = crud.get_customer_by_id(db, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    return customer


@router.get("/api/customers/{customer_id}/timeline", response_model=list[schemas.CustomerTimelineItem],
            dependencies=_session_or_key)
def read_customer_timeline(customer_id: int, db: Session = Depends(get_db)):
    customer = crud.get_customer_by_id(db, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    return crud.get_customer_timeline(db, customer_id)


@router.post("/api/customers", response_model=schemas.CustomerResponse,
             dependencies=[Depends(require_csrf_token)])
def create_new_customer(
    request: Request,
    customer: schemas.CustomerCreate,
    db: Session = Depends(get_db),
    auth=Depends(require_session_or_api_key)
):
    existing_email = crud.get_customer_by_email(db, customer.email.strip().lower())
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already exists.")
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    return crud.create_customer(db, customer, actor=actor, ip_address=get_client_ip(request))


@router.put("/api/customers/{customer_id}", response_model=schemas.CustomerResponse,
            dependencies=[Depends(require_csrf_token)])
def update_customer(
    customer_id: int,
    request: Request,
    payload: schemas.CustomerUpdate,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    customer, error = crud.update_customer(db, customer_id, payload, actor=actor, ip_address=get_client_ip(request))
    if error:
        raise HTTPException(status_code=400, detail=error)
    return customer


@router.patch("/api/customers/{customer_id}/deactivate", response_model=schemas.CustomerResponse,
              dependencies=[Depends(require_csrf_token)])
def deactivate_customer(
    customer_id: int,
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    customer, error = crud.deactivate_customer(db, customer_id, actor=actor, ip_address=get_client_ip(request))
    if error:
        raise HTTPException(status_code=400, detail=error)
    return customer


@router.patch("/api/customers/{customer_id}/reactivate", response_model=schemas.CustomerResponse,
              dependencies=[Depends(require_csrf_token)])
def reactivate_customer(
    customer_id: int,
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    customer, error = crud.reactivate_customer(db, customer_id, actor=actor, ip_address=get_client_ip(request))
    if error:
        raise HTTPException(status_code=400, detail=error)
    return customer


@router.delete("/api/customers/{customer_id}",
               dependencies=[Depends(require_csrf_token)])
def delete_customer(
    customer_id: int,
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    success, error = crud.delete_customer(db, customer_id, actor=actor, ip_address=get_client_ip(request))
    if not success:
        raise HTTPException(status_code=404, detail=error)
    return {"message": "Customer deleted successfully."}


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

@router.get("/api/transactions", response_model=list[schemas.TransactionResponse],
            dependencies=_session_or_key)
def read_transactions(
    account_number: str | None = Query(default=None),
    transaction_type: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    return crud.get_all_transactions(db, account_number=account_number, transaction_type=transaction_type, limit=limit, offset=offset)


@router.post("/api/transactions/deposit", response_model=schemas.TransactionResponse,
             dependencies=[Depends(require_csrf_token)])
def deposit(
    request: Request,
    payload: schemas.DepositWithdrawRequest,
    db: Session = Depends(get_db),
    auth=Depends(require_session_or_api_key)
):
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    transaction, error = crud.deposit_money(db, payload, actor=actor, ip_address=get_client_ip(request))
    if error:
        raise HTTPException(status_code=400, detail=error)
    return transaction


@router.post("/api/transactions/withdraw", response_model=schemas.TransactionResponse,
             dependencies=[Depends(require_csrf_token)])
def withdraw(
    request: Request,
    payload: schemas.DepositWithdrawRequest,
    db: Session = Depends(get_db),
    auth=Depends(require_session_or_api_key)
):
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    transaction, error = crud.withdraw_money(db, payload, actor=actor, ip_address=get_client_ip(request))
    if error:
        raise HTTPException(status_code=400, detail=error)
    return transaction


@router.post("/api/transactions/transfer", response_model=schemas.TransactionResponse,
             dependencies=[Depends(require_csrf_token)])
def transfer(
    request: Request,
    payload: schemas.TransferRequest,
    db: Session = Depends(get_db),
    auth=Depends(require_session_or_api_key)
):
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    transaction, error = crud.transfer_money(db, payload, actor=actor, ip_address=get_client_ip(request))
    if error:
        raise HTTPException(status_code=400, detail=error)
    return transaction


# ---------------------------------------------------------------------------
# Audit logs
# ---------------------------------------------------------------------------

@router.get("/api/audit-logs", response_model=list[schemas.AuditLogResponse],
            dependencies=_manager_or_key)
def read_audit_logs(
    actor: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    result: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    return crud.get_all_audit_logs(db, actor=actor, event_type=event_type, result=result, limit=limit, offset=offset)


# ---------------------------------------------------------------------------
# Staff users
# ---------------------------------------------------------------------------

@router.get("/api/staff-users", response_model=list[schemas.StaffUserResponse],
            dependencies=_manager_or_key)
def read_staff_users(db: Session = Depends(get_db)):
    return crud.get_all_staff_users(db)


@router.post("/api/staff-users", response_model=schemas.StaffUserResponse,
             dependencies=[Depends(require_csrf_token)])
def create_staff_user(
    request: Request,
    payload: schemas.StaffUserCreate,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    session_user = auth.get("user")
    actor = session_user["username"] if session_user else "api_key_client"
    actor_role = session_user.get("role", "staff") if session_user else "superadmin"
    # Only superadmin (or API key) may create superadmin accounts
    if payload.role == "superadmin" and actor_role != "superadmin":
        raise HTTPException(status_code=403, detail="Only a superadmin can create superadmin accounts.")
    user, error = crud.create_staff_user(db, payload, actor=actor, ip_address=get_client_ip(request))
    if error:
        raise HTTPException(status_code=400, detail=error)
    return user


@router.patch("/api/staff-users/{user_id}/unlock", response_model=schemas.StaffUserResponse,
              dependencies=[Depends(require_csrf_token)])
def unlock_staff_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    session_user = auth.get("user")
    actor = session_user["username"] if session_user else "api_key_client"
    # API key is treated as superadmin-equivalent for unlock operations
    actor_role = session_user.get("role", "staff") if session_user else "superadmin"
    user, error = crud.unlock_staff_user(
        db, user_id, actor=actor, actor_role=actor_role, ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=403, detail=error)
    return user


@router.post("/api/staff-users/{user_id}/change-password",
             dependencies=[Depends(require_csrf_token)])
def change_staff_password(
    user_id: int,
    request: Request,
    payload: schemas.PasswordChangeRequest,
    db: Session = Depends(get_db),
    auth=Depends(require_session_or_api_key)
):
    session_user = auth.get("user")
    is_api_key = auth.get("auth_type") == "api_key"

    if is_api_key:
        # API key is a shared credential — restrict to manager-equivalent operations only.
        # A key holder can change any password, but must know the current password (enforced in crud).
        pass
    else:
        # Session auth: non-managers can only change their own password.
        is_manager = session_user.get("role") == "manager"
        target = db.query(StaffUser).filter_by(id=user_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="User not found.")
        if not is_manager and session_user.get("id") != user_id:
            raise HTTPException(status_code=403, detail="You can only change your own password.")

    actor = session_user["username"] if session_user else "api_key_client"
    _, error = crud.change_staff_password(db, user_id, payload, actor=actor, ip_address=get_client_ip(request))
    if error:
        raise HTTPException(status_code=400, detail=error)
    return {"message": "Password changed successfully."}


# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------

@router.get("/api/export/customers")
def export_customers(
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    csv_text = crud.export_customers_csv(db, actor=actor, ip_address=get_client_ip(request))
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="customers.csv"'}
    )


@router.get("/api/export/transactions")
def export_transactions(
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    csv_text = crud.export_transactions_csv(db, actor=actor, ip_address=get_client_ip(request))
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="transactions.csv"'}
    )


@router.delete("/api/audit-logs", dependencies=[Depends(require_csrf_token)])
def purge_audit_logs(
    request: Request,
    days: int = Query(default=90, ge=1, le=3650),
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key)
):
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    deleted = crud.purge_audit_logs(db, days=days, actor=actor, ip_address=get_client_ip(request))
    return {"message": f"Deleted {deleted} audit log entries older than {days} days."}
