from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app import crud, schemas
from app.database import get_db

router = APIRouter(tags=["SecureBank"])


def require_login(request: Request):
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="You must be logged in.")
    return user


@router.get("/api/customers", response_model=list[schemas.CustomerResponse])
def read_customers(
    request: Request,
    search: str | None = Query(default=None),
    db: Session = Depends(get_db)
):
    require_login(request)
    return crud.get_all_customers(db, search=search)


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

    existing_account = crud.get_customer_by_account_number(
        db, customer.account_number.strip()
    )
    if existing_account:
        raise HTTPException(status_code=400, detail="Account number already exists.")

    return crud.create_customer(db, customer, actor=user["username"])


@router.patch("/api/customers/{customer_id}/deactivate", response_model=schemas.CustomerResponse)
def deactivate_customer(customer_id: int, request: Request, db: Session = Depends(get_db)):
    user = require_login(request)
    customer, error = crud.deactivate_customer(db, customer_id, actor=user["username"])
    if error:
        raise HTTPException(status_code=400, detail=error)
    return customer


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
    transaction, error = crud.deposit_money(db, payload, actor=user["username"])
    if error:
        raise HTTPException(status_code=400, detail=error)
    return transaction


@router.post("/api/transactions/withdraw", response_model=schemas.TransactionResponse)
def withdraw(request: Request, payload: schemas.DepositWithdrawRequest, db: Session = Depends(get_db)):
    user = require_login(request)
    transaction, error = crud.withdraw_money(db, payload, actor=user["username"])
    if error:
        raise HTTPException(status_code=400, detail=error)
    return transaction


@router.post("/api/transactions/transfer", response_model=schemas.TransactionResponse)
def transfer(request: Request, payload: schemas.TransferRequest, db: Session = Depends(get_db)):
    user = require_login(request)
    transaction, error = crud.transfer_money(db, payload, actor=user["username"])
    if error:
        raise HTTPException(status_code=400, detail=error)
    return transaction


@router.get("/api/audit-logs", response_model=list[schemas.AuditLogResponse])
def read_audit_logs(request: Request, db: Session = Depends(get_db)):
    require_login(request)
    return crud.get_all_audit_logs(db)