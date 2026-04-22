"""
Customer CRUD endpoints.

    GET    /api/customers                        — paginated list.
    GET    /api/customers/{id}                   — single record.
    GET    /api/customers/{id}/timeline          — activity timeline.
    POST   /api/customers                        — create (any auth + CSRF).
    PUT    /api/customers/{id}                   — update (manager + CSRF).
    PATCH  /api/customers/{id}/deactivate        — (manager + CSRF).
    PATCH  /api/customers/{id}/reactivate        — (manager + CSRF).
    DELETE /api/customers/{id}                   — (manager + CSRF).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app import crud, schemas
from app.database import get_db
from app.security import (
    require_csrf_token,
    require_manager_or_api_key,
    require_session_or_api_key,
)
from app.utils import get_client_ip

router = APIRouter()

_session_or_key = [Depends(require_session_or_api_key)]


@router.get(
    "/api/customers",
    response_model=list[schemas.CustomerResponse],
    dependencies=_session_or_key,
)
def read_customers(
    search: str | None = Query(default=None, max_length=100),
    status: str | None = Query(default=None),
    sort_by: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
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
        offset=offset,
    )


@router.get(
    "/api/customers/{customer_id}",
    response_model=schemas.CustomerResponse,
    dependencies=_session_or_key,
)
def read_customer_by_id(
    customer_id: int, db: Session = Depends(get_db)
):
    """Return a single customer by primary key."""
    customer = crud.get_customer_by_id(db, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    return customer


@router.get(
    "/api/customers/{customer_id}/timeline",
    response_model=list[schemas.CustomerTimelineItem],
    dependencies=_session_or_key,
)
def read_customer_timeline(
    customer_id: int, db: Session = Depends(get_db)
):
    """Return the activity timeline for a single customer."""
    customer = crud.get_customer_by_id(db, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    return crud.get_customer_timeline(db, customer_id)


@router.post(
    "/api/customers",
    response_model=schemas.CustomerResponse,
    dependencies=[Depends(require_csrf_token)],
)
def create_new_customer(
    request: Request,
    customer: schemas.CustomerCreate,
    db: Session = Depends(get_db),
    auth=Depends(require_session_or_api_key),
):
    """Create a new customer record.

    Checks for a duplicate email before inserting so the error
    is clear rather than a generic database integrity violation.
    """
    existing = crud.get_customer_by_email(db, customer.email.strip().lower())
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists.")
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    return crud.create_customer(
        db, customer, actor=actor, ip_address=get_client_ip(request)
    )


@router.put(
    "/api/customers/{customer_id}",
    response_model=schemas.CustomerResponse,
    dependencies=[Depends(require_csrf_token)],
)
def update_customer(
    customer_id: int,
    request: Request,
    payload: schemas.CustomerUpdate,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key),
):
    """Update a customer's name, email, and notes (manager+ only)."""
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
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
    dependencies=[Depends(require_csrf_token)],
)
def deactivate_customer(
    customer_id: int,
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key),
):
    """Deactivate a customer account (manager+ only)."""
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    customer, error = crud.deactivate_customer(
        db, customer_id, actor=actor, ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return customer


@router.patch(
    "/api/customers/{customer_id}/reactivate",
    response_model=schemas.CustomerResponse,
    dependencies=[Depends(require_csrf_token)],
)
def reactivate_customer(
    customer_id: int,
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key),
):
    """Reactivate a previously deactivated customer (manager+ only)."""
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    customer, error = crud.reactivate_customer(
        db, customer_id, actor=actor, ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return customer


@router.delete(
    "/api/customers/{customer_id}",
    dependencies=[Depends(require_csrf_token)],
)
def delete_customer(
    customer_id: int,
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key),
):
    """Permanently delete a customer record (manager+ only)."""
    actor = auth["user"]["username"] if auth["user"] else "api_key_client"
    success, error = crud.delete_customer(
        db, customer_id, actor=actor, ip_address=get_client_ip(request)
    )
    if not success:
        raise HTTPException(status_code=404, detail=error)
    return {"message": "Customer deleted successfully."}
