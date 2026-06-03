"""Layer 1 — extract JD phrases that ground a requirement label."""
from __future__ import annotations

import re
from typing import List, Set

from resume_gui.tailor.requirement_match.normalize import normalize_text, phrase_exists

_LABEL_STOP = frozenset({
    "framework", "platform", "tool", "tools", "skill", "skills", "experience",
    "knowledge", "required", "preferred", "ability", "years",
})


def _significant_tokens(label: str) -> List[str]:
    return [
        t for t in normalize_text(label).split()
        if len(t) > 2 and t not in _LABEL_STOP
    ]


def extract_jd_phrases_for_label(
    job_description: str,
    label: str,
    *,
    max_phrases: int = 6,
) -> List[str]:
    """
    Find JD clauses that mention the same concept as label (source-grounded aliases).
    """
    tokens = _significant_tokens(label)
    if not tokens or not (job_description or "").strip():
        return []

    seen: Set[str] = set()
    out: List[str] = []

    chunks = re.split(r"[\n\r]+|(?<=[.;•])\s+", job_description)
    for chunk in chunks:
        line = chunk.strip()
        if len(line) < 4 or len(line) > 160:
            continue
        norm = normalize_text(line)
        if not all(t in norm or phrase_exists(line, t) for t in tokens):
            continue
        key = normalize_text(line)
        if key in seen:
            continue
        seen.add(key)
        out.append(line)
        if len(out) >= max_phrases:
            break

    return out
