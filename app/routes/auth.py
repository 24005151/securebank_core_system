"""
SecureBank — authentication endpoints.

Authentication endpoints:

POST /api/auth/login     — validate credentials, create a
                           session, issue a CSRF token.
POST /api/auth/logout    — clear the session.
GET  /api/auth/me        — return the current session user.
GET  /api/auth/csrf-token — return the session's CSRF token
                            (called once on page load by app.js).

Login is rate-limited to 10 attempts per minute per IP address
to mitigate brute-force attacks.  Failed attempts are logged to
the audit trail.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import crud, schemas
from app.database import get_db
from app.limiter import limiter
from app.security import generate_csrf_token
from app.utils import get_client_ip

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login")
@limiter.limit("10/minute")
def login(
    payload: schemas.LoginRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """Authenticate a staff user and establish a session.

    On success, stores the user's ID, username, role, and
    must_change_password flag in the session, then issues a
    fresh CSRF token.

    The rate limit of 10 attempts per minute per IP is applied
    by SlowAPI before any database work is done.

    Returns the same response shape regardless of whether the
    failure is "wrong password" or "account locked", to prevent
    username enumeration.
    """
    ip_address = get_client_ip(request)
    user, error = crud.authenticate_staff_user(
        db, payload.username, payload.password
    )

    if not user:
        # Log the failure before raising so there is always a
        # record even if the route raises an exception.
        crud.create_audit_log(
            db,
            "login_failed",
            payload.username.strip() or "unknown",
            error or "Failed login attempt",
            result="failure",
            ip_address=ip_address
        )
        raise HTTPException(
            status_code=401,
            detail=error or "Invalid username or password."
        )

    # Store the minimum needed in the session.  The user ID is
    # needed by the password-change endpoint to verify ownership.
    # last_login_at is stored as ISO so it survives JSON
    # session serialisation.
    request.session["user"] = {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "must_change_password": user.must_change_password,
        "last_login_at": (
            user.last_login_at.isoformat()
            if user.last_login_at else None
        )
    }

    # Generate a fresh CSRF token for this session.
    generate_csrf_token(request)

    crud.create_audit_log(
        db,
        "login_success",
        user.username,
        f"Successful staff login with role {user.role}",
        result="success",
        ip_address=ip_address
    )

    return {
        "message": "Login successful.",
        "username": user.username,
        "role": user.role,
        # The frontend uses this flag to redirect to the
        # password-change form before allowing normal access.
        "must_change_password": user.must_change_password
    }


@router.post("/logout")
def logout(request: Request):
    """Clear the current session.

    Clears all session data including the CSRF token.
    The client-side JavaScript then redirects to /login.
    """
    request.session.clear()
    return {"message": "Logged out successfully."}


@router.get("/me")
def current_user(request: Request):
    """Return the current session user dict.

    Called on page load in app.js to populate role-dependent UI
    (e.g. showing or hiding manager controls) without an extra
    server-side template variable.

    Raises:
        HTTPException 401 if there is no active session.
    """
    user = request.session.get("user")
    if not user:
        raise HTTPException(
            status_code=401, detail="Not authenticated."
        )
    return user


@router.get("/csrf-token")
def get_csrf_token(request: Request):
    """Return the CSRF token for the current session.

    Called once on page load from app.js.  The token is stored
    in a module-level variable and injected into the
    X-CSRF-Token header on every mutating fetch call via the
    global fetch wrapper.
    """
    return {"csrf_token": generate_csrf_token(request)}
