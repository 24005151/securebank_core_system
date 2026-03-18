import random

from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from app import models, schemas

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_audit_log(db: Session, event_type: str, actor: str, details: str):
    log = models.AuditLog(
        event_type=event_type,
        actor=actor,
        details=details
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def seed_default_staff_user(db: Session):
    existing_admin = db.query(models.StaffUser).filter(
        models.StaffUser.username == "admin"
    ).first()

    if not existing_admin:
        admin = models.StaffUser(
            username="admin",
            password=hash_password("admin123"),
            role="manager"
        )
        db.add(admin)
        db.commit()

    existing_staff = db.query(models.StaffUser).filter(
        models.StaffUser.username == "staff1"
    ).first()

    if not existing_staff:
        staff = models.StaffUser(
            username="staff1",
            password=hash_password("staff123"),
            role="staff"
        )
        db.add(staff)
        db.commit()


def authenticate_staff_user(db: Session, username: str, password: str):
    user = db.query(models.StaffUser).filter(
        models.StaffUser.username == username.strip()
    ).first()

    if not user:
        return None

    if not verify_password(password, user.password):
        return None

    return user


def generate_unique_account_number(db: Session) -> str:
    while True:
        account_number = f"SB{random.randint(10000000, 99999999)}"
        existing = get_customer_by_account_number(db, account_number)
        if not existing:
            return account_number


def get_dashboard_summary(db: Session):
    total_customers = db.query(func.count(models.Customer.id)).scalar() or 0
    active_customers = db.query(func.count(models.Customer.id)).filter(
        models.Customer.is_active.is_(True)
    ).scalar() or 0
    inactive_customers = db.query(func.count(models.Customer.id)).filter(
        models.Customer.is_active.is_(False)
    ).scalar() or 0
    total_transactions = db.query(func.count(models.Transaction.id)).scalar() or 0
    total_balance = db.query(func.coalesce(func.sum(models.Customer.balance), 0)).scalar() or 0

    return {
        "total_customers": total_customers,
        "active_customers": active_customers,
        "inactive_customers": inactive_customers,
        "total_transactions": total_transactions,
        "total_balance": total_balance,
    }


def get_all_customers(db: Session, search: str | None = None):
    query = db.query(models.Customer)

    if search:
        value = f"%{search.strip()}%"
        query = query.filter(
            or_(
                models.Customer.full_name.ilike(value),
                models.Customer.email.ilike(value),
                models.Customer.account_number.ilike(value)
            )
        )

    return query.order_by(models.Customer.id.desc()).all()


def get_customer_by_email(db: Session, email: str):
    return db.query(models.Customer).filter(models.Customer.email == email).first()


def get_customer_by_account_number(db: Session, account_number: str):
    return db.query(models.Customer).filter(
        models.Customer.account_number == account_number
    ).first()


def get_customer_by_id(db: Session, customer_id: int):
    return db.query(models.Customer).filter(models.Customer.id == customer_id).first()


def create_customer(db: Session, customer: schemas.CustomerCreate, actor: str):
    db_customer = models.Customer(
        full_name=customer.full_name.strip(),
        email=customer.email.strip().lower(),
        account_number=generate_unique_account_number(db),
        balance=customer.balance,
        is_active=True
    )
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)

    create_audit_log(
        db,
        "customer_create",
        actor,
        f"Created customer {db_customer.full_name} ({db_customer.account_number})"
    )
    return db_customer


def update_customer(db: Session, customer_id: int, payload: schemas.CustomerUpdate, actor: str):
    customer = get_customer_by_id(db, customer_id)
    if not customer:
        return None, "Customer not found."

    existing_email = get_customer_by_email(db, payload.email.strip().lower())
    if existing_email and existing_email.id != customer.id:
        return None, "Email already exists."

    old_name = customer.full_name
    old_email = customer.email

    customer.full_name = payload.full_name.strip()
    customer.email = payload.email.strip().lower()

    db.commit()
    db.refresh(customer)

    create_audit_log(
        db,
        "customer_update",
        actor,
        f"Updated customer {customer.account_number}: name '{old_name}' to '{customer.full_name}', email '{old_email}' to '{customer.email}'"
    )
    return customer, None


