import csv
import io
import random
import re
from datetime import datetime

from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from app import models, schemas

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

LOW_BALANCE_THRESHOLD = 250
SUSPICIOUS_TRANSACTION_THRESHOLD = 1000
MAX_FAILED_LOGIN_ATTEMPTS = 3


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def validate_password_strength(password: str) -> tuple[bool, str | None]:
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Password must include at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Password must include at least one lowercase letter."
    if not re.search(r"[0-9]", password):
        return False, "Password must include at least one number."
    return True, None


def create_audit_log(
    db: Session,
    event_type: str,
    actor: str,
    details: str,
    result: str = "success",
    ip_address: str | None = None
):
    log = models.AuditLog(
        event_type=event_type,
        actor=actor,
        details=details,
        result=result,
        ip_address=ip_address
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
            password=hash_password("Admin123"),
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
            password=hash_password("Staff123"),
            role="staff"
        )
        db.add(staff)
        db.commit()


def generate_unique_account_number(db: Session) -> str:
    while True:
        account_number = f"SB{random.randint(10000000, 99999999)}"
        existing = get_customer_by_account_number(db, account_number)
        if not existing:
            return account_number


def seed_demo_customers_bulk(db: Session):
    existing_count = db.query(func.count(models.Customer.id)).scalar() or 0
    if existing_count > 0:
        return

    demo_customers = [
        {"full_name": "Alice Johnson", "email": "alice.johnson@example.com", "balance": 2500, "is_active": True},
        {"full_name": "Michael Smith", "email": "michael.smith@example.com", "balance": 1800, "is_active": True},
        {"full_name": "Sarah Williams", "email": "sarah.williams@example.com", "balance": 3200, "is_active": True},
        {"full_name": "Daniel Brown", "email": "daniel.brown@example.com", "balance": 900, "is_active": False},
        {"full_name": "Emma Taylor", "email": "emma.taylor@example.com", "balance": 4100, "is_active": True},
        {"full_name": "James Wilson", "email": "james.wilson@example.com", "balance": 1500, "is_active": True},
        {"full_name": "Olivia Thomas", "email": "olivia.thomas@example.com", "balance": 2750, "is_active": True},
        {"full_name": "Benjamin White", "email": "benjamin.white@example.com", "balance": 600, "is_active": False},
        {"full_name": "Sophia Harris", "email": "sophia.harris@example.com", "balance": 5200, "is_active": True},
        {"full_name": "William Martin", "email": "william.martin@example.com", "balance": 1100, "is_active": True},
    ]

    created_customers = []

    for item in demo_customers:
        customer = models.Customer(
            full_name=item["full_name"],
            email=item["email"],
            account_number=generate_unique_account_number(db),
            balance=item["balance"],
            is_active=item["is_active"]
        )
        db.add(customer)
        db.commit()
        db.refresh(customer)
        created_customers.append(customer)

    if len(created_customers) >= 8:
        demo_transactions = [
            models.Transaction(transaction_type="deposit", amount=500, description="Initial demo deposit", to_customer_id=created_customers[0].id),
            models.Transaction(transaction_type="withdraw", amount=150, description="Demo cash withdrawal", from_customer_id=created_customers[1].id),
            models.Transaction(transaction_type="transfer", amount=200, description="Demo transfer 1", from_customer_id=created_customers[2].id, to_customer_id=created_customers[3].id),
            models.Transaction(transaction_type="deposit", amount=1250, description="Large salary demo", to_customer_id=created_customers[4].id, risk_flag=True),
            models.Transaction(transaction_type="transfer", amount=300, description="Demo transfer 2", from_customer_id=created_customers[5].id, to_customer_id=created_customers[6].id),
            models.Transaction(transaction_type="withdraw", amount=100, description="ATM withdrawal demo", from_customer_id=created_customers[7].id),
        ]

        created_customers[0].balance += 500
        created_customers[1].balance -= 150
        created_customers[2].balance -= 200
        created_customers[3].balance += 200
        created_customers[4].balance += 1250
        created_customers[5].balance -= 300
        created_customers[6].balance += 300
        created_customers[7].balance -= 100

        db.add_all(demo_transactions)
        db.commit()

    create_audit_log(
        db,
        "demo_seed_bulk",
        "system",
        "Seeded bulk demo customers and transactions"
    )


def authenticate_staff_user(db: Session, username: str, password: str):
    user = db.query(models.StaffUser).filter(
        models.StaffUser.username == username.strip()
    ).first()

    if not user:
        return None, "Invalid username or password."

    if user.is_locked:
        return None, "Account locked after repeated failed login attempts."

    if not verify_password(password, user.password):
        user.failed_login_attempts += 1
        user.last_failed_login_at = datetime.utcnow()
        if user.failed_login_attempts >= MAX_FAILED_LOGIN_ATTEMPTS:
            user.is_locked = True
        db.commit()
        if user.is_locked:
            return None, "Account locked after repeated failed login attempts."
        return None, "Invalid username or password."

    user.failed_login_attempts = 0
    user.is_locked = False
    user.last_failed_login_at = None
    db.commit()

    return user, None


