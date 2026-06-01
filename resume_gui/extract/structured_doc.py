"""Build ResumeDocModel from parsed profile JSON or LLM raw dict."""
from __future__ import annotations

import re
from typing import Any

from resume_gui.doc_utils import _clean_model_text
from resume_gui.extract.doc_normalize import (
    _is_structural_noise_line,
    _parse_entry_header,
)
from resume_gui.extract.education_parse import (
    _education_item_from_dict,
    _education_items_from_flat_lines,
)
from resume_gui.renderers.latex_renderer import (
    EducationItem,
    ExperienceItem,
    ProjectItem,
    ResumeDocModel,
    normalize_skill_items,
)
from resume_gui.resume_extraction import DEFAULT_SECTION_ORDER

# Action-verb starts that disqualify a line from being a tech-stack tagline
# (so we don't accidentally promote a real achievement bullet into the project
# header). Conservative — only verbs we know lead a real bullet.
_PROJECT_BULLET_LEAD_RE = re.compile(
    r"^(?:Architected|Built|Designed|Developed|Delivered|Engineered|"
    r"Implemented|Reduced|Created|Migrated|Integrated|Launched|Shipped|"
    r"Drove|Led|Owned|Established|Optimi[sz]ed|Streamlined|Automated|"
    r"Refactored|Improved|Increased|Scaled|Authored|Composed|Orchestrated|"
    r"Configured|Trained|Mentored|Coordinated|Spearheaded|Productionized|"
    r"Productionised)\b",
    re.IGNORECASE,
)


def _line_looks_like_tech_stack(line: str) -> bool:
    """A line like "Python · Django · React · LLM (Llama 3) · MySQL · MongoDB"
    that the vision extractor sometimes packs into ``bullets[0]``.

    Markers:
      - has ≥2 middot/bullet separators (" · ") or " | " separators
      - doesn't start with an action verb (those are real achievement bullets)
      - short (one display line)
      - no sentence-ending punctuation
    """
    t = (line or "").strip()
    if not t or len(t) > 220:
        return False
    if _PROJECT_BULLET_LEAD_RE.match(t):
        return False
    if t.endswith((".", "!", "?", ";")):
        return False
    sep_count = t.count(" · ") + t.count(" | ")
    return sep_count >= 2


def _project_items_from_llm_projects(raw_projects: Any) -> list[ProjectItem]:
    out: list[ProjectItem] = []
    for proj in raw_projects or []:
        if not isinstance(proj, dict):
            continue
        name_p = _clean_model_text(proj.get("name") or "")
        tech_p = _clean_model_text(str(proj.get("tech") or ""))
        p_buls = [_clean_model_text(b) for b in (proj.get("bullets") or []) if _clean_model_text(b)]
        # Vision extractor packs tech stack into bullets[0]. Promote it onto
        # the project's `tech` field so the template can render it next to
        # the name instead of as a bogus achievement bullet.
        if not tech_p and p_buls and _line_looks_like_tech_stack(p_buls[0]):
            tech_p = p_buls[0]
            p_buls = p_buls[1:]
        if name_p and p_buls:
            out.append(ProjectItem(name=name_p, bullets=p_buls, tech=tech_p))
        elif name_p:
            out.append(ProjectItem(name=name_p, bullets=[], tech=tech_p))
        elif p_buls:
            out.append(ProjectItem(name="", bullets=p_buls, tech=tech_p))
    return out


def _project_items_from_prefixed_bullets(lines: list[str]) -> list[ProjectItem]:
    """Group ``ProjectName: detail`` lines so the PDF shows one title and multiple bullets."""
    grouped: list[ProjectItem] = []
    i = 0
    n = len(lines)
    while i < n:
        line = _clean_model_text(lines[i])
        if not line:
            i += 1
            continue
        if ":" in line:
            head, rest = line.split(":", 1)
            h, r = head.strip(), rest.strip()
            if h and len(r) > 8:
                bullets = [r]
                i += 1
                while i < n:
                    nxt = _clean_model_text(lines[i])
                    if not nxt:
                        i += 1
                        continue
                    if ":" in nxt:
                        nh, nr = nxt.split(":", 1)
                        nh, nr = nh.strip(), nr.strip()
                        if nh.lower() == h.lower() and len(nr) > 8:
                            bullets.append(nr)
                            i += 1
                            continue
                        break
                    bullets.append(nxt)
                    i += 1
                grouped.append(ProjectItem(name=h, bullets=bullets))
                continue
        grouped.append(ProjectItem(name="", bullets=[line]))
        i += 1
    return grouped

