"""Seed script: populates Firestore with Olympic Stadium demo data.

Run once before demo:
    python seed/seed_venue.py

Requires GOOGLE_APPLICATION_CREDENTIALS env var or Firebase Admin SDK credentials.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore


def load_demo_data() -> dict:
    """Load the pre-built demo data JSON file."""
    data_path = Path(__file__).parent / "demo_data.json"
    with open(data_path, "r", encoding="utf-8") as f:
        return json.load(f)


def init_firebase(project_id: str) -> firestore.Client:
    """Initialize Firebase Admin SDK and return Firestore client."""
    if not firebase_admin._apps:
        # Load the downloaded service account key
        key_path = Path(__file__).parent / "serviceAccountKey.json"
        if not key_path.exists():
            raise FileNotFoundError(f"Missing {key_path}. Please download it from Firebase Console -> Project Settings -> Service Accounts.")
        
        cred = credentials.Certificate(key_path)
        firebase_admin.initialize_app(cred, {"projectId": project_id})
    return firestore.client()


def seed_zones(db: firestore.Client, zones: list[dict]) -> None:
    """Write zone documents to Firestore."""
    batch = db.batch()
    for zone in zones:
        ref = db.collection("zones").document(zone["id"])
        batch.set(ref, {
            "id": zone["id"],
            "name": zone["name"],
            "type": zone["type"],
            "capacity": zone["capacity"],
            "coordinates": zone["coordinates"],
            "polygon": zone["polygon"],
            "updated_at": datetime.now(timezone.utc),
        })
    batch.commit()
    print(f"Seeded {len(zones)} zones.")


def seed_stalls(db: firestore.Client, stalls: list[dict]) -> None:
    """Write stall documents to Firestore."""
    batch = db.batch()
    for stall in stalls:
        ref = db.collection("stalls").document(stall["id"])
        batch.set(ref, {**stall, "updated_at": datetime.now(timezone.utc)})
    batch.commit()
    print(f"Seeded {len(stalls)} stalls.")


def seed_restrooms(db: firestore.Client, restrooms: list[dict]) -> None:
    """Write restroom documents to Firestore."""
    batch = db.batch()
    for room in restrooms:
        ref = db.collection("restrooms").document(room["id"])
        batch.set(ref, {**room, "updated_at": datetime.now(timezone.utc)})
    batch.commit()
    print(f"Seeded {len(restrooms)} restrooms.")


def seed_crowd_density(db: firestore.Client, simulation: dict) -> None:
    """Write initial crowd density documents per zone per phase."""
    batch = db.batch()
    now = datetime.now(timezone.utc)
    for phase, zones in simulation["phases"].items():
        for zone_id, density in zones.items():
            doc_id = f"{zone_id}_{phase}"
            ref = db.collection("crowd_density").document(doc_id)
            batch.set(ref, {
                "zone_id": zone_id,
                "phase": phase,
                "density": density,
                "trend": "stable",
                "timestamp": now,
            })
    batch.commit()
    print("Seeded crowd density data.")


def seed_queue_times(db: firestore.Client, simulation: dict) -> None:
    """Write initial queue time documents per stall per phase."""
    batch = db.batch()
    now = datetime.now(timezone.utc)
    for phase, stalls in simulation["phases"].items():
        for stall_id, wait_minutes in stalls.items():
            doc_id = f"{stall_id}_{phase}"
            ref = db.collection("queue_times").document(doc_id)
            batch.set(ref, {
                "stall_id": stall_id,
                "phase": phase,
                "wait_minutes": wait_minutes,
                "timestamp": now,
            })
    batch.commit()
    print("Seeded queue time data.")


def seed_event_schedule(db: firestore.Client, event: dict) -> None:
    """Write event schedule and phases to Firestore."""
    ref = db.collection("event_schedule").document(event["id"])
    ref.set({
        "id": event["id"],
        "name": event["name"],
        "duration_minutes": event["duration_minutes"],
        "phases": event["phases"],
        "current_phase": "pre_event",
        "updated_at": datetime.now(timezone.utc),
    })
    print("Seeded event schedule.")


def seed_alerts(db: firestore.Client, alerts: list[dict]) -> None:
    """Write smart alert documents to Firestore."""
    batch = db.batch()
    for i, alert in enumerate(alerts):
        ref = db.collection("alerts").document(f"alert_{i+1:03d}")
        batch.set(ref, {**alert, "created_at": datetime.now(timezone.utc)})
    batch.commit()
    print(f"Seeded {len(alerts)} alerts.")


def seed_announcements(db: firestore.Client, announcements: list[dict]) -> None:
    """Write announcement documents to Firestore."""
    batch = db.batch()
    for ann in announcements:
        ref = db.collection("announcements").document(ann["id"])
        batch.set(ref, ann)
    batch.commit()
    print(f"Seeded {len(announcements)} announcements.")


def seed_crowd_summary(db: firestore.Client, simulation: dict) -> None:
    """Write the live crowd summary document used by the dashboard."""
    phase_data = simulation["phases"]["pre_event"]
    avg_density = sum(phase_data.values()) / len(phase_data)
    ref = db.collection("crowd_summary").document("live")
    ref.set({
        "overall_density": round(avg_density, 2),
        "current_phase": "pre_event",
        "busiest_zone": "gate_north",
        "quietest_zone": "stand_east",
        "timestamp": datetime.now(timezone.utc),
    })
    print("Seeded crowd summary.")


def main() -> None:
    """Entry point: seed all Firestore collections from demo data."""
    project_id = os.environ.get("FIREBASE_PROJECT_ID", "venueflow-demo")
    print(f"Seeding Firestore for project: {project_id}")

    data = load_demo_data()
    db = init_firebase(project_id)

    seed_zones(db, data["zones"])
    seed_stalls(db, data["stalls"])
    seed_restrooms(db, data["restrooms"])
    seed_crowd_density(db, data["crowd_simulation"])
    seed_queue_times(db, data["queue_simulation"])
    seed_event_schedule(db, data["event"])
    seed_alerts(db, data["alerts"])
    seed_announcements(db, data["announcements"])
    seed_crowd_summary(db, data["crowd_simulation"])

    print("\nAll seed data written successfully.")


if __name__ == "__main__":
    main()
