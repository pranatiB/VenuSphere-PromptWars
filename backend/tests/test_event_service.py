"""Unit tests for event_service.py."""

import pytest
from unittest.mock import MagicMock
from services.event_service import (
    get_current_phase,
    get_schedule,
    get_upcoming_alerts,
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
        MagicMock(**{"to_dict.return_value": {"phase": "halftime", "priority": "high", "title": "B"}}),
        MagicMock(**{"to_dict.return_value": {"phase": "halftime", "priority": "medium", "title": "C"}}),
    ]
    mock_db.collection.return_value.where.return_value.stream.return_value = iter(alert_docs)
    alerts = get_upcoming_alerts("halftime", mock_db)
    priorities = [a["priority"] for a in alerts]
    assert priorities[0] == "high"


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
    with pytest.raises(Exception):
        pass
    doc2 = _make_doc({"current_phase": "first_half"})
    doc2.reference = MagicMock()
    mock_db.collection.return_value.limit.return_value.stream.side_effect = [
        iter([doc2]),
        iter([doc2]),
    ]
    next_phase = advance_phase(mock_db)
    assert next_phase == "halftime"
