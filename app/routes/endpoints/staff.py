"""
Staff user management endpoints.

    GET   /api/staff-users                       — list all (manager+).
    POST  /api/staff-users                       — create account (manager+).
    PATCH /api/staff-users/{id}/unlock           — unlock account (manager+).
    POST  /api/staff-users/{id}/change-password  — change password (ownership rules).
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app import crud, schemas
from app.database import get_db
from app.models import StaffUser
from app.security import (
    require_csrf_token,
    require_manager_or_api_key,
    require_session_or_api_key,
)
from app.utils import get_client_ip

router = APIRouter()

_manager_or_key = [Depends(require_manager_or_api_key)]


@router.get(
    "/api/staff-users",
    response_model=list[schemas.StaffUserResponse],
    dependencies=_manager_or_key,
)
def read_staff_users(db: Session = Depends(get_db)):
    """Return all staff user records (manager+ only)."""
    return crud.get_all_staff_users(db)


@router.post(
    "/api/staff-users",
    response_model=schemas.StaffUserResponse,
    dependencies=[Depends(require_csrf_token)],
)
def create_staff_user(
    request: Request,
    payload: schemas.StaffUserCreate,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key),
):
    """Create a new staff user account (manager+ only).

    Only superadmin (or API key) may create accounts with the superadmin
    role.  A manager trying to escalate to superadmin receives a 403.
    """
    session_user = auth.get("user")
    actor = session_user["username"] if session_user else "api_key_client"
    # API key callers are treated as superadmin-equivalent.
    actor_role = session_user.get("role", "staff") if session_user else "superadmin"

    if payload.role == "superadmin" and actor_role != "superadmin":
        raise HTTPException(
            status_code=403,
            detail="Only a superadmin can create superadmin accounts.",
        )

    user, error = crud.create_staff_user(
        db, payload, actor=actor, ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return user


@router.patch(
    "/api/staff-users/{user_id}/unlock",
    response_model=schemas.StaffUserResponse,
    dependencies=[Depends(require_csrf_token)],
)
def unlock_staff_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    auth=Depends(require_manager_or_api_key),
):
    """Unlock a locked staff account (manager+ only).

    Only superadmin (or API key) may unlock manager/superadmin accounts.
    A 403 is raised if the actor lacks the required role.
    """
    session_user = auth.get("user")
    actor = session_user["username"] if session_user else "api_key_client"
    actor_role = session_user.get("role", "staff") if session_user else "superadmin"

    user, error = crud.unlock_staff_user(
        db, user_id, actor=actor, actor_role=actor_role,
        ip_address=get_client_ip(request),
    )
    if error:
        raise HTTPException(status_code=403, detail=error)
    return user


@router.post(
    "/api/staff-users/{user_id}/change-password",
    dependencies=[Depends(require_csrf_token)],
)
def change_staff_password(
    user_id: int,
    request: Request,
    payload: schemas.PasswordChangeRequest,
    db: Session = Depends(get_db),
    auth=Depends(require_session_or_api_key),
):
    """Change a staff user's password.

    Session auth: staff-role users may only change their own password.
    Managers may change any user's password.
    API key auth: may change any password (still verifies current password).
    """
    session_user = auth.get("user")
    is_api_key = auth.get("auth_type") == "api_key"

    if not is_api_key:
        is_manager = session_user.get("role") in ("manager", "superadmin")
        target = db.query(StaffUser).filter_by(id=user_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="User not found.")
        if not is_manager and session_user.get("id") != user_id:
            raise HTTPException(
                status_code=403,
                detail="You can only change your own password.",
            )

    actor = session_user["username"] if session_user else "api_key_client"
    _, error = crud.change_staff_password(
        db, user_id, payload, actor=actor, ip_address=get_client_ip(request)
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return {"message": "Password changed successfully."}
