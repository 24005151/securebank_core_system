from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app import crud, schemas
from app.database import get_db

router = APIRouter(tags=["SecureBank"])


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def require_login(request: Request):
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="You must be logged in.")
    return user


def require_manager(request: Request):
    user = require_login(request)
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Manager access required.")
    return user


@router.get("/api/dashboard-summary", response_model=schemas.DashboardSummaryResponse)
def read_dashboard_summary(request: Request, db: Session = Depends(get_db)):
    require_login(request)
    return crud.get_dashboard_summary(db)


@router.get("/api/chart-data", response_model=schemas.ChartDataResponse)
def read_chart_data(request: Request, db: Session = Depends(get_db)):
    require_login(request)
    return crud.get_chart_data(db)


@router.get("/api/customers", response_model=list[schemas.CustomerResponse])
def read_customers(
    request: Request,
    search: str | None = Query(default=None),
    status: str | None = Query(default=None),
    sort_by: str | None = Query(default=None),
    db: Session = Depends(get_db)
):
    require_login(request)
    return crud.get_all_customers(db, search=search, status=status, sort_by=sort_by)


@router.get("/api/customers/{customer_id}", response_model=schemas.CustomerResponse)
def read_customer_by_id(customer_id: int, request: Request, db: Session = Depends(get_db)):
    require_login(request)
    customer = crud.get_customer_by_id(db, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    return customer


@router.get("/api/customers/{customer_id}/timeline", response_model=list[schemas.CustomerTimelineItem])
def read_customer_timeline(customer_id: int, request: Request, db: Session = Depends(get_db)):
    require_login(request)
    customer = crud.get_customer_by_id(db, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    return crud.get_customer_timeline(db, customer_id)


@router.post("/api/customers", response_model=schemas.CustomerResponse)
def create_new_customer(
    request: Request,
    customer: schemas.CustomerCreate,
    db: Session = Depends(get_db)
):
    user = require_login(request)
    existing_email = crud.get_customer_by_email(db, customer.email.strip().lower())
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already exists.")
    return crud.create_customer(
        db,
        customer,
        actor=user["username"],
        ip_address=get_client_ip(request)
    )


@router.put("/api/customers/{customer_id}", response_model=schemas.CustomerResponse)
def update_customer(
    customer_id: int,
    request: Request,
    payload: schemas.CustomerUpdate,
    db: Session = Depends(get_db)
):
    user = require_manager(request)
    customer, error = crud.update_customer(
        db,
        customer_id,
        payload,
        actor=user["username"],
        ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return customer


@router.patch("/api/customers/{customer_id}/deactivate", response_model=schemas.CustomerResponse)
def deactivate_customer(customer_id: int, request: Request, db: Session = Depends(get_db)):
    user = require_manager(request)
    customer, error = crud.deactivate_customer(
        db,
        customer_id,
        actor=user["username"],
        ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return customer


@router.patch("/api/customers/{customer_id}/reactivate", response_model=schemas.CustomerResponse)
def reactivate_customer(customer_id: int, request: Request, db: Session = Depends(get_db)):
    user = require_manager(request)
    customer, error = crud.reactivate_customer(
        db,
        customer_id,
        actor=user["username"],
        ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return customer


@router.delete("/api/customers/{customer_id}")
def delete_customer(customer_id: int, request: Request, db: Session = Depends(get_db)):
    user = require_manager(request)
    success, error = crud.delete_customer(
        db,
        customer_id,
        actor=user["username"],
        ip_address=get_client_ip(request)
    )
    if not success:
        raise HTTPException(status_code=404, detail=error)
    return {"message": "Customer deleted successfully."}


@router.get("/api/transactions", response_model=list[schemas.TransactionResponse])
def read_transactions(
    request: Request,
    account_number: str | None = Query(default=None),
    transaction_type: str | None = Query(default=None),
    db: Session = Depends(get_db)
):
    require_login(request)
    return crud.get_all_transactions(
        db,
        account_number=account_number,
        transaction_type=transaction_type
    )


@router.post("/api/transactions/deposit", response_model=schemas.TransactionResponse)
def deposit(request: Request, payload: schemas.DepositWithdrawRequest, db: Session = Depends(get_db)):
    user = require_login(request)
    transaction, error = crud.deposit_money(
        db,
        payload,
        actor=user["username"],
        ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return transaction


@router.post("/api/transactions/withdraw", response_model=schemas.TransactionResponse)
def withdraw(request: Request, payload: schemas.DepositWithdrawRequest, db: Session = Depends(get_db)):
    user = require_login(request)
    transaction, error = crud.withdraw_money(
        db,
        payload,
        actor=user["username"],
        ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return transaction


@router.post("/api/transactions/transfer", response_model=schemas.TransactionResponse)
def transfer(request: Request, payload: schemas.TransferRequest, db: Session = Depends(get_db)):
    user = require_login(request)
    transaction, error = crud.transfer_money(
        db,
        payload,
        actor=user["username"],
        ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return transaction


@router.get("/api/audit-logs", response_model=list[schemas.AuditLogResponse])
def read_audit_logs(
    request: Request,
    actor: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    result: str | None = Query(default=None),
    db: Session = Depends(get_db)
):
    require_manager(request)
    return crud.get_all_audit_logs(db, actor=actor, event_type=event_type, result=result)


@router.get("/api/staff-users", response_model=list[schemas.StaffUserResponse])
def read_staff_users(request: Request, db: Session = Depends(get_db)):
    require_manager(request)
    return crud.get_all_staff_users(db)


@router.patch("/api/staff-users/{user_id}/unlock", response_model=schemas.StaffUserResponse)
def unlock_staff_user(user_id: int, request: Request, db: Session = Depends(get_db)):
    manager = require_manager(request)
    user, error = crud.unlock_staff_user(
        db,
        user_id,
        actor=manager["username"],
        ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=404, detail=error)
    return user


@router.get("/api/export/customers")
def export_customers(request: Request, db: Session = Depends(get_db)):
    require_manager(request)
    csv_text = crud.export_customers_csv(db)
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="customers.csv"'}
    )


@router.get("/api/export/transactions")
def export_transactions(request: Request, db: Session = Depends(get_db)):
    require_manager(request)
    csv_text = crud.export_transactions_csv(db)
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="transactions.csv"'}
    )