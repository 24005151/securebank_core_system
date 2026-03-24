from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

router = APIRouter(tags=["Pages"])
templates = Jinja2Templates(directory="app/templates")


def get_current_user(request: Request):
    return request.session.get("user")


@router.get("/")
def home(request: Request):
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login", status_code=303)

    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "user": user
        }
    )


@router.get("/dashboard")
def dashboard(request: Request):
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login", status_code=303)

    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "user": user
        }
    )


@router.get("/login")
def login_page(request: Request):
    user = get_current_user(request)
    if user:
        return RedirectResponse(url="/", status_code=303)

    return templates.TemplateResponse(
        request,
        "login.html",
        {}
    )