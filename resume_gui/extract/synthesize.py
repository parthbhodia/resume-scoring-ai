"""Synthesize clean preview text from a structured ResumeDocModel."""
from __future__ import annotations

import re
from typing import List

from resume_gui.renderers.latex_renderer import ResumeDocModel

def _synthesize_text_from_resume_doc(doc: ResumeDocModel) -> str:
    """Produce a clean text representation of a ResumeDocModel for the preview
    + analysis prompt.

    When the vision-PDF extract succeeds, the raw MarkItDown / pdfplumber text
    is no longer the source of truth — the structured doc is. The Analyze
    right-panel preview reads ``extractedText`` line-by-line, and so does the
    analysis prompt. Synthesizing both from the (clean) doc means the user
    sees the layout the parser actually understood, and the LLM grades the
    real content instead of column-extraction artifacts ("fragmented
    locations under Experience", "disorganized header").

    Format mirrors what the frontend renderer expects:
      - Header: NAME on line 1, contact pipe-joined on line 2
      - Section labels in ALL-CAPS (EDUCATION / EXPERIENCE / ...)
      - Entry headers use ``" | "`` separators (Company | Role | Location | Date)
        so ``looksLikeEntryHeader`` picks them up for bold styling
      - Bullets prefixed with ``"• "``
      - Blank line between entries / sections
    """
    out: List[str] = []

    name = (doc.full_name or "").strip()
    if name:
        out.append(name)

    contact_parts: List[str] = []
    for v in (doc.phone, doc.email, doc.linkedin, doc.github):
        s = (v or "").strip()
        if s:
            contact_parts.append(s)
    if contact_parts:
        out.append(" | ".join(contact_parts))

    if (doc.location or "").strip():
        out.append(doc.location.strip())

    summary = (doc.summary or "").strip()
    if summary:
        out.extend(["", "SUMMARY", summary])

    if doc.education:
        out.extend(["", "EDUCATION"])
        # Year-or-status hint embedded as "(YYYY)" / "(Ongoing|Present|Current|Now)"
        # at the end of the degree string. Lift it onto the entry header line
        # so it renders right-aligned (Harshibar style) instead of leaking out
        # as a parenthesized fragment that the frontend treats as a bullet.
        _trailing_date_re = re.compile(
            r"\s*\(\s*((?:19|20)\d{2}|Ongoing|Present|Current|Now|"
            r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(?:19|20)\d{2})\s*\)\s*$",
            re.IGNORECASE,
        )
        for e in doc.education:
            inst = (e.institution or "").strip()
            loc = (e.location or "").strip()
            explicit_dates = (e.dates or "").strip()
            degree = (e.degree or "").strip()
            cleaned_degree = degree
            year_from_degree = ""
            m = _trailing_date_re.search(degree) if degree else None
            if m:
                year_from_degree = m.group(1).strip()
                cleaned_degree = degree[: m.start()].rstrip()
            dates = explicit_dates or year_from_degree
            header_pieces = [p for p in (inst, loc, dates) if p]
            if header_pieces:
                out.append(" | ".join(header_pieces))
            if cleaned_degree:
                out.append(cleaned_degree)
            for b in (e.bullets or []):
                bs = (b or "").strip()
                if bs:
                    out.append(f"• {bs}")
            out.append("")
        if out and out[-1] == "":
            out.pop()

    if doc.experience:
        out.extend(["", "EXPERIENCE"])
        for w in doc.experience:
            role = (w.role or "").strip()
            company = (w.company or "").strip()
            loc = (w.location or "").strip()
            dates = (w.dates or "").strip()
            header_pieces = [p for p in (role, company, loc, dates) if p]
            if header_pieces:
                out.append(" | ".join(header_pieces))
            for b in (w.bullets or []):
                bs = (b or "").strip()
                if bs:
                    out.append(f"• {bs}")
            out.append("")
        if out and out[-1] == "":
            out.pop()

    if doc.projects:
        out.extend(["", "PROJECTS"])
        for p in doc.projects:
            name_p = (p.name or "").strip()
            bullets = [b.strip() for b in (p.bullets or []) if b and b.strip()]
            # First bullet may be the tech stack (synthesized that way by
            # _vision_raw_to_resume_doc). Promote it onto the project header
            # line for nicer rendering.
            tech = ""
            if bullets and " · " in bullets[0] and not bullets[0].startswith(("Built ", "Designed ", "Engineered ", "Architected ", "Developed ", "Delivered ", "Implemented ")):
                tech = bullets[0]
                bullets = bullets[1:]
            if name_p and tech:
                out.append(f"{name_p} | {tech}")
            elif name_p:
                out.append(name_p)
            for b in bullets:
                out.append(f"• {b}")
            out.append("")
        if out and out[-1] == "":
            out.pop()

    if doc.skills:
        out.extend(["", "SKILLS"])
        for cat, items in doc.skills:
            items_clean = [i.strip() for i in (items or []) if i and i.strip()]
            if not items_clean:
                continue
            label = (cat or "Skills").strip() or "Skills"
            out.append(f"{label}: {', '.join(items_clean)}")

    for title, lines in (doc.extra_sections or []):
        title_clean = (title or "").strip()
        if not title_clean or not lines:
            continue
        out.extend(["", title_clean.upper()])
        for ln in lines:
            s = (ln or "").strip()
            if s:
                out.append(s)

    text = "\n".join(out).strip()
    # Collapse runs of >2 newlines so we don't accidentally create giant gaps.
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text
