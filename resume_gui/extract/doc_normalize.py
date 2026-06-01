"""Normalize structured ResumeDocModel fields after extract."""
from __future__ import annotations

import re

from resume_gui.doc_utils import _clean_model_text
from resume_gui.renderers.latex_renderer import ResumeDocModel

def _parse_entry_header(header: str) -> Tuple[str, str, str, str]:
    parts = [p.strip() for p in (header or "").split("|") if p.strip()]
    if not parts:
        return "", "", "", ""
    if len(parts) == 1:
        return "", parts[0], "", ""
    if len(parts) == 2:
        return parts[0], parts[1], "", ""
    if len(parts) == 3:
        return parts[0], parts[1], "", parts[2]
    return parts[0], parts[1], parts[2], " | ".join(parts[3:])

_DEGREE_LINE_RE = re.compile(
    r"\b(?:"
    r"B\.?\s*S\.?|B\.?\s*A\.?|Bachelor|M\.?\s*S\.?|M\.?\s*A\.?|MBA|Master'?s?|Ph\.?\s*D\.?|Doctorate|"
    r"Associate|Diploma|PG\s+Diploma|Undergraduate|Postgraduate)\b",
    re.I,
)
_SCHOOL_HINT_RE = re.compile(r"\b(?:university|college|institute|school|academy)\b", re.I)
_EDU_DATE_HINT_RE = re.compile(
    r"\b(?:19|20)\d{2}\b|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b",
    re.I,
)
_EXPERIENCE_SECTION_LABELS = frozenset({
    "experience",
    "work experience",
    "professional experience",
    "employment",
    "work history",
})
_SKILL_SECTION_LABELS = frozenset({"skills", "technical skills", "core competencies"})
_LOCATION_BULLET_RE = re.compile(
    r"^[A-Za-z .'-]+,\s*[A-Za-z .'-]+$",
)
_EDU_SECTION_NOISE = frozenset({"projects", "project", "education", "coursework", "relevant coursework"})
_ACCOMPLISHMENT_STARTERS = frozenset({
    "developed", "supported", "led", "built", "implemented", "automated", "collaborated",
    "assisted", "performed", "ensured", "redesigned", "constructed", "consolidated",
    "managed", "conducted", "applied", "designed", "streamlined", "owned", "contributed",
    "created", "analyzed", "analysed", "optimized", "optimised", "reduced", "increased",
})


def _is_experience_section_label(text: str) -> bool:
    low = re.sub(r"[^a-z ]", "", (text or "").lower()).strip()
    return low in _EXPERIENCE_SECTION_LABELS


def _looks_like_accomplishment_bullet(text: str) -> bool:
    t = _clean_model_text(text)
    if len(t.split()) < 8:
        return False
    first = t.split()[0].lower().rstrip(",")
    return first in _ACCOMPLISHMENT_STARTERS


def _normalize_phone_value(phone: str) -> str:
    p = _clean_model_text(phone)
    if p and p[0].isdigit() and ")" in p and "(" not in p:
        p = "(" + p
    return p


def _normalize_structured_experience(doc: ResumeDocModel) -> None:
    """Fix table-style extracts that put the word 'Experience' in the company slot."""
    for exp in doc.experience or []:
        company = _clean_model_text(exp.company or "")
        role = _clean_model_text(exp.role or "")
        loc = _clean_model_text(exp.location or "")
        if _is_experience_section_label(company):
            if "|" in role:
                parts = [p.strip() for p in role.split("|") if p.strip()]
                if len(parts) >= 2:
                    exp.role = _clean_model_text(parts[0])
                    exp.company = _clean_model_text(parts[1])
                    if len(parts) >= 3:
                        exp.location = _clean_model_text(parts[2].strip(" |"))
                else:
                    exp.company = ""
            else:
                exp.company = ""
        if _is_experience_section_label(exp.role):
            exp.role = ""
        if role and not exp.role and not _is_experience_section_label(company):
            if "|" in role:
                parts = [p.strip() for p in role.split("|") if p.strip()]
                if len(parts) >= 2 and not _is_experience_section_label(parts[0]):
                    exp.role = _clean_model_text(parts[0])
                    exp.company = _clean_model_text(parts[1]) or exp.company
                    if len(parts) >= 3:
                        exp.location = _clean_model_text(parts[2].strip(" |")) or loc
            elif not exp.role:
                exp.role = role
        exp.role = _clean_model_text(exp.role or "").strip(" |")
        exp.company = _clean_model_text(exp.company or "")
        if _is_experience_section_label(exp.company):
            exp.company = ""


