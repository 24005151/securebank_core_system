from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import crud, schemas
from app.database import get_db

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login")
def login(payload: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = crud.authenticate_staff_user(db, payload.username, payload.password)

    if not user:
        crud.create_audit_log(
            db,
            "login_failed",
            payload.username.strip() or "unknown",
            "Failed login attempt"
        )
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    request.session["user"] = {
        "username": user.username,
        "role": user.role
    }

    crud.create_audit_log(
        db,
        "login_success",
        user.username,
        "Successful staff login"
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