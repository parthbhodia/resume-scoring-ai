"""Normalize LLM analysis output (calibration v2, bullet categories)."""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from resume_gui.analysis.constants import _CATEGORY_SCORE_KEYS, _ISSUE_TEXT_CATEGORY_HINTS
from resume_gui.analysis.rewrite_validators import (
    _adds_quantification,
    _filter_bullet_rewrites,
)

logger = logging.getLogger("resume_gui")

def _sanitize_bullet_display(s: str) -> str:
    """Strip CID placeholders and collapse spaces in LLM bullet fields."""
    if not isinstance(s, str):
        return ""
    s = re.sub(r"\(\s*cid\s*:\s*\d+\)", "", s, flags=re.IGNORECASE)
    s = " ".join(s.split())
    return s.strip()

def _infer_bullet_category_from_text(issues: Optional[List[Any]]) -> str:
    """Best-effort single category from free-text issue tags. Used only to
    backfill a missing/invalid primaryCategory. Defaults to achievementQuality
    (the most common weak-bullet bucket) when nothing matches."""
    for tag in issues or []:
        low = str(tag).strip().lower()
        for needle, cat in _ISSUE_TEXT_CATEGORY_HINTS:
            if needle in low:
                return cat
    return "achievementQuality"


def _normalize_bullet_categories(
    raw_primary: Any,
    raw_issue_cats: Any,
    *,
    original: str,
    improved: str,
    category_rewrites: Optional[dict],
    issues: Optional[List[Any]],
) -> Tuple[str, List[str]]:
    """Produce a trustworthy (primaryCategory, issueCategories) pair.

    Invariants the frontend now relies on (so it can delete its regex pile):
      1. primaryCategory ∈ _CATEGORY_SCORE_KEYS.
      2. issueCategories ⊆ _CATEGORY_SCORE_KEYS, deduped, and always contains
         primaryCategory.
      3. "quantification" appears in neither field unless some surviving rewrite
         (improvedBullet or a categoryRewrites value) actually adds a numeral
         that wasn't in the original — mirrors the lying-tag strip so the
         category bucket and the issues[] tag never disagree.
      4. If primaryCategory would have been "quantification" but that claim is
         unsupported, it is re-derived from the remaining issueCategories /
         issue text rather than left dangling.
    """
    valid = set(_CATEGORY_SCORE_KEYS)

    # Does any surviving rewrite add quantification (numeral or [X%] placeholder)?
    quant_supported = False
    for candidate in [improved] + list((category_rewrites or {}).values()):
        if candidate and _adds_quantification(original, candidate):
            quant_supported = True
            break

    # Normalize issueCategories: keep only valid keys, dedupe, preserve order.
    issue_cats: List[str] = []
    if isinstance(raw_issue_cats, list):
        for c in raw_issue_cats:
            key = str(c).strip()
            if key in valid and key not in issue_cats:
                issue_cats.append(key)

    # A category that has a surviving rewrite is always legitimate, even if the
    # LLM forgot to list it.
    for ck in (category_rewrites or {}):
        if ck in valid and ck not in issue_cats:
            issue_cats.append(ck)

    # Drop unsupported quantification claims everywhere.
    if not quant_supported:
        issue_cats = [c for c in issue_cats if c != "quantification"]

    # Resolve primaryCategory.
    primary = str(raw_primary).strip() if raw_primary is not None else ""
    if primary == "quantification" and not quant_supported:
        primary = ""  # force re-derive
    if primary not in valid:
        primary = issue_cats[0] if issue_cats else _infer_bullet_category_from_text(issues)
        if primary == "quantification" and not quant_supported:
            primary = "achievementQuality"

    if primary not in issue_cats:
        issue_cats.insert(0, primary)

    return primary, issue_cats

