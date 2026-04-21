"""
Alerts endpoint (manager+ only).

    GET /api/alerts — risk-flagged transactions + locked staff accounts.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import crud
from app.database import get_db
from app.security import require_manager_or_api_key

router = APIRouter()

_manager_or_key = [Depends(require_manager_or_api_key)]


@router.get("/api/alerts", dependencies=_manager_or_key)
def read_alerts(db: Session = Depends(get_db)):
    """Return active alerts: risk-flagged transactions and locked accounts.

    Returns the 50 most recent risk-flagged transactions plus all
    currently locked staff accounts.
    """
    risk_txns = crud.get_all_transactions(db, risk_flag=True, limit=50, offset=0)
    locked_staff = [u for u in crud.get_all_staff_users(db) if u.is_locked]
    return {
        "risk_transactions": [
            {
                "id": t.id,
                # Transactions link via customer relationships, not a direct
                # account_number column.  Use whichever customer end is set.
                "account_number": (
                    (t.to_customer or t.from_customer).account_number
                    if (t.to_customer or t.from_customer) else "—"
                ),
                "transaction_type": t.transaction_type,
                "amount": t.amount,
                "timestamp": t.created_at.isoformat() if t.created_at else None,
                "description": t.description,
            }
            for t in risk_txns
        ],
        "locked_staff": [
            {
                "id": u.id,
                "username": u.username,
                "role": u.role,
                "failed_login_attempts": u.failed_login_attempts,
            }
            for u in locked_staff
        ],
    }
