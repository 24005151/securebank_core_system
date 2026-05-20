"""
SecureBank — database operations (CRUD layer).

All direct database interactions go through this module so
route handlers stay thin and easy to test.  Every function
that changes data also writes an audit log entry.

Key constants:
    LOW_BALANCE_THRESHOLD             — pence below which a
        customer is counted as "low balance" on the dashboard.
    SUSPICIOUS_TRANSACTION_THRESHOLD  — pence at or above which
        a transaction is automatically risk-flagged.
    MAX_FAILED_LOGIN_ATTEMPTS         — consecutive failures
        before an account is locked.
    SEARCH_MAX_LENGTH                 — maximum characters
        accepted in a search term to limit query cost.
"""

import csv
import io
import random
import re
from datetime import datetime, timezone

from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from app import models, schemas

# pbkdf2_sha256 is the hashing scheme.  passlib will re-hash
# automatically on verify if a stronger scheme is added
# later (deprecated="auto").
pwd_context = CryptContext(
    schemes=["pbkdf2_sha256"], deprecated="auto"
)

LOW_BALANCE_THRESHOLD = 250
SUSPICIOUS_TRANSACTION_THRESHOLD = 1000
MAX_FAILED_LOGIN_ATTEMPTS = 3
SEARCH_MAX_LENGTH = 100


