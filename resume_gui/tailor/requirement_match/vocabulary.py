"""Build role-specific requirement vocabulary from JD + gap labels."""
from __future__ import annotations

import re
from typing import List, Optional, Set

from resume_gui.tailor.requirement_match.abbreviation import generate_abbreviation
from resume_gui.tailor.requirement_match.domain_dict import domain_aliases_for_canonical
from resume_gui.tailor.requirement_match.jd_phrases import _LABEL_STOP, extract_jd_phrases_for_label
from resume_gui.tailor.requirement_match.models import RequirementConcept, RequirementType
from resume_gui.tailor.requirement_match.role_family import classify_role_family


def _slug_id(text: str, prefix: str = "req") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:80]
    return f"{prefix}:{slug or 'unknown'}"


def _gap_type_to_requirement_type(gap_type: str) -> RequirementType:
    if gap_type == "responsibility":
        return "responsibility"
    if gap_type == "keyword":
        return "tool"
    return "technical_skill"


def requirement_from_gap_label(
    label: str,
    gap_type: str = "qualification",
    *,
    job_description: str = "",
    source_text: str = "",
    requirement_id: Optional[str] = None,
    role_family: Optional[str] = None,
) -> RequirementConcept:
    """
    Build a RequirementConcept for one tailor gap (ratings missing item or keyword).

    Vocabulary is JD-centric: phrases from the posting + dynamic abbreviation + optional
    domain dictionary for the classified role family — not a global alias map.
    """
    canonical = (label or "").strip()
    if not canonical:
        raise ValueError("label required")

    family = role_family or classify_role_family(job_description)
    aliases: Set[str] = set()

    # Layer 1: exact phrases from JD
    for phrase in extract_jd_phrases_for_label(job_description, canonical):
        if phrase.lower() != canonical.lower():
            aliases.add(phrase)

    # Layer 2: dynamic abbreviation
    abbr = generate_abbreviation(canonical)
    from resume_gui.tailor.requirement_match.normalize import normalize_text as _norm

    if abbr and abbr != _norm(canonical):
        aliases.add(abbr)

    # Layer 3: domain dictionary (category-scoped)
    aliases |= domain_aliases_for_canonical(canonical, family)

    # Dotted tech variants (nuxt.js ↔ nuxt js)
    if ".js" in canonical.lower():
        base = re.sub(r"\.js\b", "", canonical, flags=re.I).strip()
        if base:
            aliases.add(f"{base}.js")
            aliases.add(f"{base} js")

    # Drop trailing generic suffixes (e.g. "Nuxt.js framework" → "Nuxt.js")
    parts = re.split(r"[\s/]+", canonical)
    while len(parts) > 1 and parts[-1].lower() in _LABEL_STOP:
        parts.pop()
    core = " ".join(parts).strip()
    if core and core.lower() != canonical.lower():
        aliases.add(core)

    rid = requirement_id or _slug_id(canonical, gap_type)
    return RequirementConcept(
        id=rid,
        canonical=canonical,
        aliases=tuple(sorted(aliases)),
        type=_gap_type_to_requirement_type(gap_type),
        importance="required",
        role_family=family,
        source_text=source_text or canonical,
        confidence=0.88,
    )


def build_requirement_vocabulary_from_gaps(
    job_description: str,
    gaps: List[dict],
) -> List[RequirementConcept]:
    """Build vocabulary for all addressed gaps in one rescore."""
    out: List[RequirementConcept] = []
    family = classify_role_family(job_description)
    for gap in gaps:
        label = str(gap.get("label") or "").strip()
        if not label:
            continue
        gtype = str(gap.get("type") or "qualification")
        out.append(
            requirement_from_gap_label(
                label,
                gtype,
                job_description=job_description,
                source_text=label,
                requirement_id=str(gap.get("id") or "") or None,
                role_family=family,
            ),
        )
    return out