def _normalize_analysis(raw: dict) -> dict:
    """Ensure the LLM result has all required keys with sane defaults."""
    cs_defaults = {
        "readability": 50, "atsCompatibility": 50, "jobMatch": None,
        "achievementQuality": 50, "quantification": 50,
        "sectionStructure": 50, "languageQuality": 50, "technicalBranding": 50,
    }
    cs = raw.get("categoryScores") or {}
    for k, v in cs_defaults.items():
        if k not in cs:
            cs[k] = v
    scores = [v for v in cs.values() if isinstance(v, (int, float))]
    base_overall = round(sum(scores) / len(scores)) if scores else 50
    raw.setdefault("summary", "Analysis complete.")
    raw.setdefault("topStrengths", [])
    raw.setdefault("topIssues", [])
    raw.setdefault("atsWarnings", [])
    raw.setdefault("keywordAnalysis", {
        "matchedKeywords": [], "missingKeywords": [], "keywordScore": None, "suggestions": [],
    })
    raw.setdefault("bulletAnalysis", [])
    raw.setdefault("sectionFeedback", [])
    raw.setdefault("rewriteSuggestions", [])
    raw.setdefault("finalRecommendations", [])
    cr_raw = raw.get("categoryRationales") or raw.get("category_rationales")
    normalized_cr: Dict[str, str] = {}
    if isinstance(cr_raw, dict):
        for k in _CATEGORY_SCORE_KEYS:
            v = cr_raw.get(k)
            if isinstance(v, str) and v.strip():
                normalized_cr[k] = v.strip()[:600]
    raw["categoryRationales"] = normalized_cr
    raw["categoryScores"] = cs
    bullets = raw.get("bulletAnalysis") or []
    if isinstance(bullets, list):
        for ba in bullets:
            if isinstance(ba, dict):
                ba["originalBullet"] = _sanitize_bullet_display(ba.get("originalBullet", ""))
                ba["improvedBullet"] = _sanitize_bullet_display(ba.get("improvedBullet", ""))
                cr = ba.get("categoryRewrites") or ba.get("category_rewrites")
                if isinstance(cr, dict):
                    cleaned = {}
                    for ck, cv in cr.items():
                        if isinstance(cv, str) and cv.strip():
                            cleaned[str(ck)] = _sanitize_bullet_display(cv)
                    if cleaned:
                        ba["categoryRewrites"] = cleaned
                # Reject rewrites that silently drop numerals / proper nouns /
                # named technologies from the original, claim "quantification"
                # without actually adding a number, or are byte-identical to
                # the original ("AI IMPROVED" that produces the same prose).
                # Also strip a lying "quantification" tag from issues[] when
                # no rewrite actually adds numerals.
                orig_bullet = ba.get("originalBullet", "")
                kept_improved, kept_cr, kept_issues = _filter_bullet_rewrites(
                    orig_bullet,
                    ba.get("improvedBullet", ""),
                    ba.get("categoryRewrites"),
                    ba.get("issues"),
                    primary_category=ba.get("primaryCategory"),
                )
                # Surface quant rewrite in improvedBullet when the LLM only filled categoryRewrites.
                if not (kept_improved or "").strip():
                    qrw = ""
                    if isinstance(kept_cr, dict):
                        qrw = (kept_cr.get("quantification") or "").strip()
                    if qrw and _adds_quantification(orig_bullet, qrw):
                        kept_improved = qrw
                ba["improvedBullet"] = kept_improved
                if kept_cr:
                    ba["categoryRewrites"] = kept_cr
                elif "categoryRewrites" in ba:
                    # All variant rewrites failed validation — drop the field.
                    ba.pop("categoryRewrites", None)
                ba["issues"] = kept_issues

                # Backfill + validate the structured category fields the
                # frontend now trusts verbatim (no more guessIssueCategory
                # regex pile). primaryCategory/issueCategories are guaranteed
                # to be valid categoryScores keys and consistent with the
                # surviving rewrites (esp. the quantification claim).
                primary_cat, issue_cats = _normalize_bullet_categories(
                    ba.get("primaryCategory"),
                    ba.get("issueCategories"),
                    original=ba.get("originalBullet", ""),
                    improved=kept_improved,
                    category_rewrites=ba.get("categoryRewrites"),
                    issues=kept_issues,
                )
                ba["primaryCategory"] = primary_cat
                ba["issueCategories"] = issue_cats

        # ── Drop flagged-but-helpless bullets ────────────────────────────
        # After the rewrite validator has stripped no-op / lossy rewrites,
        # any bullet that ends up with:
        #   • no improvedBullet
        #   • no categoryRewrites
        #   • score >= 70 (already decent)
        # is dead-end UX — the user sees "this bullet needs work" with
        # nothing to act on. Mirrors the category-level Option A fix
        # (d4f2641): if we can't help, we don't ask the user to think
        # about it. A truly weak bullet (<70) without a rewrite stays in
        # so the user at least knows it scored low — they can use the
        # issue tags as general guidance.
        pruned: list = []
        dropped_helpless = 0
        for ba in bullets:
            if not isinstance(ba, dict):
                pruned.append(ba)
                continue
            improved = (ba.get("improvedBullet") or "").strip()
            cr = ba.get("categoryRewrites") or {}
            has_any_cr = isinstance(cr, dict) and any(
                isinstance(v, str) and v.strip() for v in cr.values()
            )
            score = ba.get("score")
            if (
                not improved
                and not has_any_cr
                and isinstance(score, (int, float))
                and score >= 70
            ):
                dropped_helpless += 1
                logger.info(
                    "rewrite-validator dropped flagged-but-helpless bullet "
                    "(score=%s, no rewrite, no categoryRewrites): %r",
                    score, str(ba.get("originalBullet") or "")[:80],
                )
                continue
            pruned.append(ba)
        if dropped_helpless:
            raw["bulletAnalysis"] = pruned
            bullets = pruned

    # Calibrate overall score so it reflects visible weaknesses.
    # This prevents inflated "90+" overall when there are many weak bullets/issues.
    weak_bullets = 0
    if isinstance(bullets, list):
        weak_bullets = sum(
            1 for ba in bullets
            if isinstance(ba, dict) and isinstance(ba.get("score"), (int, float)) and ba.get("score", 0) < 55
        )

    issues = raw.get("topIssues") or []
    high_issues = 0
    medium_issues = 0
    if isinstance(issues, list):
        for it in issues:
            if not isinstance(it, dict):
                continue
            sev = str(it.get("severity", "")).lower()
            if sev == "high":
                high_issues += 1
            elif sev == "medium":
                medium_issues += 1

    # ── Calibration v2 ────────────────────────────────────────────────────
    # Old formula stacked three penalties (weak_bullets × 3, high_issues × 4,
    # floor of (70 - min_cat) × 0.35) that double-counted the same weaknesses
    # the category scores already encode. Result: a legitimate cashier CV
    # with mean=34 got crushed to 0, and a strong résumé got pulled from a
    # fair 71 down to 62. New formula:
    #
    #   1. base_overall  = mean of category scores. This is our truth — it
    #      already reflects every weakness.
    #   2. soft_penalty  = small, capped, ONLY counts high-severity legit
    #      issues. No floor_penalty (redundant with the mean). No weak_bullets
    #      penalty (the bullet weaknesses are already in achievementQuality /
    #      quantification / languageQuality).
    #   3. blended       = midpoint of (calibrated_base, llm_overall) when the
    #      LLM's overall is plausible. When the validator fired (LLM proven
    #      untrustworthy on this résumé), we skip the blend and use the base.
    #   4. floor at 20   = any résumé that produced category scores at all
    #      deserves at least 20 (reserve <20 for non-résumés / parse failures).
    soft_penalty = min(6, high_issues * 2 + medium_issues)
    calibrated = max(0, base_overall - soft_penalty)

    llm_overall = raw.get("overallScore")
    validator_adjusted = bool(raw.pop("__validator_adjusted__", False))
    if validator_adjusted or not isinstance(llm_overall, (int, float)):
        final = calibrated
    else:
        # Blend toward the midpoint — but if the LLM diverges from base by
        # more than 20 points, the LLM is probably wrong; lean on calibrated.
        diff = llm_overall - base_overall
        if abs(diff) > 20:
            final = calibrated
        else:
            final = round((calibrated + llm_overall) / 2)

    raw["overallScore"] = int(max(20, min(100, round(final))))
    return raw
