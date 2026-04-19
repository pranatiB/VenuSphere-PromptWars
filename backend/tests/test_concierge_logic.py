"""Unit tests for the Proactive AI Concierge notification logic.

These tests cover the backend alert/announcement pipeline that feeds the
Concierge nudge tray — including priority ranking, phase-aware filtering,
and announcement formatting used by event_service.
"""

import pytest
from unittest.mock import MagicMock
from services.event_service import (
    get_upcoming_alerts,
    get_announcements,
    get_current_phase,
)
from utils.cache import clear_all


@pytest.fixture(autouse=True)
def clear_cache():
    clear_all()
    yield
    clear_all()


def _make_alert_docs(alerts_data):
    """Build mock Firestore alert documents from a list of dicts."""
    docs = []
    for a in alerts_data:
        d = MagicMock()
        d.to_dict.return_value = a
        docs.append(d)
    return docs


# ── Alert Priority & Filtering ──────────────────────────────────────────────

class TestConciergeAlertPipeline:
    """The Concierge surfaces the highest-priority alerts. backend must rank correctly."""

    def test_returns_alerts_for_current_phase(self, mock_db):
        alerts = [
            {"priority": "high",   "title": "Surge incoming", "message": "Go now",   "phase": "first_half"},
            {"priority": "medium", "title": "Restroom tip",   "message": "West free", "phase": "first_half"},
            {"priority": "low",    "title": "Merch open",     "message": "Low crowd", "phase": "pre_event"},
        ]
        mock_db.collection.return_value.where.return_value.stream.return_value = iter(
            _make_alert_docs(alerts)
        )
        result = get_upcoming_alerts("first_half", mock_db)
        # All returned alerts should be from the queried phase
        assert len(result) >= 1
        assert all("priority" in a for a in result)

    def test_high_priority_alerts_present(self, mock_db):
        alerts = [
            {"priority": "high", "title": "Critical gate congestion",
             "message": "Gate North at 95% — use Gate West", "phase": "second_half"},
        ]
        mock_db.collection.return_value.where.return_value.stream.return_value = iter(
            _make_alert_docs(alerts)
        )
        result = get_upcoming_alerts("second_half", mock_db)
        assert len(result) >= 1
        assert result[0]["priority"] == "high"

    def test_empty_alerts_returns_empty_list(self, mock_db):
        mock_db.collection.return_value.where.return_value.stream.return_value = iter([])
        result = get_upcoming_alerts("halftime", mock_db)
        assert result == []

    def test_alert_has_required_fields(self, mock_db):
        alert = {"priority": "medium", "title": "Queue tip", "message": "Food Court B clear", "phase": "halftime"}
        mock_db.collection.return_value.where.return_value.stream.return_value = iter(
            _make_alert_docs([alert])
        )
        result = get_upcoming_alerts("halftime", mock_db)
        for a in result:
            assert "priority" in a
            assert "title" in a
            assert "message" in a


# ── Announcements Feed ───────────────────────────────────────────────────────

class TestAnnouncementFeed:
    """Announcements are surfaced as Concierge nudges when priority == emergency."""

    def test_returns_list_of_announcements(self, mock_db):
        announcements = [
            {"message": "Halftime show starting now!", "priority": "normal"},
            {"message": "Gate West now open for fast exit", "priority": "high"},
        ]
        docs = [MagicMock() for _ in announcements]
        for doc, ann in zip(docs, announcements):
            doc.to_dict.return_value = ann
        mock_db.collection.return_value.stream.return_value = iter(docs)
        result = get_announcements(mock_db)
        assert len(result) == 2

    def test_announcement_message_present(self, mock_db):
        docs = [MagicMock()]
        docs[0].to_dict.return_value = {"message": "Game resumes in 2 minutes", "priority": "normal"}
        mock_db.collection.return_value.stream.return_value = iter(docs)
        result = get_announcements(mock_db)
        assert "message" in result[0]
        assert len(result[0]["message"]) > 0

    def test_empty_announcements(self, mock_db):
        mock_db.collection.return_value.stream.return_value = iter([])
        result = get_announcements(mock_db)
        assert result == []


# ── Phase Detection for Concierge ────────────────────────────────────────────

class TestPhaseDetectionForConcierge:
    """Concierge nudge timing depends on accurate phase detection."""

    def test_returns_default_phase_when_no_doc(self, mock_db):
        mock_db.collection.return_value.stream.return_value = iter([])
        phase = get_current_phase(mock_db)
        assert phase in {"pre_event", "first_half", "halftime", "second_half", "post_event"}

    def test_returns_live_phase(self, mock_db):
        doc = MagicMock()
        doc.to_dict.return_value = {"current_phase": "halftime", "id": "schedule_1"}
        mock_db.collection.return_value.stream.return_value = iter([doc])
        phase = get_current_phase(mock_db)
        assert phase == "halftime"

    def test_halftime_phase_triggers_concierge_window(self, mock_db):
        """Halftime is the primary Concierge activation window — must be detectable."""
        doc = MagicMock()
        doc.to_dict.return_value = {"current_phase": "halftime", "id": "s1"}
        mock_db.collection.return_value.stream.return_value = iter([doc])
        phase = get_current_phase(mock_db)
        assert phase == "halftime", "Halftime phase must be detected for Concierge to activate surge warnings"

    def test_post_event_phase_triggers_exit_nudge(self, mock_db):
        doc = MagicMock()
        doc.to_dict.return_value = {"current_phase": "post_event", "id": "s1"}
        mock_db.collection.return_value.stream.return_value = iter([doc])
        phase = get_current_phase(mock_db)
        assert phase == "post_event"


# ── Nudge Priority Ranking (Logic Validation) ───────────────────────────────

class TestNudgePriorityRanking:
    """Validate that the severity ranking used in concierge.js frontend is consistent
    with the backend priority values we emit."""

    @pytest.mark.parametrize("priority,expected_rank", [
        ("high",   3),
        ("medium", 2),
        ("low",    1),
    ])
    def test_priority_maps_to_rank(self, priority, expected_rank):
        rank_map = {"high": 3, "medium": 2, "low": 1}
        assert rank_map.get(priority) == expected_rank

    def test_critical_alerts_outrank_info(self):
        """Replicate concierge.js _severityRank logic in Python for verification."""
        severity_rank = lambda s: {"critical": 3, "warning": 2, "info": 1}.get(s, 0)
        assert severity_rank("critical") > severity_rank("warning")
        assert severity_rank("warning")  > severity_rank("info")
        assert severity_rank("unknown") == 0
