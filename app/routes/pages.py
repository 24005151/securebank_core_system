"""
SecureBank — HTML page routes.

I serve the three browser-facing views here:

GET /          — main dashboard (redirects to /login if no
                 active session).
GET /dashboard — alias for / so bookmarked links still work.
GET /login     — login page (redirects to / if already signed in).

Template rendering is handled by Jinja2.  I pass the ``user``
dict from the session so the base template can show the logged-in
username, role, and conditionally render manager-only sections.
"""

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

router = APIRouter(tags=["Pages"])

# I point Jinja2 at the templates directory relative to where
# uvicorn is started (the project root), not relative to this
# file.  Always start the server from the project root.
templates = Jinja2Templates(directory="app/templates")


def get_current_user(request: Request):
    """Return the session user dict, or None if not logged in."""
    return request.session.get("user")


@router.get("/")
def home(request: Request):
    """Serve the main dashboard to authenticated users.

    I redirect unauthenticated requests to the login page
    using a 303 See Other so the browser switches to GET even
    if the original request was a POST.
    """
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login", status_code=303)

    return templates.TemplateResponse(
        request,
        "index.html",
        {"user": user}
    )


@router.get("/dashboard")
def dashboard(request: Request):
    """Alias for the home route.

    I keep this so that links and bookmarks to /dashboard
    continue to work after any future URL restructuring.
    """
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login", status_code=303)

    return templates.TemplateResponse(
        request,
        "index.html",
        {"user": user}
    )


@router.get("/login")
def login_page(request: Request):
    """Serve the login page to unauthenticated users.

    I redirect users who already have an active session to the
    dashboard so they are not prompted to log in again.
    """
    user = get_current_user(request)
    if user:
        return RedirectResponse(url="/", status_code=303)

    return templates.TemplateResponse(
        request,
        "login.html",
        {}
    )
