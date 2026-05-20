"""
SecureBank — Pydantic request and response schemas.

Pydantic request and response schemas for all API endpoints.
Request schemas validate and sanitise incoming JSON payloads.
Response schemas serialise ORM objects into JSON, hiding
fields that should not be exposed (e.g. hashed passwords).

Pydantic v2 is used throughout; ``model_config`` replaces the
old inner ``Config`` class from v1.
"""

from datetime import datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
)


class LoginRequest(BaseModel):
    """Credentials submitted via the login form."""

    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=100)


class CustomerCreate(BaseModel):
    """Payload for creating a new customer record.

    Requires at least two whitespace-separated words in
    ``full_name`` so staff always enter a proper name rather
    than a single word or alias.
    """

    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    # Opening balance defaults to zero; cannot be negative.
    balance: int = Field(default=0, ge=0)
    # Optional free-text notes; empty string is stored as None.
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("full_name")
    @classmethod
    def validate_name(cls, value: str):
        """Strip whitespace and enforce a two-word minimum."""
        value = value.strip()
        if len(value.split()) < 2:
            raise ValueError("Please enter a full name.")
        return value


class CustomerUpdate(BaseModel):
    """Payload for editing an existing customer's details.

    Only name and email can be changed here.  Balance is
    modified exclusively through transaction endpoints so there
    is always a transaction record and audit trail.
    """

    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    notes: str | None = Field(default=None, max_length=500)


class CustomerResponse(BaseModel):
    """Shape of a customer record returned by the API.

    ``from_attributes=True`` tells Pydantic to read values
    from SQLAlchemy ORM attributes rather than a dict.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    account_number: str
    balance: int
    is_active: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime


class DepositWithdrawRequest(BaseModel):
    """Payload for deposit and withdrawal operations."""

    account_number: str = Field(
        ..., min_length=6, max_length=20
    )
    # Amount in pence — must be at least 1.
    amount: int = Field(..., gt=0)
    description: str = Field(default="", max_length=255)


class TransferRequest(BaseModel):
    """Payload for a transfer between two customer accounts."""

    from_account_number: str = Field(
        ..., min_length=6, max_length=20
    )
    to_account_number: str = Field(
        ..., min_length=6, max_length=20
    )
    # Amount in pence — must be at least 1.
    amount: int = Field(..., gt=0)
    description: str = Field(default="", max_length=255)


class TransactionResponse(BaseModel):
    """Shape of a transaction record returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_type: str
    amount: int
    description: str | None
    risk_flag: bool
    from_customer_id: int | None
    to_customer_id: int | None
    created_at: datetime


class AuditLogResponse(BaseModel):
    """Shape of an audit log entry returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    event_type: str
    actor: str
    details: str
    result: str
    ip_address: str | None
    created_at: datetime


class DashboardSummaryResponse(BaseModel):
    """Aggregated statistics shown on the dashboard metric cards.

    All values are computed by a single database query in
    ``crud.get_dashboard_summary``.
    """

    total_customers: int
    active_customers: int
    inactive_customers: int
    total_transactions: int
    # Sum of all customer balances in pence.
    total_balance: int
    # Number of transactions with risk_flag=True.
    suspicious_transactions: int
    # Customers whose balance is below LOW_BALANCE_THRESHOLD.
    low_balance_customers: int


class CustomerTimelineItem(BaseModel):
    """Single entry in a customer's activity timeline.

    Built from the customer's creation record and all linked
    transactions, sorted newest first.
    """

    event_type: str
    description: str
    created_at: datetime


class StaffUserResponse(BaseModel):
    """Shape of a staff user record returned by the API.

    Deliberately excludes the ``password`` field so the hashed
    password is never sent over the wire.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: str
    failed_login_attempts: int
    is_locked: bool
    # True if the user needs to set a new password on login.
    must_change_password: bool
    created_at: datetime


class ChartDataResponse(BaseModel):
    """Data for the two dashboard charts.

    customer_status  — counts of active vs inactive customers.
    transaction_types — counts per transaction type.
    """

    customer_status: dict[str, int]
    transaction_types: dict[str, int]


class StaffUserCreate(BaseModel):
    """Payload for creating a new staff user (manager+ only).

    Usernames are restricted to alphanumeric characters and
    underscores to keep them safe for display and logging.
    Password strength is validated separately in crud.py
    (uppercase, lowercase, digit, 8+ characters).
    """

    username: str = Field(
        ...,
        min_length=3,
        max_length=50,
        pattern=r"^[a-zA-Z0-9_]+$"
    )
    password: str = Field(..., min_length=8, max_length=100)
    role: str = Field(default="staff")

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str):
        """Reject any role string that is not a known role."""
        if value not in ("staff", "manager", "superadmin"):
            raise ValueError(
                "Role must be 'staff', 'manager', or 'superadmin'."
            )
        return value


class PasswordChangeRequest(BaseModel):
    """Payload for changing a staff user's password.

    Requires the current password to prevent an attacker with
    a stolen session from locking out the real user.
    Additional strength rules are enforced in crud.py.
    """

    current_password: str = Field(
        ..., min_length=1, max_length=100
    )
    new_password: str = Field(
        ..., min_length=8, max_length=100
    )
