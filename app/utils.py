"""
SecureBank — shared request utilities.

Small shared helpers used across multiple route modules.
"""

from fastapi import Request


def get_client_ip(request: Request) -> str:
    """Return the connecting client's IP address.

    Reads only ``request.client.host`` and ignores
    ``X-Forwarded-For``, ``X-Real-IP``, and similar headers.
    Reading forwarded headers without validating the full proxy
    chain allows an attacker to spoof their IP and bypass rate
    limits.

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
