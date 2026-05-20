"""
SecureBank — database configuration.

SQLAlchemy engine and session factory setup.
SQLite is used for development. In production, swap
DATABASE_URL for a PostgreSQL connection string and remove
the ``check_same_thread`` connect argument.

The DATABASE_URL environment variable overrides the default
file path.  The test suite uses this to point at an in-memory
SQLite instance so tests never touch the real database and
always start from a clean state.
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

# Allow the test suite (or deployment) to override the path.
DATABASE_URL = os.environ.get(
    "DATABASE_URL", "sqlite:///./securebank.db"
)

# In-memory SQLite databases are connection-scoped by default.
# StaticPool forces all sessions to share one connection so
# the schema created at startup is still visible to requests.
_is_memory = DATABASE_URL == "sqlite:///:memory:"
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    **({"poolclass": StaticPool} if _is_memory else {})
)

# autocommit=False: db.commit() is always called explicitly,
# giving full control over transaction boundaries.
# autoflush=False prevents implicit flushes before queries.
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# All ORM models inherit from this base so SQLAlchemy can
# discover their table definitions via Base.metadata.
Base = declarative_base()


def get_db():
    """Yield a database session and close it after the request.

    FastAPI dependency — each request gets its own isolated
    session that is always closed, even if the route raises.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
