"""Gemini-powered AI assistant service with context-aware venue recommendations."""

import json
from datetime import datetime, timezone
from typing import Any

from services.crowd_service import get_all_zones_density
from services.queue_service import get_all_queue_times
from services.event_service import get_current_phase, get_upcoming_alerts
from utils.cache import get_cached, set_cached


_MODEL_NAME = "gemini-1.5-flash"
_MAX_HISTORY_TURNS = 10
_SYSTEM_PROMPT = """You are VenueFlow, an AI assistant for Olympic Stadium.
You help attendees at Championship Final 2026 navigate the venue, find food with
short wait times, locate restrooms, check crowd levels, and plan their event experience.

You have access to live venue data which will be provided in the user's context.
Always give specific, actionable recommendations with clear reasoning.
Responses should be concise (under 150 words) and end with a clear action item.
Format structured data (stalls, routes) as JSON inside <action> tags when relevant."""


def _load_session_history(uid: str, session_id: str, db: Any) -> list[dict]:
    """Load the last N chat turns from Firestore for context.

    Args:
        uid: Firebase user ID.
        session_id: Chat session identifier.
        db: Firestore client instance.

    Returns:
        List of message dicts [{'role', 'content'}].
    """
    docs = (
        db.collection("users")
        .document(uid)
        .collection("chat_history")
        .order_by("created_at", direction="ASCENDING")
        .limit(_MAX_HISTORY_TURNS * 2)
        .stream()
    )
    history = []
    for doc in docs:
        data = doc.to_dict()
        history.append({
            "role": data.get("role", "user"),
            "content": data.get("content", ""),
        })
    return history


def _save_message(uid: str, role: str, content: str, db: Any) -> None:
    """Persist a single chat message to Firestore.

    Args:
        uid: Firebase user ID.
        role: 'user' or 'assistant'.
        content: Message text.
        db: Firestore client instance.
    """
    db.collection("users").document(uid).collection("chat_history").add({
        "role": role,
        "content": content,
        "created_at": datetime.now(timezone.utc),
    })


def _build_venue_context(phase: str, db: Any) -> str:
    """Build a concise JSON context string with live venue state.

    Args:
        phase: Current event phase.
        db: Firestore client instance.

    Returns:
        JSON string summarising crowd, queue, and alert data.
    """
    crowd = get_all_zones_density(phase, db)
    queues = get_all_queue_times(phase, db)
    alerts = get_upcoming_alerts(phase, db)

    top_crowded = sorted(crowd, key=lambda x: x["density"], reverse=True)[:3]
    shortest_queues = sorted(queues, key=lambda x: x["wait_minutes"])[:5]

    context = {
        "event_phase": phase,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "busiest_zones": [{"zone_id": z["zone_id"], "density": z["density"], "label": z["label"]} for z in top_crowded],
        "shortest_queues": [{"stall_id": q["stall_id"], "wait_minutes": q["wait_minutes"]} for q in shortest_queues],
        "active_alerts": [a.get("message", "") for a in alerts[:2]],
    }
    return json.dumps(context, indent=2)


def _detect_action_type(response_text: str) -> tuple[str | None, dict | None]:
    """Extract structured action from assistant response if present.

    Args:
        response_text: Raw text response from Gemini.

    Returns:
        Tuple of (action_type, action_payload) or (None, None).
    """
    if "<action>" in response_text and "</action>" in response_text:
        start = response_text.index("<action>") + len("<action>")
        end = response_text.index("</action>")
        action_str = response_text[start:end].strip()
        try:
            payload = json.loads(action_str)
            action_type = payload.get("type", "info")
            return action_type, payload
        except (json.JSONDecodeError, ValueError):
            pass
    return None, None


def chat(uid: str, message: str, session_id: str, phase: str, db: Any) -> dict:
    """Process a user message and return a contextual Gemini response.

    Args:
        uid: Firebase Auth user ID.
        message: User's message text (already sanitized).
        session_id: Chat session identifier for history grouping.
        phase: Current event phase for context injection.
        db: Firestore client instance.

    Returns:
        Dict with 'text', 'action_type', 'action_payload', and 'session_id'.
    """
    try:
        import vertexai
        from vertexai.generative_models import GenerativeModel

        vertexai.init()
        model = GenerativeModel(
            _MODEL_NAME,
            system_instruction=_SYSTEM_PROMPT,
        )

        history = _load_session_history(uid, session_id, db)
        venue_context = _build_venue_context(phase, db)
        enriched_message = f"[Live Venue Data]\n{venue_context}\n\n[User Message]\n{message}"

        gemini_history = []
        for turn in history:
            gemini_history.append({
                "role": turn["role"],
                "parts": [turn["content"]],
            })

        chat_session = model.start_chat(history=gemini_history)
        response = chat_session.send_message(enriched_message)
        response_text = response.text

        _save_message(uid, "user", message, db)
        _save_message(uid, "assistant", response_text, db)

        action_type, action_payload = _detect_action_type(response_text)
        clean_text = response_text
        if "<action>" in clean_text:
            clean_text = clean_text[:clean_text.index("<action>")].strip()

        return {
            "text": clean_text,
            "action_type": action_type,
            "action_payload": action_payload,
            "session_id": session_id,
        }

    except Exception as exc:
        fallback = _fallback_response(message, phase, db)
        return {
            "text": fallback,
            "action_type": None,
            "action_payload": None,
            "session_id": session_id,
            "error": str(exc),
        }


def _fallback_response(message: str, phase: str, db: Any) -> str:
    """Generate a rule-based fallback response when Gemini is unavailable.

    Args:
        message: User's original message.
        phase: Current event phase.
        db: Firestore client instance.

    Returns:
        A contextual fallback response string.
    """
    msg_lower = message.lower()
    queues = get_all_queue_times(phase, db)
    shortest_stalls = sorted(queues, key=lambda q: q["wait_minutes"])

    if any(w in msg_lower for w in ("food", "eat", "hungry", "stall")):
        if shortest_stalls:
            s = shortest_stalls[0]
            return (f"The shortest food queue right now is at {s['stall_id']} "
                    f"with a {s['wait_minutes']}-minute wait. Head there now!")
    if any(w in msg_lower for w in ("restroom", "toilet", "bathroom", "wc")):
        wc = [q for q in shortest_stalls if q["stall_id"].startswith("wc_")]
        if wc:
            w = wc[0]
            return (f"Nearest restroom with shortest wait: {w['stall_id']} "
                    f"— only {w['wait_minutes']} minutes.")
    if any(w in msg_lower for w in ("exit", "gate", "leave")):
        return "Gate West is currently the least crowded exit. Head there now for fastest exit."
    return "I'm here to help! Ask me about food queues, restrooms, crowd levels, or navigation."
