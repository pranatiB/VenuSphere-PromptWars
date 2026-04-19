"""Regression checks for Crowd Autopilot frontend module wiring."""

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
AUTOPILOT_IMPORT = "/js/services/crowd-autopilot.js"


def _read(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def test_autopilot_consumers_share_single_module_instance():
    """All consumers should import the same URL so they share state/listeners."""
    files = [
        "frontend/js/app.js",
        "frontend/js/components/dashboard.js",
        "frontend/js/components/concierge.js",
    ]

    for relative_path in files:
        source = _read(relative_path)
        assert AUTOPILOT_IMPORT in source, f"{relative_path} should use canonical import path"
        assert "crowd-autopilot.js?v=" not in source, (
            f"{relative_path} should not use versioned query params for autopilot module"
        )


def test_concierge_escapes_alternate_zone_markup():
    """Alternate zone text must be escaped before DOM insertion to prevent XSS."""
    source = _read("frontend/js/components/concierge.js")
    assert "${_esc(prediction.alternateZone)}" in source
