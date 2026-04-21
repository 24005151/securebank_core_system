"""
Transaction endpoints.

    GET  /api/transactions              — paginated list with filters.
    POST /api/transactions/deposit      — credit funds (any auth + CSRF).
    POST /api/transactions/withdraw     — debit funds (any auth + CSRF).
    POST /api/transactions/transfer     — between accounts (any auth + CSRF).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app import crud, schemas
from app.database import get_db
from app.security import require_csrf_token, require_session_or_api_key
from app.utils import get_client_ip

router = APIRouter()

_session_or_key = [Depends(require_session_or_api_key)]


@router.get(
    "/api/transactions",
    response_model=list[schemas.TransactionResponse],
    dependencies=_session_or_key,
)
def read_transactions(
    account_number: str | None = Query(default=None),
    transaction_type: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    amount_min: int | None = Query(default=None, ge=0),
    amount_max: int | None = Query(default=None, ge=0),
    risk_flag: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Return a paginated, filtered list of transactions."""
    return crud.get_all_transactions(
        db,
        account_number=account_number,
        transaction_type=transaction_type,
        date_from=date_from,
        date_to=date_to,
        amount_min=amount_min,
        amount_max=amount_max,
        risk_flag=risk_flag,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/api/transactions/deposit",
    response_model=schemas.TransactionResponse,
    dependencies=[Depends(require_csrf_token)],
)
def deposit(
    request: Request,
    payload: schemas.DepositWithdrawRequest,
    db: Session = Depends(get_db),
    auth=Depends(require_session_or_api_key),
):
    """Credit funds to a customer account."""
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    transaction, error = crud.deposit_money(
        db, payload, actor=actor, ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return transaction


@router.post(
    "/api/transactions/withdraw",
    response_model=schemas.TransactionResponse,
    dependencies=[Depends(require_csrf_token)],
)
def withdraw(
    request: Request,
    payload: schemas.DepositWithdrawRequest,
    db: Session = Depends(get_db),
    auth=Depends(require_session_or_api_key),
):
    """Debit funds from a customer account."""
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    transaction, error = crud.withdraw_money(
        db, payload, actor=actor, ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return transaction


@router.post(
    "/api/transactions/transfer",
    response_model=schemas.TransactionResponse,
    dependencies=[Depends(require_csrf_token)],
)
def transfer(
    request: Request,
    payload: schemas.TransferRequest,
    db: Session = Depends(get_db),
    auth=Depends(require_session_or_api_key),
):
    """Transfer funds between two customer accounts."""
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    transaction, error = crud.transfer_money(
        db, payload, actor=actor, ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return transaction
