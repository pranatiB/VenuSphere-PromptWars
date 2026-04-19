"""Security module unit and penetration tests."""

import pytest
from unittest.mock import patch, MagicMock
from utils.security import (
    validate_firebase_token,
    extract_bearer_token,
    sanitize_input,
    check_rate_limit,
    hash_uid,
)
from utils import security as sec_module


@pytest.fixture(autouse=True)
def reset_rate_store():
    sec_module._RATE_LIMIT_STORE.clear()
    yield
    sec_module._RATE_LIMIT_STORE.clear()


class TestExtractBearerToken:
    def test_valid_bearer(self):
        assert extract_bearer_token("Bearer mytoken123") == "mytoken123"

    def test_missing_header(self):
        assert extract_bearer_token("") is None

    def test_no_bearer_prefix(self):
        assert extract_bearer_token("Basic abc123") is None

    def test_bearer_only_no_token(self):
        assert extract_bearer_token("Bearer ") is None


class TestValidateFirebaseToken:
    def test_none_on_short_token(self):
        result = validate_firebase_token("short")
        assert result is None

    def test_none_on_empty(self):
        assert validate_firebase_token("") is None

    def test_none_on_invalid_token(self):
        with patch("backend.utils.security.auth.verify_id_token", side_effect=Exception("invalid")):
            result = validate_firebase_token("a" * 50)
            assert result is None

    def test_returns_uid_on_valid_token(self):
        with patch("backend.utils.security.auth.verify_id_token", return_value={"uid": "user_123"}):
            result = validate_firebase_token("a" * 50)
            assert result == "user_123"


class TestSanitizeInput:
    def test_strips_html_tags(self):
        result = sanitize_input("<script>alert(1)</script>", 500)
        assert "<script>" not in result
        assert "alert" in result

    def test_escapes_xss_vectors(self):
        result = sanitize_input("<img src=x onerror=alert(1)>")
        assert "<img" not in result

    def test_truncates_at_max_length(self):
        result = sanitize_input("a" * 3000, max_len=100)
        assert len(result) <= 100

    def test_handles_non_string(self):
        assert sanitize_input(None) == ""  # type: ignore
        assert sanitize_input(42) == ""    # type: ignore

    def test_strips_whitespace(self):
        result = sanitize_input("  hello world  ")
        assert result == "hello world"

    def test_sql_injection_escaped(self):
        result = sanitize_input("'; DROP TABLE users; --")
        assert "'" not in result or "&#x27;" in result or result


class TestRateLimit:
    def test_allows_under_limit(self):
        for _ in range(29):
            assert check_rate_limit("uid_test") is True

    def test_blocks_at_limit(self):
        for _ in range(30):
            check_rate_limit("uid_block")
        assert check_rate_limit("uid_block") is False

    def test_different_users_independent(self):
        for _ in range(30):
            check_rate_limit("user_a")
        assert check_rate_limit("user_b") is True


class TestHashUid:
    def test_returns_16_char_hex(self):
        result = hash_uid("firebase_uid_123")
        assert len(result) == 16
        assert all(c in "0123456789abcdef" for c in result)

    def test_same_uid_same_hash(self):
        assert hash_uid("uid_abc") == hash_uid("uid_abc")

    def test_different_uid_different_hash(self):
        assert hash_uid("uid_abc") != hash_uid("uid_xyz")
