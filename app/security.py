import hmac
import os
import secrets

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db

API_KEY = os.environ.get("API_KEY", "")
API_KEY_HEADER_NAME = "X-API-Key"

# Roles that have manager-level access (superadmin is a superset of manager)
PRIVILEGED_ROLES = {"manager", "superadmin"}


def _key_matches(provided: str | None) -> bool:
    if not provided or not API_KEY:
        return False
    return hmac.compare_digest(provided.encode(), API_KEY.encode())


def _validate_session_user(request: Request, db: Session) -> dict | None:
    """Return the session user dict if the account is still active and not locked.
    Clears the session and returns None if the account has been locked or deleted
    since the session was created."""
    user = request.session.get("user")
    if not user:
        return None

    # Re-check against the database on every authenticated request
    from app.models import StaffUser  # local import avoids circular dependency
    db_user = db.query(StaffUser).filter_by(username=user["username"]).first()
    if not db_user or db_user.is_locked:
        request.session.clear()
        return None

    return user


def generate_csrf_token(request: Request) -> str:
    """Generate or retrieve the CSRF token for the current session."""
    if "csrf_token" not in request.session:
        request.session["csrf_token"] = secrets.token_hex(32)
    return request.session["csrf_token"]


def require_csrf_token(
    request: Request,
    x_csrf_token: str | None = Header(default=None)
):
    """Validate CSRF token for session-authenticated mutating requests.
    Skipped automatically for API key auth (not cookie-based)."""
    api_key_header = request.headers.get("X-API-Key")
    if _key_matches(api_key_header):
        return

    session_token = request.session.get("csrf_token")
    if not session_token or not x_csrf_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token required."
        )
    if not hmac.compare_digest(session_token, x_csrf_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid CSRF token."
        )


def require_session_or_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias=API_KEY_HEADER_NAME),
    db: Session = Depends(get_db)
):
    user = _validate_session_user(request, db)

    if user:
        return {"auth_type": "session", "user": user}

    if _key_matches(x_api_key):
        return {"auth_type": "api_key", "user": None}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated. Provide a valid session or API key."
    )


def require_manager_or_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias=API_KEY_HEADER_NAME),
    db: Session = Depends(get_db)
):
    user = _validate_session_user(request, db)

    if user and user.get("role") in PRIVILEGED_ROLES:
        return {"auth_type": "session", "user": user}

    if _key_matches(x_api_key):
        return {"auth_type": "api_key", "user": None}

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Manager access or valid API key required."
    )


def require_superadmin_or_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias=API_KEY_HEADER_NAME),
    db: Session = Depends(get_db)
):
    """Restrict to superadmin role only — used for operations that affect privileged accounts."""
    user = _validate_session_user(request, db)

    if user and user.get("role") == "superadmin":
        return {"auth_type": "session", "user": user}

    if _key_matches(x_api_key):
        return {"auth_type": "api_key", "user": None}

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Superadmin access required."
    )
