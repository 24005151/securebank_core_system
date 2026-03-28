from fastapi import Header, HTTPException, Request, status

API_KEY = "Devilcat1988"
API_KEY_HEADER_NAME = "X-API-Key"


def require_session_or_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias=API_KEY_HEADER_NAME)
):
    user = request.session.get("user")

    if user:
        return {"auth_type": "session", "user": user}

    if x_api_key == API_KEY:
        return {"auth_type": "api_key", "user": None}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated. Provide a valid session or API key."
    )


def require_manager_or_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias=API_KEY_HEADER_NAME)
):
    user = request.session.get("user")

    if user and user.get("role") == "manager":
        return {"auth_type": "session", "user": user}

    if x_api_key == API_KEY:
        return {"auth_type": "api_key", "user": None}

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Manager access or valid API key required."
    )