def _resume_doc_from_parsed(parsed: dict) -> ResumeDocModel:
    contact = parsed.get("contact") or {}
    sections = parsed.get("sections") or []

    doc = ResumeDocModel(
        full_name=str(contact.get("name") or "Candidate").strip() or "Candidate",
        headline="",
        location=str(contact.get("location") or "").strip(),
        email=str(contact.get("email") or "").strip(),
        phone=str(contact.get("phone") or "").strip(),
        linkedin=str(contact.get("linkedinUrl") or contact.get("linkedin") or "").strip(),
        github=str(contact.get("githubUrl") or contact.get("github") or "").strip(),
        summary="",
        skills=[],
        experience=[],
        extra_sections=[],
    )

    for sec in sections:
        sec_name = str(sec.get("name") or "").strip().lower()
        entries = sec.get("entries") or []

        if "summary" in sec_name or "profile" in sec_name:
            for ent in entries:
                bullets = ent.get("bullets") or []
                if bullets:
                    cleaned_lines = []
                    for b in bullets:
                        line = _clean_model_text(str(b.get("text") or ""))
                        if not line or _is_structural_noise_line(line):
                            continue
                        cleaned_lines.append(line)
                    doc.summary = " ".join(cleaned_lines)
                    break
            continue

        if "skill" in sec_name:
            for ent in entries:
                for b in ent.get("bullets") or []:
                    line = _clean_model_text(str(b.get("text") or ""))
                    if not line or _is_structural_noise_line(line):
                        continue
                    if ":" in line:
                        label, rest = line.split(":", 1)
                        if _is_structural_noise_line(label):
                            label = "Skills"
                        items = [x.strip() for x in rest.split(",") if x.strip()]
                        items = [x for x in items if not _is_structural_noise_line(x)]
                        clean_label = _clean_model_text(label)
                        if not clean_label:
                            clean_label = "Skills"
                        normalized = normalize_skill_items(items)
                        if normalized:
                            doc.skills.append((clean_label, normalized))
                    else:
                        normalized = normalize_skill_items([line])
                        if normalized:
                            doc.skills.append(("Skills", normalized))
            continue

        if "experience" in sec_name or "work" in sec_name:
            for ent in entries:
                role, company, location, dates = _parse_entry_header(str(ent.get("header") or ""))
                bullets = [
                    _clean_model_text(str(b.get("text") or ""))
                    for b in (ent.get("bullets") or [])
                    if _clean_model_text(str(b.get("text") or ""))
                ]
                bullets = [b for b in bullets if not _is_structural_noise_line(b)]
                if not company and not role and not bullets:
                    continue
                doc.experience.append(
                    ExperienceItem(
                        company=company or "Experience",
                        role=role,
                        location=location,
                        dates=dates,
                        bullets=bullets,
                    )
                )
            continue

        if "education" in sec_name:
            for ent in entries:
                flat: list[str] = []
                hdr = _clean_model_text(str(ent.get("header") or "")).strip()
                if hdr and not _is_structural_noise_line(hdr):
                    for part in re.split(r"\s*·\s*", hdr):
                        p = part.strip()
                        if p:
                            flat.append(p)
                for b in ent.get("bullets") or []:
                    txt = _clean_model_text(str(b.get("text") or ""))
                    if txt and not _is_structural_noise_line(txt):
                        flat.append(txt)
                doc.education.extend(_education_items_from_flat_lines(flat))
            continue

        if "project" in sec_name:
            for ent in entries:
                hdr = _clean_model_text(str(ent.get("header") or "")).strip()
                bullets = [
                    _clean_model_text(str(b.get("text") or ""))
                    for b in (ent.get("bullets") or [])
                    if _clean_model_text(str(b.get("text") or ""))
                ]
                bullets = [b for b in bullets if not _is_structural_noise_line(b)]
                name = ""
                if hdr and not _is_structural_noise_line(hdr):
                    name = re.split(r"\s*·\s*", hdr)[0].strip()
                if name or bullets:
                    doc.projects.append(ProjectItem(name=name, bullets=bullets))
            continue

        # Dynamic catch-all sections for anything beyond summary/skills/experience/education/projects.
        sec_label = _clean_model_text(str(sec.get("name") or "")).strip()
        if sec_label:
            extra_lines: list[str] = []
            for ent in entries:
                hdr = _clean_model_text(str(ent.get("header") or "")).strip()
                if hdr and not _is_structural_noise_line(hdr):
                    extra_lines.append(hdr)
                for b in ent.get("bullets") or []:
                    txt = _clean_model_text(str(b.get("text") or ""))
                    if txt and not _is_structural_noise_line(txt):
                        extra_lines.append(txt)
            if extra_lines:
                doc.extra_sections.append((sec_label, extra_lines[:30]))

    # Consolidate duplicated skill labels/items from noisy model output.
    merged_skills: list[tuple[str, list[str]]] = []
    skill_index: dict[str, int] = {}
    for label, items in doc.skills:
        clean_label = _clean_model_text(label) or "Skills"
        key = clean_label.lower()
        if key not in skill_index:
            skill_index[key] = len(merged_skills)
            merged_skills.append((clean_label, []))
        idx = skill_index[key]
        existing = merged_skills[idx][1]
        seen = {x.lower() for x in existing}
        for item in items:
            item_clean = _clean_model_text(item)
            if not item_clean or _is_structural_noise_line(item_clean):
                continue
            lk = item_clean.lower()
            if lk not in seen:
                existing.append(item_clean)
                seen.add(lk)
    doc.skills = [(label, items) for label, items in merged_skills if items]

    cleaned_exp: list[ExperienceItem] = []
    for exp in doc.experience:
        company = _clean_model_text(exp.company)
        role = _clean_model_text(exp.role)
        bullets = [b for b in exp.bullets if b and not _is_structural_noise_line(b)]
        if not bullets and not role and company.lower() in {"", "experience"}:
            continue
        cleaned_exp.append(
            ExperienceItem(
                company=company or "Experience",
                role=role,
                location=_clean_model_text(exp.location),
                dates=_clean_model_text(exp.dates),
                bullets=bullets,
            )
        )
    doc.experience = cleaned_exp

    if doc.projects or doc.education:
        filtered_extra: list[tuple[str, list[str]]] = []
        for title, lines in doc.extra_sections:
            lname = (title or "").strip().lower()
            if doc.projects and lname in ("projects", "project"):
                continue
            if doc.education and lname == "education":
                continue
            filtered_extra.append((title, lines))
        doc.extra_sections = filtered_extra

    return doc

