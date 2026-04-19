"""Event service: schedule retrieval, phase detection, alerts, and announcements."""

from datetime import datetime, timezone
from typing import Any

from models.event import SmartAlert, Announcement
from utils.cache import get_cached, set_cached


def get_current_phase(db: Any) -> str:
    """Fetch the active event phase from the Firestore schedule document.

    Args:
        db: Firestore client instance.

    Returns:
        Phase ID string (e.g. 'halftime'), defaulting to 'pre_event'.
    """
    cached = get_cached("current_phase", ttl_seconds=10)
    if cached:
        return cached

    docs = db.collection("event_schedule").limit(1).stream()
    for doc in docs:
        phase = doc.to_dict().get("current_phase", "pre_event")
        set_cached("current_phase", phase)
        return phase
    return "pre_event"


def get_schedule(db: Any) -> dict:
    """Fetch the full event schedule including all phases.

    Args:
        db: Firestore client instance.

    Returns:
        Dict with event name, current phase, and list of phase objects.
    """
    cached = get_cached("event_schedule", ttl_seconds=60)
    if cached:
        return cached

    docs = db.collection("event_schedule").limit(1).stream()
    for doc in docs:
        data = doc.to_dict()
        set_cached("event_schedule", data)
        return data
    return {"name": "Championship Final", "current_phase": "pre_event", "phases": []}


def get_upcoming_alerts(phase: str, db: Any) -> list[dict]:
    """Fetch smart alerts relevant to the current event phase.

    Args:
        phase: Current event phase ID.
        db: Firestore client instance.

    Returns:
        List of alert dicts sorted by priority (high first).
    """
    cache_key = f"alerts_{phase}"
    cached = get_cached(cache_key, ttl_seconds=30)
    if cached:
        return cached

    docs = (
        db.collection("alerts")
        .where("phase", "==", phase)
        .stream()
    )
    priority_order = {"emergency": 0, "high": 1, "medium": 2, "low": 3}
    alerts = []
    for doc in docs:
        data = doc.to_dict()
        alerts.append(data)

    alerts.sort(key=lambda a: priority_order.get(a.get("priority", "low"), 3))
    set_cached(cache_key, alerts)
    return alerts


def get_announcements(db: Any, limit: int = 10) -> list[dict]:
    """Fetch the most recent venue-wide announcements.

    Args:
        db: Firestore client instance.
        limit: Maximum number of announcements to return.

    Returns:
        List of announcement dicts ordered newest first.
    """
    docs = (
        db.collection("announcements")
        .order_by("created_at", direction="DESCENDING")
        .limit(limit)
        .stream()
    )
    return [doc.to_dict() for doc in docs]


def publish_announcement(message: str, priority: str, db: Any) -> str:
    """Publish a new venue-wide announcement to Firestore.

    Simulates Cloud Pub/Sub delivery via Firestore onSnapshot listeners
    on the client side. High-priority messages use 'emergency' priority.

    Args:
        message: Announcement text body.
        priority: One of 'normal', 'high', 'emergency'.
        db: Firestore client instance.

    Returns:
        The new announcement document ID.
    """
    doc_ref = db.collection("announcements").document()
    doc_ref.set({
        "id": doc_ref.id,
        "message": message,
        "priority": priority,
        "created_at": datetime.now(timezone.utc),
    })
    return doc_ref.id


def advance_phase(db: Any) -> str:
    """Move the event to the next phase. Used by Cloud Scheduler simulation.

    Args:
        db: Firestore client instance.

    Returns:
        The new current phase ID.
    """
    phase_order = ["pre_event", "first_half", "halftime", "second_half", "post_event"]
    current = get_current_phase(db)
    idx = phase_order.index(current) if current in phase_order else 0
    next_phase = phase_order[min(idx + 1, len(phase_order) - 1)]

    docs = db.collection("event_schedule").limit(1).stream()
    for doc in docs:
        doc.reference.update({
            "current_phase": next_phase,
            "updated_at": datetime.now(timezone.utc),
        })

    from utils.cache import invalidate
    invalidate("current_phase")
    return next_phase
