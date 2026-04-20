"""Unit tests for assistant_service.py — targets >95% branch coverage.

The Vertex AI `chat()` happy path is covered by patching `vertexai` and
`GenerativeModel` so the live import block (lines 132-170) is exercised.
The fallback path (lines 172-180, 211) is covered by making the patch raise.
Private helpers _load_session_history (35-50) and _save_message (62) are
exercised via their own dedicated tests.
"""

import pytest
from unittest.mock import MagicMock, patch, call
from services.assistant_service import (
    _detect_action_type,
    _fallback_response,
    _build_venue_context,
    _load_session_history,
    _save_message,
    chat,
)
from utils.cache import clear_all


@pytest.fixture(autouse=True)
def clear_cache():
    clear_all()
    yield
    clear_all()


# ── _detect_action_type ────────────────────────────────────────────────────────

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


def test_detect_action_type_no_type_key():
    """Payload without 'type' key should default to 'info'."""
    text = '<action>{"stall_id": "stall_3"}</action>'
    action_type, payload = _detect_action_type(text)
    assert action_type == "info"
    assert payload["stall_id"] == "stall_3"


# ── _load_session_history (lines 35-50) ───────────────────────────────────────

def test_load_session_history_with_messages(mock_db):
    """Cover lines 35-50: Firestore doc iteration in history loader."""
    msg1 = MagicMock()
    msg1.to_dict.return_value = {"role": "user", "content": "Hello"}
    msg2 = MagicMock()
    msg2.to_dict.return_value = {"role": "assistant", "content": "Hi there!"}

    (mock_db.collection.return_value
     .document.return_value
     .collection.return_value
     .order_by.return_value
     .limit.return_value
     .stream.return_value) = iter([msg1, msg2])

    history = _load_session_history("uid1", "sess1", mock_db)
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert history[1]["content"] == "Hi there!"


def test_load_session_history_empty(mock_db):
    """Empty chat history returns empty list."""
    (mock_db.collection.return_value
     .document.return_value
     .collection.return_value
     .order_by.return_value
     .limit.return_value
     .stream.return_value) = iter([])

    history = _load_session_history("uid1", "sess1", mock_db)
    assert history == []


def test_load_session_history_missing_role_defaults_to_user(mock_db):
    """Doc without 'role' key should default to 'user'."""
    msg = MagicMock()
    msg.to_dict.return_value = {"content": "No role here"}
    (mock_db.collection.return_value
     .document.return_value
     .collection.return_value
     .order_by.return_value
     .limit.return_value
     .stream.return_value) = iter([msg])

    history = _load_session_history("uid1", "sess1", mock_db)
    assert history[0]["role"] == "user"


# ── _save_message (line 62) ───────────────────────────────────────────────────

def test_save_message_calls_firestore(mock_db):
    """Cover line 62: Firestore .add() called for user message."""
    _save_message("uid1", "user", "Where is the food?", mock_db)
    mock_db.collection.assert_called_with("users")
    add_mock = (mock_db.collection.return_value
                .document.return_value
                .collection.return_value
                .add)
    add_mock.assert_called_once()


def test_save_message_assistant_role(mock_db):
    _save_message("uid1", "assistant", "Head to stall 3.", mock_db)
    call_args = (mock_db.collection.return_value
                 .document.return_value
                 .collection.return_value
                 .add.call_args[0][0])
    assert call_args["role"] == "assistant"
    assert call_args["content"] == "Head to stall 3."


# ── _build_venue_context ───────────────────────────────────────────────────────

def test_build_venue_context_contains_phase(mock_db, sample_zones, sample_queues):
    mock_db.collection.return_value.where.return_value.stream.return_value = iter(
        sample_zones + sample_queues
    )
    ctx = _build_venue_context("halftime", mock_db)
    assert "halftime" in ctx


def test_build_venue_context_empty_data(mock_db):
    """Empty Firestore collections should produce valid JSON."""
    mock_db.collection.return_value.where.return_value.stream.return_value = iter([])
    import json
    ctx = _build_venue_context("pre_event", mock_db)
    parsed = json.loads(ctx)
    assert parsed["event_phase"] == "pre_event"
    assert parsed["busiest_zones"] == []
    assert parsed["shortest_queues"] == []


# ── chat() — Vertex AI happy path (lines 132-170) ─────────────────────────────

def _make_vertex_mocks():
    """Return mocked vertexai and GenerativeModel."""
    mock_vertexai = MagicMock()
    mock_model_cls = MagicMock()
    mock_model = MagicMock()
    mock_model_cls.return_value = mock_model
    mock_chat_session = MagicMock()
    mock_model.start_chat.return_value = mock_chat_session
    mock_response = MagicMock()
    mock_response.text = "Go to Gate West for the fastest exit."
    mock_chat_session.send_message.return_value = mock_response
    return mock_vertexai, mock_model_cls, mock_model


