"""Evidence-grounded issue validation against actual résumé text."""
from __future__ import annotations

import logging
import re
from typing import Optional

from resume_gui.analysis.constants import (
    _CATEGORY_SCORE_KEYS,
    _MISSING_METRICS_CLAIM_RE,
    _NON_ISSUE_ATS_WARNING_RE,
    _NUMERAL_PLENTY_MIN,
    _PRONOUN_CLAIM_RE,
    _PRONOUN_RE,
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


_SECTION_HEADING_RE = re.compile(
    r"^(?:"
    r"(?:PROFESSIONAL\s+)?(?:WORK\s+)?EXPERIENCE|EMPLOYMENT|"
    r"EDUCATION|(?:TECHNICAL\s+)?SKILLS?|PROJECTS?|PORTFOLIO|"
    r"SUMMARY|PROFILE|OBJECTIVE|CERTIFICATIONS?|ACTIVITIES|"
    r"HONORS?|AWARDS?|PUBLICATIONS?|VOLUNTEER(?:\s+EXPERIENCE)?|"
    r"LEADERSHIP|RESEARCH"
    r")\s*:?\s*$",
    re.IGNORECASE,
)

_PRONOUN_CLAUSE_STRIP_RE = re.compile(
    r"(?:,?\s*)?"
    r"(?:or\s+)?(?:rephrase\s+to\s+)?remove\s+(?:the\s+)?personal\s+pronouns?\b[^.;]*|"
    r"(?:,?\s*)?remove\s+(?:all\s+)?personal\s+pronouns?\b[^.;]*|"
    r"(?:,?\s*)?avoid\s+(?:using\s+)?personal\s+pronouns?\b[^.;]*|"
    r"(?:,?\s*)?(?:no|without)\s+personal\s+pronouns?\b[^.;]*|"
    r"(?:,?\s*)?(?:do\s+not|don't)\s+use\s+personal\s+pronouns?\b[^.;]*",
    re.IGNORECASE,
)


def _canonical_section_key(label: str) -> str:
    t = re.sub(r"[^a-z]+", " ", (label or "").lower()).strip()
    if "project" in t or "portfolio" in t:
        return "projects"
    if "experience" in t or "employment" in t:
        return "experience"
    if "education" in t or "academic" in t:
        return "education"
    if "skill" in t:
        return "skills"
    if "summary" in t or "profile" in t or "objective" in t:
        return "summary"
    if "certif" in t:
        return "certifications"
    if "activit" in t or "leadership" in t:
        return "activities"
    return t.replace(" ", "_") or "general"


def _resume_section_blobs(text: str) -> dict[str, str]:
    """Map canonical section key → body text under that heading."""
    buckets: dict[str, list[str]] = {}
    current = "general"
    for raw in (text or "").splitlines():
        ln = raw.strip()
        if not ln:
            continue
        if _SECTION_HEADING_RE.match(ln):
            current = _canonical_section_key(ln)
            buckets.setdefault(current, [])
            continue
        buckets.setdefault(current, []).append(ln)
    return {k: "\n".join(v) for k, v in buckets.items() if v}


def _section_blob_for_label(resume_text: str, section_label: str) -> str:
    blobs = _resume_section_blobs(resume_text)
    key = _canonical_section_key(section_label)
    if key in blobs:
        return blobs[key]
    # Fuzzy: PROJECT vs projects
    for blob_key, blob in blobs.items():
        if key in blob_key or blob_key in key:
            return blob
    return resume_text


def _strip_unsupported_pronoun_advice(advice: str) -> tuple[str, bool]:
    """Remove pronoun-fix clauses from LLM advice (caller ensures scope has no pronouns)."""
    original = (advice or "").strip()
    if not original:
        return original, False
    if not _PRONOUN_CLAIM_RE.search(original):
        return original, False

    cleaned = _PRONOUN_CLAUSE_STRIP_RE.sub("", original)
    cleaned = re.sub(r"\s+or\s+and\s+", " and ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bor\s+and\b", "and", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" ,;.")
    if cleaned and cleaned != original:
        if cleaned[-1] not in ".!?":
            cleaned += "."
        return cleaned, True

    return (
        "Use 1–2 concise achievement bullets with strong opening verbs and outcomes.",
        True,
    )


def _sanitize_pronoun_claims_in_text_fields(raw: dict, resume_text: str) -> int:
    """Strip lying pronoun advice from sectionFeedback and other narrative fields."""
    adjustments = 0
    resume_has_pronoun = bool(_PRONOUN_RE.search(resume_text or ""))

    section_fb = raw.get("sectionFeedback")
    if isinstance(section_fb, list):
        for item in section_fb:
            if not isinstance(item, dict):
                continue
            fb = str(item.get("feedback") or "").strip()
            if not fb:
                continue
            scope = _section_blob_for_label(resume_text, str(item.get("section") or ""))
            scope_has_pronoun = bool(_PRONOUN_RE.search(scope))
            if scope_has_pronoun or resume_has_pronoun:
                continue
            cleaned, changed = _strip_unsupported_pronoun_advice(fb)
            if changed:
                logger.info(
                    "evidence-validator sanitized sectionFeedback pronoun claim: %s | was=%r | now=%r",
                    str(item.get("section") or "")[:40],
                    fb[:80],
                    cleaned[:80],
                )
                item["feedback"] = cleaned
                adjustments += 1

    if not resume_has_pronoun:
        for issue in raw.get("topIssues") or []:
            if not isinstance(issue, dict):
                continue
            for field in ("issue", "suggestion", "whyItMatters"):
                val = str(issue.get(field) or "").strip()
                if not val:
                    continue
                cleaned, changed = _strip_unsupported_pronoun_advice(val)
                if changed:
                    issue[field] = cleaned
                    adjustments += 1

        rationales = raw.get("categoryRationales")
        if isinstance(rationales, dict):
            for key in _CATEGORY_SCORE_KEYS:
                val = str(rationales.get(key) or "").strip()
                if not val:
                    continue
                cleaned, changed = _strip_unsupported_pronoun_advice(val)
                if changed:
                    rationales[key] = cleaned
                    adjustments += 1

        kept_recs: list = []
        for rec in raw.get("finalRecommendations") or []:
            t = str(rec or "").strip()
            if not t:
                continue
            cleaned, changed = _strip_unsupported_pronoun_advice(t)
            if changed:
                adjustments += 1
            if cleaned.strip():
                kept_recs.append(cleaned)
        if isinstance(raw.get("finalRecommendations"), list):
            raw["finalRecommendations"] = kept_recs

    return adjustments


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


_PROSE_BRACKET_RE = re.compile(r"\[[^\]]{0,24}\]")


def _placeholder_phrase(token: str) -> str:
    """Plain-English stand-in for a bracket placeholder in advice prose."""
    inner = token[1:-1].strip().lower()
    if "%" in inner or "percent" in inner:
        return "a percentage"
    if "$" in inner or "usd" in inner or "dollar" in inner or "revenue" in inner or "cost" in inner:
        return "a dollar figure"
    if "×" in inner or "fold" in inner or "times" in inner or inner == "x" or inner.endswith("x"):
        return "a multiple"
    if "placeholder" in inner:
        return "real figures"
    return "a number"


def _strip_bracket_placeholders_from_prose(raw: dict) -> int:
    """Replace AI bracket placeholders ([X%], [~N users], [placeholders]) with
    plain words in narrative / advice fields. In prose they read as "written by
    AI" and literally tell the student to put brackets in their résumé. Bracket
    placeholders stay ONLY in bulletAnalysis rewrites (improvedBullet /
    categoryRewrites), which the frontend turns into concrete example figures.
    Always-on; the bracket convention is wrong in advice prose on any résumé."""
    if not isinstance(raw, dict):
        return 0
    adjustments = 0

    def _clean(val):
        nonlocal adjustments
        if not isinstance(val, str) or "[" not in val:
            return val
        new = _PROSE_BRACKET_RE.sub(lambda m: _placeholder_phrase(m.group(0)), val)
        new = re.sub(r"\s{2,}", " ", new).strip()
        if new != val:
            adjustments += 1
        return new

    if isinstance(raw.get("summary"), str):
        raw["summary"] = _clean(raw["summary"])

    for issue in raw.get("topIssues") or []:
        if isinstance(issue, dict):
            for field in ("issue", "whyItMatters", "suggestion"):
                if field in issue:
                    issue[field] = _clean(issue.get(field))

    for warn in raw.get("atsWarnings") or []:
        if isinstance(warn, dict):
            for field in ("warning", "suggestion"):
                if field in warn:
                    warn[field] = _clean(warn.get(field))

    rationales = raw.get("categoryRationales")
    if isinstance(rationales, dict):
        for key in list(rationales.keys()):
            rationales[key] = _clean(rationales.get(key))

    for item in raw.get("sectionFeedback") or []:
        if isinstance(item, dict) and "feedback" in item:
            item["feedback"] = _clean(item.get("feedback"))

    keyword_analysis = raw.get("keywordAnalysis")
    if isinstance(keyword_analysis, dict) and isinstance(keyword_analysis.get("suggestions"), list):
        keyword_analysis["suggestions"] = [_clean(s) for s in keyword_analysis["suggestions"]]

    if isinstance(raw.get("finalRecommendations"), list):
        raw["finalRecommendations"] = [_clean(r) for r in raw["finalRecommendations"]]

    if adjustments:
        logger.info(
            "evidence-validator scrubbed %d bracket placeholder(s) from advice prose",
            adjustments,
        )
    return adjustments


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

    # Always-on cleanup that doesn't depend on evidence thresholds.
    _strip_non_issue_ats_warnings(raw)
    _strip_bracket_placeholders_from_prose(raw)
    adjustments = _sanitize_pronoun_claims_in_text_fields(raw, text)

    if not (has_plenty_numerals or has_strong_majority):
        if adjustments >= 2:
            raw["__validator_adjusted__"] = True
            logger.info(
                "evidence-validator: %d adjustments made → LLM overall cap disabled",
                adjustments,
            )
        return raw

    # Track whether the validator actually made any changes — when it did,
    # _normalize_analysis should no longer cap the overall at the LLM's
    # (proven-untrustworthy) overallScore. Stored on a private key so it
    # doesn't leak into the API response.

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
