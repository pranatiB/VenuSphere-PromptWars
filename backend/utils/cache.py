"""Firestore caching helpers with TTL-based invalidation."""

import time
from typing import Any, Optional


_MEMORY_CACHE: dict[str, tuple[Any, float]] = {}


def get_cached(key: str, ttl_seconds: int = 30) -> Optional[Any]:
    """Retrieve a value from the in-memory cache if still valid.

    Args:
        key: Cache key (e.g. 'zones_all' or 'crowd_zone_north').
        ttl_seconds: Maximum age of a cache entry in seconds.

    Returns:
        The cached value if valid, or None if missing/expired.
    """
    entry = _MEMORY_CACHE.get(key)
    if entry is None:
        return None
    value, stored_at = entry
    if time.time() - stored_at > ttl_seconds:
        del _MEMORY_CACHE[key]
        return None
    return value


def set_cached(key: str, value: Any) -> None:
    """Store a value in the in-memory cache with current timestamp.

    Args:
        key: Cache key.
        value: Value to cache (any JSON-serialisable type).
    """
    _MEMORY_CACHE[key] = (value, time.time())


def invalidate(key: str) -> None:
    """Remove a specific key from the cache.

    Args:
        key: Cache key to remove.
    """
    _MEMORY_CACHE.pop(key, None)


def invalidate_prefix(prefix: str) -> None:
    """Remove all cache entries whose key starts with a given prefix.

    Args:
        prefix: Key prefix to match for bulk invalidation.
    """
    keys_to_delete = [k for k in _MEMORY_CACHE if k.startswith(prefix)]
    for key in keys_to_delete:
        del _MEMORY_CACHE[key]


def clear_all() -> None:
    """Clear the entire in-memory cache. Used in tests."""
    _MEMORY_CACHE.clear()
