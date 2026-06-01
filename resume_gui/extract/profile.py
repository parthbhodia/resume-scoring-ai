"""Build ResumeDocModel from regex-parsed profile text."""
from __future__ import annotations

import logging
from typing import Optional

from resume_gui.doc_utils import _clean_model_text
from resume_gui.extract.doc_normalize import (
    _is_structural_noise_line, _looks_like_accomplishment_bullet, _normalize_phone_value,
)
from resume_gui.extract.education_parse import _collect_education_flat_lines, _education_items_from_flat_lines
from resume_gui.extract.structured_doc import _project_items_from_prefixed_bullets
from resume_gui.profile_parser import parse_profile_text
from resume_gui.renderers.latex_renderer import ExperienceItem, ProjectItem, ResumeDocModel, normalize_skill_items
from resume_gui.resume_extraction import (
    ProfileSectionInventory, dedupe_education_rows, inject_section_line_breaks,
    validate_extraction_against_inventory,
)

logger = logging.getLogger("resume_gui")

def _resume_doc_from_profile_text(candidate_profile: Optional[str], role: str, company: str) -> ResumeDocModel:
    parsed = parse_profile_text(candidate_profile)
    extra_sec = list(parsed.extra_sections or [])

    full_name = _clean_model_text(parsed.full_name or "Candidate") or "Candidate"
    summary = _clean_model_text(parsed.summary or "")
    skills: list[tuple[str, list[str]]] = []
    for ln in parsed.skills_lines or []:
        clean = _clean_model_text(ln)
        if not clean or _is_structural_noise_line(clean) or _looks_like_accomplishment_bullet(clean):
            continue
        if ":" in clean:
            label, rest = clean.split(":", 1)
            items = [x.strip() for x in rest.split(",") if x.strip()]
            if items:
                skills.append((_clean_model_text(label) or "Skills", normalize_skill_items(items)))
        else:
            skills.append(("Skills", normalize_skill_items([clean])))

    if parsed.experience_entries:
        experience_list = [
            ExperienceItem(
                company=_clean_model_text(ec),
                role=_clean_model_text(er or ""),
                dates=_clean_model_text(ed or ""),
                location=_clean_model_text(el or ""),
                bullets=[_clean_model_text(b) for b in eb if _clean_model_text(b)],
            )
            for ec, er, ed, el, eb in parsed.experience_entries
        ]
    else:
        reg_bullets = [_clean_model_text(b) for b in (parsed.experience_bullets or []) if _clean_model_text(b)]
        experience_list = [
            ExperienceItem(
                company=company or "",
                role=role or "",
                dates="",
                location="",
                bullets=reg_bullets,
            )
        ]

    structured_projects: list[ProjectItem] = []
    if parsed.projects_bullets:
        clean_proj = [_clean_model_text(b) for b in parsed.projects_bullets if _clean_model_text(b)]
        if clean_proj:
            structured_projects = _project_items_from_prefixed_bullets(clean_proj)
            if not structured_projects:
                structured_projects = [ProjectItem(name="", bullets=clean_proj)]
    if not structured_projects:
        for name, vals in extra_sec:
            if (name or "").strip().lower() in ("projects", "project") and vals:
                structured_projects = _project_items_from_prefixed_bullets(
                    [_clean_model_text(v) for v in vals if _clean_model_text(v)]
                )
                break

    edu_flat = _collect_education_flat_lines(parsed.education_lines, extra_sec)
    structured_education = _education_items_from_flat_lines(edu_flat)

    extra_sec_filtered: list[tuple[str, list[str]]] = []
    for name, vals in extra_sec:
        lname = (name or "").strip().lower()
        if structured_projects and lname in ("projects", "project"):
            continue
        if structured_education and lname == "education":
            continue
        cleaned = (name, [_clean_model_text(v) for v in vals if _clean_model_text(v)])
        if cleaned[0]:
            extra_sec_filtered.append(cleaned)

    return ResumeDocModel(
        full_name=full_name,
        headline=_clean_model_text(parsed.headline or role or ""),
        location=_clean_model_text(parsed.location or ""),
        email=_clean_model_text(parsed.email or ""),
        phone=_normalize_phone_value(_clean_model_text(parsed.phone or "")),
        linkedin=_clean_model_text(parsed.linkedin or ""),
        github=_clean_model_text(parsed.github or ""),
        summary=summary,
        skills=skills,
        experience=experience_list,
        education=structured_education,
        projects=structured_projects,
        extra_sections=extra_sec_filtered,
    )


