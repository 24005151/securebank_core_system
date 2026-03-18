from sqlalchemy.orm import Session

from app import models, schemas


def get_all_customers(db: Session):
    return db.query(models.Customer).order_by(models.Customer.id.desc()).all()


def get_customer_by_email(db: Session, email: str):
    return db.query(models.Customer).filter(models.Customer.email == email).first()


def get_customer_by_account_number(db: Session, account_number: str):
    return (
        db.query(models.Customer)
        .filter(models.Customer.account_number == account_number)
        .first()
    )


def create_customer(db: Session, customer: schemas.CustomerCreate):
    db_customer = models.Customer(
        full_name=customer.full_name.strip(),
        email=customer.email.strip().lower(),
        account_number=customer.account_number.strip(),
        balance=customer.balance,
        is_active=True
    )
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer