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
def login(payload: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip_address = get_client_ip(request)
    user, error = crud.authenticate_staff_user(db, payload.username, payload.password)

    if not user:
        crud.create_audit_log(
            db,
            "login_failed",
            payload.username.strip() or "unknown",
            error or "Failed login attempt",
            result="failure",
            ip_address=ip_address
        )
        raise HTTPException(status_code=401, detail=error or "Invalid username or password.")

    request.session["user"] = {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "must_change_password": user.must_change_password
    }
    # Issue a fresh CSRF token on login
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
        "must_change_password": user.must_change_password
    }


@router.post("/logout")
def logout(request: Request):
    request.session.clear()
    return {"message": "Logged out successfully."}


@router.get("/me")
def current_user(request: Request):
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return user


@router.get("/csrf-token")
def get_csrf_token(request: Request):
    """Return the CSRF token for the current session. Call this once on page load."""
    return {"csrf_token": generate_csrf_token(request)}
