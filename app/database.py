"""
SecureBank — database configuration.

I set up the SQLAlchemy engine and session factory here.
SQLite is used for development. In production, swap
DATABASE_URL for a PostgreSQL connection string and remove
the ``check_same_thread`` connect argument.

The DATABASE_URL environment variable overrides the default
file path.  I use this in the test suite to point at an
in-memory SQLite instance so tests never touch the real file
and start from a clean state on every run.
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

# autocommit=False means I always call db.commit() explicitly,
# giving me full control over transaction boundaries.
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

    I use this as a FastAPI dependency so each request gets
    its own isolated session that is always cleaned up, even
    if an exception is raised inside the route handler.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
