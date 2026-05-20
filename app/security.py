"""
SecureBank — authentication and authorisation dependencies.

Authentication and authorisation dependency functions.

Three FastAPI dependencies protect API endpoints at different
privilege levels:

* ``require_session_or_api_key``    — any authenticated user.
* ``require_manager_or_api_key``    — manager or superadmin.
* ``require_superadmin_or_api_key`` — superadmin only.

Each dependency accepts either a valid session cookie or an
``X-API-Key`` header.  Session users are re-validated against
the database on every request so that newly locked accounts
are rejected immediately without waiting for the session to
expire.

CSRF protection uses a double-submit token pattern: a secret
is stored in the session on login and the client must echo it
back as the ``X-CSRF-Token`` header on every mutating
(POST/PUT/PATCH/DELETE) request.  API-key-authenticated
requests are exempt because they don't use cookies and are
not vulnerable to CSRF.
"""

import hmac
import os
import secrets

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db

# Loaded from the environment — never hardcoded.
# An empty string means API key auth will always fail.
API_KEY = os.environ.get("API_KEY", "")
API_KEY_HEADER_NAME = "X-API-Key"

# Roles with manager-level access.  Superadmin is treated as
# a strict superset of manager, so both pass manager checks.
PRIVILEGED_ROLES = {"manager", "superadmin"}


def _key_matches(provided: str | None) -> bool:
    """Return True if ``provided`` matches the configured API key.

    Uses ``hmac.compare_digest`` for a constant-time comparison
    that prevents timing attacks from distinguishing a wrong key
    from no key at all.
    """
    if not provided or not API_KEY:
        return False
    return hmac.compare_digest(
        provided.encode(), API_KEY.encode()
    )


def _validate_session_user(
    request: Request, db: Session
) -> dict | None:
    """Return the session user dict if the account is valid.

    Re-queries the database on every authenticated request so
    an account locked since login is immediately ejected.
    The session is cleared on ejection.

    Returns:
        The session user dict, or None if unauthenticated or
        the account is now locked/deleted.
    """
    user = request.session.get("user")
    if not user:
        return None

    # Local import avoids a circular dependency between
    # security.py and models.py at module load time.
    from app.models import StaffUser
    db_user = (
        db.query(StaffUser)
        .filter_by(username=user["username"])
        .first()
    )
    if not db_user or db_user.is_locked:
        request.session.clear()
        return None

    return user


def generate_csrf_token(request: Request) -> str:
    """Generate or retrieve the CSRF token for this session.

    Creates the token on first call and stores it in the
    session so the same value is returned on subsequent calls.
    A fresh token is issued on every login.
    """
    if "csrf_token" not in request.session:
        request.session["csrf_token"] = secrets.token_hex(32)
    return request.session["csrf_token"]


def require_csrf_token(
    request: Request,
    x_csrf_token: str | None = Header(default=None)
):
    """Validate the CSRF token on mutating session requests.

    Skips validation when the request is authenticated via API
    key — those requests don't use cookies so CSRF doesn't
    apply.

    Raises:
        HTTPException 403 if the token is missing or wrong.
    """
    api_key_header = request.headers.get("X-API-Key")
    if _key_matches(api_key_header):
        # API key auth — CSRF check not required.
        return

    session_token = request.session.get("csrf_token")
    if not session_token or not x_csrf_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token required."
        )
    # Constant-time comparison prevents timing attacks.
    if not hmac.compare_digest(session_token, x_csrf_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid CSRF token."
        )


def require_session_or_api_key(
    request: Request,
    x_api_key: str | None = Header(
        default=None, alias=API_KEY_HEADER_NAME
    ),
    db: Session = Depends(get_db)
):
    """Require any valid authentication — session or API key.

    Accepts staff sessions (any role) and the shared API key.
    Use on endpoints that any authenticated user may call.

    Returns:
        Dict with ``auth_type`` ('session' or 'api_key') and
        ``user`` (session user dict, or None for API key).

    Raises:
        HTTPException 401 if neither credential is valid.
    """
    user = _validate_session_user(request, db)

    if user:
        return {"auth_type": "session", "user": user}

    if _key_matches(x_api_key):
        return {"auth_type": "api_key", "user": None}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=(
            "Not authenticated. "
            "Provide a valid session or API key."
        )
    )


def require_manager_or_api_key(
    request: Request,
    x_api_key: str | None = Header(
        default=None, alias=API_KEY_HEADER_NAME
    ),
    db: Session = Depends(get_db)
):
    """Require manager/superadmin role or a valid API key.

    Guards sensitive operations (customer edits, staff
    management, audit logs, CSV export).  Staff-role sessions
    are rejected.

    Returns:
        Dict with ``auth_type`` and ``user`` (same as above).

    Raises:
        HTTPException 403 if the session user lacks privilege.
    """
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
    x_api_key: str | None = Header(
        default=None, alias=API_KEY_HEADER_NAME
    ),
    db: Session = Depends(get_db)
):
    """Restrict to superadmin role or a valid API key.

    For operations that affect privileged accounts, such as
    unlocking another manager or superadmin.  Regular manager
    sessions are rejected.

    Returns:
        Dict with ``auth_type`` and ``user``.

    Raises:
        HTTPException 403 if the caller is not superadmin.
    """
    user = _validate_session_user(request, db)

    if user and user.get("role") == "superadmin":
        return {"auth_type": "session", "user": user}

    if _key_matches(x_api_key):
        return {"auth_type": "api_key", "user": None}

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Superadmin access required."
    )
