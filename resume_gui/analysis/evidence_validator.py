"""Evidence-grounded issue validation against actual résumé text."""
from __future__ import annotations

import logging
import re
from typing import Optional

from resume_gui.analysis.constants import (
    _MISSING_METRICS_CLAIM_RE,
    _NON_ISSUE_ATS_WARNING_RE,
    _NUMERAL_PLENTY_MIN,
    _STRONG_VERB_MAJORITY_SHARE,
    _WEAK_VERB_CLAIM_RE,
    _bullet_leads_with_strong_ownership_verb,
    _resume_numeral_count,
    _resume_strong_verb_share,
)

logger = logging.getLogger("resume_gui")


def _issue_text_blob(item: dict) -> str:
    parts = []
    for k in ("issue", "suggestion", "whyItMatters", "category", "warning"):
        v = item.get(k) if isinstance(item, dict) else None
        if isinstance(v, str):
            parts.append(v)
    return " ".join(parts).lower()


def _issue_contradicts_resume(
    blob: str,
    has_plenty_of_numerals: bool,
    has_strong_verb_majority: bool,
) -> Optional[str]:
    """Return a non-empty reason string when the issue's claim contradicts evidence."""
    if has_plenty_of_numerals and _MISSING_METRICS_CLAIM_RE.search(blob):
        return "claims missing metrics but résumé has plenty of numerals"
    if has_strong_verb_majority and _WEAK_VERB_CLAIM_RE.search(blob):
        return "claims weak/duty verbs but most bullets lead with strong ownership verbs"
    return None


# Phrasings the LLM emits as atsWarnings that are actually GOOD facts about
# the résumé, not warnings. "No tables detected" doesn't deserve a warning
# label — the absence of tables is precisely what ATS-friendly résumés want.
_NON_ISSUE_ATS_WARNING_RE = re.compile(
    # Trailing `s?\b` on the noun alternatives so plurals match without
    # accidentally eating compounds like "tablespace" / "graphical".
    r"\b(?:"
    r"no\s+(?:table|graphic|image|column|header|footer|text\s*box|chart|icon|sidebar)s?\b|"
    r"no\s+multi[- ]column\b|"
    r"no\s+(?:embedded|complex)\s+(?:formatting|layout)s?\b|"
    r"standard\s+(?:heading|section|format)s?\b|"
    r"plain[- ]text\s+(?:heading|format|layout)s?\b|"
    r"ats[- ]friendly\s+(?:layout|format|structure)s?\b|"
    r"no\s+(?:non[- ]standard|unusual)\s+formatting\b"
    r")",
    re.IGNORECASE,
)


def _strip_non_issue_ats_warnings(raw: dict) -> None:
    """Drop atsWarnings whose text describes a non-issue (good fact framed as
    a warning). Always-on; doesn't depend on evidence thresholds because these
    phrasings are wrong on any résumé regardless of its content."""
    warnings = raw.get("atsWarnings")
    if not isinstance(warnings, list):
        return
    kept = []
    for w in warnings:
        if not isinstance(w, dict):
            kept.append(w)
            continue
        blob = _issue_text_blob(w)
        if _NON_ISSUE_ATS_WARNING_RE.search(blob):
            logger.info(
                "evidence-validator dropped non-issue atsWarning: %r",
                str(w.get("warning") or "")[:80],
            )
            continue
        kept.append(w)
    raw["atsWarnings"] = kept


