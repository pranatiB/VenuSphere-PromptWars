"""Guardrails to prevent committing frontend secrets."""

import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_FILE = REPO_ROOT / "frontend/js/config.prod.js"


def test_prod_config_uses_placeholders_not_live_keys():
    source = CONFIG_FILE.read_text(encoding="utf-8")

    # Common high-signal secret fingerprints.
    forbidden_patterns = [
        r"AIza[0-9A-Za-z_-]{20,}",  # Google API keys
        r"6L[eE][0-9A-Za-z_-]{20,}",  # reCAPTCHA site keys
        r"firebaseapp\.com",  # committed project domains
    ]

    for pattern in forbidden_patterns:
        assert not re.search(pattern, source), f"Found forbidden secret-like pattern: {pattern}"

    required_placeholders = [
        "REPLACE_MAPS_API_KEY",
        "REPLACE_RECAPTCHA_SITE_KEY",
        "REPLACE_FIREBASE_API_KEY",
        "REPLACE_FIREBASE_AUTH_DOMAIN",
    ]
    for placeholder in required_placeholders:
        assert placeholder in source, f"Missing expected placeholder: {placeholder}"
