"""Vision-based PDF structured extraction."""
from __future__ import annotations

import base64
import json
import logging
import os
import re
from typing import List, Optional

from resume_gui.renderers.latex_renderer import (
    EducationItem,
    ExperienceItem,
    ProjectItem,
    ResumeDocModel,
)

logger = logging.getLogger("resume_gui")

_VISION_EXTRACT_PROMPT = """You are reading a one-page (or rarely multi-page) résumé image. Produce a COMPLETE, FAITHFUL JSON of every field on the page — do not skip anything, do not paraphrase. Schema:

{
  "full_name": "",
  "headline": "",
  "phone": "",
  "email": "",
  "linkedin": "",
  "github": "",
  "portfolio": "",
  "location": "",
  "summary": "",
  "education": [
    {"institution":"", "degree":"", "location":"", "dates":"", "gpa_or_grade":"", "notes":""}
  ],
  "experience": [
    {"company":"", "role":"", "location":"", "dates":"", "bullets":["..."]}
  ],
  "projects": [
    {"name":"", "tech":"", "dates":"", "bullets":["..."]}
  ],
  "skills_groups": [
    {"category":"", "items":["..."]}
  ],
  "certifications": [{"name":"", "issuer":"", "date":""}],
  "awards": ["..."],
  "publications": ["..."],
  "languages": ["..."],
  "activities_or_leadership": [{"title":"", "organization":"", "dates":"", "bullets":["..."]}],
  "extra_sections": [{"section_name":"", "items":["..."]}]
}

CRITICAL RULES:
- Every institution = its own education entry. Never merge two schools into one.
- Every distinct role/job = its own experience entry.
- Bullets must be FULL multi-line text exactly as visible; do not truncate, do not paraphrase.
- Preserve every numeral, percent, year, CGPA, count (e.g. "5 refinement cycles", "up to 3 retries", "9,000+ records", "50,000+ HEIs", "~70%", "CGPA: 9.266").
- If a field is absent in the résumé, set it to "" or [].
- Skills MUST be grouped exactly as the résumé groups them (e.g. "Languages and Frameworks", "ML / AI"). Do not invent groups.
- Put anything that doesn't fit a named schema field into extra_sections.
Return ONLY the JSON object, no markdown fences, no commentary."""

def _render_pdf_pages_to_b64_pngs(
    pdf_bytes: bytes, *, dpi: int = 200, max_pages: int = 2
) -> List[str]:
    """Render the first ``max_pages`` of a PDF to base64-encoded PNGs."""
    try:
        import fitz  # type: ignore  # PyMuPDF
    except Exception as exc:
        logger.warning("vision-extract: PyMuPDF unavailable (%s)", exc)
        return []
    out: List[str] = []
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        logger.warning("vision-extract: PDF open failed (%s)", exc)
        return []
    try:
        for i in range(min(len(doc), max_pages)):
            pix = doc[i].get_pixmap(dpi=dpi)
            png_bytes = pix.tobytes("png")
            out.append(base64.standard_b64encode(png_bytes).decode())
    finally:
        doc.close()
    return out


