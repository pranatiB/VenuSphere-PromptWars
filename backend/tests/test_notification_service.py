"""Tests for notification service."""

import pytest
from unittest.mock import MagicMock
from services.notification_service import check_queue_subscriptions, _deliver_in_app_notification, broadcast_announcement


@pytest.fixture
def mock_db():
    return MagicMock()


def test_check_queue_subscriptions_normal(mock_db, monkeypatch):
    mock_user_doc = MagicMock()
    mock_user_doc.id = "user123"
    mock_db.collection.return_value.stream.return_value = [mock_user_doc]

    mock_sub = MagicMock()
    mock_sub.to_dict.return_value = {"stall_id": "food_1", "threshold_minutes": 10}
    
    mock_db.collection.return_value.document.return_value.collection.return_value.where.return_value.stream.return_value = [mock_sub]

    mock_get_queue = MagicMock(return_value={"wait_minutes": 5})
    monkeypatch.setattr("services.notification_service.get_queue_time", mock_get_queue)
    monkeypatch.setattr("services.notification_service._deliver_in_app_notification", MagicMock())

    count = check_queue_subscriptions("first_half", mock_db)
    assert count == 1
    mock_sub.reference.update.assert_called_once_with({"active": False})


def test_check_queue_subscriptions_no_trigger(mock_db, monkeypatch):
    mock_user_doc = MagicMock()
    mock_user_doc.id = "user123"
    mock_db.collection.return_value.stream.return_value = [mock_user_doc]

    mock_sub = MagicMock()
    mock_sub.to_dict.return_value = {"stall_id": "food_1", "threshold_minutes": 5}
    
    mock_db.collection.return_value.document.return_value.collection.return_value.where.return_value.stream.return_value = [mock_sub]

    mock_get_queue = MagicMock(return_value={"wait_minutes": 15}) # over threshold
    monkeypatch.setattr("services.notification_service.get_queue_time", mock_get_queue)

    count = check_queue_subscriptions("first_half", mock_db)
    assert count == 0


def test_deliver_in_app_notification(mock_db):
    _deliver_in_app_notification("uid1", "Test Title", "Test Body", mock_db)
    mock_db.collection.return_value.document.return_value.collection.return_value.add.assert_called_once()


def test_broadcast_announcement(mock_db, monkeypatch):
    # Depending on how broadcast_announcement is implemented now (delegates to event_service)
    # We should mock it to prove it works.
    mock_publish = MagicMock(return_value="ann123")
    monkeypatch.setattr("services.event_service.publish_announcement", mock_publish)
    
    doc_id = broadcast_announcement("Emergency", "high", mock_db)
    assert doc_id == "ann123"
    mock_publish.assert_called_once()
