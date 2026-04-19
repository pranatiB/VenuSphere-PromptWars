"""Unit tests for crowd_service.py."""

import pytest
from unittest.mock import MagicMock, patch
from services.crowd_service import (
    get_zone_density,
    get_all_zones_density,
    predict_density,
    process_checkin,
    _get_density_label,
)
from utils.cache import clear_all


@pytest.fixture(autouse=True)
def clear_cache():
    clear_all()
    yield
    clear_all()


def test_get_density_label_low():
    assert _get_density_label(0.1) == "low"


def test_get_density_label_moderate():
    assert _get_density_label(0.45) == "moderate"


def test_get_density_label_high():
    assert _get_density_label(0.7) == "high"


def test_get_density_label_critical():
    assert _get_density_label(0.9) == "critical"


def test_get_zone_density_returns_data(sample_crowd_doc, mock_db):
    mock_db.collection.return_value.document.return_value.get.return_value = sample_crowd_doc
    result = get_zone_density("food_court_a", "halftime", mock_db)
    assert result["zone_id"] == "food_court_a"
    assert result["density"] == 0.92
    assert result["label"] == "critical"
    assert result["trend"] == "increasing"


def test_get_zone_density_missing_doc(mock_db):
    missing = MagicMock()
    missing.exists = False
    mock_db.collection.return_value.document.return_value.get.return_value = missing
    result = get_zone_density("nonexistent_zone", "halftime", mock_db)
    assert result["density"] == 0.0
    assert result["label"] == "unknown"


def test_get_zone_density_uses_cache(sample_crowd_doc, mock_db):
    mock_db.collection.return_value.document.return_value.get.return_value = sample_crowd_doc
    get_zone_density("food_court_a", "halftime", mock_db)
    get_zone_density("food_court_a", "halftime", mock_db)
    assert mock_db.collection.return_value.document.return_value.get.call_count == 1


def test_get_all_zones_density(sample_zones, mock_db):
    mock_db.collection.return_value.where.return_value.stream.return_value = iter(sample_zones)
    results = get_all_zones_density("pre_event", mock_db)
    assert len(results) == 3
    assert all("density" in r for r in results)
    assert all("label" in r for r in results)


def test_predict_density_halftime_food_court(sample_crowd_doc, mock_db):
    mock_db.collection.return_value.document.return_value.get.return_value = sample_crowd_doc
    result = predict_density("food_court_a", "halftime", 15, mock_db)
    assert result["predicted_density"] <= 1.0
    assert result["minutes_ahead"] == 15
    assert "confidence" in result


def test_predict_density_clamps_at_zero(mock_db):
    doc = MagicMock()
    doc.exists = True
    doc.to_dict.return_value = {
        "zone_id": "stand_north",
        "density": 0.05,
        "trend": "stable",
        "phase": "halftime",
        "timestamp": "2026-01-01T00:00:00Z",
    }
    mock_db.collection.return_value.document.return_value.get.return_value = doc
    result = predict_density("stand_north", "halftime", 15, mock_db)
    assert result["predicted_density"] >= 0.0


def test_process_checkin_increments_density(mock_db):
    doc = MagicMock()
    doc.exists = True
    doc.to_dict.return_value = {"density": 0.5}
    doc_ref = MagicMock()
    doc_ref.get.return_value = doc
    mock_db.collection.return_value.document.return_value = doc_ref
    result = process_checkin("food_court_a", "hashed_uid", "pre_event", mock_db)
    assert result is True
    doc_ref.update.assert_called_once()
    updated = doc_ref.update.call_args[0][0]
    assert updated["density"] > 0.5


def test_process_checkin_missing_zone(mock_db):
    doc = MagicMock()
    doc.exists = False
    mock_db.collection.return_value.document.return_value.get.return_value = doc
    result = process_checkin("bad_zone", "uid", "pre_event", mock_db)
    assert result is False
