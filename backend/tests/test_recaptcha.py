"""Unit tests for reCAPTCHA v3 utility."""

import pytest
from unittest.mock import patch, MagicMock
from utils.recaptcha import verify_recaptcha
import os


@pytest.fixture
def mock_env():
    with patch.dict(os.environ, {"RECAPTCHA_SECRET": "test-secret"}):
        yield


def test_missing_secret_bypasses(caplog):
    """If RECAPTCHA_SECRET is not set, we should bypass validation completely."""
    with patch.dict(os.environ, clear=True):
        is_human, score = verify_recaptcha("any-token", "chat_send")
        assert is_human is True
        assert score == 1.0


def test_missing_token_fails(mock_env):
    is_human, score = verify_recaptcha("", "chat_send")
    assert is_human is False
    assert score == 0.0


@patch("utils.recaptcha.urllib.request.urlopen")
def test_valid_token_high_score(mock_urlopen, mock_env):
    mock_response = MagicMock()
    mock_response.read.return_value = b'{"success": true, "action": "chat_send", "score": 0.9}'
    mock_urlopen.return_value.__enter__.return_value = mock_response

    is_human, score = verify_recaptcha("valid-token", "chat_send", min_score=0.5)
    assert is_human is True
    assert score == 0.9


@patch("utils.recaptcha.urllib.request.urlopen")
def test_valid_token_low_score(mock_urlopen, mock_env):
    mock_response = MagicMock()
    mock_response.read.return_value = b'{"success": true, "action": "chat_send", "score": 0.2}'
    mock_urlopen.return_value.__enter__.return_value = mock_response

    is_human, score = verify_recaptcha("valid-token", "chat_send", min_score=0.5)
    assert is_human is False
    assert score == 0.2


@patch("utils.recaptcha.urllib.request.urlopen")
def test_action_mismatch_fails(mock_urlopen, mock_env):
    mock_response = MagicMock()
    mock_response.read.return_value = b'{"success": true, "action": "login", "score": 0.9}'
    mock_urlopen.return_value.__enter__.return_value = mock_response

    is_human, score = verify_recaptcha("valid-token", "chat_send", min_score=0.5)
    assert is_human is False
    assert score == 0.0


@patch("utils.recaptcha.urllib.request.urlopen")
def test_api_failure_fails_closed(mock_urlopen, mock_env):
    mock_response = MagicMock()
    mock_response.read.return_value = b'{"success": false, "error-codes": ["invalid-input-response"]}'
    mock_urlopen.return_value.__enter__.return_value = mock_response

    is_human, score = verify_recaptcha("bad-token", "chat_send", min_score=0.5)
    assert is_human is False
    assert score == 0.0