def test_chat_vertex_success(mock_db, sample_zones, sample_queues):
    """Exercise the Vertex AI happy path (lines 132-170)."""
    # Stub out Firestore data used inside the function
    mock_db.collection.return_value.where.return_value.stream.return_value = iter(
        sample_zones + sample_queues
    )
    (mock_db.collection.return_value
     .document.return_value
     .collection.return_value
     .order_by.return_value
     .limit.return_value
     .stream.return_value) = iter([])

    mock_vertexai, mock_model_cls, _ = _make_vertex_mocks()

    with patch.dict("sys.modules", {
        "vertexai": mock_vertexai,
        "vertexai.generative_models": MagicMock(GenerativeModel=mock_model_cls),
    }):
        result = chat("uid1", "How do I exit?", "sess1", "post_event", mock_db)

    assert "text" in result
    assert result["session_id"] == "sess1"
    assert result["action_type"] is None  # no <action> tag in response


def test_chat_vertex_success_with_action_tag(mock_db, sample_zones, sample_queues):
    """Response with <action> tag should strip it from clean_text (line 162-163)."""
    mock_db.collection.return_value.where.return_value.stream.return_value = iter(
        sample_zones + sample_queues
    )
    (mock_db.collection.return_value
     .document.return_value
     .collection.return_value
     .order_by.return_value
     .limit.return_value
     .stream.return_value) = iter([])

    mock_vertexai, mock_model_cls, mock_model = _make_vertex_mocks()
    mock_session = mock_model.start_chat.return_value
    mock_session.send_message.return_value.text = (
        'Go to Stall 3. <action>{"type": "navigate", "stall_id": "stall_3"}</action>'
    )

    with patch.dict("sys.modules", {
        "vertexai": mock_vertexai,
        "vertexai.generative_models": MagicMock(GenerativeModel=mock_model_cls),
    }):
        result = chat("uid1", "Where can I eat?", "sess1", "halftime", mock_db)

    assert "<action>" not in result["text"]
    assert result["action_type"] == "navigate"


def test_chat_vertex_success_with_history(mock_db, sample_zones, sample_queues):
    """History turns should be forwarded to the Vertex AI chat session."""
    msg = MagicMock()
    msg.to_dict.return_value = {"role": "user", "content": "Hello"}

    def stream_side_effect(*args, **kwargs):
        return iter(sample_zones + sample_queues)

    mock_db.collection.return_value.where.return_value.stream.side_effect = stream_side_effect
    (mock_db.collection.return_value
     .document.return_value
     .collection.return_value
     .order_by.return_value
     .limit.return_value
     .stream.return_value) = iter([msg])

    mock_vertexai, mock_model_cls, mock_model = _make_vertex_mocks()

    with patch.dict("sys.modules", {
        "vertexai": mock_vertexai,
        "vertexai.generative_models": MagicMock(GenerativeModel=mock_model_cls),
    }):
        result = chat("uid1", "And food?", "sess1", "halftime", mock_db)

    # start_chat must have been called with a non-empty history list
    call_kwargs = mock_model.start_chat.call_args[1]
    assert len(call_kwargs["history"]) == 1


# ── chat() — fallback path (lines 172-180) ────────────────────────────────────

def test_chat_falls_back_on_vertex_error(mock_db, sample_queues):
    """When Vertex AI raises, the fallback response must be returned (lines 172-180)."""
    mock_db.collection.return_value.where.return_value.stream.return_value = iter(
        sample_queues
    )
    (mock_db.collection.return_value
     .document.return_value
     .collection.return_value
     .order_by.return_value
     .limit.return_value
     .stream.return_value) = iter([])

    broken_vertexai = MagicMock()
    broken_vertexai.init.side_effect = RuntimeError("Vertex unavailable")

    with patch.dict("sys.modules", {
        "vertexai": broken_vertexai,
        "vertexai.generative_models": MagicMock(),
    }):
        result = chat("uid1", "I need food", "sess1", "first_half", mock_db)

    assert "text" in result
    assert "error" in result
    assert result["action_type"] is None
    assert result["action_payload"] is None
    assert len(result["text"]) > 0


# ── _fallback_response (line 211 — generic return) ────────────────────────────

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


def test_fallback_generic_query_hits_line_211(mock_db):
    """'Tell me…' with empty queues matches none of the keyword traps
    → exercises the bare 'return' on line 211."""
    mock_db.collection.return_value.where.return_value.stream.return_value = iter([])
    response = _fallback_response("Tell me about the weather", "pre_event", mock_db)
    assert "I'm here to help" in response


def test_fallback_food_no_stalls(mock_db):
    """When queue list is empty, food query must not crash."""
    mock_db.collection.return_value.where.return_value.stream.return_value = iter([])
    response = _fallback_response("hungry", "pre_event", mock_db)
    assert len(response) > 0


def test_fallback_restroom_no_wc_stalls(mock_db, sample_queues):
    """No wc_ stalls in results — restroom branch must fall through gracefully."""
    # Remove any wc_ entries from sample data
    non_wc = [q for q in sample_queues if not q.to_dict()["stall_id"].startswith("wc_")]
    mock_db.collection.return_value.where.return_value.stream.return_value = iter(non_wc)
    response = _fallback_response("I need a toilet", "pre_event", mock_db)
    assert len(response) > 0
