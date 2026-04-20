"""Edge case unit tests for Cloud Translate utility to boost coverage."""

import pytest
import sys
import importlib
from unittest.mock import patch, MagicMock
from utils.translate import translate_text, _get_client
from utils import translate as tr_module
from utils.cache import clear_all

@pytest.fixture(autouse=True)
def reset_state():
    clear_all()
    tr_module._translate_client = None
    yield
    clear_all()
    tr_module._translate_client = None

def test_get_client_returns_none_if_client_cls_missing():
    """Verify gracefully handling the case where translate.Client is missing."""
    with patch("utils.translate.translate", MagicMock(spec=[])):
        # By removing 'Client' from the mock, we trigger the 'client_cls is None' path
        client = _get_client()
        assert client is None

@patch("utils.translate.translate")
def test_translate_text_handles_missing_client_gracefully(mock_tr_lib):
    """Verify that translate_text returns original if client fails to init."""
    # Simulate first branch (client_cls is None)
    mock_tr_lib.Client = None
    result = translate_text("Hello", "es")
    assert result == "Hello"

def test_translate_text_decodes_html_entities():
    """Verify that the utility decodes &quot; or other entities from API."""
    mock_client = MagicMock()
    mock_client.translate.return_value = {"translatedText": "Hola &quot;amigo&quot;"}
    
    with patch("utils.translate._get_client", return_value=mock_client):
        result = translate_text("Hello friend", "es")
        # Should be decoded to "Hola "amigo""
        assert result == 'Hola "amigo"'

def test_translate_text_returns_original_on_exception():
    """Double check that any unexpected exception returns original text."""
    mock_client = MagicMock()
    mock_client.translate.side_effect = RuntimeError("Unknown error")
    
    with patch("utils.translate._get_client", return_value=mock_client):
        result = translate_text("Surge!", "hi")
        assert result == "Surge!"

def test_translate_import_fallback():
    """Line 16-22: Force the fallback exception paths during module import."""
    # We must patch sys.modules and reload the module to trigger the try/except block
    with patch.dict("sys.modules", {"google.cloud": None}):
        import utils.translate
        importlib.reload(utils.translate)
        # Verify the fallback worked
        assert hasattr(utils.translate.translate, "Client")
        assert utils.translate.translate.Client is None
    
    # Reload again to restore normal state for other tests
    importlib.reload(utils.translate)
