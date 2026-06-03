"""Deterministic weighted JD match scorer.

Buckets each RequirementConcept into one of five scoring dimensions, counts
how many are covered by the corresponding RequirementMatch results, and
produces a single weighted score plus a structured breakdown.

Bucket assignment rules (first matching rule wins):
  job_title          – concept.id == 'req:job-title'
  responsibilities   – concept.type == 'responsibility'
  required_qualifications – concept.importance == 'required' AND
                            concept.type in QUAL_TYPES
  required_keywords  – concept.importance == 'required' (all other types)
  preferred_keywords – concept.importance in ('preferred', 'nice_to_have')
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .models import RequirementConcept, RequirementMatch

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCORE_WEIGHTS: Dict[str, float] = {
    "job_title": 0.10,
    "required_qualifications": 0.25,
    "responsibilities": 0.25,
    "required_keywords": 0.20,
    "preferred_keywords": 0.10,
    "evidence_quality": 0.05,
    "formatting_parseability": 0.05,
}

# Concept types that belong in the "required qualifications" bucket when
# importance == 'required'.
_QUAL_TYPES = frozenset(
    {
        "technical_skill",
        "tool",
        "certification",
        "license",
        "degree",
        "domain_knowledge",
        "experience",
    }
)


# ---------------------------------------------------------------------------
# Dataclass
# ---------------------------------------------------------------------------


@dataclass
class JdMatchBreakdown:
    job_title_score: float  # 0–100
    job_title_matched: bool
    job_title_evidence: List[str]

    qualifications_total: int
    qualifications_covered: int

    responsibilities_total: int
    responsibilities_covered: int

    keywords_required_total: int
    keywords_required_found: int

    keywords_preferred_total: int
    keywords_preferred_found: int

    formatting_score: float  # always 100 for now (placeholder)
    overall_score: float  # weighted final 0–100


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _bucket_for(concept: RequirementConcept) -> str:
    """Return the scoring bucket name for a concept."""
    if concept.id == "req:job-title":
        return "job_title"
    if concept.type == "responsibility":
        return "responsibilities"
    if concept.importance == "required" and concept.type in _QUAL_TYPES:
        return "required_qualifications"
    if concept.importance == "required":
        return "required_keywords"
    # preferred / nice_to_have
    return "preferred_keywords"


def _safe_ratio(covered: int, total: int) -> float:
    """Return covered/total, or 1.0 when total is zero (bucket absent → neutral)."""
    if total == 0:
        return 1.0
    return covered / total


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def calculate_weighted_jd_score(
    matches: List[RequirementMatch],
    concepts: List[RequirementConcept],
) -> JdMatchBreakdown:
    """Compute a deterministic weighted JD match score.

    Parameters
    ----------
    matches:
        One RequirementMatch per RequirementConcept (same requirement_id).
    concepts:
        The full list of RequirementConcepts extracted from the JD.

    Returns
    -------
    JdMatchBreakdown with per-bucket counts and a weighted overall_score.
    """
    # Build a lookup: requirement_id → match
    match_by_id: Dict[str, RequirementMatch] = {m.requirement_id: m for m in matches}

    # Per-bucket accumulators: (total, covered)
    buckets: Dict[str, List[int]] = {
        "job_title": [0, 0],
        "required_qualifications": [0, 0],
        "responsibilities": [0, 0],
        "required_keywords": [0, 0],
        "preferred_keywords": [0, 0],
    }

    # job_title extras
    job_title_matched = False
    job_title_evidence: List[str] = []

    # evidence quality accumulation: (sum_confidence, count)
    eq_conf_sum = 0.0
    eq_matched_count = 0

    for concept in concepts:
        bucket = _bucket_for(concept)
        m = match_by_id.get(concept.id)

        buckets[bucket][0] += 1  # total

        is_matched = bool(m and m.matched)
        if is_matched:
            buckets[bucket][1] += 1  # covered

            if m:
                eq_conf_sum += m.confidence
                eq_matched_count += 1

        if bucket == "job_title":
            job_title_matched = is_matched
            if m and m.evidence:
                job_title_evidence.append(m.evidence)

    # ---------- sub-scores (0.0–1.0) ----------
    job_title_pct = _safe_ratio(buckets["job_title"][1], buckets["job_title"][0])
    qual_pct = _safe_ratio(
        buckets["required_qualifications"][1], buckets["required_qualifications"][0]
    )
    resp_pct = _safe_ratio(
        buckets["responsibilities"][1], buckets["responsibilities"][0]
    )
    req_kw_pct = _safe_ratio(
        buckets["required_keywords"][1], buckets["required_keywords"][0]
    )
    pref_kw_pct = _safe_ratio(
        buckets["preferred_keywords"][1], buckets["preferred_keywords"][0]
    )

    # evidence_quality: avg confidence of matched items; neutral 0.8 when none matched
    evidence_quality_pct = (
        (eq_conf_sum / eq_matched_count) if eq_matched_count > 0 else 0.8
    )

    formatting_pct = 1.0  # reserved placeholder

    # ---------- weighted sum ----------
    raw_score = (
        SCORE_WEIGHTS["job_title"] * job_title_pct
        + SCORE_WEIGHTS["required_qualifications"] * qual_pct
        + SCORE_WEIGHTS["responsibilities"] * resp_pct
        + SCORE_WEIGHTS["required_keywords"] * req_kw_pct
        + SCORE_WEIGHTS["preferred_keywords"] * pref_kw_pct
        + SCORE_WEIGHTS["evidence_quality"] * evidence_quality_pct
        + SCORE_WEIGHTS["formatting_parseability"] * formatting_pct
    )
    overall_score = float(max(0.0, min(100.0, raw_score * 100)))

    return JdMatchBreakdown(
        job_title_score=round(job_title_pct * 100, 2),
        job_title_matched=job_title_matched,
        job_title_evidence=job_title_evidence,
        qualifications_total=buckets["required_qualifications"][0],
        qualifications_covered=buckets["required_qualifications"][1],
        responsibilities_total=buckets["responsibilities"][0],
        responsibilities_covered=buckets["responsibilities"][1],
        keywords_required_total=buckets["required_keywords"][0],
        keywords_required_found=buckets["required_keywords"][1],
        keywords_preferred_total=buckets["preferred_keywords"][0],
        keywords_preferred_found=buckets["preferred_keywords"][1],
        formatting_score=100.0,
        overall_score=round(overall_score, 2),
    )


def to_dict(breakdown: JdMatchBreakdown) -> Dict[str, Any]:
    """Return a JSON-serialisable dict matching the expected output shape."""
    qual_missing = breakdown.qualifications_total - breakdown.qualifications_covered
    resp_missing = breakdown.responsibilities_total - breakdown.responsibilities_covered

    return {
        "job_title": {
            "score": breakdown.job_title_score,
            "matched": breakdown.job_title_matched,
            "evidence": breakdown.job_title_evidence,
        },
        "qualifications": {
            "total": breakdown.qualifications_total,
            "covered": breakdown.qualifications_covered,
            "missing": qual_missing,
        },
        "responsibilities": {
            "total": breakdown.responsibilities_total,
            "covered": breakdown.responsibilities_covered,
            "missing": resp_missing,
        },
        "keywords": {
            "required_total": breakdown.keywords_required_total,
            "required_found": breakdown.keywords_required_found,
            "preferred_total": breakdown.keywords_preferred_total,
            "preferred_found": breakdown.keywords_preferred_found,
        },
        "formatting_score": breakdown.formatting_score,
        "overall_score": breakdown.overall_score,
    }


def calculate_jd_match_score(
    matches: List[RequirementMatch],
    concepts: List[RequirementConcept],
) -> Dict[str, Any]:
    """High-level entry point that returns the full output shape from the design spec.

    Returns
    -------
    {
        jdMatchScore: int,
        jdMatchBreakdown: { ... },
        scoringMeta: { ... },
        requirementConcepts: list[dict],
    }
    """
    breakdown = calculate_weighted_jd_score(matches, concepts)

    match_by_id: Dict[str, RequirementMatch] = {m.requirement_id: m for m in matches}
    concept_by_id: Dict[str, RequirementConcept] = {c.id: c for c in concepts}

    # Build per-bucket matched/total dicts for the jdMatchBreakdown shape
    buckets_matched: Dict[str, int] = {
        "job_title": int(breakdown.job_title_matched),
        "qualifications": breakdown.qualifications_covered,
        "responsibilities": breakdown.responsibilities_covered,
        "required_keywords": breakdown.keywords_required_found,
        "preferred_keywords": breakdown.keywords_preferred_found,
    }
    buckets_total: Dict[str, int] = {
        "job_title": 1 if any(c.id == "req:job-title" for c in concepts) else 0,
        "qualifications": breakdown.qualifications_total,
        "responsibilities": breakdown.responsibilities_total,
        "required_keywords": breakdown.keywords_required_total,
        "preferred_keywords": breakdown.keywords_preferred_total,
    }

    def _bucket_score(matched: int, total: int) -> float:
        return round(_safe_ratio(matched, total) * 100, 2)

    jd_match_breakdown = {
        "job_title": {
            "matched": buckets_matched["job_title"],
            "total": buckets_total["job_title"],
            "score": _bucket_score(
                buckets_matched["job_title"], buckets_total["job_title"]
            ),
        },
        "qualifications": {
            "matched": buckets_matched["qualifications"],
            "total": buckets_total["qualifications"],
            "score": _bucket_score(
                buckets_matched["qualifications"], buckets_total["qualifications"]
            ),
        },
        "responsibilities": {
            "matched": buckets_matched["responsibilities"],
            "total": buckets_total["responsibilities"],
            "score": _bucket_score(
                buckets_matched["responsibilities"], buckets_total["responsibilities"]
            ),
        },
        "required_keywords": {
            "matched": buckets_matched["required_keywords"],
            "total": buckets_total["required_keywords"],
            "score": _bucket_score(
                buckets_matched["required_keywords"],
                buckets_total["required_keywords"],
            ),
        },
        "preferred_keywords": {
            "matched": buckets_matched["preferred_keywords"],
            "total": buckets_total["preferred_keywords"],
            "score": _bucket_score(
                buckets_matched["preferred_keywords"],
                buckets_total["preferred_keywords"],
            ),
        },
    }

    return {
        "jdMatchScore": int(round(breakdown.overall_score)),
        "jdMatchBreakdown": jd_match_breakdown,
        "scoringMeta": {
            "scoring_model": "deterministic_weighted_v1",
            "scoring_version": "1.0.0",
            "prompt_version": "jd_extract_v1",
            "scoring_algorithm": "weighted_bucket_sum",
        },
        "requirementConcepts": [c.to_dict() for c in concepts],
    }
