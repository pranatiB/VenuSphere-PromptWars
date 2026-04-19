"""Unit tests for assistant_service.py."""

import pytest
from unittest.mock import MagicMock, patch
from services.assistant_service import (
    _detect_action_type,
    _fallback_response,
    _build_venue_context,
)
from utils.cache import clear_all


@pytest.fixture(autouse=True)
def clear_cache():
    clear_all()
    yield
    clear_all()


def test_detect_action_type_with_valid_json():
    text = 'Head to Stall 2. <action>{"type": "navigate", "stall_id": "stall_2"}</action>'
    action_type, payload = _detect_action_type(text)
    assert action_type == "navigate"
    assert payload["stall_id"] == "stall_2"


def test_detect_action_type_no_tag():
    text = "The queue at Stall 2 is 3 minutes long."
    action_type, payload = _detect_action_type(text)
    assert action_type is None
    assert payload is None


def test_detect_action_type_malformed_json():
    text = "Try this. <action>{invalid json}</action>"
    action_type, payload = _detect_action_type(text)
    assert action_type is None
    assert payload is None


def test_fallback_food_query(mock_db, sample_queues):
    mock_db.collection.return_value.where.return_value.stream.return_value = iter(sample_queues)
    response = _fallback_response("Where should I eat?", "pre_event", mock_db)
    assert "stall" in response.lower() or "queue" in response.lower() or "food" in response.lower()


def test_fallback_restroom_query(mock_db, sample_queues):
    mock_db.collection.return_value.where.return_value.stream.return_value = iter(sample_queues)
    response = _fallback_response("I need a restroom", "pre_event", mock_db)
    assert "restroom" in response.lower() or "wait" in response.lower()


def test_fallback_exit_query(mock_db, sample_queues):
    mock_db.collection.return_value.where.return_value.stream.return_value = iter(sample_queues)
    response = _fallback_response("How do I exit?", "post_event", mock_db)
    assert "gate" in response.lower() or "exit" in response.lower()


def test_fallback_generic_query(mock_db, sample_queues):
    mock_db.collection.return_value.where.return_value.stream.return_value = iter(sample_queues)
    response = _fallback_response("Tell me about the weather", "pre_event", mock_db)
    assert len(response) > 0


def test_build_venue_context_contains_phase(mock_db, sample_zones, sample_queues):
    mock_db.collection.return_value.where.return_value.stream.return_value = iter(sample_zones + sample_queues)
    ctx = _build_venue_context("halftime", mock_db)
    assert "halftime" in ctx
