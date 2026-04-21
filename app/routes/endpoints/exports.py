"""
CSV export endpoints (manager+ only, all downloads logged in audit trail).

    GET /api/export/customers                         — all customers.
    GET /api/export/transactions                      — all transactions.
    GET /api/export/customers/{id}/transactions       — single customer.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app import crud
from app.database import get_db
from app.security import require_manager_or_api_key
from app.utils import get_client_ip

router = APIRouter()


@router.get("/api/export/customers")
def export_customers(
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key),
):
    """Export all customer records as a CSV file (manager+ only).

    Every download is logged in the audit trail so it is traceable.
    """
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    csv_text = crud.export_customers_csv(
        db, actor=actor, ip_address=get_client_ip(request)
    )
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="customers.csv"'},
    )


@router.get("/api/export/transactions")
def export_transactions(
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key),
):
    """Export all transaction records as a CSV file (manager+ only)."""
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    csv_text = crud.export_transactions_csv(
        db, actor=actor, ip_address=get_client_ip(request)
    )
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="transactions.csv"'},
    )


@router.get("/api/export/customers/{customer_id}/transactions")
def export_customer_transactions(
    customer_id: int,
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key),
):
    """Export a single customer's transactions as a CSV file.

    Returns 404 if the customer does not exist.
    """
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    csv_text = crud.export_customer_transactions_csv(
        db, customer_id=customer_id, actor=actor, ip_address=get_client_ip(request)
    )
    if csv_text is None:
        raise HTTPException(status_code=404, detail="Customer not found.")
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={
            "Content-Disposition":
                f'attachment; filename="customer_{customer_id}_transactions.csv"'
        },
    )
