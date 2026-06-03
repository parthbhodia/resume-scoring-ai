"""Server-side validation for suggest-gap-fix LLM proposals."""
from __future__ import annotations

import logging
from typing import Dict, List, Set

from resume_gui.tailor.gap_fix_terms import (
    extract_gap_target_terms,
    rewrite_includes_gap_terms,
)

logger = logging.getLogger("resume_gui")

_VALID_CATEGORIES = frozenset({
    "add_keywords",
    "relevance",
    "quantification",
    "readability",
    "action_verbs",
    "languagequality",
    "remove_filler",
})

_VALID_PRIORITIES = frozenset({"high", "medium", "low"})


def validate_gap_fix_suggestions(
    suggestions: List[dict],
    *,
    eligible_originals: Set[str],
    gap_name: str,
    gap_notes: str,
    validate_rewrite_fn,
) -> List[dict]:
    """
    LLM JSON = proposed patches; this layer = truth before the client shows them.
    """
    gap_target_terms = extract_gap_target_terms(gap_name, gap_notes)
    validated: List[dict] = []

    for raw in suggestions:
        if not isinstance(raw, dict):
            continue
        original = str(raw.get("original") or "").strip()
        suggested = str(raw.get("suggested") or "").strip()
        if not original or not suggested:
            continue
        if original not in eligible_originals:
            logger.info(
                "suggest-gap-fix dropped original not in structured bullets: orig=%r",
                original[:80],
            )
            continue
        if gap_target_terms and not rewrite_includes_gap_terms(suggested, gap_target_terms):
            logger.info(
                "suggest-gap-fix dropped rewrite missing JD terms %s: rewrite=%r",
                gap_target_terms,
                suggested[:100],
            )
            continue
        cat = str(raw.get("category") or "").strip().lower() or None
        if cat and cat not in _VALID_CATEGORIES:
            cat = "add_keywords"
        pri = str(raw.get("priority") or "high").strip().lower()
        if pri not in _VALID_PRIORITIES:
            pri = "high"
        ok, why = validate_rewrite_fn(original, suggested, category=cat)
        if not ok:
            logger.info(
                "suggest-gap-fix dropped suggestion (%s): orig=%r  rewrite=%r",
                why,
                original[:80],
                suggested[:80],
            )
            continue
        validated.append({
            "id": str(raw.get("id") or f"gf{len(validated) + 1}"),
            "section": str(raw.get("section") or "Work Experience"),
            "original": original,
            "suggested": suggested,
            "reason": str(raw.get("reason") or "").strip(),
            "category": cat or "add_keywords",
            "priority": pri,
        })
    return validated
