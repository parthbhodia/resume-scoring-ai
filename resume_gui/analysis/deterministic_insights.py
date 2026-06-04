"""Surface deterministic recruiter checks as topIssues for regex-fallback analysis only.

`_recruiter_checks()` always runs; on the normal LLM path its summary is passed
into the analysis prompt as structural_signals — not copied into topIssues (those
are generic one-liners with raw line lists, no per-bullet rewrites).

When the LLM call fails, `_regex_to_comprehensive` + `inject_deterministic_insights`
provide a minimal UI from rule-based checks instead.
"""
from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger("resume_gui")

# check id → one of AnalysisResult.categoryScores keys
_CHECK_CATEGORY: dict[str, str] = {
    "quantify":        "quantification",
    "role_depth":      "quantification",
    "weak_verbs":      "achievementQuality",
    "action":          "achievementQuality",
    "passive_voice":   "achievementQuality",
    "pronouns":        "languageQuality",
    "repetition":      "languageQuality",
    "buzzwords":       "languageQuality",
    "spelling":        "languageQuality",
    "density":         "readability",
    "length":          "readability",
    "summary_length":  "readability",
    "unnecessary":     "sectionStructure",
    "date_led_bullet": "sectionStructure",
    "dates":           "atsCompatibility",
    "contact":         "atsCompatibility",
    "portfolio":       "atsCompatibility",
}

# Short, imperative suggestion per check id (what the user should DO).
_CHECK_SUGGESTION: dict[str, str] = {
    "quantify":        "Add a metric (%/$/count/time) to the bullets below.",
    "role_depth":      "Give each role 3+ bullets with at least one quantified result.",
    "weak_verbs":      "Replace weak verbs (helped, worked on) with strong action verbs.",
    "action":          "Start each bullet with a strong action verb.",
    "passive_voice":   "Rewrite passive 'was/were …ed' lines into owned, active outcomes.",
    "pronouns":        "Remove personal pronouns (I, me, my, we) — résumés use implied first person.",
    "repetition":      "Vary your action verbs — avoid repeating the same opener.",
    "buzzwords":       "Replace these buzzwords with specific, measurable accomplishments.",
    "spelling":        "Fix these spelling errors.",
    "density":         "Expand thin bullets into Action + Context + Result.",
    "length":          "Adjust length toward 400–700 words (one page for most candidates).",
    "summary_length":  "Condense the professional summary to 25–75 words.",
    "unnecessary":     "Remove these filler phrases entirely.",
    "date_led_bullet": "Move dates to the role header; open bullets with an action.",
    "dates":           "Add start/end dates to every role and education entry.",
    "contact":         "Add the missing contact details to your header.",
    "portfolio":       "Add a portfolio / GitHub / personal-site link.",
}


def _severity_for(score: int) -> str:
    if score < 5:
        return "high"
    if score < 7:
        return "medium"
    return "low"


def _dedup_blob(issue: dict) -> str:
    return re.sub(
        r"\s+", " ",
        f"{issue.get('issue','')} {issue.get('whyItMatters','')} {issue.get('suggestion','')}".lower(),
    )


def build_deterministic_issues(struct: dict) -> list[dict]:
    """Convert failed _recruiter_checks into topIssue dicts (category + items)."""
    out: list[dict] = []
    for c in struct.get("checks", []) or []:
        if c.get("passed"):
            continue
        cid = c.get("id", "")
        category = _CHECK_CATEGORY.get(cid)
        if not category:
            continue
        score = int(c.get("score") or 0)
        items = [str(x) for x in (c.get("items") or []) if str(x).strip()]
        # A failing check with no concrete items and no useful detail isn't
        # actionable — skip it (e.g. a borderline density score with nothing to show).
        out.append({
            "issue": c.get("name", cid),
            "severity": _severity_for(score),
            "whyItMatters": c.get("detail", ""),
            "suggestion": _CHECK_SUGGESTION.get(cid, c.get("detail", "")[:120]),
            "category": category,
            "items": items[:8],
            "source": "deterministic",
        })
    return out


def inject_deterministic_insights(result: dict, struct: dict) -> dict:
    """Merge deterministic check findings into result['topIssues'], skipping any
    that an LLM issue already covers (by category + keyword overlap)."""
    if not isinstance(result, dict):
        return result
    det = build_deterministic_issues(struct)
    if not det:
        return result

    existing = result.get("topIssues")
    if not isinstance(existing, list):
        existing = []
    existing_blobs = [_dedup_blob(it) for it in existing if isinstance(it, dict)]

    added = 0
    for d in det:
        name_l = d["issue"].lower()
        # Skip if an existing issue already names this check topic.
        if any(name_l in blob for blob in existing_blobs):
            continue
        existing.append(d)
        existing_blobs.append(_dedup_blob(d))
        added += 1

    result["topIssues"] = existing
    if added:
        logger.info("deterministic-insights: added %d issue(s) the LLM omitted", added)
    return result
