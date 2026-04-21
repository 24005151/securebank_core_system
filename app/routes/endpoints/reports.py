"""
Reports endpoint (manager+ only).

    GET /api/reports — monthly volumes, top customers, type totals, risk summary.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import crud
from app.database import get_db
from app.security import require_manager_or_api_key

router = APIRouter()

_manager_or_key = [Depends(require_manager_or_api_key)]


@router.get("/api/reports", dependencies=_manager_or_key)
def read_reports(db: Session = Depends(get_db)):
    """Return aggregated reporting data (manager+ only).

    Returns monthly transaction volumes, top customers by volume,
    transaction type totals, and risk summary statistics.
    """
    return crud.get_reports_data(db)
