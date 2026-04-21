"""
SecureBank — HTML page routes.

Every authenticated page passes ``active_page`` to the template
context so the sidebar can highlight the current section.
"""

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

from app import crud
from app.database import SessionLocal

router = APIRouter(tags=["Pages"])
templates = Jinja2Templates(directory="app/templates")


def get_current_user(request: Request):
    """Return the session user dict, or None if not logged in."""
    return request.session.get("user")


def _auth(request: Request):
    """Return (user, None) or (None, redirect) for auth-guarded pages."""
    user = get_current_user(request)
    if not user:
        return None, RedirectResponse(url="/login", status_code=303)
    return user, None


# ---------------------------------------------------------------------------
# Existing pages
# ---------------------------------------------------------------------------

@router.get("/")
def home(request: Request):
    user, redir = _auth(request)
    if redir:
        return redir
    return templates.TemplateResponse(
        request, "index.html",
        {"user": user, "active_page": "dashboard"}
    )


@router.get("/dashboard")
def dashboard(request: Request):
    user, redir = _auth(request)
    if redir:
        return redir
    return templates.TemplateResponse(
        request, "index.html",
        {"user": user, "active_page": "dashboard"}
    )


@router.get("/login")
def login_page(request: Request):
    user = get_current_user(request)
    if user:
        return RedirectResponse(url="/", status_code=303)
    return templates.TemplateResponse(request, "login.html", {})


# ---------------------------------------------------------------------------
# New dedicated pages
# ---------------------------------------------------------------------------

@router.get("/customers")
def customers_page(request: Request):
    user, redir = _auth(request)
    if redir:
        return redir
    return templates.TemplateResponse(
        request, "customers.html",
        {"user": user, "active_page": "customers"}
    )


@router.get("/transactions")
def transactions_page(request: Request):
    user, redir = _auth(request)
    if redir:
        return redir
    return templates.TemplateResponse(
        request, "transactions.html",
        {"user": user, "active_page": "transactions"}
    )


@router.get("/audit")
def audit_page(request: Request):
    user, redir = _auth(request)
    if redir:
        return redir
    return templates.TemplateResponse(
        request, "audit.html",
        {"user": user, "active_page": "audit"}
    )


@router.get("/staff")
def staff_page(request: Request):
    user, redir = _auth(request)
    if redir:
        return redir
    if user.get("role") not in ("manager", "superadmin"):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Manager access required.")
    return templates.TemplateResponse(
        request, "staff.html",
        {"user": user, "active_page": "staff"}
    )


@router.get("/reports")
def reports_page(request: Request):
    user, redir = _auth(request)
    if redir:
        return redir
    if user.get("role") not in ("manager", "superadmin"):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Manager access required.")
    return templates.TemplateResponse(
        request, "reports.html",
        {"user": user, "active_page": "reports"}
    )


@router.get("/alerts")
def alerts_page(request: Request):
    user, redir = _auth(request)
    if redir:
        return redir
    if user.get("role") not in ("manager", "superadmin"):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Manager access required.")
    return templates.TemplateResponse(
        request, "alerts.html",
        {"user": user, "active_page": "alerts"}
    )


@router.get("/settings")
def settings_page(request: Request):
    user, redir = _auth(request)
    if redir:
        return redir
    return templates.TemplateResponse(
        request, "settings.html",
        {"user": user, "active_page": "settings"}
    )


@router.get("/help")
def help_page(request: Request):
    user = get_current_user(request)
    return templates.TemplateResponse(
        request, "help.html",
        {"user": user, "active_page": "help"}
    )


@router.get("/staff/{user_id}")
def staff_profile_page(request: Request, user_id: int):
    user, redir = _auth(request)
    if redir:
        return redir
    # Only managers and superadmin can view staff profiles.
    if user.get("role") not in ("manager", "superadmin"):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Manager access required.")
    db = SessionLocal()
    try:
        staff_user = crud.get_staff_user_by_id(db, user_id)
    finally:
        db.close()
    if not staff_user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Staff user not found.")
    return templates.TemplateResponse(
        request, "staff_profile.html",
        {"user": user, "active_page": "staff", "staff_user": staff_user}
    )


@router.get("/customers/{customer_id}")
def customer_profile_page(request: Request, customer_id: int):
    user, redir = _auth(request)
    if redir:
        return redir
    db = SessionLocal()
    try:
        customer = crud.get_customer_by_id(db, customer_id)
    finally:
        db.close()
    if not customer:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Customer not found")
    return templates.TemplateResponse(
        request, "customer_profile.html",
        {"user": user, "active_page": "customers", "customer": customer}
    )
