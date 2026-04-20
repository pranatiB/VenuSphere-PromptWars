"""reCAPTCHA v3 verification utility.

Provides a lightweight server-side check against the Google reCAPTCHA API.
Fails softly (allows request) if the secret key is missing during local dev.
"""

import json
import logging
import os
import urllib.request
import urllib.parse
from typing import Tuple

from services.analytics_service import log_security_event


_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"
_logger = logging.getLogger("venusphere")


def verify_recaptcha(token: str, action: str, min_score: float = 0.5) -> Tuple[bool, float]:
    """Verify a reCAPTCHA v3 client token.

    Args:
        token: The token string provided by the frontend.
        action: The expected reCAPTCHA action (e.g. 'chat_send').
        min_score: Minimum risk score to pass (0.0=bot, 1.0=human).

    Returns:
        (is_valid, score). Score is 0.0 if invalid.
    """
    secret = os.environ.get("RECAPTCHA_SECRET")
    if not secret:
        # Development mode bypass
        _logger.warning("RECAPTCHA_SECRET not set. Bypassing reCAPTCHA check.")
        return True, 1.0

    if not token:
        log_security_event("unknown", "recaptcha_missing_token", f"Action: {action}")
        return False, 0.0

    data = urllib.parse.urlencode({
        "secret": secret,
        "response": token
    }).encode("utf-8")

    try:
        req = urllib.request.Request(_VERIFY_URL, data=data, method="POST")
        with urllib.request.urlopen(req, timeout=5) as response:
            result = json.loads(response.read().decode("utf-8"))

        if not result.get("success"):
            codes = ",".join(result.get("error-codes", []))
            log_security_event("unknown", "recaptcha_failure", f"Errors: {codes}")
            return False, 0.0

        if result.get("action") != action:
            log_security_event("unknown", "recaptcha_action_mismatch",
                               f"Expected {action}, got {result.get('action')}")
            return False, 0.0

        score = float(result.get("score", 0.0))
        if score < min_score:
            log_security_event("unknown", "recaptcha_low_score",
                               f"Score {score} < {min_score} for action {action}")
            return False, score

        return True, score

    except Exception as exc:  # pylint: disable=broad-exception-caught
        # Fail closed on network errors to prevent bypass
        log_security_event("unknown", "recaptcha_network_error", str(exc))
        return False, 0.0
