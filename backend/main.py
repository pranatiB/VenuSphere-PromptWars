"""Cloud Function HTTP entry points for the VenuSphere API.

All endpoints (except /api/health) require a valid Firebase Auth token
in the Authorization: Bearer <token> header.

Rate limit: 30 requests per 60 seconds per authenticated user.
"""

import json
import os
import uuid

import firebase_admin
from firebase_functions import https_fn
from firebase_admin import firestore
from flask import Request, Response, jsonify

from services import (
    crowd_service,
    queue_service,
    event_service,
    assistant_service,
    notification_service,
    analytics_service,
)
from utils.security import (
    validate_firebase_token,
    extract_bearer_token,
    sanitize_input,
    check_rate_limit,
    hash_uid,
)


_ALLOWED_ORIGINS = [
    os.environ.get("CORS_ORIGIN", "https://venusphere-promptwars-apr2026.web.app"),
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]


def _init_firebase() -> None:
    """Initialize Firebase Admin SDK once (lazy singleton)."""
    if not firebase_admin._apps:
        firebase_admin.initialize_app()


def _get_db():
    """Return the Firestore client, initializing Firebase if needed."""
    _init_firebase()
    return firestore.client()


def _cors_headers(origin: str = None) -> dict:
    """Return CORS response headers restricted to the allowed domains."""
    # Default to the primary production origin
    effective_origin = os.environ.get("CORS_ORIGIN", "https://venusphere-promptwars-apr2026.web.app")

    # If the request provides an Origin, check if it's in our allowed list
    if origin:
        # Match production URL or any localhost/127.0.0.1 variation
        if origin in _ALLOWED_ORIGINS or "localhost" in origin or "127.0.0.1" in origin:
            effective_origin = origin

    return {
        "Access-Control-Allow-Origin": effective_origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "3600",
    }


def _authenticate(request: Request) -> tuple[str | None, Response | None]:
    """Validate the bearer token and enforce rate limiting.

    Returns:
        (uid, None) on success, or (None, error_response) on failure.
    """
    origin = request.headers.get("Origin")
    token = extract_bearer_token(request.headers.get("Authorization", ""))
    if not token:
        return None, (jsonify({"error": "Missing authorization token"}), 401, _cors_headers(origin))

    uid = validate_firebase_token(token)
    if not uid:
        analytics_service.log_security_event("unknown", "invalid_token", request.path)
        return None, (jsonify({"error": "Invalid or expired token"}), 401, _cors_headers(origin))

    if not check_rate_limit(uid):
        analytics_service.log_security_event(hash_uid(uid), "rate_limit_exceeded", request.path)
        return None, (jsonify({"error": "Rate limit exceeded. Max 30 requests/minute."}), 429, _cors_headers(origin))

    return uid, None


@https_fn.on_request()
def venusphere_api(request: https_fn.Request) -> https_fn.Response:
    """Main Cloud Function HTTP dispatcher for all /api/* routes.

    Args:
        request: Incoming Flask-like HTTP request.

    Returns:
        JSON HTTP response.
    """
    origin = request.headers.get("Origin")
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers(origin))

    path = request.path.rstrip("/")
    method = request.method

    # Health check MUST be before any Firebase/Firestore initialization
    # so the Cloud Run health probe succeeds during cold start.
    if path == "/api/health":
        return jsonify({"status": "ok", "service": "venusphere"}), 200, _cors_headers(origin)

    uid, err_response = _authenticate(request)
    if err_response:
        return err_response

    db = _get_db()
    uid_hash = hash_uid(uid)
    try:
        return _dispatch(request, path, method, uid, uid_hash, db, origin)
    except Exception as exc:
        analytics_service.log_api_error(path, str(exc), 500)
        return jsonify({"error": "Internal server error"}), 500, _cors_headers(origin)


