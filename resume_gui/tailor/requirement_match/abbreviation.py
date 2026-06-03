"""Dynamic abbreviation generation from multi-word phrases."""
from __future__ import annotations

import re

_ABBR_STOP_WORDS = frozenset({
    "and", "or", "the", "for", "with", "experience", "skills", "skill",
})


def generate_abbreviation(phrase: str) -> str | None:
    """
    Multi-word phrase → acronym (e.g. National Electrical Code → nec).
    Returns None for short/generic phrases.
    """
    words = [
        word for word in re.findall(r"[a-zA-Z]+", phrase or "")
        if len(word) > 2 and word.lower() not in _ABBR_STOP_WORDS
    ]
    if len(words) < 2:
        return None
    abbreviation = "".join(word[0].lower() for word in words)
    if len(abbreviation) < 2:
        return None
    return abbreviation
