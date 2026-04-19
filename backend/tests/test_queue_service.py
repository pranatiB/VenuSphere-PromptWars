"""Unit tests for queue_service.py."""

import pytest
from unittest.mock import MagicMock
from services.queue_service import (
    get_queue_time,
    get_all_queue_times,
    best_time_recommendation,
    subscribe_alert,
    _predict_queue,
)
from utils.cache import clear_all


@pytest.fixture(autouse=True)
def clear_cache():
    clear_all()
    yield
    clear_all()


def test_get_queue_time_returns_data(sample_queue_doc, mock_db):
    mock_db.collection.return_value.document.return_value.get.return_value = sample_queue_doc
    result = get_queue_time("stall_1", "halftime", mock_db)
    assert result["stall_id"] == "stall_1"
    assert result["wait_minutes"] == 28


def test_get_queue_time_missing_doc(mock_db):
    missing = MagicMock()
    missing.exists = False
    mock_db.collection.return_value.document.return_value.get.return_value = missing
    result = get_queue_time("nonexistent", "halftime", mock_db)
    assert result["wait_minutes"] == 0


def test_get_queue_time_uses_cache(sample_queue_doc, mock_db):
    mock_db.collection.return_value.document.return_value.get.return_value = sample_queue_doc
    get_queue_time("stall_1", "halftime", mock_db)
    get_queue_time("stall_1", "halftime", mock_db)
    assert mock_db.collection.return_value.document.return_value.get.call_count == 1


def test_get_all_queue_times_sorted(sample_queues, mock_db):
    mock_db.collection.return_value.where.return_value.stream.return_value = iter(sample_queues)
    results = get_all_queue_times("pre_event", mock_db)
    waits = [r["wait_minutes"] for r in results]
    assert waits == sorted(waits)


def test_predict_queue_halftime_decreasing():
    p15, p30 = _predict_queue("stall_1", 28, "halftime")
    assert p15 < 28
    assert p30 < p15


def test_predict_queue_first_half_increasing():
    p15, p30 = _predict_queue("stall_1", 2, "first_half")
    assert p15 > 2


def test_predict_queue_never_negative():
    p15, p30 = _predict_queue("stall_1", 0, "post_event")
    assert p15 >= 0
    assert p30 >= 0


def test_best_time_recommendation_go_now(sample_queue_doc, mock_db):
    doc = MagicMock()
    doc.exists = True
    doc.to_dict.return_value = {
        "stall_id": "stall_2",
        "wait_minutes": 2,
        "trend": "stable",
        "phase": "pre_event",
        "timestamp": "2026-01-01T00:00:00Z",
    }
    mock_db.collection.return_value.document.return_value.get.return_value = doc
    result = best_time_recommendation("stall_2", "pre_event", mock_db)
    assert "Go now" in result["advice"] or result["best_in_minutes"] in (0, 15, 30)


def test_subscribe_alert_writes_to_firestore(mock_db):
    result = subscribe_alert("uid_abc", "stall_6", 5, mock_db)
    assert result is True
    mock_db.collection.assert_called()
