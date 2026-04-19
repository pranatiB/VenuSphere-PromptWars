"""Notification service: push alert delivery and queue threshold checking."""

from datetime import datetime, timezone
from typing import Any

from services.queue_service import get_queue_time


def check_queue_subscriptions(phase: str, db: Any) -> int:
    """Check all active queue subscriptions and trigger alerts when thresholds are met.

    Designed to be triggered periodically by Cloud Scheduler.

    Args:
        phase: Current event phase.
        db: Firestore client instance.

    Returns:
        Number of notifications sent.
    """
    sent_count = 0
    users_ref = db.collection("users").stream()

    for user_doc in users_ref:
        uid = user_doc.id
        subs = (
            db.collection("users")
            .document(uid)
            .collection("subscriptions")
            .where("active", "==", True)
            .stream()
        )
        for sub in subs:
            sub_data = sub.to_dict()
            stall_id = sub_data.get("stall_id")
            threshold = sub_data.get("threshold_minutes", 5)
            queue = get_queue_time(stall_id, phase, db)
            wait = queue.get("wait_minutes", 999)

            if wait <= threshold:
                _deliver_in_app_notification(
                    uid=uid,
                    title=f"Queue Alert: {stall_id}",
                    body=f"Wait time dropped to {wait} min — head there now!",
                    db=db,
                )
                sub.reference.update({"active": False})
                sent_count += 1

    return sent_count


def _deliver_in_app_notification(uid: str, title: str, body: str, db: Any) -> None:
    """Write a notification document to Firestore for in-app delivery.

    Args:
        uid: Target user ID.
        title: Notification title.
        body: Notification body text.
        db: Firestore client instance.
    """
    db.collection("users").document(uid).collection("notifications").add({
        "title": title,
        "body": body,
        "read": False,
        "created_at": datetime.now(timezone.utc),
    })


def broadcast_announcement(message: str, priority: str, db: Any) -> str:
    """Broadcast a venue-wide announcement via Firestore (Pub/Sub simulation).

    Clients listen via onSnapshot and display announcements in real time.

    Args:
        message: Announcement body text.
        priority: 'normal', 'high', or 'emergency'.
        db: Firestore client instance.

    Returns:
        New announcement document ID.
    """
    doc_ref = db.collection("announcements").document()
    doc_ref.set({
        "id": doc_ref.id,
        "message": message,
        "priority": priority,
        "created_at": datetime.now(timezone.utc),
    })
    return doc_ref.id
