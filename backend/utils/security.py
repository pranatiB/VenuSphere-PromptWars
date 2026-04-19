"""Security utilities: token validation, input sanitization, and rate limiting."""

import hashlib
import html
import re
import time
from typing import Optional

import firebase_admin
from firebase_admin import auth


_RATE_LIMIT_STORE: dict[str, list[float]] = {}
_RATE_LIMIT_WINDOW_SECONDS = 60
_RATE_LIMIT_MAX_REQUESTS = 30
_MAX_INPUT_LENGTH = 2000
_ALLOWED_CHARS_PATTERN = re.compile(r"[^\w\s.,!?@#\-'\"():;/]", re.UNICODE)


def validate_firebase_token(id_token: str) -> Optional[str]:
    """Validate a Firebase ID token and return the UID or None.

    Args:
        id_token: Raw Firebase Auth ID token from Authorization header.

    Returns:
        The verified user UID, or None if the token is invalid.
    """
    if not id_token or len(id_token) < 10:
        return None
    try:
        decoded = auth.verify_id_token(id_token)
        return decoded.get("uid")
    except (auth.InvalidIdTokenError, auth.ExpiredIdTokenError,
            ValueError, Exception):
        return None


def extract_bearer_token(authorization_header: str) -> Optional[str]:
    """Extract the Bearer token from an Authorization header.

    Args:
        authorization_header: The value of the HTTP Authorization header.

    Returns:
        The token string, or None if not a valid Bearer header.
    """
    if not authorization_header or not authorization_header.startswith("Bearer "):
        return None
    token = authorization_header[7:].strip()
    return token if token else None


def sanitize_input(text: str, max_len: int = _MAX_INPUT_LENGTH) -> str:
    """Sanitize user-provided text: strip HTML, limit length, escape entities.

    Args:
        text: Raw user input string.
        max_len: Maximum allowed character length (default 2000).

    Returns:
        Sanitized, HTML-escaped string safe for storage and display.
    """
    if not isinstance(text, str):
        return ""
    text = text.strip()[:max_len]
    text = html.escape(text, quote=True)
    return text


def check_rate_limit(uid: str) -> bool:
    """Check if a user has exceeded the request rate limit.

    Enforces a sliding window of 30 requests per 60 seconds per user.

    Args:
        uid: Firebase Auth user ID.

    Returns:
        True if the request is allowed, False if rate limit exceeded.
    """
    now = time.time()
    window_start = now - _RATE_LIMIT_WINDOW_SECONDS

    if uid not in _RATE_LIMIT_STORE:
        _RATE_LIMIT_STORE[uid] = []

    calls = _RATE_LIMIT_STORE[uid]
    calls[:] = [t for t in calls if t > window_start]

    if len(calls) >= _RATE_LIMIT_MAX_REQUESTS:
        return False

    calls.append(now)
    return True


def hash_uid(uid: str) -> str:
    """Create a one-way hash of a UID for anonymous logging.

    Args:
        uid: Firebase Auth user ID.

    Returns:
        SHA-256 hex digest of the UID (first 16 chars for brevity).
    """
    return hashlib.sha256(uid.encode()).hexdigest()[:16]
