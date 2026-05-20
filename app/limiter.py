"""
SecureBank — rate-limiter singleton.

The SlowAPI ``Limiter`` instance lives in its own module to
avoid circular imports.  Both ``main.py`` (which registers it
on the FastAPI app) and ``auth.py`` (which applies the
``@limiter.limit`` decorator) import from here.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Keyed by the direct remote IP address.
# X-Forwarded-For and similar proxy headers are intentionally
# ignored to prevent IP-spoofing bypass in environments that
# do not sit behind a trusted, correctly configured proxy.
limiter = Limiter(key_func=get_remote_address)