def deactivate_customer(db: Session, customer_id: int, actor: str):
    customer = get_customer_by_id(db, customer_id)
    if not customer:
        return None, "Customer not found."

    if not customer.is_active:
        return None, "Customer is already inactive."

    customer.is_active = False
    db.commit()
    db.refresh(customer)

    create_audit_log(
        db,
        "customer_deactivate",
        actor,
        f"Deactivated customer {customer.full_name} ({customer.account_number})"
    )
    return customer, None


def delete_customer(db: Session, customer_id: int, actor: str):
    customer = get_customer_by_id(db, customer_id)
    if not customer:
        return False, "Customer not found."

    account_number = customer.account_number
    full_name = customer.full_name

    db.delete(customer)
    db.commit()

    create_audit_log(
        db,
        "customer_delete",
        actor,
        f"Deleted customer {full_name} ({account_number})"
    )
    return True, None


def get_all_transactions(
    db: Session,
    account_number: str | None = None,
    transaction_type: str | None = None
):
    query = db.query(models.Transaction)

    if transaction_type:
        query = query.filter(models.Transaction.transaction_type == transaction_type)

    transactions = query.order_by(models.Transaction.id.desc()).all()

    if account_number:
        customer = get_customer_by_account_number(db, account_number.strip())
        if not customer:
            return []
        transactions = [
            t for t in transactions
            if t.from_customer_id == customer.id or t.to_customer_id == customer.id
        ]

    return transactions


def get_all_audit_logs(db: Session):
    return db.query(models.AuditLog).order_by(models.AuditLog.id.desc()).all()


def deposit_money(db: Session, request: schemas.DepositWithdrawRequest, actor: str):
    customer = get_customer_by_account_number(db, request.account_number.strip())
    if not customer:
        return None, "Customer account not found."

    if not customer.is_active:
        return None, "Customer account is inactive."

    customer.balance += request.amount

    transaction = models.Transaction(
        transaction_type="deposit",
        amount=request.amount,
        description=request.description.strip() or "Deposit",
        to_customer_id=customer.id
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    create_audit_log(
        db,
        "deposit",
        actor,
        f"Deposited £{request.amount} into {customer.account_number}"
    )
    return transaction, None


def withdraw_money(db: Session, request: schemas.DepositWithdrawRequest, actor: str):
    customer = get_customer_by_account_number(db, request.account_number.strip())
    if not customer:
        return None, "Customer account not found."

    if not customer.is_active:
        return None, "Customer account is inactive."

    if customer.balance < request.amount:
        return None, "Insufficient funds."

    customer.balance -= request.amount

    transaction = models.Transaction(
        transaction_type="withdraw",
        amount=request.amount,
        description=request.description.strip() or "Withdrawal",
        from_customer_id=customer.id
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    create_audit_log(
        db,
        "withdraw",
        actor,
        f"Withdrew £{request.amount} from {customer.account_number}"
    )
    return transaction, None


def transfer_money(db: Session, request: schemas.TransferRequest, actor: str):
    from_customer = get_customer_by_account_number(
        db, request.from_account_number.strip()
    )
    to_customer = get_customer_by_account_number(
        db, request.to_account_number.strip()
    )

    if not from_customer:
        return None, "Source account not found."

    if not to_customer:
        return None, "Destination account not found."

    if not from_customer.is_active:
        return None, "Source account is inactive."

    if not to_customer.is_active:
        return None, "Destination account is inactive."

    if from_customer.id == to_customer.id:
        return None, "Cannot transfer to the same account."

    if from_customer.balance < request.amount:
        return None, "Insufficient funds."

    from_customer.balance -= request.amount
    to_customer.balance += request.amount

    transaction = models.Transaction(
        transaction_type="transfer",
        amount=request.amount,
        description=request.description.strip() or "Transfer",
        from_customer_id=from_customer.id,
        to_customer_id=to_customer.id
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    create_audit_log(
        db,
        "transfer",
        actor,
        f"Transferred £{request.amount} from {from_customer.account_number} to {to_customer.account_number}"
    )
    return transaction, None