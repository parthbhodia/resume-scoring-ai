"""Synthesize clean preview text from a structured ResumeDocModel."""
from __future__ import annotations

import re
from typing import List

from resume_gui.renderers.latex_renderer import ResumeDocModel

# Per-employer tech blocks: "Technologies (Adobe)", "TECHNOLOGIES - COMPANY", …
_TECH_EXTRA_TITLE_RE = re.compile(
    r"^technologies\s*(?:\(\s*(.+?)\s*\)|[-–—:|]\s*(.+))\s*$",
    re.IGNORECASE,
)
_COMPANY_SUFFIX_RE = re.compile(
    r"\b(incorporated|inc|llc|ltd|limited|corp|corporation|co|company)\b",
    re.IGNORECASE,
)

_ACTION_VERB_PREFIXES = (
    "Built ", "Designed ", "Engineered ", "Architected ", "Developed ", "Delivered ",
    "Implemented ", "Led ", "Created ", "Launched ", "Managed ", "Drove ", "Optimized ",
    "Integrated ", "Automated ", "Reduced ", "Improved ", "Won ", "Achieved ", "Spearheaded ",
)


def _strip_leading_markers(text: str) -> str:
    """Remove any leading bullet / list markers a vision extract may have kept
    (``*``, ``-``, ``•``, ``·``, ``▪``, ``◦``, ``>``) so the synthesizer adds
    exactly one ``• `` and the frontend's CSS bullet never doubles up."""
    return re.sub(r"^[\s•\-–—*·◦▪▸→>]+", "", text or "").strip()


def _looks_like_tech_stack_line(text: str) -> bool:
    """A project's first 'bullet' is often the tech stack, not an achievement.

    Tech-stack lines look like ``Vue Js, REST API, Mongo DB`` or
    ``React · Node · PostgreSQL`` — short, separator-delimited token lists with no
    leading action verb and no sentence punctuation. Achievement bullets ("Won 2nd
    place at...", "Built a progressive web app...") must NOT match.
    """
    s = (text or "").strip()
    if not s or len(s) > 90:
        return False
    if s.startswith(_ACTION_VERB_PREFIXES):
        return False
    # Sentence-like content disqualifies it (period mid-line, or ends with a period).
    if ". " in s or s.endswith("."):
        return False
    # Must be a delimited list of a few short tokens.
    parts = re.split(r"\s*[,·|]\s*", s)
    parts = [p for p in parts if p]
    if len(parts) < 2:
        return False
    # Every token short (tech names, not clauses) and the whole line is few words.
    if any(len(p.split()) > 4 for p in parts):
        return False
    return len(s.split()) <= 14


def _company_from_technologies_extra_title(title: str) -> str | None:
    m = _TECH_EXTRA_TITLE_RE.match((title or "").strip())
    if not m:
        return None
    company = (m.group(1) or m.group(2) or "").strip()
    return company or None


def _normalize_company_key(company: str) -> str:
    s = re.sub(r"[^\w\s]", " ", (company or "").lower())
    s = _COMPANY_SUFFIX_RE.sub("", s)
    return re.sub(r"\s+", " ", s).strip()


def _partition_company_tech_extras(
    extra_sections: list[tuple[str, list[str]]] | None,
) -> tuple[dict[str, list[str]], list[tuple[str, list[str]]]]:
    tech_by_company: dict[str, list[str]] = {}
    other_extras: list[tuple[str, list[str]]] = []
    for title, lines in extra_sections or []:
        company = _company_from_technologies_extra_title(title)
        clean_lines = [(ln or "").strip() for ln in lines if (ln or "").strip()]
        if company and clean_lines:
            key = _normalize_company_key(company)
            if key:
                tech_by_company.setdefault(key, []).extend(clean_lines)
                continue
        other_extras.append((title, lines))
    return tech_by_company, other_extras


def _tech_lines_for_experience(company: str, tech_by_company: dict[str, list[str]]) -> list[str]:
    exp_key = _normalize_company_key(company)
    if not exp_key:
        return []
    if exp_key in tech_by_company:
        return tech_by_company[exp_key]
    for parsed_key, lines in tech_by_company.items():
        if parsed_key in exp_key or exp_key in parsed_key:
            return lines
    return []


def _company_tech_paragraph_lines(raw_lines: list[str]) -> list[str]:
    cleaned = [
        re.sub(r"^technologies\s*:\s*", "", ln, flags=re.IGNORECASE).strip()
        for ln in raw_lines
        if (ln or "").strip()
    ]
    if not cleaned:
        return []
    if any(re.match(r"^[^:]+:\s*.+", ln) for ln in cleaned):
        return cleaned
    return [f"Technologies: {', '.join(cleaned)}"]


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
                bs = _strip_leading_markers(b)
                if bs:
                    out.append(f"• {bs}")
            out.append("")
        if out and out[-1] == "":
            out.pop()

    tech_by_company, other_extras = _partition_company_tech_extras(doc.extra_sections)

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
                bs = _strip_leading_markers(b)
                if bs:
                    out.append(f"• {bs}")
            for line in _company_tech_paragraph_lines(_tech_lines_for_experience(company, tech_by_company)):
                out.append(line)
            out.append("")
        if out and out[-1] == "":
            out.pop()

    if doc.projects:
        out.extend(["", "PROJECTS"])
        for p in doc.projects:
            name_p = (p.name or "").strip()
            bullets = [m for b in (p.bullets or []) if (m := _strip_leading_markers(b))]
            # First bullet may be the tech stack (synthesized that way by
            # _vision_raw_to_resume_doc, or mis-classified by vision extract).
            # Promote it onto the project header line for nicer rendering so it
            # doesn't render as a stray achievement bullet.
            tech = (p.tech or "").strip()
            if not tech and bullets and _looks_like_tech_stack_line(bullets[0]):
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

    for title, lines in other_extras:
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
