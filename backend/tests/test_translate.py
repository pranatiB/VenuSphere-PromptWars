"""Unit tests for Cloud Translate utility."""

import pytest
from unittest.mock import patch, MagicMock
from utils.translate import translate_text, _get_client
from utils import translate as tr_module
from utils.cache import clear_all


@pytest.fixture(autouse=True)
def reset_cache():
    clear_all()
    tr_module._translate_client = None
    yield
    clear_all()
    tr_module._translate_client = None


def test_empty_string_returns_empty():
    assert translate_text("", "es") == ""


def test_none_returns_none():
    assert translate_text(None, "es") is None


def test_en_target_returns_original():
    assert translate_text("Hello", "en") == "Hello"


@patch("utils.translate.translate.Client")
def test_successful_translation(mock_client_cls):
    mock_client = MagicMock()
    mock_client_cls.return_value = mock_client
    mock_client.translate.return_value = {"translatedText": "Hola"}

    result = translate_text("Hello", "es")
    
    assert result == "Hola"
    mock_client.translate.assert_called_once_with("Hello", target_language="es")


@patch("utils.translate.translate.Client")
def test_caching_prevents_multiple_calls(mock_client_cls):
    mock_client = MagicMock()
    mock_client_cls.return_value = mock_client
    mock_client.translate.return_value = {"translatedText": "Hola"}

    # First call hits API
    res1 = translate_text("Hello", "es")
    # Second call hits cache
    res2 = translate_text("Hello", "es")

    assert res1 == "Hola"
    assert res2 == "Hola"
    # Client should only be called once
    mock_client.translate.assert_called_once()


@patch("utils.translate.translate.Client")
def test_api_failure_returns_original_gracefully(mock_client_cls):
    mock_client = MagicMock()
    mock_client_cls.return_value = mock_client
    mock_client.translate.side_effect = Exception("API Quota Exceeded")

    result = translate_text("Important message", "es")
    
    assert result == "Important message"


@patch("utils.translate.translate.Client")
def test_client_init_failure_returns_original(mock_client_cls):
    mock_client_cls.side_effect = Exception("No credentials")
    
    result = translate_text("Hello", "fr")
    assert result == "Hello"