def _now():
    """Return the current UTC datetime as a timezone-aware value."""
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Return the pbkdf2_sha256 hash of ``password``."""
    return pwd_context.hash(password)


def verify_password(
    plain_password: str, hashed_password: str
) -> bool:
    """Return True if ``plain_password`` matches the stored hash."""
    return pwd_context.verify(plain_password, hashed_password)


def validate_password_strength(
    password: str,
) -> tuple[bool, str | None]:
    """Check that ``password`` meets the strength requirements.

    Requires at least 8 characters, one uppercase letter, one
    lowercase letter, and one digit.

    Returns:
        A (True, None) tuple on success, or (False, message)
        describing the first failing rule.
    """
    if len(password) < 8:
        return False, (
            "Password must be at least 8 characters long."
        )
    if not re.search(r"[A-Z]", password):
        return False, (
            "Password must include at least one uppercase letter."
        )
    if not re.search(r"[a-z]", password):
        return False, (
            "Password must include at least one lowercase letter."
        )
    if not re.search(r"[0-9]", password):
        return False, (
            "Password must include at least one number."
        )
    return True, None


# ---------------------------------------------------------------------------
# Audit logging
# ---------------------------------------------------------------------------

def create_audit_log(
    db: Session,
    event_type: str,
    actor: str,
    details: str,
    result: str = "success",
    ip_address: str | None = None
):
    """Write an immutable audit log entry to the database.

    Called at the end of every mutating operation so there is
    always a full trail of who did what and when.

    Args:
        db:         Active database session.
        event_type: Short machine-readable name, e.g. 'deposit'.
        actor:      Username of the staff member, or 'system'.
        details:    Human-readable description of the event.
        result:     'success' or 'failure'.
        ip_address: Peer IP from the HTTP request, or None.

    Returns:
        The newly created AuditLog ORM object.
    """
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


# ---------------------------------------------------------------------------
# Staff user seeding
# ---------------------------------------------------------------------------

def seed_default_staff_user(db: Session):
    """Create the four demo staff accounts on first startup.

    Only inserts each account when it does not already exist,
    so safe to call on every application boot.

    Demo accounts:
        admin    — manager,    must change password on first login
        staff1   — staff,      must change password on first login
        admin2   — manager,    no forced password change
        sysadmin — superadmin, must change password on first login
    """
    # --- admin (manager) ---
    existing_admin = db.query(models.StaffUser).filter(
        models.StaffUser.username == "admin"
    ).first()
    if not existing_admin:
        admin = models.StaffUser(
            username="admin",
            password=hash_password("Admin123"),
            role="manager",
            must_change_password=True
        )
        db.add(admin)
        db.commit()

    # --- staff1 (staff) ---
    existing_staff = db.query(models.StaffUser).filter(
        models.StaffUser.username == "staff1"
    ).first()
    if not existing_staff:
        staff = models.StaffUser(
            username="staff1",
            password=hash_password("Staff123"),
            role="staff",
            must_change_password=True
        )
        db.add(staff)
        db.commit()

    # --- admin2 (manager, no forced reset) ---
    existing_admin2 = db.query(models.StaffUser).filter(
        models.StaffUser.username == "admin2"
    ).first()
    if not existing_admin2:
        admin2 = models.StaffUser(
            username="admin2",
            password=hash_password("Watford88"),
            role="manager",
            must_change_password=False
        )
        db.add(admin2)
        db.commit()

    # --- sysadmin (superadmin) ---
    existing_sysadmin = db.query(models.StaffUser).filter(
        models.StaffUser.username == "sysadmin"
    ).first()
    if not existing_sysadmin:
        sysadmin = models.StaffUser(
            username="sysadmin",
            password=hash_password("Sysadmin1"),
            role="superadmin",
            must_change_password=True
        )
        db.add(sysadmin)
        db.commit()

    # --- Gbisley (superadmin) ---
    existing_gbisley = db.query(models.StaffUser).filter(
        models.StaffUser.username == "Gbisley"
    ).first()
    if not existing_gbisley:
        gbisley = models.StaffUser(
            username="Gbisley",
            password=hash_password("woLIP2m@ga5r"),
            role="superadmin",
            must_change_password=True
        )
        db.add(gbisley)
        db.commit()


# ---------------------------------------------------------------------------
# Staff user management
# ---------------------------------------------------------------------------

def get_all_staff_users(db: Session):
    """Return all staff users ordered by ID ascending."""
    return (
        db.query(models.StaffUser)
        .order_by(models.StaffUser.id.asc())
        .all()
    )


def get_staff_user_by_id(db: Session, user_id: int):
    """Return the staff user with the given primary key, or None."""
    return (
        db.query(models.StaffUser)
        .filter(models.StaffUser.id == user_id)
        .first()
    )


def unlock_staff_user(
    db: Session,
    user_id: int,
    actor: str,
    actor_role: str = "staff",
    ip_address: str | None = None
):
    """Unlock a staff account that has been locked by failed logins.

    Enforces role hierarchy: manager and superadmin accounts
    can only be unlocked by a superadmin.  Regular staff can
    be unlocked by any manager or superadmin.

    Args:
        db:          Active database session.
        user_id:     ID of the account to unlock.
        actor:       Username of the person performing the unlock.
        actor_role:  Role of the person performing the unlock.
        ip_address:  Peer IP for the audit log.

    Returns:
        (user, None) on success, or (None, error_message).
    """
    user = db.query(models.StaffUser).filter(
        models.StaffUser.id == user_id
    ).first()
    if not user:
        return None, "User not found."

    # Privileged accounts can only be unlocked by a superadmin.
    if (user.role in ("manager", "superadmin")
            and actor_role != "superadmin"):
        return None, (
            "Only a superadmin can unlock "
            "manager or superadmin accounts."
        )

    user.is_locked = False
    user.failed_login_attempts = 0
    user.last_failed_login_at = None
    db.commit()
    db.refresh(user)

    create_audit_log(
        db,
        "staff_unlock",
        actor,
        f"Unlocked staff user {user.username} (role: {user.role})",
        ip_address=ip_address
    )
    return user, None


def create_staff_user(
    db: Session,
    payload: schemas.StaffUserCreate,
    actor: str,
    ip_address: str | None = None
):
    """Create a new staff user account.

    Validates password strength before hashing.  All new
    accounts are created with ``must_change_password=True``
    so the user is prompted to set their own password on first
    login.

    Returns:
        (user, None) on success, or (None, error_message).
    """
    # Check for duplicate usernames before doing any work.
    existing = db.query(models.StaffUser).filter(
        models.StaffUser.username == payload.username.strip()
    ).first()
    if existing:
        return None, "Username already exists."

    valid, msg = validate_password_strength(payload.password)
    if not valid:
        return None, msg

    user = models.StaffUser(
        username=payload.username.strip(),
        password=hash_password(payload.password),
        role=payload.role,
        must_change_password=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    create_audit_log(
        db,
        "staff_create",
        actor,
        (
            f"Created staff user {user.username} "
            f"with role {user.role}"
        ),
        ip_address=ip_address
    )
    return user, None


def change_staff_password(
    db: Session,
    user_id: int,
    payload: schemas.PasswordChangeRequest,
    actor: str,
    ip_address: str | None = None
):
    """Change a staff user's password.

    Verifies the current password, enforces strength rules, and
    requires the new password to differ from the current one.
    On success clears the ``must_change_password`` flag so
    the user is no longer redirected to the change form.

    Returns:
        (user, None) on success, or (None, error_message).
    """
    user = db.query(models.StaffUser).filter(
        models.StaffUser.id == user_id
    ).first()
    if not user:
        return None, "User not found."

    if not verify_password(payload.current_password, user.password):
        return None, "Current password is incorrect."

    valid, msg = validate_password_strength(payload.new_password)
    if not valid:
        return None, msg

    if payload.current_password == payload.new_password:
        return None, "New password must differ from current password."

    user.password = hash_password(payload.new_password)
    # Clear the forced-change flag now the user has set their own
    # password.
    user.must_change_password = False
    db.commit()
    db.refresh(user)

    create_audit_log(
        db,
        "staff_password_change",
        actor,
        f"Password changed for staff user {user.username}",
        ip_address=ip_address
    )
    return user, None


# ---------------------------------------------------------------------------
# Customer helpers
# ---------------------------------------------------------------------------

def generate_unique_account_number(db: Session) -> str:
    """Generate a unique SB-prefixed account number.

    Loops until finding a number that does not already exist in
    the database.  The 8-digit random component gives 90 million
    possible values so collisions are extremely rare in practice.
    """
    while True:
        account_number = f"SB{random.randint(10000000, 99999999)}"
        existing = get_customer_by_account_number(
            db, account_number
        )
        if not existing:
            return account_number


def seed_demo_customers_bulk(db: Session):
    """Populate the database with demo customers and transactions.

    Only runs when the customers table is completely empty.
    Gives a realistic starting dataset for demonstration and
    development without requiring manual data entry.
    Ten customers are created, eight of whom receive demo
    transactions that adjust their balances accordingly.
    """
    existing_count = (
        db.query(func.count(models.Customer.id)).scalar() or 0
    )
    if existing_count > 0:
        # Database already has customer data — skip seeding.
        return

    demo_customers = [
        {
            "full_name": "Alice Johnson",
            "email": "alice.johnson@example.com",
            "balance": 2500,
            "is_active": True,
            "notes": "Prefers email contact. Joint account holder with spouse."
        },
        {
            "full_name": "Michael Smith",
            "email": "michael.smith@example.com",
            "balance": 1800,
            "is_active": True,
            "notes": "Business account. Requires monthly statement by post."
        },
        {
            "full_name": "Sarah Williams",
            "email": "sarah.williams@example.com",
            "balance": 3200,
            "is_active": True
        },
        {
            "full_name": "Daniel Brown",
            "email": "daniel.brown@example.com",
            "balance": 900,
            "is_active": False,
            "notes": "Account suspended pending identity verification."
        },
        {
            "full_name": "Emma Taylor",
            "email": "emma.taylor@example.com",
            "balance": 4100,
            "is_active": True
        },
        {
            "full_name": "James Wilson",
            "email": "james.wilson@example.com",
            "balance": 1500,
            "is_active": True
        },
        {
            "full_name": "Olivia Thomas",
            "email": "olivia.thomas@example.com",
            "balance": 2750,
            "is_active": True
        },
        {
            "full_name": "Benjamin White",
            "email": "benjamin.white@example.com",
            "balance": 600,
            "is_active": False
        },
        {
            "full_name": "Sophia Harris",
            "email": "sophia.harris@example.com",
            "balance": 5200,
            "is_active": True
        },
        {
            "full_name": "William Martin",
            "email": "william.martin@example.com",
            "balance": 1100,
            "is_active": True
        },
    ]

    created_customers = []

    for item in demo_customers:
        customer = models.Customer(
            full_name=item["full_name"],
            email=item["email"],
            account_number=generate_unique_account_number(db),
            balance=item["balance"],
            is_active=item["is_active"],
            notes=item.get("notes")
        )
        db.add(customer)
        db.commit()
        db.refresh(customer)
        created_customers.append(customer)

    # Only add demo transactions if we have enough customers to
    # populate meaningful from/to relationships.
    if len(created_customers) >= 8:
        demo_transactions = [
            models.Transaction(
                transaction_type="deposit",
                amount=500,
                description="Initial demo deposit",
                to_customer_id=created_customers[0].id
            ),
            models.Transaction(
                transaction_type="withdraw",
                amount=150,
                description="Demo cash withdrawal",
                from_customer_id=created_customers[1].id
            ),
            models.Transaction(
                transaction_type="transfer",
                amount=200,
                description="Demo transfer 1",
                from_customer_id=created_customers[2].id,
                to_customer_id=created_customers[3].id
            ),
            # risk_flag=True because amount >= 1 000
            models.Transaction(
                transaction_type="deposit",
                amount=1250,
                description="Large salary demo",
                to_customer_id=created_customers[4].id,
                risk_flag=True
            ),
            models.Transaction(
                transaction_type="transfer",
                amount=300,
                description="Demo transfer 2",
                from_customer_id=created_customers[5].id,
                to_customer_id=created_customers[6].id
            ),
            models.Transaction(
                transaction_type="withdraw",
                amount=100,
                description="ATM withdrawal demo",
                from_customer_id=created_customers[7].id
            ),
        ]

        # Apply balance changes to match the demo transactions.
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


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

def authenticate_staff_user(
    db: Session, username: str, password: str
):
    """Verify login credentials and return the staff user.

    Increments the failed-attempt counter on every wrong
    password and locks the account when the threshold is reached.

    Returns the same generic error for "user not found" and
    "account locked" to prevent username enumeration — an
    attacker cannot confirm whether a username exists from the
    error message alone.

    Returns:
        (user, None) on success, or (None, error_message).
    """
    user = db.query(models.StaffUser).filter(
        models.StaffUser.username == username.strip()
    ).first()

    if not user:
        # User does not exist — return generic message.
        return None, "Invalid username or password."

    if user.is_locked:
        # Return the same message as invalid credentials to
        # avoid revealing that the username is valid but locked.
        return None, "Invalid username or password."

    if not verify_password(password, user.password):
        user.failed_login_attempts += 1
        user.last_failed_login_at = _now()

        if user.failed_login_attempts >= MAX_FAILED_LOGIN_ATTEMPTS:
            # Lock the account after too many failures.
            user.is_locked = True

        db.commit()
        return None, "Invalid username or password."

    # Successful login — reset the failure counters and
    # record when this login occurred so we can surface it in
    # the sidebar ("Last login: ...").
    user.failed_login_attempts = 0
    user.is_locked = False
    user.last_failed_login_at = None
    user.last_login_at = _now()
    db.commit()

    return user, None


# ---------------------------------------------------------------------------
# Dashboard statistics
# ---------------------------------------------------------------------------

def get_dashboard_summary(db: Session):
    """Return aggregate statistics for the dashboard metric cards.

    Runs all seven counts in a single database round-trip
    (separate scalar queries) and returns them as a dict
    that maps to the DashboardSummaryResponse schema.
    """
    total_customers = (
        db.query(func.count(models.Customer.id)).scalar() or 0
    )
    active_customers = (
        db.query(func.count(models.Customer.id))
        .filter(models.Customer.is_active.is_(True))
        .scalar() or 0
    )
    inactive_customers = (
        db.query(func.count(models.Customer.id))
        .filter(models.Customer.is_active.is_(False))
        .scalar() or 0
    )
    total_transactions = (
        db.query(func.count(models.Transaction.id)).scalar() or 0
    )
    # coalesce avoids NULL when no customers exist yet.
    total_balance = (
        db.query(
            func.coalesce(func.sum(models.Customer.balance), 0)
        ).scalar() or 0
    )
    suspicious_transactions = (
        db.query(func.count(models.Transaction.id))
        .filter(models.Transaction.risk_flag.is_(True))
        .scalar() or 0
    )
    low_balance_customers = (
        db.query(func.count(models.Customer.id))
        .filter(
            models.Customer.balance < LOW_BALANCE_THRESHOLD
        )
        .scalar() or 0
    )

    return {
        "total_customers": total_customers,
        "active_customers": active_customers,
        "inactive_customers": inactive_customers,
        "total_transactions": total_transactions,
        "total_balance": total_balance,
        "suspicious_transactions": suspicious_transactions,
        "low_balance_customers": low_balance_customers,
    }


def get_chart_data(db: Session):
    """Return count data for the two dashboard charts.

    Returns a dict with:
        customer_status   — active and inactive customer counts.
        transaction_types — counts for deposit, withdraw, transfer.
    """
    customer_status = {
        "active": (
            db.query(func.count(models.Customer.id))
            .filter(models.Customer.is_active.is_(True))
            .scalar() or 0
        ),
        "inactive": (
            db.query(func.count(models.Customer.id))
            .filter(models.Customer.is_active.is_(False))
            .scalar() or 0
        ),
    }

    transaction_types = {
        "deposit": (
            db.query(func.count(models.Transaction.id))
            .filter(
                models.Transaction.transaction_type == "deposit"
            ).scalar() or 0
        ),
        "withdraw": (
            db.query(func.count(models.Transaction.id))
            .filter(
                models.Transaction.transaction_type == "withdraw"
            ).scalar() or 0
        ),
        "transfer": (
            db.query(func.count(models.Transaction.id))
            .filter(
                models.Transaction.transaction_type == "transfer"
            ).scalar() or 0
        ),
    }

    return {
        "customer_status": customer_status,
        "transaction_types": transaction_types
    }


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

def get_reports_data(db: Session) -> dict:
    """Return aggregated data for the Reports page.

    Returns:
        monthly_volumes  — last 12 months of deposit/withdraw/transfer
                           totals (amount in pence, count of transactions).
        top_customers    — top 5 customers by total transaction volume.
        type_totals      — sum of amounts per transaction type.
        risk_summary     — count and total of risk-flagged transactions.
    """
    # Monthly volumes — group by YYYY-MM using strftime
    monthly_raw = (
        db.query(
            func.strftime(
                "%Y-%m", models.Transaction.created_at
            ).label("month"),
            models.Transaction.transaction_type,
            func.count(models.Transaction.id).label("count"),
            func.sum(models.Transaction.amount).label("total"),
        )
        .group_by("month", models.Transaction.transaction_type)
        .order_by("month")
        .all()
    )
    # Build monthly aggregates: sum across all types per month
    monthly_agg: dict = {}
    for row in monthly_raw:
        m = row.month or "unknown"
        if m not in monthly_agg:
            monthly_agg[m] = {"total": 0, "count": 0}
        monthly_agg[m]["total"] += int(row.total or 0)
        monthly_agg[m]["count"] += int(row.count or 0)
    monthly_volumes = [
        {"month": m, "total": v["total"], "count": v["count"]}
        for m, v in sorted(monthly_agg.items())
    ]

    # Top 5 customers by total transaction volume (sent + received)
    customer_tx_counts: dict = {}
    for c in db.query(models.Customer).all():
        sent = (
            db.query(func.sum(models.Transaction.amount))
            .filter(models.Transaction.from_customer_id == c.id)
            .scalar() or 0
        )
        received = (
            db.query(func.sum(models.Transaction.amount))
            .filter(models.Transaction.to_customer_id == c.id)
            .scalar() or 0
        )
        tx_count = (
            db.query(func.count(models.Transaction.id))
            .filter(
                (models.Transaction.from_customer_id == c.id)
                | (models.Transaction.to_customer_id == c.id)
            )
            .scalar() or 0
        )
        total_volume = int(sent) + int(received)
        if total_volume > 0:
            customer_tx_counts[c.id] = {
                "id": c.id,
                "full_name": c.full_name,
                "account_number": c.account_number,
                "total_volume": total_volume,
                "tx_count": tx_count,
            }
    top_customers = sorted(
        customer_tx_counts.values(),
        key=lambda x: x["total_volume"],
        reverse=True
    )[:5]

    # Total amounts per transaction type — list form for Chart.js
    type_totals = [
        {
            "type": txn_type,
            "count": (
                db.query(func.count(models.Transaction.id))
                .filter(models.Transaction.transaction_type == txn_type)
                .scalar() or 0
            ),
            "total": int(
                db.query(func.sum(models.Transaction.amount))
                .filter(models.Transaction.transaction_type == txn_type)
                .scalar() or 0
            ),
        }
        for txn_type in ("deposit", "withdraw", "transfer")
    ]

    # Risk summary
    total_tx = (
        db.query(func.count(models.Transaction.id)).scalar() or 0
    )
    flagged_count = (
        db.query(func.count(models.Transaction.id))
        .filter(models.Transaction.risk_flag.is_(True))
        .scalar() or 0
    )
    flagged_amount = int(
        db.query(func.sum(models.Transaction.amount))
        .filter(models.Transaction.risk_flag.is_(True))
        .scalar() or 0
    )
    flagged_pct = (
        round(flagged_count / total_tx * 100, 1) if total_tx > 0 else 0.0
    )

    return {
        "monthly_volumes": monthly_volumes,
        "top_customers": top_customers,
        "type_totals": type_totals,
        "risk_summary": {
            "flagged_count": flagged_count,
            "flagged_amount": flagged_amount,
            "flagged_pct": flagged_pct,
            "total_count": total_tx,
        },
    }


# ---------------------------------------------------------------------------
# Customer queries
# ---------------------------------------------------------------------------

def get_all_customers(
    db: Session,
    search: str | None = None,
    status: str | None = None,
    sort_by: str | None = None,
    limit: int = 50,
    offset: int = 0
):
    """Return a paginated, optionally filtered list of customers.

    Args:
        db:      Active database session.
        search:  Optional search term matched against full_name,
                 email, and account_number (case-insensitive).
                 Truncated to SEARCH_MAX_LENGTH characters to
                 prevent excessively expensive LIKE queries.
        status:  'active', 'inactive', or None for all.
        sort_by: 'balance_desc', 'balance_asc', 'name_asc', or
                 None (defaults to newest first by ID).
        limit:   Maximum number of records to return.
        offset:  Number of records to skip for pagination.
    """
    query = db.query(models.Customer)

    if search:
        # Truncate to avoid LIKE queries on very long strings.
        term = search.strip()[:SEARCH_MAX_LENGTH]
        value = f"%{term}%"
        query = query.filter(
            or_(
                models.Customer.full_name.ilike(value),
                models.Customer.email.ilike(value),
                models.Customer.account_number.ilike(value)
            )
        )

    if status == "active":
        query = query.filter(
            models.Customer.is_active.is_(True)
        )
    elif status == "inactive":
        query = query.filter(
            models.Customer.is_active.is_(False)
        )

    if sort_by == "balance_desc":
        query = query.order_by(models.Customer.balance.desc())
    elif sort_by == "balance_asc":
        query = query.order_by(models.Customer.balance.asc())
    elif sort_by == "name_asc":
        query = query.order_by(models.Customer.full_name.asc())
    else:
        # Default: newest records first.
        query = query.order_by(models.Customer.id.desc())

    return query.offset(offset).limit(limit).all()


def get_customer_by_email(db: Session, email: str):
    """Return the customer with the given email, or None."""
    return db.query(models.Customer).filter(
        models.Customer.email == email
    ).first()


def get_customer_by_account_number(
    db: Session, account_number: str
):
    """Return the customer with the given account number, or None."""
    return db.query(models.Customer).filter(
        models.Customer.account_number == account_number
    ).first()


def get_customer_by_id(db: Session, customer_id: int):
    """Return the customer with the given primary key, or None."""
    return db.query(models.Customer).filter(
        models.Customer.id == customer_id
    ).first()


# ---------------------------------------------------------------------------
# Customer mutations
# ---------------------------------------------------------------------------

def create_customer(
    db: Session,
    customer: schemas.CustomerCreate,
    actor: str,
    ip_address: str | None = None
):
    """Create a new customer record and write an audit log.

    Normalises the email to lowercase and strips whitespace from
    name and email before saving.  The account number is
    generated by ``generate_unique_account_number``.

    Returns:
        The newly created Customer ORM object.
    """
    db_customer = models.Customer(
        full_name=customer.full_name.strip(),
        email=customer.email.strip().lower(),
        account_number=generate_unique_account_number(db),
        balance=customer.balance,
        is_active=True,
        notes=customer.notes.strip() if customer.notes else None
    )
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)

    create_audit_log(
        db,
        "customer_create",
        actor,
        (
            f"Created customer {db_customer.full_name} "
            f"({db_customer.account_number})"
        ),
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
    """Update a customer's name and email address.

    Checks email uniqueness before saving so the error surfaces
    before any data changes.  Old name and email are captured
    for the audit log so there is a full history of changes.

    Returns:
        (customer, None) on success, or (None, error_message).
    """
    customer = get_customer_by_id(db, customer_id)
    if not customer:
        return None, "Customer not found."

    # Check the new email is not already used by a different
    # customer (an existing customer updating to their own
    # current email is fine).
    existing_email = get_customer_by_email(
        db, payload.email.strip().lower()
    )
    if existing_email and existing_email.id != customer.id:
        return None, "Email already exists."

    # Capture old values before overwriting for the audit log.
    old_name = customer.full_name
    old_email = customer.email

    customer.full_name = payload.full_name.strip()
    customer.email = payload.email.strip().lower()
    customer.notes = (
        payload.notes.strip() if payload.notes else None
    )
    customer.updated_at = _now()

    db.commit()
    db.refresh(customer)

    create_audit_log(
        db,
        "customer_update",
        actor,
        (
            f"Updated customer {customer.account_number}: "
            f"name '{old_name}' to '{customer.full_name}', "
            f"email '{old_email}' to '{customer.email}'"
        ),
        ip_address=ip_address
    )
    return customer, None


def deactivate_customer(
    db: Session,
    customer_id: int,
    actor: str,
    ip_address: str | None = None
):
    """Set a customer account to inactive.

    Inactive accounts cannot send or receive money.  Guarded
    against double-deactivation to keep the audit log clean.

    Returns:
        (customer, None) on success, or (None, error_message).
    """
    customer = get_customer_by_id(db, customer_id)
    if not customer:
        return None, "Customer not found."

    if not customer.is_active:
        return None, "Customer is already inactive."

    customer.is_active = False
    customer.updated_at = _now()
    db.commit()
    db.refresh(customer)

    create_audit_log(
        db,
        "customer_deactivate",
        actor,
        (
            f"Deactivated customer {customer.full_name} "
            f"({customer.account_number})"
        ),
        ip_address=ip_address
    )
    return customer, None


def reactivate_customer(
    db: Session,
    customer_id: int,
    actor: str,
    ip_address: str | None = None
):
    """Restore a previously deactivated customer account.

    Returns:
        (customer, None) on success, or (None, error_message).
    """
    customer = get_customer_by_id(db, customer_id)
    if not customer:
        return None, "Customer not found."

    if customer.is_active:
        return None, "Customer is already active."

    customer.is_active = True
    customer.updated_at = _now()
    db.commit()
    db.refresh(customer)

    create_audit_log(
        db,
        "customer_reactivate",
        actor,
        (
            f"Reactivated customer {customer.full_name} "
            f"({customer.account_number})"
        ),
        ip_address=ip_address
    )
    return customer, None


def delete_customer(
    db: Session,
    customer_id: int,
    actor: str,
    ip_address: str | None = None
):
    """Permanently delete a customer record from the database.

    Captures the name and account number before deletion so
    they can be included in the audit log entry (the ORM object
    is gone after ``db.delete``).

    Returns:
        (True, None) on success, or (False, error_message).
    """
    customer = get_customer_by_id(db, customer_id)
    if not customer:
        return False, "Customer not found."

    # Capture before deleting — the object becomes detached.
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


# ---------------------------------------------------------------------------
# Transaction queries
# ---------------------------------------------------------------------------

def get_all_transactions(
    db: Session,
    account_number: str | None = None,
    transaction_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    amount_min: int | None = None,
    amount_max: int | None = None,
    risk_flag: bool | None = None,
    limit: int = 50,
    offset: int = 0
):
    """Return a paginated list of transactions with optional filters."""
    query = db.query(models.Transaction)

    if transaction_type:
        query = query.filter(
            models.Transaction.transaction_type == transaction_type
        )

    if account_number:
        customer = get_customer_by_account_number(
            db, account_number.strip()
        )
        if not customer:
            return []
        query = query.filter(
            or_(
                models.Transaction.from_customer_id == customer.id,
                models.Transaction.to_customer_id == customer.id
            )
        )

    if date_from:
        try:
            from_dt = datetime.fromisoformat(date_from)
            query = query.filter(
                models.Transaction.created_at >= from_dt
            )
        except ValueError:
            pass

    if date_to:
        try:
            to_dt = datetime.fromisoformat(date_to)
            to_dt = to_dt.replace(hour=23, minute=59, second=59)
            query = query.filter(
                models.Transaction.created_at <= to_dt
            )
        except ValueError:
            pass

    if amount_min is not None:
        query = query.filter(
            models.Transaction.amount >= amount_min
        )

    if amount_max is not None:
        query = query.filter(
            models.Transaction.amount <= amount_max
        )

    if risk_flag is not None:
        query = query.filter(
            models.Transaction.risk_flag == risk_flag
        )

    return (
        query.order_by(models.Transaction.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def get_all_audit_logs(
    db: Session,
    actor: str | None = None,
    event_type: str | None = None,
    result: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 100,
    offset: int = 0
):
    """Return a paginated, filtered list of audit log entries.

    All filters are optional and can be combined.  ``actor`` is
    matched with a case-insensitive LIKE so partial usernames
    work.  ``event_type`` and ``result`` are exact matches.
    """
    query = db.query(models.AuditLog)

    if actor:
        safe_actor = actor.strip()[:SEARCH_MAX_LENGTH]
        query = query.filter(
            models.AuditLog.actor.ilike(f"%{safe_actor}%")
        )
    if event_type:
        query = query.filter(
            models.AuditLog.event_type == event_type
        )
    if result:
        query = query.filter(
            models.AuditLog.result == result
        )
    if date_from:
        try:
            from_dt = datetime.fromisoformat(date_from)
            query = query.filter(
                models.AuditLog.created_at >= from_dt
            )
        except ValueError:
            pass  # ignore malformed date strings
    if date_to:
        try:
            # Treat the date_to value as end-of-day so that
            # entering "2026-04-14" includes all events that day.
            to_dt = datetime.fromisoformat(date_to)
            to_dt = to_dt.replace(hour=23, minute=59, second=59)
            query = query.filter(
                models.AuditLog.created_at <= to_dt
            )
        except ValueError:
            pass

    return (
        query.order_by(models.AuditLog.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def get_customer_timeline(db: Session, customer_id: int):
    """Build a chronological activity timeline for a customer.

    Combines the customer's creation event with all of their
    transactions (up to 200) and sorts newest-first.  Used in
    the customer detail panel in the UI.

    Returns:
        List of dicts with 'event_type', 'description', and
        'created_at' keys, sorted newest first.  Empty list if
        the customer does not exist.
    """
    customer = get_customer_by_id(db, customer_id)
    if not customer:
        return []

    items = [
        {
            "event_type": "customer_created",
            "description": (
                f"Customer record created for {customer.full_name}"
            ),
            "created_at": customer.created_at
        }
    ]

    for transaction in get_all_transactions(
        db,
        account_number=customer.account_number,
        limit=200
    ):
        items.append(
            {
                "event_type": transaction.transaction_type,
                "description": (
                    f"{transaction.transaction_type.title()} "
                    f"of £{transaction.amount} "
                    f"({transaction.description or 'No description'})"
                ),
                "created_at": transaction.created_at
            }
        )

    # Sort newest first so the most recent events appear at the
    # top of the timeline panel in the UI.
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return items


# ---------------------------------------------------------------------------
# Financial transactions
# ---------------------------------------------------------------------------

def deposit_money(
    db: Session,
    request: schemas.DepositWithdrawRequest,
    actor: str,
    ip_address: str | None = None
):
    """Credit an amount to a customer's account.

    Automatically sets ``risk_flag=True`` when the amount meets
    or exceeds ``SUSPICIOUS_TRANSACTION_THRESHOLD``.  The flag
    appears in the alerts page as a visual warning.

    Returns:
        (transaction, None) on success, or (None, error_message).
    """
    customer = get_customer_by_account_number(
        db, request.account_number.strip()
    )
    if not customer:
        return None, "Customer account not found."

    if not customer.is_active:
        return None, "Customer account is inactive."

    customer.balance += request.amount
    customer.updated_at = _now()

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

    details = (
        f"Deposited £{request.amount} "
        f"into {customer.account_number}"
    )
    if risk_flag:
        details += " [flagged as large transaction]"

    create_audit_log(
        db, "deposit", actor, details, ip_address=ip_address
    )
    return transaction, None


def withdraw_money(
    db: Session,
    request: schemas.DepositWithdrawRequest,
    actor: str,
    ip_address: str | None = None
):
    """Debit an amount from a customer's account.

    Checks for sufficient funds before proceeding so the
    balance can never go negative.

    Returns:
        (transaction, None) on success, or (None, error_message).
    """
    customer = get_customer_by_account_number(
        db, request.account_number.strip()
    )
    if not customer:
        return None, "Customer account not found."

    if not customer.is_active:
        return None, "Customer account is inactive."

    if customer.balance < request.amount:
        return None, "Insufficient funds."

    customer.balance -= request.amount
    customer.updated_at = _now()

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

    details = (
        f"Withdrew £{request.amount} "
        f"from {customer.account_number}"
    )
    if risk_flag:
        details += " [flagged as large transaction]"

    create_audit_log(
        db, "withdraw", actor, details, ip_address=ip_address
    )
    return transaction, None


def transfer_money(
    db: Session,
    request: schemas.TransferRequest,
    actor: str,
    ip_address: str | None = None
):
    """Move funds from one customer account to another.

    Validates both accounts, checks sufficient funds, then
    updates both balances and creates a single transaction
    record in one commit so the operation is effectively atomic.

    Note: SQLite does not support ``SELECT FOR UPDATE`` row
    locking, so two simultaneous withdrawals from the same
    account could both succeed (race condition).  Use PostgreSQL
    with ``SELECT FOR UPDATE`` in a production deployment.

    Returns:
        (transaction, None) on success, or (None, error_message).
    """
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

    # Timestamp both balance changes to the same instant so
    # "last updated" is consistent for both accounts.
    now = _now()
    from_customer.balance -= request.amount
    to_customer.balance += request.amount
    from_customer.updated_at = now
    to_customer.updated_at = now

    risk_flag = (
        request.amount >= SUSPICIOUS_TRANSACTION_THRESHOLD
    )

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

    details = (
        f"Transferred £{request.amount} from "
        f"{from_customer.account_number} "
        f"to {to_customer.account_number}"
    )
    if risk_flag:
        details += " [flagged as large transaction]"

    create_audit_log(
        db, "transfer", actor, details, ip_address=ip_address
    )
    return transaction, None


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------

def export_customers_csv(
    db: Session,
    actor: str,
    ip_address: str | None = None
) -> str:
    """Return all customer records serialised as a CSV string.

    Fetches up to 10 000 records and writes an audit log entry
    so every export is traceable.  The Python ``csv`` module
    handles quoting and escaping automatically.

    Returns:
        CSV text as a string (no BOM, Unix line endings).
    """
    customers = get_all_customers(db, limit=10000)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "full_name", "email", "account_number",
        "balance", "is_active", "created_at", "updated_at"
    ])
    for customer in customers:
        writer.writerow([
            customer.id, customer.full_name, customer.email,
            customer.account_number, customer.balance,
            customer.is_active,
            customer.created_at, customer.updated_at
        ])
    create_audit_log(
        db, "export_customers", actor,
        f"Exported {len(customers)} customer records as CSV",
        ip_address=ip_address
    )
    return output.getvalue()


def export_transactions_csv(
    db: Session,
    actor: str,
    ip_address: str | None = None
) -> str:
    """Return all transaction records serialised as a CSV string.

    Fetches up to 10 000 records and writes an audit log entry.

    Returns:
        CSV text as a string.
    """
    transactions = get_all_transactions(db, limit=10000)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "transaction_type", "amount", "description",
        "risk_flag", "from_customer_id",
        "to_customer_id", "created_at"
    ])
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
    create_audit_log(
        db, "export_transactions", actor,
        f"Exported {len(transactions)} transaction records as CSV",
        ip_address=ip_address
    )
    return output.getvalue()


def export_customer_transactions_csv(
    db: Session,
    customer_id: int,
    actor: str,
    ip_address: str | None = None
) -> str | None:
    """Return transaction records for one customer serialised as CSV.

    Fetches all transactions where the customer is either the sender
    or receiver, writes an audit log entry, and returns the CSV text.
    Returns ``None`` if the customer does not exist.

    Returns:
        CSV text as a string, or None if customer not found.
    """
    customer = get_customer_by_id(db, customer_id)
    if customer is None:
        return None

    transactions = (
        db.query(models.Transaction)
        .filter(
            or_(
                models.Transaction.from_customer_id == customer_id,
                models.Transaction.to_customer_id == customer_id,
            )
        )
        .order_by(models.Transaction.created_at.desc())
        .limit(10000)
        .all()
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "transaction_type", "amount", "description",
        "risk_flag", "from_customer_id", "to_customer_id", "created_at"
    ])
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
    create_audit_log(
        db, "export_customer_transactions", actor,
        f"Exported {len(transactions)} transactions for customer "
        f"{customer.full_name} (id={customer_id}) as CSV",
        ip_address=ip_address
    )
    return output.getvalue()


# ---------------------------------------------------------------------------
# Audit log maintenance
# ---------------------------------------------------------------------------

def purge_audit_logs(
    db: Session,
    days: int,
    actor: str,
    ip_address: str | None = None
) -> int:
    """Delete audit log entries older than ``days`` days.

    Performs a bulk delete rather than loading objects into
    memory, using ``synchronize_session=False`` to skip the
    SQLAlchemy in-memory sync (safe here because we commit
    immediately and don't use the deleted objects afterwards).

    After deletion a new audit entry is written recording how
    many records were purged and who requested it.

    Args:
        db:         Active database session.
        days:       Delete entries older than this many days.
        actor:      Username of the staff member requesting purge.
        ip_address: Peer IP for the audit log.

    Returns:
        Number of deleted rows.
    """
    from datetime import timedelta
    cutoff = _now() - timedelta(days=days)
    deleted = (
        db.query(models.AuditLog)
        .filter(models.AuditLog.created_at < cutoff)
        .delete(synchronize_session=False)
    )
    db.commit()
    create_audit_log(
        db, "audit_log_purge", actor,
        (
            f"Purged {deleted} audit log entries "
            f"older than {days} days"
        ),
        ip_address=ip_address
    )
    return deleted
