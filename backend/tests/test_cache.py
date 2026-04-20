"""Unit tests for utils/cache.py — targets 100% branch coverage.

Uncovered lines:
  25-26: TTL expiry branch in get_cached (entry too old → delete + return None)
  55-57: invalidate_prefix bulk deletion loop
"""

import time
import pytest
from utils.cache import (
    get_cached,
    set_cached,
    invalidate,
    invalidate_prefix,
    clear_all,
    _MEMORY_CACHE,
)


@pytest.fixture(autouse=True)
def clear():
    clear_all()
    yield
    clear_all()


# ── get_cached ─────────────────────────────────────────────────────────────────

def test_get_cached_miss_returns_none():
    """Key not in cache → None."""
    assert get_cached("nonexistent") is None


def test_get_cached_hit_returns_value():
    """Fresh entry returns stored value."""
    set_cached("my_key", {"data": 42})
    result = get_cached("my_key", ttl_seconds=60)
    assert result == {"data": 42}


def test_get_cached_ttl_expiry_returns_none(monkeypatch):
    """Lines 25-26: Entry older than TTL must be removed and return None."""
    set_cached("old_key", "stale_data")
    # Backdate the timestamp so the entry is "old"
    _MEMORY_CACHE["old_key"] = ("stale_data", time.time() - 100)
    result = get_cached("old_key", ttl_seconds=10)
    assert result is None
    # Confirm the expired entry was deleted from the cache
    assert "old_key" not in _MEMORY_CACHE


def test_get_cached_different_ttls():
    """Entry valid under longer TTL, expired under shorter."""
    set_cached("edge_key", "value")
    _MEMORY_CACHE["edge_key"] = ("value", time.time() - 30)
    assert get_cached("edge_key", ttl_seconds=60) == "value"  # still fresh
    _MEMORY_CACHE["edge_key"] = ("value", time.time() - 60)
    assert get_cached("edge_key", ttl_seconds=30) is None    # now expired


# ── set_cached ─────────────────────────────────────────────────────────────────

def test_set_cached_stores_with_timestamp():
    before = time.time()
    set_cached("ts_key", [1, 2, 3])
    after = time.time()
    value, stored_at = _MEMORY_CACHE["ts_key"]
    assert value == [1, 2, 3]
    assert before <= stored_at <= after


def test_set_cached_overwrites_existing():
    set_cached("ow_key", "old")
    set_cached("ow_key", "new")
    assert get_cached("ow_key", ttl_seconds=60) == "new"


# ── invalidate ─────────────────────────────────────────────────────────────────

def test_invalidate_removes_key():
    set_cached("rm_key", "data")
    invalidate("rm_key")
    assert get_cached("rm_key") is None


def test_invalidate_nonexistent_key_no_error():
    """pop on missing key must be silent."""
    invalidate("does_not_exist")  # must not raise


# ── invalidate_prefix (lines 55-57) ───────────────────────────────────────────

def test_invalidate_prefix_removes_matching_keys():
    """Lines 55-57: All keys starting with prefix must be deleted."""
    set_cached("crowd_zone_north", {"density": 0.7})
    set_cached("crowd_zone_south", {"density": 0.4})
    set_cached("queue_stall_1", {"wait": 5})
    invalidate_prefix("crowd_")
    assert get_cached("crowd_zone_north", ttl_seconds=60) is None
    assert get_cached("crowd_zone_south", ttl_seconds=60) is None
    # Non-matching key must survive
    assert get_cached("queue_stall_1", ttl_seconds=60) == {"wait": 5}


def test_invalidate_prefix_no_match_is_noop():
    set_cached("event_phase", "halftime")
    invalidate_prefix("crowd_")  # nothing matches
    assert get_cached("event_phase", ttl_seconds=60) == "halftime"


def test_invalidate_prefix_empty_cache():
    """Empty cache must not raise."""
    invalidate_prefix("anything_")


def test_invalidate_prefix_all_keys():
    set_cached("x_a", 1)
    set_cached("x_b", 2)
    set_cached("x_c", 3)
    invalidate_prefix("x_")
    assert get_cached("x_a", ttl_seconds=60) is None
    assert get_cached("x_b", ttl_seconds=60) is None
    assert get_cached("x_c", ttl_seconds=60) is None


# ── clear_all ──────────────────────────────────────────────────────────────────

def test_clear_all_empties_cache():
    set_cached("a", 1)
    set_cached("b", 2)
    clear_all()
    assert _MEMORY_CACHE == {}
