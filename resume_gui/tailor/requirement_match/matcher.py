"""Deterministic requirement matching (Layers 1–3)."""
from __future__ import annotations

from typing import List, Optional

from resume_gui.tailor.requirement_match.abbreviation import generate_abbreviation
from resume_gui.tailor.requirement_match.disambiguation import match_blocked
from resume_gui.tailor.requirement_match.models import RequirementConcept, RequirementMatch
from resume_gui.tailor.requirement_match.normalize import normalize_text, phrase_exists


def _evidence_snippet(text: str, phrase: str, window: int = 80) -> Optional[str]:
    norm = normalize_text(text)
    norm_phrase = normalize_text(phrase)
    if not norm_phrase:
        return None
    idx = norm.find(norm_phrase)
    if idx < 0:
        return None
    start = max(0, idx - window)
    end = min(len(norm), idx + len(norm_phrase) + window)
    return text[start:end].strip() if text else norm[start:end]


def match_requirement(
    resume_text: str,
    requirement: RequirementConcept,
) -> RequirementMatch:
    """
    Match one JD-grounded requirement against résumé text.

    Order: canonical (exact) → explicit aliases → generated abbreviation.
    """
    if phrase_exists(resume_text, requirement.canonical):
        if not match_blocked(resume_text, requirement.canonical, requirement.canonical, requirement.role_family):
            return RequirementMatch(
                requirement_id=requirement.id,
                canonical=requirement.canonical,
                matched=True,
                method="exact",
                matched_text=requirement.canonical,
                evidence=_evidence_snippet(resume_text, requirement.canonical),
                confidence=0.98,
            )

    for alias in requirement.aliases:
        if not phrase_exists(resume_text, alias):
            continue
        if match_blocked(resume_text, alias, requirement.canonical, requirement.role_family):
            continue
        return RequirementMatch(
            requirement_id=requirement.id,
            canonical=requirement.canonical,
            matched=True,
            method="alias",
            matched_text=alias,
            evidence=_evidence_snippet(resume_text, alias),
            confidence=0.9,
        )

    abbreviation = generate_abbreviation(requirement.canonical)
    if abbreviation and phrase_exists(resume_text, abbreviation):
        if not match_blocked(resume_text, abbreviation, requirement.canonical, requirement.role_family):
            return RequirementMatch(
                requirement_id=requirement.id,
                canonical=requirement.canonical,
                matched=True,
                method="abbreviation",
                matched_text=abbreviation,
                evidence=_evidence_snippet(resume_text, abbreviation),
                confidence=0.75,
            )

    return RequirementMatch(
        requirement_id=requirement.id,
        canonical=requirement.canonical,
        matched=False,
        method="not_found",
        matched_text=None,
        evidence=None,
        confidence=0.0,
    )


def score_resume_against_requirements(
    resume_text: str,
    requirements: List[RequirementConcept],
) -> List[RequirementMatch]:
    return [match_requirement(resume_text, req) for req in requirements]


def verify_gap_in_resume(
    resume_text: str,
    label: str,
    *,
    job_description: str = "",
    applied_text: str = "",
    gap_type: str = "qualification",
    requirement_id: Optional[str] = None,
) -> RequirementMatch:
    """Tailor gap-fix entry point — replaces global alias map checks."""
    from resume_gui.tailor.requirement_match.vocabulary import requirement_from_gap_label

    combined = "\n".join(p for p in (resume_text, applied_text) if p).strip()
    req = requirement_from_gap_label(
        label,
        gap_type,
        job_description=job_description,
        requirement_id=requirement_id,
    )
    return match_requirement(combined, req)
