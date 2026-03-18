from sqlalchemy import Boolean, Column, Integer, String

from app.database import Base


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    email = Column(String(120), nullable=False, unique=True, index=True)
    account_number = Column(String(20), nullable=False, unique=True, index=True)
    balance = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)