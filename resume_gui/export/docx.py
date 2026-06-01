"""Structured resume → DOCX bytes."""
from __future__ import annotations

def _build_docx_bytes_from_structured(
    structured: dict,
    accepted_edits: Optional[dict] = None,
) -> bytes:
    """Render a Word document from a structured resume dict (Analyze / Builder export)."""
    accepted_edits = accepted_edits or {}
    try:
        from docx import Document  # type: ignore
        from docx.shared import Pt, RGBColor  # type: ignore
        from docx.enum.text import WD_ALIGN_PARAGRAPH  # type: ignore
    except ImportError:
        raise RuntimeError("python-docx is not installed. Add 'python-docx' to requirements.txt.")

    doc = Document()

    for section in doc.sections:
        section.top_margin    = Pt(36)
        section.bottom_margin = Pt(36)
        section.left_margin   = Pt(54)
        section.right_margin  = Pt(54)

    def _h(text: str, size: int = 11, bold: bool = False, color: tuple = (0, 0, 0), align=WD_ALIGN_PARAGRAPH.LEFT):
        p = doc.add_paragraph()
        p.alignment = align
        run = p.add_run(text)
        run.bold = bold
        run.font.size = Pt(size)
        run.font.color.rgb = RGBColor(*color)
        return p

    full_name = structured.get("full_name") or "Candidate"
    _h(full_name, size=18, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)

    contact_parts = [v for k in ("email", "phone", "linkedin", "github", "location")
                     if (v := structured.get(k))]
    if contact_parts:
        _h(" | ".join(contact_parts), size=9, align=WD_ALIGN_PARAGRAPH.CENTER, color=(80, 80, 80))

    if structured.get("summary"):
        doc.add_paragraph()
        _h("SUMMARY", size=9, bold=True, color=(70, 70, 70))
        doc.add_paragraph().add_run(structured["summary"]).font.size = Pt(10)

    skills = structured.get("skills") or []
    if skills:
        doc.add_paragraph()
        _h("SKILLS", size=9, bold=True, color=(70, 70, 70))
        for sk in skills:
            cat   = sk.get("category", "")
            items = sk.get("items") or []
            p = doc.add_paragraph(style="List Bullet")
            run = p.add_run(f"{cat}: " if cat else "")
            run.bold = True
            run.font.size = Pt(10)
            p.add_run(", ".join(items)).font.size = Pt(10)

    experience = structured.get("experience") or []
    if experience:
        doc.add_paragraph()
        _h("EXPERIENCE", size=9, bold=True, color=(70, 70, 70))
        for ei, exp in enumerate(experience):
            header_parts = []
            if exp.get("role"):
                header_parts.append(exp["role"])
            if exp.get("company"):
                header_parts.append(exp["company"])
            role_line = " | ".join(header_parts)
            p = doc.add_paragraph()
            r = p.add_run(role_line)
            r.bold = True
            r.font.size = Pt(10.5)
            if exp.get("dates"):
                p.add_run(f"  {exp['dates']}").font.size = Pt(9)

            bullets = exp.get("bullets") or []
            ei_str  = str(ei)
            for bi, bullet in enumerate(bullets):
                bi_str = str(bi)
                text = accepted_edits.get(ei_str, {}).get(bi_str) or bullet
                p2 = doc.add_paragraph(style="List Bullet")
                p2.add_run(text).font.size = Pt(10)

    for sec in (structured.get("extra_sections") or []):
        title = sec.get("title", "")
        lines = sec.get("lines") or []
        if not lines:
            continue
        doc.add_paragraph()
        _h(title.upper(), size=9, bold=True, color=(70, 70, 70))
        for line in lines:
            p = doc.add_paragraph(style="List Bullet")
            p.add_run(line).font.size = Pt(10)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _docx_attachment_filename(stem: str, fallback: str = "resume") -> str:
    safe = re.sub(r"[^\w.\-]+", "_", (stem or "").strip()).strip("._")[:80] or fallback
    return safe if safe.lower().endswith(".docx") else f"{safe}.docx"

