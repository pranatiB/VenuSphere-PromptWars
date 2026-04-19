"""Analytics service: structured event logging via Cloud Logging.

All log records are emitted as JSON so Cloud Logging auto-parses them into
labelled fields (visible in Log Explorer and usable in log-based metrics).

Log types
---------
log_event          — user interaction (crowd view, chat, checkin, navigate …)
log_api_error      — unexpected server-side exceptions
log_security_event — token failures, rate-limit hits, abuse attempts
log_performance    — latency timing for expensive operations
log_crowd_prediction — AI prediction output with confidence metadata
"""

import logging
import json
import time
from typing import Any


_logger = logging.getLogger("venusphere")
_logger.setLevel(logging.INFO)

# Ensure a handler exists when running outside Cloud Run
# (unit-test / local dev).  Cloud Run injects its own handler automatically.
if not _logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(_handler)


def _emit(level: int, payload: dict[str, Any]) -> None:
    """Serialise payload as a single-line JSON record and emit at *level*."""
    _logger.log(level, json.dumps(payload, default=str))


# ── Public API ─────────────────────────────────────────────────────────────────


def log_event(uid_hash: str, event_type: str, metadata: dict[str, Any]) -> None:
    """Log a structured analytics event to Cloud Logging.

    Args:
        uid_hash: Anonymised user identifier (SHA-256 prefix).
        event_type: Event category (e.g. 'chat', 'checkin', 'navigate').
        metadata: Additional context fields for the event.
    """
    _emit(logging.INFO, {
        "type": "event",
        "uid_hash": uid_hash,
        "event_type": event_type,
        "metadata": metadata,
    })


def log_api_error(endpoint: str, error: str, status_code: int) -> None:
    """Log an API error with context for debugging and alerting.

    Args:
        endpoint: The request path that triggered the error.
        error: Error description or exception message.
        status_code: HTTP status code returned.
    """
    _emit(logging.ERROR, {
        "type": "api_error",
        "endpoint": endpoint,
        "error": error,
        "status_code": status_code,
    })


def log_security_event(uid_hash: str, event: str, detail: str) -> None:
    """Log a security-related event (rate limit, invalid token, etc.) for audit.

    Args:
        uid_hash: Anonymised user identifier.
        event: Security event type (e.g. 'rate_limit_exceeded', 'invalid_token').
        detail: Additional context string (endpoint or payload description).
    """
    _emit(logging.WARNING, {
        "type": "security",
        "uid_hash": uid_hash,
        "event": event,
        "detail": detail,
    })


def log_performance(operation: str, duration_ms: float, metadata: dict[str, Any] | None = None) -> None:
    """Log operation latency for performance monitoring.

    Intended for wrapping expensive operations: Gemini calls, Firestore reads,
    Translate API calls.  Cloud Logging metric alerts can fire on this stream.

    Args:
        operation: Human-readable operation name (e.g. 'gemini_chat', 'translate').
        duration_ms: Wall-clock duration in milliseconds.
        metadata: Optional extra fields (model name, token count, …).
    """
    _emit(logging.INFO, {
        "type": "performance",
        "operation": operation,
        "duration_ms": round(duration_ms, 2),
        "metadata": metadata or {},
    })


def log_crowd_prediction(
    zone_id: str,
    phase: str,
    minutes_ahead: int,
    predicted_density: float,
    confidence: float,
) -> None:
    """Log an AI crowd-density prediction for audit and model drift analysis.

    Args:
        zone_id: Venue zone identifier.
        phase: Current event phase.
        minutes_ahead: How far ahead the prediction looks.
        predicted_density: Predicted crowd density [0, 1].
        confidence: Model confidence score [0, 1].
    """
    _emit(logging.INFO, {
        "type": "crowd_prediction",
        "zone_id": zone_id,
        "phase": phase,
        "minutes_ahead": minutes_ahead,
        "predicted_density": round(predicted_density, 3),
        "confidence": round(confidence, 3),
    })


# ── Timing context manager helper ──────────────────────────────────────────────


class timed:  # pylint: disable=invalid-name
    """Context manager that measures wall-clock time and calls log_performance.

    Usage::

        with timed("gemini_chat", {"model": "gemini-1.5-flash"}):
            response = model.generate_content(prompt)
    """

    def __init__(self, operation: str, metadata: dict[str, Any] | None = None):
        self.operation = operation
        self.metadata = metadata or {}
        self._start: float = 0.0

    def __enter__(self):
        self._start = time.perf_counter()
        return self

    def __exit__(self, *_):
        duration_ms = (time.perf_counter() - self._start) * 1000
        log_performance(self.operation, duration_ms, self.metadata)
