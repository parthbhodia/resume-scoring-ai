"""Text normalization + boundary-safe phrase matching."""
from __future__ import annotations

import re
import unicodedata


def normalize_text(value: str) -> str:
    """Normalize text for deterministic matching while preserving meaning."""
    text = unicodedata.normalize("NFKD", value or "")
    text = text.lower()
    text = re.sub(r"[^a-z0-9+#.\s/-]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def phrase_exists(text: str, phrase: str) -> bool:
    """
    True when phrase appears as a standalone unit in normalized text.
    Prevents java⊂javascript, sql⊂nosql style false positives.
    """
    normalized_text = normalize_text(text)
    normalized_phrase = normalize_text(phrase)
    if not normalized_phrase:
        return False
    pattern = r"(?<![a-z0-9])" + re.escape(normalized_phrase) + r"(?![a-z0-9])"
    return re.search(pattern, normalized_text) is not None