def _validate_analysis_against_resume(raw: dict, resume_text: str) -> dict:
    """Drop topIssues, atsWarnings, bullet issue tags, and finalRecommendations
    whose claim contradicts what the résumé actually shows. Runs BEFORE
    _normalize_analysis so the calibrated score penalty in that function is
    based on the cleaned set."""
    if not isinstance(raw, dict):
        return raw

    text = resume_text or ""
    numeral_count = _resume_numeral_count(text)
    strong, total = _resume_strong_verb_share(text)
    strong_share = (strong / total) if total else 0.0
    has_plenty_numerals = numeral_count >= _NUMERAL_PLENTY_MIN
    has_strong_majority = total >= 5 and strong_share >= _STRONG_VERB_MAJORITY_SHARE

    # Always-on cleanup that doesn't depend on evidence thresholds: drop
    # atsWarnings phrased as non-issues. These can fire on any résumé.
    _strip_non_issue_ats_warnings(raw)

    if not (has_plenty_numerals or has_strong_majority):
        return raw  # nothing to contradict; let everything through

    # Track whether the validator actually made any changes — when it did,
    # _normalize_analysis should no longer cap the overall at the LLM's
    # (proven-untrustworthy) overallScore. Stored on a private key so it
    # doesn't leak into the API response.
    adjustments = 0

    # 1. topIssues
    issues = raw.get("topIssues")
    if isinstance(issues, list):
        kept_issues = []
        for it in issues:
            if not isinstance(it, dict):
                kept_issues.append(it)
                continue
            reason = _issue_contradicts_resume(
                _issue_text_blob(it), has_plenty_numerals, has_strong_majority,
            )
            if reason:
                logger.info(
                    "evidence-validator dropped topIssue: %s | %r",
                    reason, str(it.get("issue") or "")[:80],
                )
                adjustments += 1
                continue
            kept_issues.append(it)
        raw["topIssues"] = kept_issues

    # 2. atsWarnings — existing evidence-contradiction check
    warnings = raw.get("atsWarnings")
    if isinstance(warnings, list):
        kept_warn = []
        for w in warnings:
            if not isinstance(w, dict):
                kept_warn.append(w)
                continue
            reason = _issue_contradicts_resume(
                _issue_text_blob(w), has_plenty_numerals, has_strong_majority,
            )
            if reason:
                logger.info(
                    "evidence-validator dropped atsWarning: %s | %r",
                    reason, str(w.get("warning") or "")[:80],
                )
                adjustments += 1
                continue
            kept_warn.append(w)
        raw["atsWarnings"] = kept_warn

    # 3. bulletAnalysis.issues  — per-bullet check uses the bullet's OWN text
    bullets = raw.get("bulletAnalysis")
    if isinstance(bullets, list):
        for ba in bullets:
            if not isinstance(ba, dict):
                continue
            orig = str(ba.get("originalBullet") or "")
            if not orig:
                continue
            bullet_nums = _resume_numeral_count(orig)
            bullet_has_strong_verb = _bullet_leads_with_strong_ownership_verb(orig)
            issue_tags = ba.get("issues")
            if not isinstance(issue_tags, list):
                continue
            kept_tags = []
            for tag in issue_tags:
                t = str(tag or "")
                if not t.strip():
                    continue
                tl = t.lower()
                if bullet_nums >= 2 and _MISSING_METRICS_CLAIM_RE.search(tl):
                    logger.info(
                        "evidence-validator dropped bullet issue tag: bullet has %d numerals | %r",
                        bullet_nums, t[:80],
                    )
                    adjustments += 1
                    continue
                if bullet_has_strong_verb and _WEAK_VERB_CLAIM_RE.search(tl):
                    logger.info(
                        "evidence-validator dropped bullet issue tag: bullet leads with strong verb | %r",
                        t[:80],
                    )
                    adjustments += 1
                    continue
                kept_tags.append(t)
            ba["issues"] = kept_tags

    # 4. finalRecommendations  — text-only list; same matcher
    recs = raw.get("finalRecommendations")
    if isinstance(recs, list):
        kept_recs = []
        for r in recs:
            t = str(r or "")
            if not t.strip():
                continue
            reason = _issue_contradicts_resume(
                t.lower(), has_plenty_numerals, has_strong_majority,
            )
            if reason:
                logger.info(
                    "evidence-validator dropped finalRecommendation: %s | %r",
                    reason, t[:80],
                )
                adjustments += 1
                continue
            kept_recs.append(t)
        raw["finalRecommendations"] = kept_recs

    # 5. Re-floor categoryScores that are unjustifiably low given the evidence.
    # If the résumé has plenty of numerals, quantification can't legitimately
    # be sub-55. If strong-verb majority, achievementQuality + languageQuality
    # shouldn't be sub-55 either. These are *floors*, not caps — we only
    # raise, never lower.
    cs = raw.get("categoryScores")
    if isinstance(cs, dict):
        if has_plenty_numerals:
            try:
                q = cs.get("quantification")
                if isinstance(q, (int, float)) and q < 55:
                    logger.info("evidence-validator raised quantification %s→55 (numerals=%d)", q, numeral_count)
                    cs["quantification"] = 55
                    adjustments += 1
            except Exception:
                pass
        if has_strong_majority:
            for key in ("achievementQuality", "languageQuality"):
                try:
                    v = cs.get(key)
                    if isinstance(v, (int, float)) and v < 55:
                        logger.info(
                            "evidence-validator raised %s %s→55 (strong-verb share=%.0f%%)",
                            key, v, strong_share * 100,
                        )
                        cs[key] = 55
                        adjustments += 1
                except Exception:
                    pass
        raw["categoryScores"] = cs

    # Private flag — when ≥2 adjustments fired, the LLM has demonstrably been
    # untrustworthy on this résumé. Tell _normalize_analysis to stop using the
    # LLM's overallScore as a ceiling and trust our calibration instead.
    if adjustments >= 2:
        raw["__validator_adjusted__"] = True
        logger.info("evidence-validator: %d adjustments made → LLM overall cap disabled", adjustments)
    return raw