# Broader degree detection than _DEGREE_LINE_RE — catches Indian / GCSE / IB
# certifications and any line with CGPA/GPA/% which is almost always a degree


def _normalize_structured_education(doc: ResumeDocModel) -> None:
    """Fix degree/dates/location swapped when PDF tables split one school across lines."""
    for edu in doc.education or []:
        dates = _clean_model_text(edu.dates or "")
        degree = _clean_model_text(edu.degree or "")
        if dates and _DEGREE_LINE_RE.search(dates) and not _EDU_DATE_HINT_RE.search(dates):
            if not degree:
                edu.degree = dates
                edu.dates = ""
            elif _EDU_DATE_HINT_RE.search(degree) and not _EDU_DATE_HINT_RE.search(dates):
                edu.dates, edu.degree = degree, dates
        loc_field = _clean_model_text(edu.location or "")
        if loc_field and _EDU_DATE_HINT_RE.search(loc_field) and not _EDU_DATE_HINT_RE.search(edu.dates or ""):
            edu.dates = loc_field
            edu.location = ""
        bullets = list(edu.bullets or [])
        if bullets and not (edu.location or "").strip():
            kept: list[str] = []
            for b in bullets:
                bt = _clean_model_text(b)
                low_b = re.sub(r"[^a-z ]", "", bt.lower()).strip()
                if low_b in _EDU_SECTION_NOISE:
                    continue
                if (
                    _EDU_DATE_HINT_RE.search(bt)
                    and not _DEGREE_LINE_RE.search(bt)
                    and not edu.dates
                ):
                    edu.dates = bt
                    continue
                if (
                    not edu.location
                    and _LOCATION_BULLET_RE.match(bt)
                    and not _DEGREE_LINE_RE.search(bt)
                    and not _SCHOOL_HINT_RE.search(bt)
                ):
                    edu.location = bt
                else:
                    kept.append(bt)
            edu.bullets = kept


def _normalize_structured_skills(doc: ResumeDocModel) -> None:
    cleaned: list[tuple[str, list[str]]] = []
    for cat, items in doc.skills or []:
        label = _clean_model_text(cat or "")
        low = re.sub(r"[^a-z ]", "", label.lower()).strip()
        if low in _SKILL_SECTION_LABELS:
            label = "Skills"
        clean_items = [
            _clean_model_text(it)
            for it in (items or [])
            if _clean_model_text(it)
            and re.sub(r"[^a-z ]", "", _clean_model_text(it).lower()).strip() not in _SKILL_SECTION_LABELS
            and not _looks_like_accomplishment_bullet(it)
        ]
        if label or clean_items:
            cleaned.append((label or "Skills", clean_items))
    doc.skills = cleaned


def _normalize_structured_contact(doc: ResumeDocModel) -> None:
    doc.phone = _normalize_phone_value(doc.phone or "")


_STRUCTURAL_NOISE_PATTERNS = (
    r"^leftmargin\s*=",
    r"^label\s*=",
    r"^textbackslash$",
    r"^begin\s+itemize$",
    r"^end\s+itemize$",
    r"^item$",
    r"^\\item$",
    r"^\\textbackslash$",
)

_SECTION_HEADING_LINES = {
    "candidate",
    "summary",
    "technical skills",
    "skills",
    "experience",
    "work experience",
    "professional experience",
    "education",
    "github",
    "linkedin",
}


def _is_structural_noise_line(value: str) -> bool:
    t = _clean_model_text(value)
    if not t:
        return True
    low = t.lower().strip(" :-")
    if low in _SECTION_HEADING_LINES:
        return True
    for pat in _STRUCTURAL_NOISE_PATTERNS:
        if re.match(pat, low):
            return True
    return False

