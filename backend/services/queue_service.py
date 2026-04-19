"""Queue and wait time service: live wait times, predictions, and alert subscriptions."""

from datetime import datetime, timezone
from typing import Any

from utils.cache import get_cached, set_cached


def get_queue_time(stall_id: str, phase: str, db: Any) -> dict:
    """Fetch current wait time for a single stall or restroom.

    Args:
        stall_id: Stall or restroom document ID.
        phase: Current event phase.
        db: Firestore client instance.

    Returns:
        Dict with wait time, trend, and 15/30-min predictions.
    """
    cache_key = f"queue_{stall_id}_{phase}"
    cached = get_cached(cache_key, ttl_seconds=20)
    if cached:
        return cached

    doc_id = f"{stall_id}_{phase}"
    doc = db.collection("queue_times").document(doc_id).get()

    if not doc.exists:
        result = {
            "stall_id": stall_id,
            "wait_minutes": 0,
            "trend": "stable",
            "phase": phase,
            "prediction_15": 0,
            "prediction_30": 0,
        }
        return result

    data = doc.to_dict()
    wait = int(data.get("wait_minutes", 0))
    p15, p30 = _predict_queue(stall_id, wait, phase)

    result = {
        "stall_id": stall_id,
        "wait_minutes": wait,
        "trend": data.get("trend", "stable"),
        "phase": phase,
        "prediction_15": p15,
        "prediction_30": p30,
        "timestamp": str(data.get("timestamp", "")),
    }
    set_cached(cache_key, result)
    return result


def get_all_queue_times(phase: str, db: Any) -> list[dict]:
    """Fetch current wait times for all stalls and restrooms.

    Args:
        phase: Current event phase.
        db: Firestore client instance.

    Returns:
        List of queue dicts ordered by wait_minutes ascending.
    """
    cache_key = f"queue_all_{phase}"
    cached = get_cached(cache_key, ttl_seconds=20)
    if cached:
        return cached

    docs = db.collection("queue_times").where("phase", "==", phase).stream()
    results = []
    for doc in docs:
        data = doc.to_dict()
        wait = int(data.get("wait_minutes", 0))
        stall_id = data.get("stall_id", "")
        p15, p30 = _predict_queue(stall_id, wait, phase)
        results.append({
            "stall_id": stall_id,
            "wait_minutes": wait,
            "trend": data.get("trend", "stable"),
            "phase": phase,
            "prediction_15": p15,
            "prediction_30": p30,
        })

    results.sort(key=lambda x: x["wait_minutes"])
    set_cached(cache_key, results)
    return results


def _predict_queue(stall_id: str, current_wait: int, phase: str) -> tuple[int, int]:
    """Heuristic queue prediction for 15 and 30 minutes ahead.

    Args:
        stall_id: Stall or restroom identifier.
        current_wait: Current wait time in minutes.
        phase: Event phase for trend context.

    Returns:
        Tuple of (prediction_15_min, prediction_30_min).
    """
    if phase == "first_half":
        p15 = min(35, current_wait + 20) if stall_id.startswith(("stall_", "wc_")) else current_wait
        p30 = min(35, current_wait + 25)
    elif phase == "halftime":
        p15 = max(1, current_wait - 10)
        p30 = max(1, current_wait - 20)
    elif phase == "second_half":
        p15 = min(30, current_wait + 15)
        p30 = min(35, current_wait + 20)
    else:
        p15 = current_wait
        p30 = max(0, current_wait - 5)

    return p15, p30


def best_time_recommendation(stall_id: str, phase: str, db: Any) -> dict:
    """Recommend the best time to visit a stall based on predictions.

    Args:
        stall_id: Stall or restroom identifier.
        phase: Current event phase.
        db: Firestore client instance.

    Returns:
        Dict with recommended action and predicted wait times.
    """
    current = get_queue_time(stall_id, phase, db)
    wait = current.get("wait_minutes", 0)
    p15 = current.get("prediction_15", wait)
    p30 = current.get("prediction_30", wait)

    best = min(wait, p15, p30)
    if best == wait:
        advice = "Go now — current wait is the shortest."
        best_in = 0
    elif best == p15:
        advice = "Wait 15 minutes — the line will be shorter."
        best_in = 15
    else:
        advice = "Wait 30 minutes for the shortest wait."
        best_in = 30

    return {
        "stall_id": stall_id,
        "current_wait": wait,
        "best_wait": best,
        "best_in_minutes": best_in,
        "advice": advice,
    }


def subscribe_alert(
    uid: str,
    stall_id: str,
    threshold_minutes: int,
    db: Any,
) -> bool:
    """Create a queue alert subscription for a user.

    Args:
        uid: Firebase Auth user ID.
        stall_id: Target stall or restroom.
        threshold_minutes: Notify when wait drops below this value.
        db: Firestore client instance.

    Returns:
        True if subscription was created successfully.
    """
    sub_id = f"{stall_id}_{threshold_minutes}"
    db.collection("users").document(uid).collection("subscriptions").document(sub_id).set({
        "uid": uid,
        "stall_id": stall_id,
        "threshold_minutes": threshold_minutes,
        "active": True,
        "created_at": datetime.now(timezone.utc),
    })
    return True
