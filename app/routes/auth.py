from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import crud, schemas
from app.database import get_db

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


@router.post("/login")
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
        "username": user.username,
        "role": user.role
    }

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
        "role": user.role
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