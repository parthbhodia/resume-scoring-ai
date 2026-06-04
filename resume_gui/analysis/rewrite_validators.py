"""Rewrite-vs-original validation and bullet rewrite filtering."""
from __future__ import annotations

import logging
import re
from typing import Any, List, Optional, Tuple

from resume_gui.analysis.constants import (
    _NUMERAL_RE,
    _PROPER_NOUN_RE,
    _bullet_leads_with_strong_ownership_verb,
    _first_word_token,
)

logger = logging.getLogger("resume_gui")

def _rewrite_numerals(text: str) -> set[str]:
    return set(_NUMERAL_RE.findall(text or ""))


def _rewrite_proper_nouns(text: str) -> set[str]:
    return {m.group(0) for m in _PROPER_NOUN_RE.finditer(text or "")}


def _validate_rewrite_against_original(
    original: str,
    rewrite: str,
    *,
    category: Optional[str] = None,
) -> Tuple[bool, str]:
    """Return (is_honest, reason). The rewrite is honest iff:
      - it preserves every numeral from the original
      - it preserves every concrete proper noun / acronym / CamelCase tech
        name from the original
      - it does not shrink dramatically in length (a clear sign of dropped
        content) — allow a small trim (≥ 80% of original word count)
      - if category == "quantification", at least one numeral that was not
        in the original must appear in the rewrite (otherwise the badge is
        a lie)
    Empty rewrites or rewrites identical to the original are considered
    honest at this layer (callers strip those separately).
    """
    o = (original or "").strip()
    r = (rewrite or "").strip()
    if not o or not r or o == r:
        return True, ""

    orig_nums = _rewrite_numerals(o)
    new_nums = _rewrite_numerals(r)
    dropped_nums = orig_nums - new_nums
    if dropped_nums:
        return False, f"dropped numerals: {sorted(dropped_nums)[:5]}"

    orig_props = _rewrite_proper_nouns(o)
    new_props = _rewrite_proper_nouns(r)
    dropped_props = orig_props - new_props
    if dropped_props:
        return False, f"dropped proper nouns: {sorted(dropped_props)[:5]}"

    o_wc = len(o.split())
    r_wc = len(r.split())
    if o_wc >= 8 and r_wc < int(o_wc * 0.8):
        return False, f"shrank from {o_wc}→{r_wc} words (>20% drop)"

    if category and category.lower() in ("quantification", "quantify_impact"):
        added_nums = new_nums - orig_nums
        if not added_nums:
            return False, "tagged quantification but no new numerals added"

    return True, ""


def _normalize_for_rewrite_diff(s: str) -> str:
    """Collapse whitespace + bullet glyphs + punctuation for no-op detection."""
    if not s:
        return ""
    t = re.sub(r"^[\s•\-\*▪▸●◦‧·・‣⁃►➤○⚫—–‑]+", "", s.strip())
    t = re.sub(r"\s+", " ", t)
    return t.lower().strip(" .,:;")


def _word_jaccard(a: str, b: str) -> float:
    """Jaccard similarity between word bags of two strings (0–1).

    Used to catch near-no-op rewrites that change only connectors or
    punctuation (e.g. '; researched' → ' and researched').
    """
    wa = set(re.findall(r"\b\w+\b", a.lower()))
    wb = set(re.findall(r"\b\w+\b", b.lower()))
    if not wa and not wb:
        return 1.0
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def _token_morph_variants(token: str) -> set:
    """Return conservative variants for no-op tense/plural changes."""
    t = token.lower()
    variants = {t}
    if len(t) >= 5 and t.endswith("ed"):
        root = t[:-2]
        variants.add(root)
        variants.add(root + "e")
    if len(t) >= 6 and t.endswith("ing"):
        root = t[:-3]
        variants.add(root)
        variants.add(root + "e")
    if len(t) >= 4 and t.endswith("s") and not t.endswith("ss"):
        variants.add(t[:-1])
    return variants


def _is_morphology_only_rewrite(original: str, rewrite: str) -> bool:
    """Detect rewrites that only change word form, e.g. Conduct → Conducted."""
    orig_words = re.findall(r"\b[a-zA-Z]+\b", original.lower())
    rewrite_words = re.findall(r"\b[a-zA-Z]+\b", rewrite.lower())
    if not orig_words or len(orig_words) != len(rewrite_words):
        return False

    changed = 0
    for ow, rw in zip(orig_words, rewrite_words):
        if ow == rw:
            continue
        if _token_morph_variants(ow).isdisjoint(_token_morph_variants(rw)):
            return False
        changed += 1

    return 0 < changed <= 2