def _build_resume_doc_from_llm_raw(
    raw: dict,
    *,
    role: str = "",
    company: str = "",
) -> ResumeDocModel:
    """Map LLM JSON to ResumeDocModel with consistent field cleaning."""
    full_name = str(raw.get("full_name") or "Candidate").strip() or "Candidate"

    skills: list[tuple[str, list[str]]] = []
    for sk in (raw.get("skills") or []):
        if not isinstance(sk, dict):
            continue
        cat = _clean_model_text(str(sk.get("category") or "Skills"))
        items = normalize_skill_items(str(i) for i in (sk.get("items") or []))
        if items:
            skills.append((cat or "Skills", items))

    experience: list[ExperienceItem] = []
    for exp in (raw.get("experience") or []):
        if not isinstance(exp, dict):
            continue
        bullets = [
            _clean_model_text(str(b))
            for b in (exp.get("bullets") or [])
            if _clean_model_text(str(b))
        ]
        company_name = _clean_model_text(str(exp.get("company") or "")) or "Company"
        experience.append(
            ExperienceItem(
                company=company_name,
                role=_clean_model_text(str(exp.get("role") or "")),
                dates=_clean_model_text(str(exp.get("dates") or "")),
                location=_clean_model_text(str(exp.get("location") or "")),
                bullets=bullets,
            )
        )

    education: list[EducationItem] = []
    for edu in (raw.get("education") or []):
        if isinstance(edu, dict):
            row = _education_item_from_dict(edu)
            if row:
                education.append(row)

    projects = _project_items_from_llm_projects(raw.get("projects"))

    return ResumeDocModel(
        full_name=full_name,
        headline=_clean_model_text(str(raw.get("headline") or role or "")),
        location=_clean_model_text(str(raw.get("location") or "")),
        email=_clean_model_text(str(raw.get("email") or "")),
        phone=_clean_model_text(str(raw.get("phone") or "")),
        linkedin=_clean_model_text(str(raw.get("linkedin") or "")),
        github=_clean_model_text(str(raw.get("github") or "")),
        summary=_clean_model_text(str(raw.get("summary") or "")),
        skills=skills,
        experience=experience,
        education=education,
        projects=projects,
        extra_sections=[],
    )


def _doc_extraction_counts(doc: "ResumeDocModel") -> dict:
    """Compact section counts for log lines (grep ``EXTRACT_DEBUG``)."""
    return {
        "experience_entries": len(doc.experience or []),
        "experience_bullets": sum(len(e.bullets or []) for e in (doc.experience or [])),
        "education_entries": len(doc.education or []),
        "skill_groups": len(doc.skills or []),
        "skill_items": sum(len(items) for _, items in (doc.skills or [])),
        "projects": len(doc.projects or []),
        "extra_sections": len(doc.extra_sections or []),
        "summary_chars": len((doc.summary or "").strip()),
        "section_order": list(getattr(doc, "section_order", None) or DEFAULT_SECTION_ORDER),
    }

def _resume_doc_to_dict(doc: "ResumeDocModel") -> dict:
    """Serialize a ResumeDocModel to a plain dict for JSON transport."""
    return {
        "full_name": doc.full_name,
        "headline": doc.headline,
        "location": doc.location,
        "email": doc.email,
        "phone": doc.phone,
        "linkedin": doc.linkedin,
        "github": doc.github,
        "summary": doc.summary,
        "skills": [{"category": cat, "items": items} for cat, items in (doc.skills or [])],
        "experience": [
            {
                "company": e.company,
                "role": e.role,
                "dates": e.dates,
                "location": e.location,
                "bullets": list(e.bullets),
            }
            for e in (doc.experience or [])
        ],
        "education": [
            {
                "institution": e.institution,
                "degree": e.degree,
                "dates": e.dates,
                "location": e.location,
                "bullets": list(e.bullets),
            }
            for e in (doc.education or [])
        ],
        "projects": [
            {"name": p.name, "bullets": list(p.bullets), "tech": getattr(p, "tech", "")}
            for p in (doc.projects or [])
        ],
        "extra_sections": [
            {"title": title, "lines": lines}
            for title, lines in (doc.extra_sections or [])
        ],
        "section_order": list(getattr(doc, "section_order", None) or DEFAULT_SECTION_ORDER),
    }

