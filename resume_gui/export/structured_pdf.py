"""Legacy structured LaTeX PDF export helpers."""
from __future__ import annotations

import logging
from typing import Any, Optional

from resume_gui.renderers.latex_renderer import ResumeDocModel

logger = logging.getLogger("resume_gui")

def _llm_tailor_to_jd(doc: "ResumeDocModel", jd: str, role: str, company: str) -> "ResumeDocModel":
    """Re-tailor an already-extracted ResumeDocModel to a specific JD.

    Returns the tailored doc, or the original doc unchanged if LLM fails.
    """
    jd_snippet     = (jd or "")[:3000].strip()
    profile_snippet = (jd or "")[:100]  # just for context; real content is from doc

    # Serialize the existing model's content into a compact profile block
    lines: list[str] = []
    if doc.summary:
        lines.append(f"SUMMARY: {doc.summary}")
    for exp in (doc.experience or []):
        lines.append(f"\nROLE: {exp.role} at {exp.company} ({exp.dates})")
        for b in exp.bullets:
            lines.append(f"  - {b}")
    serialized = "\n".join(lines)[:5000]

    prompt = f"""You are an expert resume writer. Rewrite the professional summary and experience bullets
to target this specific role and JD. Keep all dates, company names, and core facts exactly as given.
Strengthen verbs, quantify where data is present, and naturally weave in 1-2 JD keywords per bullet.
Do NOT fabricate metrics.

TARGET ROLE: {role} at {company}

JOB DESCRIPTION:
{jd_snippet}

CURRENT RESUME CONTENT:
{serialized}

Output ONLY valid JSON (no markdown) with this schema:
{{
  "summary": "string — new 2-3 sentence summary tailored to JD",
  "experience": [
    {{
      "company": "string — exact original value",
      "role": "string — exact original value",
      "bullets": ["string — rewritten bullet"]
    }}
  ]
}}"""

    try:
        raw = _llm_json_call(prompt)
        if not raw or not isinstance(raw, dict):
            return doc

        new_summary = _clean_model_text(str(raw.get("summary") or ""))
        if new_summary:
            doc = _resume_doc_with_updates(doc, summary=new_summary)

        exp_list = raw.get("experience") or []
        new_experience = list(doc.experience or [])
        for ei, raw_exp in enumerate(exp_list):
            if ei >= len(new_experience):
                break
            raw_bullets = [_clean_model_text(str(b)) for b in (raw_exp.get("bullets") or []) if _clean_model_text(str(b))]
            if raw_bullets:
                old = new_experience[ei]
                new_experience[ei] = ExperienceItem(
                    company=old.company, role=old.role, dates=old.dates,
                    location=old.location, bullets=raw_bullets,
                )

        return _resume_doc_with_updates(doc, experience=new_experience)
    except Exception as exc:
        logger.warning(f"_llm_tailor_to_jd failed: {exc}")
        return doc


def _doc_from_structured_dict(
    structured: dict,
    accepted_edits: "dict[str, dict[str, str]]",
) -> "ResumeDocModel":
    """Rebuild a ResumeDocModel from a structuredResume dict (Phase 1 format),
    patching in any accepted bullet edits from the Analyze UI.

    accepted_edits format: { "<experienceIdx>": { "<bulletIdx>": "new text" } }
    """
    experience: list[ExperienceItem] = []
    for ei, exp in enumerate(structured.get("experience") or []):
        raw_bullets = list(exp.get("bullets") or [])
        ei_key = str(ei)
        patched = []
        for bi, bullet in enumerate(raw_bullets):
            override = (accepted_edits.get(ei_key) or {}).get(str(bi))
            patched.append(_clean_model_text(override) if override else _clean_model_text(bullet))
        experience.append(ExperienceItem(
            company=_clean_model_text(str(exp.get("company") or "")) or "Company",
            role=_clean_model_text(str(exp.get("role") or "")),
            dates=_clean_model_text(str(exp.get("dates") or "")),
            location=_clean_model_text(str(exp.get("location") or "")),
            bullets=[b for b in patched if b],
        ))

    skills: list[tuple[str, list[str]]] = []
    for sk in (structured.get("skills") or []):
        cat   = _clean_model_text(str(sk.get("category") or "Skills"))
        items = normalize_skill_items(str(i) for i in (sk.get("items") or []))
        if items:
            skills.append((cat or "Skills", items))

    education: list[EducationItem] = []
    for edu in structured.get("education") or []:
        if isinstance(edu, dict):
            row = _education_item_from_dict(edu)
            if row:
                education.append(row)

    projects = _project_items_from_llm_projects(structured.get("projects"))

    extra_sections: list[tuple[str, list[str]]] = []
    for sec in (structured.get("extra_sections") or []):
        title = str(sec.get("title") or "")
        lines = [_clean_model_text(str(l)) for l in (sec.get("lines") or []) if _clean_model_text(str(l))]
        if title and lines:
            extra_sections.append((title, lines))

    # Preserve the source PDF's section order (Education-first résumés
    # otherwise get flipped to the default Experience-first order, which
    # contradicts what the live preview showed the user).
    raw_section_order = structured.get("section_order")
    if isinstance(raw_section_order, list):
        section_order = [str(s).strip() for s in raw_section_order if str(s).strip()]
    else:
        section_order = []
    doc_kwargs = dict(
        full_name=_clean_model_text(str(structured.get("full_name") or "Candidate")) or "Candidate",
        headline=_clean_model_text(str(structured.get("headline") or "")),
        location=_clean_model_text(str(structured.get("location") or "")),
        email=_clean_model_text(str(structured.get("email") or "")),
        phone=_clean_model_text(str(structured.get("phone") or "")),
        linkedin=_clean_model_text(str(structured.get("linkedin") or "")),
        github=_clean_model_text(str(structured.get("github") or "")),
        summary=_clean_model_text(str(structured.get("summary") or "")),
        skills=skills,
        experience=experience,
        education=education,
        projects=projects,
        extra_sections=extra_sections,
    )
    if section_order:
        doc_kwargs["section_order"] = section_order
    return ResumeDocModel(**doc_kwargs)