def get_dashboard_summary(db: Session):
    total_customers = db.query(func.count(models.Customer.id)).scalar() or 0
    active_customers = db.query(func.count(models.Customer.id)).filter(
        models.Customer.is_active.is_(True)
    ).scalar() or 0
    inactive_customers = db.query(func.count(models.Customer.id)).filter(
        models.Customer.is_active.is_(False)
    ).scalar() or 0
    total_transactions = db.query(func.count(models.Transaction.id)).scalar() or 0
    total_balance = db.query(
        func.coalesce(func.sum(models.Customer.balance), 0)
    ).scalar() or 0
    suspicious_transactions = db.query(func.count(models.Transaction.id)).filter(
        models.Transaction.risk_flag.is_(True)
    ).scalar() or 0
    low_balance_customers = db.query(func.count(models.Customer.id)).filter(
        models.Customer.balance < LOW_BALANCE_THRESHOLD
    ).scalar() or 0

    return {
        "total_customers": total_customers,
        "active_customers": active_customers,
        "inactive_customers": inactive_customers,
        "total_transactions": total_transactions,
        "total_balance": total_balance,
        "suspicious_transactions": suspicious_transactions,
        "low_balance_customers": low_balance_customers,
    }


def get_all_customers(
    db: Session,
    search: str | None = None,
    status: str | None = None,
    sort_by: str | None = None
):
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

    if status == "active":
        query = query.filter(models.Customer.is_active.is_(True))
    elif status == "inactive":
        query = query.filter(models.Customer.is_active.is_(False))

    if sort_by == "balance_desc":
        query = query.order_by(models.Customer.balance.desc())
    elif sort_by == "balance_asc":
        query = query.order_by(models.Customer.balance.asc())
    elif sort_by == "name_asc":
        query = query.order_by(models.Customer.full_name.asc())
    else:
        query = query.order_by(models.Customer.id.desc())

    return query.all()


def get_customer_by_email(db: Session, email: str):
    return db.query(models.Customer).filter(
        models.Customer.email == email
    ).first()


def get_customer_by_account_number(db: Session, account_number: str):
    return db.query(models.Customer).filter(
        models.Customer.account_number == account_number
    ).first()


def get_customer_by_id(db: Session, customer_id: int):
    return db.query(models.Customer).filter(
        models.Customer.id == customer_id
    ).first()


def create_customer(db: Session, customer: schemas.CustomerCreate, actor: str, ip_address: str | None = None):
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
        f"Created customer {db_customer.full_name} ({db_customer.account_number})",
        ip_address=ip_address
    )
    return db_customer


def update_customer(
    db: Session,
    customer_id: int,
    payload: schemas.CustomerUpdate,
    actor: str,
    ip_address: str | None = None
):
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
    customer.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(customer)

    create_audit_log(
        db,
        "customer_update",
        actor,
        f"Updated customer {customer.account_number}: name '{old_name}' to '{customer.full_name}', email '{old_email}' to '{customer.email}'",
        ip_address=ip_address
    )
    return customer, None


def deactivate_customer(db: Session, customer_id: int, actor: str, ip_address: str | None = None):
    customer = get_customer_by_id(db, customer_id)
    if not customer:
        return None, "Customer not found."

    if not customer.is_active:
        return None, "Customer is already inactive."

    customer.is_active = False
    customer.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(customer)

    create_audit_log(
        db,
        "customer_deactivate",
        actor,
        f"Deactivated customer {customer.full_name} ({customer.account_number})",
        ip_address=ip_address
    )
    return customer, None


def reactivate_customer(db: Session, customer_id: int, actor: str, ip_address: str | None = None):
    customer = get_customer_by_id(db, customer_id)
    if not customer:
        return None, "Customer not found."

    if customer.is_active:
        return None, "Customer is already active."

    customer.is_active = True
    customer.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(customer)

    create_audit_log(
        db,
        "customer_reactivate",
        actor,
        f"Reactivated customer {customer.full_name} ({customer.account_number})",
        ip_address=ip_address
    )
    return customer, None


def delete_customer(db: Session, customer_id: int, actor: str, ip_address: str | None = None):
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
        f"Deleted customer {full_name} ({account_number})",
        ip_address=ip_address
    )
    return True, None


