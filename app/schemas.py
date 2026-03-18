from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=100)


class CustomerCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    balance: int = Field(default=0, ge=0)


class CustomerUpdate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    account_number: str
    balance: int
    is_active: bool


class DepositWithdrawRequest(BaseModel):
    account_number: str = Field(..., min_length=6, max_length=20)
    amount: int = Field(..., gt=0)
    description: str = Field(default="", max_length=255)


class TransferRequest(BaseModel):
    from_account_number: str = Field(..., min_length=6, max_length=20)
    to_account_number: str = Field(..., min_length=6, max_length=20)
    amount: int = Field(..., gt=0)
    description: str = Field(default="", max_length=255)


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_type: str
    amount: int
    description: str | None
    from_customer_id: int | None
    to_customer_id: int | None
    created_at: datetime


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_type: str
    actor: str
    details: str
    created_at: datetime


class DashboardSummaryResponse(BaseModel):
    total_customers: int
    active_customers: int
    inactive_customers: int
    total_transactions: int
    total_balance: int