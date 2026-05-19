"""
SecureBank — FastAPI application entry point.

I create and configure the FastAPI application here in five
steps:

1. Load environment variables from ``.env`` via load_dotenv.
2. Create all database tables through Base.metadata.create_all.
3. Seed demo staff users and customers on the very first start.
4. Register the rate-limiter, security-headers middleware,
   session middleware, and the static-file mount.
5. Include all route routers (pages, auth, api).

Required environment variables (see ``.env.example``):
    SESSION_SECRET_KEY — random hex string used to sign and
                         verify session cookies.  The app
                         will not start if this is missing.

Optional environment variables:
    HTTPS_ONLY — set to ``true`` in production to mark the
                 session cookie as ``Secure`` so it is only
                 sent over HTTPS connections.
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app import crud
from app.database import Base, SessionLocal, engine
from app.limiter import limiter
from app.routes import api, auth, pages

# Load .env into os.environ before any other code runs.
load_dotenv()

# Create all tables defined in models.py if they do not exist.
# Safe to call on every startup — it is a no-op for tables
# that are already present.
Base.metadata.create_all(bind=engine)

# Seed demo data once on first boot.  The seed functions check
# whether records already exist so they are idempotent.
db = SessionLocal()
try:
    crud.seed_default_staff_user(db)
    crud.seed_demo_customers_bulk(db)
finally:
    # Always close the startup session even if seeding raises.
    db.close()

app = FastAPI(title="SecureBank Core System")

# Attach the SlowAPI limiter to app state so the exception
# handler can read its configuration.
app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded, _rate_limit_exceeded_handler
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security response headers to every HTTP response.

    I inject the following headers on every response:

    Content-Security-Policy
        Restricts which origins scripts, styles, images, and
        fonts may be loaded from.  ``script-src 'self'`` means
        inline ``onclick=`` handlers are blocked — I use event
        delegation in app.js instead to comply with this policy.

    X-Frame-Options: DENY
        Prevents the app from being embedded in an iframe,
        blocking clickjacking attacks.

    X-Content-Type-Options: nosniff
        Stops browsers from MIME-sniffing responses away from
        the declared content type.

    Referrer-Policy
        Limits what URL information is sent in the Referer
        header when navigating away from the app.

    X-XSS-Protection
        Legacy header — modern browsers rely on CSP, but I
        keep this for older browser compatibility.
    """

    async def dispatch(
        self, request: Request, call_next
    ) -> Response:
        """Call the route handler then inject security headers."""
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = (
            "strict-origin-when-cross-origin"
        )
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "font-src 'self'; "
            "connect-src 'self';"
        )
        return response


# SecurityHeadersMiddleware must be added before SessionMiddleware
# so headers are present even on error responses.
app.add_middleware(SecurityHeadersMiddleware)

# Session cookie settings:
#   max_age=1200   — sessions expire after 20 minutes of
#                    inactivity (1 200 seconds).
#   same_site=lax  — the cookie is sent on top-level navigations
#                    but not on cross-site sub-resource requests,
#                    providing CSRF protection at the cookie level.
#   https_only     — True in production (HTTPS_ONLY=true in .env)
#                    so the cookie is never sent over plain HTTP.
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ["SESSION_SECRET_KEY"],
    max_age=60 * 20,
    same_site="lax",
    https_only=(
        os.environ.get("HTTPS_ONLY", "false").lower() == "true"
    ),
)

# Serve everything under app/static/ at the /static URL prefix.
app.mount(
    "/static",
    StaticFiles(directory="app/static"),
    name="static"
)

# Include route routers in dependency order:
#   pages  — HTML views (/, /login)
#   auth   — login, logout, CSRF token, /me
#   api    — all data endpoints
app.include_router(pages.router)
app.include_router(auth.router)
app.include_router(api.router)

# ---------------------------------------------------------------------------
# Custom error pages
# ---------------------------------------------------------------------------

_templates = Jinja2Templates(directory="app/templates")


@app.exception_handler(404)
async def not_found_handler(request: Request, _exc):
    """Render the custom 404 page, passing the session user if present."""
    user = request.session.get("user")
    return _templates.TemplateResponse(
        request, "errors/404.html",
        {"user": user, "active_page": None},
        status_code=404
    )


@app.exception_handler(403)
async def forbidden_handler(request: Request, exc):
    """Render the custom 403 page, passing the session user if present."""
    user = request.session.get("user")
    return _templates.TemplateResponse(
        request, "errors/403.html",
        {"user": user, "active_page": None},
        status_code=403
    )
