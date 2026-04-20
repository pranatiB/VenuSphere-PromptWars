"""Unit tests for event_service.py."""

import pytest
from unittest.mock import MagicMock
from services.event_service import (
    get_current_phase,
    get_schedule,
    get_upcoming_alerts,
    get_announcements,
    publish_announcement,
    advance_phase,
)
from utils.cache import clear_all


@pytest.fixture(autouse=True)
def clear_cache():
    clear_all()
    yield
    clear_all()


def _make_doc(data: dict) -> MagicMock:
    doc = MagicMock()
    doc.exists = True
    doc.to_dict.return_value = data
    return doc


def test_get_current_phase_returns_phase(mock_db):
    doc = _make_doc({"current_phase": "halftime"})
    mock_db.collection.return_value.limit.return_value.stream.return_value = iter([doc])
    phase = get_current_phase(mock_db)
    assert phase == "halftime"


def test_get_current_phase_default(mock_db):
    mock_db.collection.return_value.limit.return_value.stream.return_value = iter([])
    phase = get_current_phase(mock_db)
    assert phase == "pre_event"


def test_get_schedule_returns_data(mock_db):
    data = {"name": "Championship Final", "current_phase": "first_half", "phases": []}
    doc = _make_doc(data)
    mock_db.collection.return_value.limit.return_value.stream.return_value = iter([doc])
    result = get_schedule(mock_db)
    assert result["name"] == "Championship Final"


def test_get_upcoming_alerts_sorted_by_priority(mock_db):
    alert_docs = [
        MagicMock(**{"to_dict.return_value": {"phase": "halftime", "priority": "low", "title": "A"}}),
        MagicMock(**{"to_dict.return_value": {"phase": "halftime", "priority": "emergency", "title": "EVAC"}}),
        MagicMock(**{"to_dict.return_value": {"phase": "halftime", "priority": "high", "title": "B"}}),
        MagicMock(**{"to_dict.return_value": {"phase": "halftime", "priority": "medium", "title": "C"}}),
    ]
    mock_db.collection.return_value.where.return_value.stream.return_value = iter(alert_docs)
    alerts = get_upcoming_alerts("halftime", mock_db)
    priorities = [a["priority"] for a in alerts]
    assert priorities[0] == "emergency"
    assert priorities[1] == "high"

def test_get_announcements_returns_list(mock_db):
    ann_docs = [
        MagicMock(**{"to_dict.return_value": {"message": "Msg 1"}}),
        MagicMock(**{"to_dict.return_value": {"message": "Msg 2"}}),
    ]
    mock_db.collection.return_value.order_by.return_value.limit.return_value.stream.return_value = iter(ann_docs)
    result = get_announcements(mock_db, limit=2)
    assert len(result) == 2
    assert result[0]["message"] == "Msg 1"


def test_publish_announcement_creates_doc(mock_db):
    doc_ref = MagicMock()
    doc_ref.id = "ann_test_123"
    mock_db.collection.return_value.document.return_value = doc_ref
    result = publish_announcement("Test announcement", "high", mock_db)
    assert result == "ann_test_123"
    doc_ref.set.assert_called_once()


def test_advance_phase_moves_to_next(mock_db):
    doc = _make_doc({"current_phase": "first_half"})
    doc.reference = MagicMock()
    mock_db.collection.return_value.limit.return_value.stream.return_value = iter([doc])
    doc2 = _make_doc({"current_phase": "first_half"})
    doc2.reference = MagicMock()
    mock_db.collection.return_value.limit.return_value.stream.side_effect = [
        iter([doc2]),
        iter([doc2]),
    ]
    next_phase = advance_phase(mock_db)
    assert next_phase == "halftime"


# ── cache-hit branches (lines 21, 42, 49, 65) ──────────────────────────────────

def test_get_current_phase_cache_hit(mock_db):
    """Line 21: Second call must return cached result without hitting Firestore."""
    doc = _make_doc({"current_phase": "second_half"})
    mock_db.collection.return_value.limit.return_value.stream.return_value = iter([doc])
    first = get_current_phase(mock_db)
    # Reset stream so second call would fail if cache unused
    mock_db.collection.return_value.limit.return_value.stream.return_value = iter([])
    second = get_current_phase(mock_db)
    assert first == second == "second_half"


def test_get_schedule_cache_hit(mock_db):
    """Line 42: Second call to get_schedule must use cache."""
    data = {"name": "Eden Gardens Final", "current_phase": "halftime", "phases": []}
    doc = _make_doc(data)
    mock_db.collection.return_value.limit.return_value.stream.return_value = iter([doc])
    first = get_schedule(mock_db)
    mock_db.collection.return_value.limit.return_value.stream.return_value = iter([])
    second = get_schedule(mock_db)
    assert first == second
    assert first["name"] == "Eden Gardens Final"


def test_get_schedule_default_fallback(mock_db):
    """Line 49: Empty Firestore → default schedule dict returned."""
    mock_db.collection.return_value.limit.return_value.stream.return_value = iter([])
    result = get_schedule(mock_db)
    assert result["current_phase"] == "pre_event"
    assert result["phases"] == []


def test_get_upcoming_alerts_cache_hit(mock_db):
    """Line 65: Second call to get_upcoming_alerts uses cache."""
    alert_docs = [
        MagicMock(**{"to_dict.return_value": {"priority": "high", "title": "Surge"}}),
    ]
    mock_db.collection.return_value.where.return_value.stream.return_value = iter(alert_docs)
    first = get_upcoming_alerts("halftime", mock_db)
    mock_db.collection.return_value.where.return_value.stream.return_value = iter([])
    second = get_upcoming_alerts("halftime", mock_db)
    assert first == second
    assert len(second) == 1


def test_advance_phase_at_last_phase_stays(mock_db):
    """advance_phase on post_event (last) must stay at post_event."""
    doc = _make_doc({"current_phase": "post_event"})
    doc.reference = MagicMock()
    mock_db.collection.return_value.limit.return_value.stream.side_effect = [
        iter([doc]),
        iter([doc]),
    ]
    result = advance_phase(mock_db)
    assert result == "post_event"


def test_advance_phase_unknown_phase_defaults_to_second(mock_db):
    """Unknown phase string handled gracefully (idx=0 → first_half)."""
    doc = _make_doc({"current_phase": "unknown_phase"})
    doc.reference = MagicMock()
    mock_db.collection.return_value.limit.return_value.stream.side_effect = [
        iter([doc]),
        iter([doc]),
    ]
    result = advance_phase(mock_db)
    assert result == "first_half"

