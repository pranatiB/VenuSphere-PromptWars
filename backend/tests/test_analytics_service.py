"""Unit tests for analytics_service.py — targets 100% branch coverage."""

import logging
from services.analytics_service import log_event, log_api_error, log_security_event


# ── log_event ──────────────────────────────────────────────────────────────────

def test_log_event_normal(caplog):
    with caplog.at_level(logging.INFO, logger="venusphere"):
        log_event("abc123", "checkin", {"zone_id": "gate_north"})
    assert "checkin" in caplog.text


def test_log_event_none_uid(caplog):
    """log_event must not raise even when uid_hash is None."""
    with caplog.at_level(logging.INFO, logger="venusphere"):
        log_event(None, "click_button", {"button_id": "nav_queue"})
    assert "click_button" in caplog.text


def test_log_event_empty_metadata(caplog):
    with caplog.at_level(logging.INFO, logger="venusphere"):
        log_event("uid1", "page_view", {})
    assert "page_view" in caplog.text


def test_log_event_non_serializable_payload(caplog):
    """Payload containing sets or custom types must still log via default=str."""
    with caplog.at_level(logging.INFO, logger="venusphere"):
        log_event("uid1", "weird_action", {"data": set([1, 2, 3])})
    assert "weird_action" in caplog.text


# ── log_api_error ──────────────────────────────────────────────────────────────

def test_log_api_error_500(caplog):
    with caplog.at_level(logging.ERROR, logger="venusphere"):
        log_api_error("/api/chat", "Internal error", 500)
    assert "api_error" in caplog.text
    assert "500" in caplog.text


def test_log_api_error_400(caplog):
    with caplog.at_level(logging.ERROR, logger="venusphere"):
        log_api_error("/api/checkin", "zone_id missing", 400)
    assert "/api/checkin" in caplog.text


def test_log_api_error_very_long_path(caplog):
    with caplog.at_level(logging.ERROR, logger="venusphere"):
        log_api_error("/api/" * 200, "overflow", 400)
    # Must not raise even with huge path
    assert "api_error" in caplog.text


# ── log_security_event (lines 53-59 — previously 0% covered) ──────────────────

def test_log_security_event_invalid_token(caplog):
    """Exercise log_security_event — the previously uncovered lines 53-59."""
    with caplog.at_level(logging.WARNING, logger="venusphere"):
        log_security_event("unknown", "invalid_token", "/api/crowd")
    assert "security" in caplog.text
    assert "invalid_token" in caplog.text


def test_log_security_event_rate_limit(caplog):
    with caplog.at_level(logging.WARNING, logger="venusphere"):
        log_security_event("abc123", "rate_limit_exceeded", "/api/chat")
    assert "rate_limit_exceeded" in caplog.text


def test_log_security_event_none_values(caplog):
    """None values must not cause a crash."""
    with caplog.at_level(logging.WARNING, logger="venusphere"):
        log_security_event(None, None, None)
    assert "security" in caplog.text