def _vision_raw_to_resume_doc(raw: dict) -> ResumeDocModel:
    """Map the vision-extract JSON schema onto ResumeDocModel.

    The vision schema separates ``degree`` from ``gpa_or_grade`` and emits a
    standalone ``activities_or_leadership`` array; we merge the two grade
    fields into ``EducationItem.degree`` and append activities (plus any
    certifications / awards / publications / languages) into the doc's
    ``extra_sections`` so nothing the candidate wrote is dropped.
    """
    EduCtor = EducationItem
    ExpCtor = ExperienceItem
    ProjCtor = ProjectItem

    # ── Education ─────────────────────────────────────────────────────────
    # The vision LLM is run-to-run inconsistent about whether the grade lives
    # in `degree` (as "B.Tech ... CGPA: 9.266 (Ongoing)"), in `gpa_or_grade`
    # ("CGPA: 9.266 (Ongoing)"), or both. Combine only when the degree text
    # doesn't already include the grade — otherwise we end up with
    # "B.Tech ... CGPA: 9.266 (Ongoing) — CGPA: 9.266 (Ongoing)".
    education: List[EducationItem] = []
    for e in (raw.get("education") or []):
        if not isinstance(e, dict):
            continue
        degree = str(e.get("degree") or "").strip()
        grade = str(e.get("gpa_or_grade") or "").strip()
        # Strip a possible trailing date / status from the grade for the
        # containment check ("CGPA: 9.266 (Ongoing)" vs "CGPA: 9.266").
        grade_core = re.sub(r"\s*\(\s*[^)]+\s*\)\s*$", "", grade).strip()
        if degree and grade:
            if grade_core and grade_core.lower() in degree.lower():
                combined = degree
            elif grade.lower() in degree.lower():
                combined = degree
            else:
                combined = f"{degree} — {grade}"
        else:
            combined = degree or grade
        notes = str(e.get("notes") or "").strip()
        education.append(EduCtor(
            institution=str(e.get("institution") or "").strip(),
            degree=combined,
            dates=str(e.get("dates") or "").strip(),
            location=str(e.get("location") or "").strip(),
            bullets=[notes] if notes else [],
        ))

    # ── Experience ────────────────────────────────────────────────────────
    # Vision is run-to-run inconsistent about whether the location lives in
    # `location` or gets embedded into `company` as "Company · Location" /
    # "Company, Location". Detect the embedded form and strip the location
    # out so we don't end up with "Co · Tardeo, Mumbai | Tardeo, Mumbai".
    experience: List[ExperienceItem] = []
    for w in (raw.get("experience") or []):
        if not isinstance(w, dict):
            continue
        company = str(w.get("company") or "").strip()
        location = str(w.get("location") or "").strip()
        if company and location:
            # Try common embedded patterns: " · ", " - ", " | ", ", "
            for sep in (" · ", " - ", " | "):
                if sep in company:
                    left, right = company.split(sep, 1)
                    if location.lower() == right.strip().lower() or location.lower() in right.strip().lower():
                        company = left.strip()
                        break
            # Trailing ", Location" pattern — only strip when the comma-tail
            # is a clear location match (avoid eating legit "Company, Inc.").
            if company.lower().endswith(f", {location.lower()}"):
                company = company[: -(len(location) + 2)].strip()
        bullets = [str(b).strip() for b in (w.get("bullets") or []) if str(b).strip()]
        experience.append(ExpCtor(
            company=company,
            role=str(w.get("role") or "").strip(),
            dates=str(w.get("dates") or "").strip(),
            location=location,
            bullets=bullets,
        ))

    # ── Projects ──────────────────────────────────────────────────────────
    projects: List[ProjectItem] = []
    for p in (raw.get("projects") or []):
        if not isinstance(p, dict):
            continue
        name = str(p.get("name") or "").strip()
        tech = str(p.get("tech") or "").strip()
        bullets = [str(b).strip() for b in (p.get("bullets") or []) if str(b).strip()]
        # Prepend tech stack as the first bullet so the stack list is preserved
        # in display (Harshibar's project template doesn't have a dedicated
        # tech field yet). Skip when the tech string would duplicate the name.
        if tech and tech not in bullets:
            bullets = [tech] + bullets
        projects.append(ProjCtor(name=name, bullets=bullets))

    # ── Skills (preserve the candidate's own grouping) ────────────────────
    # The LLM is run-to-run inconsistent on the items[] shape: sometimes a
    # proper array (["Python", "Java", ...]), sometimes a single CSV string
    # (["Python, Java, C, ..."]). Split any comma-joined entries so the
    # rendered preview shows them as individual chips.
    skills: List[tuple[str, List[str]]] = []
    for g in (raw.get("skills_groups") or []):
        if not isinstance(g, dict):
            continue
        cat = str(g.get("category") or "Skills").strip() or "Skills"
        raw_items = g.get("items") or []
        items: List[str] = []
        for it in raw_items:
            s = str(it).strip()
            if not s:
                continue
            if "," in s and len(s) > 18:
                # Split on commas while preserving compound names like "Power BI"
                # and parenthesized clarifications.
                parts = [p.strip().strip(",") for p in s.split(",")]
                items.extend(p for p in parts if p)
            else:
                items.append(s)
        if items:
            skills.append((cat, items))

    # ── extra_sections: activities, certs, awards, etc. ──────────────────
    extra_sections: List[tuple[str, List[str]]] = []

    activities = raw.get("activities_or_leadership") or []
    if activities:
        lines: List[str] = []
        for a in activities:
            if not isinstance(a, dict):
                continue
            title = str(a.get("title") or "").strip()
            org = str(a.get("organization") or "").strip()
            dates = str(a.get("dates") or "").strip()
            header = " | ".join(p for p in (title, org, dates) if p)
            if header:
                lines.append(header)
            for b in (a.get("bullets") or []):
                bs = str(b).strip()
                if bs:
                    lines.append(f"• {bs}")
        if lines:
            extra_sections.append(("Activities & Leadership", lines))

    for key, label in (
        ("certifications", "Certifications"),
        ("awards", "Awards"),
        ("publications", "Publications"),
        ("languages", "Languages"),
    ):
        items = raw.get(key) or []
        if not items:
            continue
        lines = []
        for it in items:
            if isinstance(it, dict):
                pieces = [str(it.get(k) or "").strip() for k in ("name", "issuer", "date")]
                line = " | ".join(p for p in pieces if p)
                if line:
                    lines.append(line)
            else:
                s = str(it).strip()
                if s:
                    lines.append(s)
        if lines:
            extra_sections.append((label, lines))

    for s in (raw.get("extra_sections") or []):
        if not isinstance(s, dict):
            continue
        name = str(s.get("section_name") or "").strip() or "Other"
        items = [str(it).strip() for it in (s.get("items") or []) if str(it).strip()]
        if items:
            extra_sections.append((name, items))

    return ResumeDocModel(
        full_name=str(raw.get("full_name") or "Candidate").strip() or "Candidate",
        headline=str(raw.get("headline") or "").strip(),
        location=str(raw.get("location") or "").strip(),
        email=str(raw.get("email") or "").strip(),
        phone=str(raw.get("phone") or "").strip(),
        linkedin=str(raw.get("linkedin") or "").strip(),
        github=str(raw.get("github") or "").strip(),
        summary=str(raw.get("summary") or "").strip(),
        skills=skills,
        experience=experience,
        education=education,
        projects=projects,
        extra_sections=extra_sections,
    )


