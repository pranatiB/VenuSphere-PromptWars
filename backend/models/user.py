"""User data models: preferences, chat sessions, and check-ins."""

from dataclasses import dataclass, field
from typing import Literal


DietaryRestriction = Literal["vegan", "halal", "gluten-free", "nut-free", "vegetarian"]
AccessibilityNeed = Literal["wheelchair", "hearing_loop", "large_text", "none"]


@dataclass
class UserPreferences:
    """Persisted preferences for a venue attendee."""

    uid: str
    dietary: list[DietaryRestriction] = field(default_factory=list)
    accessibility: list[AccessibilityNeed] = field(default_factory=list)
    favorite_cuisines: list[str] = field(default_factory=list)
    seating_section: str = ""
    language: str = "en"
    high_contrast: bool = False
    notifications_enabled: bool = True


@dataclass
class ChatMessage:
    """A single message in a chat session."""

    role: Literal["user", "assistant"]
    content: str
    timestamp: str
    action_type: str | None = None
    action_payload: dict | None = None


@dataclass
class ChatSession:
    """A conversation session between user and the assistant."""

    session_id: str
    uid: str
    messages: list[ChatMessage] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""


@dataclass
class CheckIn:
    """Anonymous crowd check-in from a user at a zone."""

    uid: str
    zone_id: str
    timestamp: str


@dataclass
class AlertSubscription:
    """User subscription for queue threshold push notification."""

    uid: str
    stall_id: str
    threshold_minutes: int
    active: bool = True
    created_at: str = ""
