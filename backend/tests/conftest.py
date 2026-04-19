"""Shared pytest fixtures for all backend tests."""

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone


@pytest.fixture
def mock_db():
    """Return a mock Firestore client with configurable document returns."""
    db = MagicMock()
    return db


@pytest.fixture
def sample_crowd_doc():
    """Return a realistic crowd density document dictionary."""
    doc = MagicMock()
    doc.exists = True
    doc.to_dict.return_value = {
        "zone_id": "food_court_a",
        "density": 0.92,
        "trend": "increasing",
        "phase": "halftime",
        "timestamp": datetime.now(timezone.utc),
    }
    return doc


@pytest.fixture
def sample_queue_doc():
    """Return a realistic queue time document dictionary."""
    doc = MagicMock()
    doc.exists = True
    doc.to_dict.return_value = {
        "stall_id": "stall_1",
        "wait_minutes": 28,
        "trend": "increasing",
        "phase": "halftime",
        "timestamp": datetime.now(timezone.utc),
    }
    return doc


@pytest.fixture
def sample_zones():
    """Return a list of zone mock documents for all-zones queries."""
    zones = [
        {"zone_id": "gate_north", "density": 0.75, "trend": "stable", "phase": "pre_event"},
        {"zone_id": "food_court_a", "density": 0.92, "trend": "increasing", "phase": "pre_event"},
        {"zone_id": "stand_north", "density": 0.30, "trend": "stable", "phase": "pre_event"},
    ]
    docs = []
    for z in zones:
        d = MagicMock()
        d.to_dict.return_value = z
        docs.append(d)
    return docs


@pytest.fixture
def sample_queues():
    """Return a list of queue mock documents for all-queues queries."""
    queues = [
        {"stall_id": "stall_1", "wait_minutes": 12, "trend": "stable", "phase": "pre_event"},
        {"stall_id": "stall_2", "wait_minutes": 5, "trend": "stable", "phase": "pre_event"},
        {"stall_id": "wc_north_a", "wait_minutes": 3, "trend": "stable", "phase": "pre_event"},
    ]
    docs = []
    for q in queues:
        d = MagicMock()
        d.to_dict.return_value = q
        docs.append(d)
    return docs


@pytest.fixture
def autouse_clear_cache(autouse=True):
    """Clear the in-memory cache before each test to prevent cross-test pollution."""
    from utils.cache import clear_all
    clear_all()
    yield
    clear_all()
