"""Google Cloud Translation API wrapper with local LRU caching."""

import logging
from typing import Optional

from google.cloud import translate_v2 as translate
from utils.cache import get_cached, set_cached
from services.analytics_service import log_performance

_logger = logging.getLogger("venusphere")
_translate_client = None


def _get_client() -> Optional[translate.Client]:
    """Lazy initialize the translation client to reduce cold-start."""
    global _translate_client  # pylint: disable=global-statement
    if _translate_client is None:
        try:
            _translate_client = translate.Client()
        except Exception as exc:  # pylint: disable=broad-exception-caught
            _logger.warning("Could not initialize translate client (likely missing credentials): %s", exc)
            return None
    return _translate_client


def translate_text(text: str, target_language: str) -> str:
    """Translate text to the target language via Google Cloud Translate v2 API.

    Uses an in-memory cache to avoid repeated API calls for the same text.
    If the API fails or is unconfigured, returns the original text gracefully.

    Args:
        text: The text to translate.
        target_language: ISO-639-1 language code (e.g., 'es', 'hi').

    Returns:
        The translated text, or the original text if translation fails.
    """
    if not text or not target_language or target_language == "en":
        return text

    cache_key = f"tr_{target_language}_{hash(text)}"
    cached = get_cached(cache_key, ttl_seconds=3600)  # Cache translations for 1 hour
    if cached:
        return cached

    client = _get_client()
    if not client:
        return text

    import time
    start = time.perf_counter()
    try:
        # Client handles batching, but we only send one here
        result = client.translate(text, target_language=target_language)
        translated = result.get("translatedText", text)
        
        # Decode HTML entities that the API sometimes returns
        import html
        translated = html.unescape(translated)

        duration_ms = (time.perf_counter() - start) * 1000
        log_performance("translate_api", duration_ms, {"target": target_language})

        set_cached(cache_key, translated)
        return translated

    except Exception as exc:  # pylint: disable=broad-exception-caught
        _logger.error("Translation API error: %s", exc)
        return text