def get_all_transactions(
    db: Session,
    account_number: str | None = None,
    transaction_type: str | None = None
):
    query = db.query(models.Transaction)

    if transaction_type:
        query = query.filter(
            models.Transaction.transaction_type == transaction_type
        )

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
    return db.query(models.AuditLog).order_by(
        models.AuditLog.id.desc()
    ).all()


def get_customer_timeline(db: Session, customer_id: int):
    customer = get_customer_by_id(db, customer_id)
    if not customer:
        return []

    items = [
        {
            "event_type": "customer_created",
            "description": f"Customer record created for {customer.full_name}",
            "created_at": customer.created_at
        }
    ]

    for transaction in get_all_transactions(db, account_number=customer.account_number):
        items.append(
            {
                "event_type": transaction.transaction_type,
                "description": f"{transaction.transaction_type.title()} of £{transaction.amount} ({transaction.description or 'No description'})",
                "created_at": transaction.created_at
            }
        )

    items.sort(key=lambda x: x["created_at"], reverse=True)
    return items


def deposit_money(
    db: Session,
    request: schemas.DepositWithdrawRequest,
    actor: str,
    ip_address: str | None = None
):
    customer = get_customer_by_account_number(db, request.account_number.strip())
    if not customer:
        return None, "Customer account not found."

    if not customer.is_active:
        return None, "Customer account is inactive."

    customer.balance += request.amount
    customer.updated_at = datetime.utcnow()

    risk_flag = request.amount >= SUSPICIOUS_TRANSACTION_THRESHOLD

    transaction = models.Transaction(
        transaction_type="deposit",
        amount=request.amount,
        description=request.description.strip() or "Deposit",
        to_customer_id=customer.id,
        risk_flag=risk_flag
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    details = f"Deposited £{request.amount} into {customer.account_number}"
    if risk_flag:
        details += " [flagged as large transaction]"

    create_audit_log(
        db,
        "deposit",
        actor,
        details,
        ip_address=ip_address
    )
    return transaction, None


def withdraw_money(
    db: Session,
    request: schemas.DepositWithdrawRequest,
    actor: str,
    ip_address: str | None = None
):
    customer = get_customer_by_account_number(db, request.account_number.strip())
    if not customer:
        return None, "Customer account not found."

    if not customer.is_active:
        return None, "Customer account is inactive."

    if customer.balance < request.amount:
        return None, "Insufficient funds."

    customer.balance -= request.amount
    customer.updated_at = datetime.utcnow()

    risk_flag = request.amount >= SUSPICIOUS_TRANSACTION_THRESHOLD

    transaction = models.Transaction(
        transaction_type="withdraw",
        amount=request.amount,
        description=request.description.strip() or "Withdrawal",
        from_customer_id=customer.id,
        risk_flag=risk_flag
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    details = f"Withdrew £{request.amount} from {customer.account_number}"
    if risk_flag:
        details += " [flagged as large transaction]"

    create_audit_log(
        db,
        "withdraw",
        actor,
        details,
        ip_address=ip_address
    )
    return transaction, None


def transfer_money(
    db: Session,
    request: schemas.TransferRequest,
    actor: str,
    ip_address: str | None = None
):
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
    from_customer.updated_at = datetime.utcnow()
    to_customer.updated_at = datetime.utcnow()

    risk_flag = request.amount >= SUSPICIOUS_TRANSACTION_THRESHOLD

    transaction = models.Transaction(
        transaction_type="transfer",
        amount=request.amount,
        description=request.description.strip() or "Transfer",
        from_customer_id=from_customer.id,
        to_customer_id=to_customer.id,
        risk_flag=risk_flag
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    details = f"Transferred £{request.amount} from {from_customer.account_number} to {to_customer.account_number}"
    if risk_flag:
        details += " [flagged as large transaction]"

    create_audit_log(
        db,
        "transfer",
        actor,
        details,
        ip_address=ip_address
    )
    return transaction, None


def export_customers_csv(db: Session) -> str:
    customers = get_all_customers(db)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "full_name", "email", "account_number", "balance", "is_active", "created_at", "updated_at"])
    for customer in customers:
        writer.writerow([
            customer.id,
            customer.full_name,
            customer.email,
            customer.account_number,
            customer.balance,
            customer.is_active,
            customer.created_at,
            customer.updated_at
        ])
    return output.getvalue()


def export_transactions_csv(db: Session) -> str:
    transactions = get_all_transactions(db)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "transaction_type", "amount", "description", "risk_flag", "from_customer_id", "to_customer_id", "created_at"])
    for transaction in transactions:
        writer.writerow([
            transaction.id,
            transaction.transaction_type,
            transaction.amount,
            transaction.description,
            transaction.risk_flag,
            transaction.from_customer_id,
            transaction.to_customer_id,
            transaction.created_at
        ])
    return output.getvalue()