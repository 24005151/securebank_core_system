"""
SecureBank — shared request utilities.

I keep small helpers that are needed across multiple route
modules here so they are not duplicated in every file.
"""

from fastapi import Request


def get_client_ip(request: Request) -> str:
    """Return the connecting client's IP address.

    I deliberately read only ``request.client.host`` and
    ignore ``X-Forwarded-For``, ``X-Real-IP``, and similar
    headers.  Reading forwarded headers without first
    validating the full proxy chain allows an attacker to
    spoof their IP and bypass rate limits.

    In production behind a single trusted load balancer,
    replace this with a check of the first entry in
    ``X-Forwarded-For`` after verifying the request
    genuinely came through that proxy.

    Returns:
        The peer IP string, or ``"unknown"`` if the ASGI
        server did not populate ``request.client``.
    """
    if request.client:
        return request.client.host
    return "unknown"
