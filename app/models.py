from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class StaffUser(Base):
    __tablename__ = "staff_users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), nullable=False, unique=True, index=True)
    password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="staff")
    failed_login_attempts = Column(Integer, nullable=False, default=0)
    is_locked = Column(Boolean, nullable=False, default=False)
    last_failed_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    email = Column(String(120), nullable=False, unique=True, index=True)
    account_number = Column(String(20), nullable=False, unique=True, index=True)
    balance = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    outgoing_transactions = relationship(
        "Transaction",
        foreign_keys="Transaction.from_customer_id",
        back_populates="from_customer"
    )
    incoming_transactions = relationship(
        "Transaction",
        foreign_keys="Transaction.to_customer_id",
        back_populates="to_customer"
    )


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    transaction_type = Column(String(20), nullable=False)
    amount = Column(Integer, nullable=False)
    description = Column(String(255), nullable=True)
    risk_flag = Column(Boolean, nullable=False, default=False)

    from_customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    to_customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    from_customer = relationship(
        "Customer",
        foreign_keys=[from_customer_id],
        back_populates="outgoing_transactions"
    )
    to_customer = relationship(
        "Customer",
        foreign_keys=[to_customer_id],
        back_populates="incoming_transactions"
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False)
    actor = Column(String(50), nullable=False)
    details = Column(String(255), nullable=False)
    result = Column(String(20), nullable=False, default="success")
    ip_address = Column(String(64), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)