def _is_language_micro_edit(original: str, rewrite: str, orig_norm: str) -> bool:
    """True when a rewrite is non-substantive but still a valid proofreading tweak.

    These are salvaged into categoryRewrites.languageQuality instead of being
    shown as a primary achievement/quant rewrite — tense, punctuation, spelling.
    """
    text = (rewrite or "").strip()
    if not text:
        return False
    if _normalize_for_rewrite_diff(text) == orig_norm:
        return False
    ok, _ = _validate_rewrite_against_original(original, text)
    if not ok:
        return False
    if _word_jaccard(original, text) >= 0.88:
        return True
    if _is_morphology_only_rewrite(original, text):
        return True
    orig_words = re.findall(r"\b[a-zA-Z]+\b", original.lower())
    rewrite_words = re.findall(r"\b[a-zA-Z]+\b", text.lower())
    if orig_words and len(orig_words) == len(rewrite_words):
        diffs = sum(1 for ow, rw in zip(orig_words, rewrite_words) if ow != rw)
        if 0 < diffs <= 2:
            return True
    return False


def _salvage_language_quality_rewrite(
    original: str,
    rewrite: str,
    kept_cr: dict,
    orig_norm: str,
    *,
    source: str,
) -> None:
    """Route a non-substantive rewrite to languageQuality when appropriate."""
    if kept_cr.get("languageQuality", "").strip():
        return
    if not _is_language_micro_edit(original, rewrite, orig_norm):
        return
    kept_cr["languageQuality"] = rewrite.strip()
    logger.info(
        "rewrite-validator salvaged languageQuality micro-edit from %s: orig=%r rewrite=%r",
        source, original[:80], rewrite[:80],
    )


def _validate_achievement_rewrite(original: str, rewrite: str) -> Tuple[bool, str]:
    """Achievement rewrites must change the opening word and fix duty-style leads."""
    r = (rewrite or "").strip()
    if not r:
        return True, ""
    o_first = _first_word_token(original)
    r_first = _first_word_token(rewrite)
    if o_first and r_first and o_first == r_first:
        return False, "achievement rewrite must change opening word"
    if not _bullet_leads_with_strong_ownership_verb(rewrite):
        return False, "achievement rewrite still uses participial duty-style lead"
    return True, ""