def _preserve_structured_sections_from_profile(
    doc: ResumeDocModel,
    candidate_profile: Optional[str],
    inv: ProfileSectionInventory,
    role: str,
    company: str,
) -> None:
    """When LLM tailoring drops sections, backfill from regex profile parse (upload/PDF text)."""
    profile_norm = inject_section_line_breaks((candidate_profile or "")[:8000])
    if not profile_norm.strip():
        return
    try:
        source = _resume_doc_from_profile_text(profile_norm, role, company)
    except Exception as exc:
        logger.warning("preserve_structured_sections_from_profile failed: %s", exc)
        return

    src_edu = list(source.education or [])
    doc_edu = list(doc.education or [])
    expected_rows = max(1, inv.estimated_education_lines) if inv.expects_education() else 0

    if not doc_edu and src_edu:
        doc.education = src_edu
        logger.info(
            "Structured renderer: restored %s education row(s) from profile parse",
            len(doc.education),
        )
    elif inv.expects_education() and src_edu:
        if len(doc_edu) > len(src_edu) and len(src_edu) <= max(2, expected_rows):
            logger.warning(
                "Structured renderer: replacing %s LLM education row(s) with %s profile-parsed row(s) "
                "(LLM over-extracted vs source EDUCATION section)",
                len(doc_edu),
                len(src_edu),
            )
            doc.education = src_edu
        elif len(doc_edu) < len(src_edu):
            seen = {
                (e.institution.strip().lower(), e.degree.strip().lower())
                for e in doc_edu
            }
            for row in src_edu:
                key = (row.institution.strip().lower(), row.degree.strip().lower())
                if key not in seen and (row.institution or row.degree):
                    doc.education.append(row)
                    seen.add(key)
    doc.education = dedupe_education_rows(list(doc.education or []))

    if not doc.projects and source.projects:
        doc.projects = list(source.projects)

    if not doc.skills and source.skills:
        doc.skills = list(source.skills)
    elif inv.has_skills_header and source.skills:
        src_count = sum(len(items) for _, items in source.skills)
        doc_count = sum(len(items) for _, items in doc.skills)
        if doc_count < max(3, src_count // 2):
            doc.skills = list(source.skills)
            logger.info("Structured renderer: restored skills from profile parse (LLM under-extracted)")

    if inv.expects_experience() and source.experience:
        if not doc.experience:
            doc.experience = list(source.experience)
            logger.info(
                "Structured renderer: restored %s experience entries from profile parse",
                len(doc.experience),
            )
        elif len(doc.experience) < max(1, inv.estimated_job_blocks - 1) and len(source.experience) > len(doc.experience):
            doc.experience = list(source.experience)
            logger.warning(
                "Structured renderer: replaced experience with profile parse "
                "(%s jobs vs LLM %s)",
                len(source.experience),
                len(doc.experience),
            )

    for field_name, src_val, doc_val in (
        ("email", source.email, doc.email),
        ("phone", source.phone, doc.phone),
        ("linkedin", source.linkedin, doc.linkedin),
        ("github", source.github, doc.github),
    ):
        if src_val and not doc_val:
            setattr(doc, field_name, src_val)

    for w in validate_extraction_against_inventory(doc, inv):
        logger.warning("After profile backfill still incomplete: %s", w)
