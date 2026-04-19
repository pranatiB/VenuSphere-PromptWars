"""Venue data models: Zone, Stall, Restroom, Gate, and VenueLayout dataclasses."""

from dataclasses import dataclass, field
from typing import Literal


ZoneType = Literal["gate", "stand", "food_court", "merchandise", "concourse"]
StallType = Literal["food", "beverage", "merchandise"]


@dataclass
class Coordinates:
    """Geographic coordinates for a venue location."""

    lat: float
    lng: float


@dataclass
class Zone:
    """A named area of the venue with capacity and crowd tracking."""

    id: str
    name: str
    type: ZoneType
    capacity: int
    coordinates: Coordinates
    polygon: list[Coordinates] = field(default_factory=list)


@dataclass
class Stall:
    """A food, beverage, or merchandise stall within a zone."""

    id: str
    name: str
    zone_id: str
    type: StallType
    cuisine: str | None
    dietary: list[str]
    coordinates: Coordinates


@dataclass
class Restroom:
    """A restroom block within a zone."""

    id: str
    name: str
    zone_id: str
    coordinates: Coordinates
    is_accessible: bool = True


@dataclass
class Gate:
    """An entry/exit gate in the venue."""

    id: str
    name: str
    coordinates: Coordinates
    is_open: bool = True


@dataclass
class VenueLayout:
    """Complete venue structure used for navigation and queries."""

    id: str
    name: str
    capacity: int
    coordinates: Coordinates
    zones: list[Zone] = field(default_factory=list)
    stalls: list[Stall] = field(default_factory=list)
    restrooms: list[Restroom] = field(default_factory=list)
    gates: list[Gate] = field(default_factory=list)


@dataclass
class CrowdReading:
    """A density reading for a zone at a point in time."""

    zone_id: str
    density: float
    trend: Literal["increasing", "decreasing", "stable"]
    phase: str
    timestamp: str


@dataclass
class QueueReading:
    """A wait time reading for a stall or restroom."""

    stall_id: str
    wait_minutes: int
    trend: Literal["increasing", "decreasing", "stable"]
    phase: str
    timestamp: str