def _filter_bullet_rewrites(
    original: str,
    improved: str,
    category_rewrites: Optional[dict],
    issues: Optional[List[Any]] = None,
    *,
    primary_category: Optional[str] = None,
) -> Tuple[str, dict, List[Any]]:
    """Drop any rewrite that fails _validate_rewrite_against_original, drop
    no-op rewrites that are byte-equal (after whitespace/punctuation normalize)
    to the original, and strip "quantification" from the issues tag list when
    neither the rewrite nor the category rewrites actually add new numerals.

    Returns (kept_improved, kept_category_rewrites, kept_issues). When a
    rewrite is rejected we replace it with empty string so the UI falls back
    to the original — better silence than a misleading badge.
    """
    kept_improved = improved or ""
    orig_norm = _normalize_for_rewrite_diff(original)
    pending_lq_salvage: Optional[str] = None

    def _reject_achievement(candidate: str, *, slot: str, force: bool = False) -> bool:
        if not candidate.strip():
            return False
        if not force and (primary_category or "").lower() != "achievementquality":
            return False
        ok, why = _validate_achievement_rewrite(original, candidate)
        if not ok:
            logger.info(
                "rewrite-validator dropped %s: %s  | orig=%r  | rewrite=%r",
                slot, why, original[:80], candidate[:80],
            )
            return True
        return False

    if kept_improved:
        ok, why = _validate_rewrite_against_original(original, kept_improved)
        if not ok:
            logger.info(
                "rewrite-validator dropped improvedBullet: %s  | orig=%r  | rewrite=%r",
                why, original[:80], kept_improved[:80],
            )
            kept_improved = ""
        elif _reject_achievement(kept_improved, slot="improvedBullet"):
            kept_improved = ""
        elif _normalize_for_rewrite_diff(kept_improved) == orig_norm:
            logger.info(
                "rewrite-validator dropped no-op improvedBullet (identical to original): %r",
                original[:80],
            )
            kept_improved = ""
        elif _word_jaccard(original, kept_improved) >= 0.88:
            logger.info(
                "rewrite-validator dropped near-no-op improvedBullet (jaccard=%.2f): orig=%r rewrite=%r",
                _word_jaccard(original, kept_improved), original[:80], kept_improved[:80],
            )
            pending_lq_salvage = kept_improved
            kept_improved = ""
        elif _is_morphology_only_rewrite(original, kept_improved):
            logger.info(
                "rewrite-validator dropped morphology-only improvedBullet: orig=%r rewrite=%r",
                original[:80], kept_improved[:80],
            )
            pending_lq_salvage = kept_improved
            kept_improved = ""

    kept_cr: dict = {}
    if isinstance(category_rewrites, dict):
        for cat, txt in category_rewrites.items():
            if not isinstance(txt, str) or not txt.strip():
                continue
            cat_key = str(cat)
            if _reject_achievement(
                txt,
                slot=f"categoryRewrites.{cat_key}",
                force=cat_key.lower() == "achievementquality",
            ):
                continue
            ok, why = _validate_rewrite_against_original(original, txt, category=str(cat))
            if not ok:
                logger.info(
                    "rewrite-validator dropped categoryRewrites.%s: %s  | orig=%r  | rewrite=%r",
                    cat, why, original[:80], txt[:80],
                )
                continue
            if str(cat) == "languageQuality":
                # Language category keeps proofreading-level edits (tense, spelling, ;).
                if _normalize_for_rewrite_diff(txt) == orig_norm:
                    continue
                kept_cr[str(cat)] = txt
                continue
            if _normalize_for_rewrite_diff(txt) == orig_norm:
                logger.info(
                    "rewrite-validator dropped no-op categoryRewrites.%s (identical to original): %r",
                    cat, original[:80],
                )
                continue
            if _word_jaccard(original, txt) >= 0.88:
                logger.info(
                    "rewrite-validator dropped near-no-op categoryRewrites.%s (jaccard=%.2f): %r",
                    cat, _word_jaccard(original, txt), original[:80],
                )
                _salvage_language_quality_rewrite(
                    original, txt, kept_cr, orig_norm, source=f"categoryRewrites.{cat}/jaccard",
                )
                continue
            if _is_morphology_only_rewrite(original, txt):
                logger.info(
                    "rewrite-validator dropped morphology-only categoryRewrites.%s: %r",
                    cat, original[:80],
                )
                _salvage_language_quality_rewrite(
                    original, txt, kept_cr, orig_norm, source=f"categoryRewrites.{cat}/morphology",
                )
                continue
            kept_cr[str(cat)] = txt

    if pending_lq_salvage:
        _salvage_language_quality_rewrite(
            original, pending_lq_salvage, kept_cr, orig_norm, source="improvedBullet",
        )

    # ── Strip lying "quantification" tag ──────────────────────────────────
    # The LLM regularly stamps a bullet with `issues: ["quantification", ...]`
    # then emits a rewrite that adds zero numerals. The badge tells the user
    # the bullet needs metrics — but the AI's own proposed fix is identical
    # prose. Drop the tag in that case so the user isn't misled.
    kept_issues: List[Any] = list(issues or [])
    if kept_issues:
        lowered = [str(t).strip().lower() for t in kept_issues]
        quant_keys = {"quantification", "quantify_impact", "quantify"}
        has_quant_tag = any(t in quant_keys for t in lowered)
        if has_quant_tag:
            orig_nums = _rewrite_numerals(original)
            added_anywhere = False
            for candidate in [kept_improved] + list(kept_cr.values()):
                if not candidate:
                    continue
                if _rewrite_numerals(candidate) - orig_nums:
                    added_anywhere = True
                    break
            if not added_anywhere:
                kept_issues = [
                    t for t in kept_issues
                    if str(t).strip().lower() not in quant_keys
                ]
                logger.info(
                    "rewrite-validator stripped 'quantification' tag — no new numerals in any rewrite: %r",
                    original[:80],
                )

    return kept_improved, kept_cr, kept_issues
