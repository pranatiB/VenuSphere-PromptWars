"""Crowd density service: zone readings, trend analysis, and AI predictions."""

from datetime import datetime, timezone
from typing import Any

from firebase_admin import firestore

from utils.cache import get_cached, set_cached


_DENSITY_LABELS = {
    (0.0, 0.3): "low",
    (0.3, 0.6): "moderate",
    (0.6, 0.8): "high",
    (0.8, 1.01): "critical",
}


def _get_density_label(density: float) -> str:
    """Map a density float [0,1] to a human-readable label."""
    for (low, high), label in _DENSITY_LABELS.items():
        if low <= density < high:
            return label
    return "unknown"


def get_zone_density(zone_id: str, phase: str, db: Any) -> dict:
    """Fetch current crowd density for a single zone.

    Args:
        zone_id: Zone document ID.
        phase: Current event phase ID.
        db: Firestore client instance.

    Returns:
        Dict with density, label, trend, and prediction fields.
    """
    cache_key = f"crowd_{zone_id}_{phase}"
    cached = get_cached(cache_key, ttl_seconds=15)
    if cached:
        return cached

    doc_id = f"{zone_id}_{phase}"
    doc = db.collection("crowd_density").document(doc_id).get()

    if not doc.exists:
        result = {
            "zone_id": zone_id,
            "density": 0.0,
            "label": "unknown",
            "trend": "stable",
            "phase": phase,
        }
        return result

    data = doc.to_dict()
    density = float(data.get("density", 0.0))
    result = {
        "zone_id": zone_id,
        "density": density,
        "label": _get_density_label(density),
        "trend": data.get("trend", "stable"),
        "phase": phase,
        "timestamp": data.get("timestamp", "").isoformat()
        if hasattr(data.get("timestamp", ""), "isoformat")
        else str(data.get("timestamp", "")),
    }
    set_cached(cache_key, result)
    return result


def get_all_zones_density(phase: str, db: Any) -> list[dict]:
    """Fetch current crowd density for all 12 venue zones.

    Args:
        phase: Current event phase ID.
        db: Firestore client instance.

    Returns:
        List of density dicts for every zone.
    """
    cache_key = f"crowd_all_{phase}"
    cached = get_cached(cache_key, ttl_seconds=15)
    if cached:
        return cached

    docs = (
        db.collection("crowd_density")
        .where("phase", "==", phase)
        .stream()
    )
    results = []
    for doc in docs:
        data = doc.to_dict()
        density = float(data.get("density", 0.0))
        results.append({
            "zone_id": data.get("zone_id"),
            "density": density,
            "label": _get_density_label(density),
            "trend": data.get("trend", "stable"),
            "phase": phase,
        })

    set_cached(cache_key, results)
    return results


def predict_density(zone_id: str, phase: str, minutes_ahead: int, db: Any) -> dict:
    """Predict crowd density for a zone at a future point.

    Uses heuristic phase-transition logic for demo; in production this
    would call a Vertex AI prediction endpoint with historical time-series.

    Args:
        zone_id: Zone document ID.
        phase: Current event phase.
        minutes_ahead: Minutes into the future to predict (15 or 30).
        db: Firestore client instance.

    Returns:
        Dict with predicted density and confidence.
    """
    current = get_zone_density(zone_id, phase, db)
    current_density = current.get("density", 0.5)

    phase_order = ["pre_event", "first_half", "halftime", "second_half", "post_event"]
    phase_idx = phase_order.index(phase) if phase in phase_order else 0

    adjustment = 0.0
    if phase == "first_half" and minutes_ahead >= 30:
        adjustment = 0.3 if zone_id in ("food_court_a", "food_court_b") else -0.1
    elif phase == "halftime" and minutes_ahead >= 15:
        adjustment = -0.3 if zone_id in ("food_court_a", "food_court_b") else 0.2
    elif phase == "second_half" and minutes_ahead >= 30:
        adjustment = 0.2 if zone_id.startswith("gate_") else 0.0
    elif phase == "post_event":
        adjustment = -0.1 if zone_id.startswith("gate_") else -0.05

    predicted = max(0.0, min(1.0, current_density + adjustment))
    return {
        "zone_id": zone_id,
        "minutes_ahead": minutes_ahead,
        "predicted_density": round(predicted, 2),
        "predicted_label": _get_density_label(predicted),
        "confidence": 0.78,
        "current_density": current_density,
    }


def process_checkin(zone_id: str, uid: str, phase: str, db: Any) -> bool:
    """Process an anonymous user check-in to update zone density.

    Args:
        zone_id: Zone the user is checking into.
        uid: Hashed user ID (anonymous).
        phase: Current event phase.
        db: Firestore client instance.

    Returns:
        True if check-in was recorded successfully.
    """
    doc_ref = db.collection("crowd_density").document(f"{zone_id}_{phase}")
    doc = doc_ref.get()
    if not doc.exists:
        return False

    data = doc.to_dict()
    current = float(data.get("density", 0.5))
    increment = min(0.02, (1.0 - current) * 0.05)
    new_density = round(min(1.0, current + increment), 3)

    doc_ref.update({
        "density": new_density,
        "trend": "increasing" if new_density > current else "stable",
        "timestamp": datetime.now(timezone.utc),
    })
    return True
