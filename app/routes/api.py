from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import crud, schemas
from app.database import get_db

router = APIRouter(prefix="/api/customers", tags=["Customers"])


@router.get("/", response_model=list[schemas.CustomerResponse])
def read_customers(db: Session = Depends(get_db)):
    return crud.get_all_customers(db)


@router.post("/", response_model=schemas.CustomerResponse)
def create_new_customer(
    customer: schemas.CustomerCreate,
    db: Session = Depends(get_db)
):
    existing_email = crud.get_customer_by_email(db, customer.email.strip().lower())
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already exists.")

    existing_account = crud.get_customer_by_account_number(
        db, customer.account_number.strip()
    )
    if existing_account:
        raise HTTPException(status_code=400, detail="Account number already exists.")

    return crud.create_customer(db, customer)