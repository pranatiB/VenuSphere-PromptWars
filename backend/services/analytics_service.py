"""Analytics service: structured event logging via Cloud Logging."""

import logging
import json
from typing import Any


_logger = logging.getLogger("venusphere")
_logger.setLevel(logging.INFO)


def log_event(uid_hash: str, event_type: str, metadata: dict[str, Any]) -> None:
    """Log a structured analytics event to Cloud Logging.

    Args:
        uid_hash: Anonymised user identifier (SHA-256 prefix).
        event_type: Event category (e.g. 'chat', 'checkin', 'navigate').
        metadata: Additional context fields for the event.
    """
    payload = {
        "uid_hash": uid_hash,
        "event_type": event_type,
        "metadata": metadata,
    }
    _logger.info(json.dumps(payload))


def log_api_error(endpoint: str, error: str, status_code: int) -> None:
    """Log an API error with context for debugging and alerting.

    Args:
        endpoint: The request path that triggered the error.
        error: Error description or exception message.
        status_code: HTTP status code returned.
    """
    payload = {
        "type": "api_error",
        "endpoint": endpoint,
        "error": error,
        "status_code": status_code,
    }
    _logger.error(json.dumps(payload))


def log_security_event(uid_hash: str, event: str, detail: str) -> None:
    """Log a security-related event (rate limit, invalid token, etc.) for audit.

    Args:
        uid_hash: Anonymised user identifier.
        event: Security event type (e.g. 'rate_limit_exceeded', 'invalid_token').
        detail: Additional context string.
    """
    payload = {
        "type": "security",
        "uid_hash": uid_hash,
        "event": event,
        "detail": detail,
    }
    _logger.warning(json.dumps(payload))
