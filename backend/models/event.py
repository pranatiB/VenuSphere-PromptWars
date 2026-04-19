"""Event data models: phases, schedule, and smart alerts."""

from dataclasses import dataclass, field
from typing import Literal


AlertType = Literal["info", "warning", "alert", "emergency"]
PriorityLevel = Literal["low", "medium", "high", "emergency"]


@dataclass
class EventPhase:
    """A named phase within the event timeline."""

    id: str
    name: str
    duration_minutes: int
    start_offset: int


@dataclass
class EventSchedule:
    """Full event schedule with all phases."""

    id: str
    name: str
    duration_minutes: int
    current_phase: str
    phases: list[EventPhase] = field(default_factory=list)


@dataclass
class SmartAlert:
    """A context-aware alert triggered by venue state or event phase."""

    phase: str
    priority: PriorityLevel
    title: str
    message: str
    type: AlertType
    zone_id: str | None = None
    stall_id: str | None = None


@dataclass
class Announcement:
    """A broadcast message sent venue-wide."""

    id: str
    message: str
    priority: PriorityLevel
    created_at: str