def _dispatch(
    request: Request,
    path: str,
    method: str,
    uid: str,
    uid_hash: str,
    db,
    origin: str = None,
) -> Response:
    """Route request to the correct service handler.

    Args:
        request: HTTP request object.
        path: Normalized request path.
        method: HTTP method string.
        uid: Authenticated user ID.
        uid_hash: Anonymised UID for logging.
        db: Firestore client.
        origin: Request origin header.

    Returns:
        JSON response tuple.
    """
    headers = _cors_headers(origin)
    phase = event_service.get_current_phase(db)

    if path == "/api/crowd" and method == "GET":
        data = crowd_service.get_all_zones_density(phase, db)
        analytics_service.log_event(uid_hash, "crowd_view", {"phase": phase})
        return jsonify({"zones": data, "phase": phase}), 200, headers

    if path.startswith("/api/crowd/") and method == "GET":
        zone_id = path.split("/api/crowd/")[1]
        data = crowd_service.get_zone_density(zone_id, phase, db)
        p15 = crowd_service.predict_density(zone_id, phase, 15, db)
        p30 = crowd_service.predict_density(zone_id, phase, 30, db)
        return jsonify({**data, "prediction_15": p15, "prediction_30": p30}), 200, headers

    if path == "/api/queue" and method == "GET":
        data = queue_service.get_all_queue_times(phase, db)
        analytics_service.log_event(uid_hash, "queue_view", {"phase": phase})
        return jsonify({"queues": data, "phase": phase}), 200, headers

    if path.startswith("/api/queue/") and not path.endswith("/subscribe") and method == "GET":
        stall_id = path.split("/api/queue/")[1]
        data = queue_service.get_queue_time(stall_id, phase, db)
        rec = queue_service.best_time_recommendation(stall_id, phase, db)
        return jsonify({**data, "recommendation": rec}), 200, headers

    if path.startswith("/api/queue/") and path.endswith("/subscribe") and method == "POST":
        stall_id = path.split("/api/queue/")[1].replace("/subscribe", "")
        body = request.get_json(silent=True) or {}
        threshold = int(body.get("threshold_minutes", 5))
        queue_service.subscribe_alert(uid, stall_id, threshold, db)
        analytics_service.log_event(uid_hash, "queue_subscribe", {"stall_id": stall_id, "threshold": threshold})
        return jsonify({"success": True, "stall_id": stall_id, "threshold_minutes": threshold}), 200, headers

    if path == "/api/chat" and method == "POST":
        body = request.get_json(silent=True) or {}
        raw_message = body.get("message", "")
        message = sanitize_input(raw_message, max_len=500)
        if not message:
            return jsonify({"error": "Message is required"}), 400, headers
        session_id = sanitize_input(body.get("session_id", str(uuid.uuid4())))
        result = assistant_service.chat(uid, message, session_id, phase, db)
        analytics_service.log_event(uid_hash, "chat", {"phase": phase})
        return jsonify(result), 200, headers

    if path == "/api/schedule" and method == "GET":
        schedule = event_service.get_schedule(db)
        alerts = event_service.get_upcoming_alerts(phase, db)
        return jsonify({"schedule": schedule, "alerts": alerts, "current_phase": phase}), 200, headers

    if path == "/api/alerts" and method == "GET":
        alerts = event_service.get_upcoming_alerts(phase, db)
        return jsonify({"alerts": alerts, "phase": phase}), 200, headers

    if path == "/api/checkin" and method == "POST":
        body = request.get_json(silent=True) or {}
        zone_id = sanitize_input(body.get("zone_id", ""), max_len=50)
        if not zone_id:
            return jsonify({"error": "zone_id is required"}), 400, headers
        from utils.security import hash_uid as h
        success = crowd_service.process_checkin(zone_id, h(uid), phase, db)
        analytics_service.log_event(uid_hash, "checkin", {"zone_id": zone_id})
        return jsonify({"success": success}), 200, headers

    if path == "/api/preferences" and method == "GET":
        doc = db.collection("users").document(uid).get()
        prefs = doc.to_dict() if doc.exists else {}
        return jsonify({"preferences": prefs}), 200, headers

    if path == "/api/preferences" and method == "PUT":
        body = request.get_json(silent=True) or {}
        allowed_keys = {"dietary", "accessibility", "favorite_cuisines",
                        "seating_section", "language", "high_contrast",
                        "notifications_enabled"}
        prefs = {k: v for k, v in body.items() if k in allowed_keys}
        prefs["uid"] = uid
        db.collection("users").document(uid).set(prefs, merge=True)
        return jsonify({"success": True}), 200, headers

    if path == "/api/navigate" and method == "POST":
        body = request.get_json(silent=True) or {}
        from_zone = sanitize_input(body.get("from_zone", ""), max_len=50)
        to_zone = sanitize_input(body.get("to_zone", ""), max_len=50)
        avoid_crowds = bool(body.get("avoid_crowds", True))

        crowd_data = crowd_service.get_all_zones_density(phase, db)
        high_density = [z["zone_id"] for z in crowd_data if z["density"] > 0.7]

        zones_ref = db.collection("zones")
        from_doc = zones_ref.document(from_zone).get()
        to_doc = zones_ref.document(to_zone).get()

        if not from_doc.exists or not to_doc.exists:
            return jsonify({"error": "Invalid zone IDs"}), 400, headers

        from_coords = from_doc.to_dict().get("coordinates", {})
        to_coords = to_doc.to_dict().get("coordinates", {})

        analytics_service.log_event(uid_hash, "navigate", {
            "from": from_zone, "to": to_zone, "avoid_crowds": avoid_crowds
        })
        return jsonify({
            "from_zone": from_zone,
            "to_zone": to_zone,
            "from_coords": from_coords,
            "to_coords": to_coords,
            "avoid_zones": high_density if avoid_crowds else [],
            "estimated_minutes": 5,
        }), 200, headers

    if path == "/api/announcements" and method == "GET":
        announcements = event_service.get_announcements(db)
        return jsonify({"announcements": announcements}), 200, headers

    return jsonify({"error": "Not found"}), 404, headers
