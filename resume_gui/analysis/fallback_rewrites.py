"""Deterministic rewrite fallbacks when the LLM or validators leave a flagged bullet empty."""
from __future__ import annotations

import re

_COUNTABLE_NOUN_RE = re.compile(
    r"\b(cases|matters|briefs|agreements|contracts|filings|memos|documents|"
    r"notices|properties|clients|deals|projects|initiatives|reports)\b",
    re.I,
)

_DUTY_LEAD_RE = re.compile(
    r"^(assisted in|helped with|worked on|responsible for|participated in|"
    r"involved in|supported work on)\s+",
    re.I,
)


def _normalize_ws(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _structure_preserving_line(text: str) -> str:
    """Keep every sentence/clause; improve skim with semicolons instead of deleting."""
    t = _normalize_ws(text)
    if not t:
        return ""
    sentences = [s.strip().rstrip(".") for s in re.split(r"(?<=[.!?])\s+", t) if s.strip()]
    if len(sentences) >= 2:
        return "; ".join(sentences) + "."
    return t if t.endswith((".", "!", "?")) else f"{t}."


def _inject_quant_placeholder(text: str) -> str:
    t = _structure_preserving_line(text)
    if re.search(r"\[[^\]]+\]|\d", t):
        return t
    return _COUNTABLE_NOUN_RE.sub(r"[~N] \1", t, count=1)


def _achievement_lead(text: str) -> str:
    t = _structure_preserving_line(text)
    return _DUTY_LEAD_RE.sub("Delivered ", t)


def synthesize_fallback_rewrite(
    original: str,
    primary_category: str | None,
    issue_categories: list | None = None,
) -> tuple[str, dict[str, str]]:
    """Return (improvedBullet, categoryRewrites) — never empty for non-empty originals."""
    orig = _normalize_ws(original)
    if not orig:
        return "", {}

    cat = (primary_category or "").strip().lower()
    issues = {str(c).strip().lower() for c in (issue_categories or []) if str(c).strip()}

    if cat == "quantification" or "quantification" in issues:
        rewrite = _inject_quant_placeholder(orig)
        return rewrite, {"quantification": rewrite}

    if cat == "achievementquality" or "achievementquality" in issues:
        rewrite = _achievement_lead(orig)
        if not re.search(r"\[[^\]]+\]|\d", rewrite):
            rewrite = _inject_quant_placeholder(rewrite)
        return rewrite, {"achievementQuality": rewrite}

    if cat == "readability" or "readability" in issues:
        rewrite = _structure_preserving_line(orig)
        return rewrite, {"readability": rewrite}

    if cat == "languagequality" or "languagequality" in issues:
        rewrite = _achievement_lead(orig)
        return rewrite, {"languageQuality": rewrite}

    # Default: always ship structured text the candidate can apply.
    rewrite = _structure_preserving_line(orig)
    if cat:
        key = primary_category or "readability"
        return rewrite, {key: rewrite}
    return rewrite, {"readability": rewrite}