def _llm_extract_pdf_vision(pdf_bytes: bytes) -> Optional[ResumeDocModel]:
    """Try the vision-PDF structured extract. Returns None on any failure
    (no PDF bytes, no XAI key, PyMuPDF missing, API error, empty result)
    so callers can fall back to the text-based reasoning extract."""
    if not pdf_bytes or len(pdf_bytes) < 100:
        return None
    if os.environ.get("DISABLE_VISION_EXTRACT", "").lower() in ("1", "true", "yes"):
        return None
    if not os.environ.get("XAI_API_KEY"):
        # Vision via Gemini isn't wired here yet; require xAI key for the fast path.
        return None
    images_b64 = _render_pdf_pages_to_b64_pngs(pdf_bytes)
    if not images_b64:
        return None
    try:
        from openai import OpenAI  # type: ignore
        model = (os.environ.get("VISION_EXTRACT_MODEL") or "grok-4").strip()
        xai = OpenAI(api_key=os.environ["XAI_API_KEY"], base_url="https://api.x.ai/v1")
        content: List[dict] = [{"type": "text", "text": _VISION_EXTRACT_PROMPT}]
        for b64 in images_b64:
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{b64}"},
            })
        r = xai.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": content}],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        text = (r.choices[0].message.content or "").strip()
        text = re.sub(r"^```[a-z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        raw = json.loads(text)
    except Exception as exc:
        logger.warning("vision-extract LLM call failed (%s) — falling back", exc)
        return None
    if not isinstance(raw, dict):
        logger.warning("vision-extract returned non-dict — falling back")
        return None
    doc = _vision_raw_to_resume_doc(raw)
    # Sanity check — if nothing meaningful was extracted, refuse and let the
    # text path try.
    if not (doc.experience or doc.education or doc.projects or doc.skills):
        logger.warning("vision-extract returned empty doc — falling back")
        return None
    logger.info(
        "vision-extract OK | edu=%d exp=%d proj=%d skills=%d extra=%d",
        len(doc.education), len(doc.experience), len(doc.projects),
        len(doc.skills), len(doc.extra_sections),
    )
    return doc
