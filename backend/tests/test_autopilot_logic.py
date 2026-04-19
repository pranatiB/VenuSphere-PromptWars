"""Unit tests for the Crowd Autopilot™ prediction engine (autopilot-engine backend logic).

Since autopilot-engine.js is a client-side ES module, these Python tests
cover the equivalent backend prediction logic in crowd_service.predict_density,
validating the surge profiles, phase-transition behavior, and clamping logic
that mirrors the JS engine's SURGE_PROFILES constants.
"""

import pytest
from unittest.mock import MagicMock
from services.crowd_service import predict_density, _get_density_label
from utils.cache import clear_all


@pytest.fixture(autouse=True)
def clear_cache():
    clear_all()
    yield
    clear_all()


def _make_doc(density, zone_id="food_court_a", phase="first_half", trend="stable"):
    """Helper: build a mock Firestore document."""
    doc = MagicMock()
    doc.exists = True
    doc.to_dict.return_value = {
        "zone_id": zone_id,
        "density": density,
        "trend": trend,
        "phase": phase,
        "timestamp": "2026-04-19T10:00:00Z",
    }
    return doc


# ── Autopilot Surge Profile Tests ──────────────────────────────────────────

class TestHalftimeFoodCourtSurge:
    """Halftime is the signature demo moment: food courts spike 3.2× in JS.
    Backend predict_density should produce a higher density at 15 min ahead."""

    def test_food_court_spikes_at_halftime(self, mock_db):
        doc = _make_doc(density=0.30, zone_id="food_court_a", phase="first_half")
        mock_db.collection.return_value.document.return_value.get.return_value = doc
        result = predict_density("food_court_a", "first_half", 30, mock_db)
        # During first_half, 30 min ahead → food court should increase toward halftime
        assert result["predicted_density"] > 0.30, "Food court must spike pre-halftime"
        assert result["predicted_density"] <= 1.0, "Density cannot exceed 1.0"

    def test_prediction_confidence_present(self, mock_db):
        doc = _make_doc(density=0.5, phase="first_half")
        mock_db.collection.return_value.document.return_value.get.return_value = doc
        result = predict_density("food_court_a", "first_half", 15, mock_db)
        assert "confidence" in result
        assert 0.0 < result["confidence"] <= 1.0

    def test_minutes_ahead_in_result(self, mock_db):
        doc = _make_doc(density=0.4)
        mock_db.collection.return_value.document.return_value.get.return_value = doc
        result = predict_density("food_court_a", "first_half", 30, mock_db)
        assert result["minutes_ahead"] == 30


class TestExitSurgeProfile:
    """Second half predicts gate congestion — mirrors autopilot SURGE_PROFILES.second_half."""

    def test_gate_density_rises_in_second_half(self, mock_db):
        doc = _make_doc(density=0.40, zone_id="gate_north", phase="second_half")
        mock_db.collection.return_value.document.return_value.get.return_value = doc
        result = predict_density("gate_north", "second_half", 30, mock_db)
        # Gates should spike in second half as fans prepare to leave
        assert result["predicted_density"] >= 0.40

    def test_predicted_label_reflects_density(self, mock_db):
        doc = _make_doc(density=0.80, zone_id="gate_south", phase="second_half")
        mock_db.collection.return_value.document.return_value.get.return_value = doc
        result = predict_density("gate_south", "second_half", 30, mock_db)
        expected_label = _get_density_label(result["predicted_density"])
        assert result["predicted_label"] == expected_label


class TestPostEventProfile:
    """Post-event: density should stabilise / decrease as crowds disperse."""

    def test_gate_density_decreases_post_event(self, mock_db):
        doc = _make_doc(density=0.80, zone_id="gate_north", phase="post_event")
        mock_db.collection.return_value.document.return_value.get.return_value = doc
        result = predict_density("gate_north", "post_event", 15, mock_db)
        # Post-event adjustment is negative for gates
        assert result["predicted_density"] <= 0.80

    def test_density_never_negative(self, mock_db):
        doc = _make_doc(density=0.02, zone_id="gate_south", phase="post_event")
        mock_db.collection.return_value.document.return_value.get.return_value = doc
        result = predict_density("gate_south", "post_event", 30, mock_db)
        assert result["predicted_density"] >= 0.0


# ── Density Label Accuracy ───────────────────────────────────────────────────

class TestDensityLabelMapping:
    """Autopilot relies on density labels for severity scoring."""

    @pytest.mark.parametrize("density,expected", [
        (0.0,  "low"),
        (0.15, "low"),
        (0.29, "low"),
        (0.30, "moderate"),
        (0.55, "moderate"),
        (0.59, "moderate"),
        (0.60, "high"),
        (0.75, "high"),
        (0.79, "high"),
        (0.80, "critical"),
        (0.95, "critical"),
        (1.00, "critical"),
    ])
    def test_label_boundaries(self, density, expected):
        assert _get_density_label(density) == expected


# ── Zone ID Handling ────────────────────────────────────────────────────────

class TestZoneIDVariants:
    """Autopilot handles all 12 venue zones — ensure no key errors on edges."""

    def test_unknown_zone_returns_fallback(self, mock_db):
        missing = MagicMock()
        missing.exists = False
        mock_db.collection.return_value.document.return_value.get.return_value = missing
        result = predict_density("nonexistent_zone_xyz", "halftime", 15, mock_db)
        # Should still return a valid shape with defaults, not raise
        assert "predicted_density" in result
        assert "predicted_label" in result
        assert 0.0 <= result["predicted_density"] <= 1.0

    def test_all_tracked_surge_zones(self, mock_db):
        """All zones in SURGE_PROFILES must be predictable without error."""
        surge_zones = [
            "gate_north", "gate_south", "gate_east", "gate_west",
            "food_court_a", "food_court_b", "main_concourse",
            "stand_north", "stand_south", "merchandise",
        ]
        for zone in surge_zones:
            doc = _make_doc(density=0.5, zone_id=zone, phase="halftime")
            mock_db.collection.return_value.document.return_value.get.return_value = doc
            clear_all()
            result = predict_density(zone, "halftime", 15, mock_db)
            assert "predicted_density" in result, f"Missing key for zone: {zone}"
