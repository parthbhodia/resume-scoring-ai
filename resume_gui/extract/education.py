"""Education entry normalization helpers."""
from __future__ import annotations

import re
from typing import Any, List

from resume_gui.doc_utils import _clean_model_text
from resume_gui.renderers.latex_renderer import ResumeDocModel

_SCHOOL_HINT_RE = re.compile(r"\b(?:university|college|institute|school|academy)\b", re.I)

# line in education context. Used by _split_collapsed_education_entries.
_DEGREE_BROAD_RE = re.compile(
    r"\b(?:"
    r"B\.?\s*Tech|M\.?\s*Tech|B\.?\s*E\b|M\.?\s*E\b|B\.?\s*Sc|M\.?\s*Sc|"
    r"B\.?\s*S\b|M\.?\s*S\b|B\.?\s*A\b|M\.?\s*A\b|MBA|Ph\.?\s*D|Doctorate|"
    r"Higher\s+Secondary|HSC|SSC|ICSE|CBSE|IGCSE|GED|A[\s-]?Level|"
    r"Certificate|Bachelor|Master|Associate|Undergraduate|Postgraduate|"
    r"Diploma"
    r")\b",
    re.I,
)


def _looks_like_education_degree_line(text: str) -> bool:
    """Heuristic: does this line describe a degree / qualification rather than an institution?"""
    t = _clean_model_text(text or "")
    if not t:
        return False
    if _DEGREE_BROAD_RE.search(t):
        return True
    if re.search(r"\b(?:CGPA|GPA)\b", t, re.I):
        return True
    if re.search(r"\d+(?:\.\d+)?\s*%", t):
        return True
    return False


def _looks_like_education_institution_line(text: str) -> bool:
    """Heuristic: short line naming a school / college / university (no degree tokens)."""
    t = _clean_model_text(text or "")
    if not t:
        return False
    if not _SCHOOL_HINT_RE.search(t):
        return False
    # If it's actually a degree line that happens to mention "school" / "college"
    # (rare, e.g. "Doctor of College Education"), prefer degree.
    if _looks_like_education_degree_line(t):
        return False
    # Real institution names are short — 1-8 words. Bullets that talk ABOUT a
    # school in prose are usually much longer.
    if len(t.split()) > 9:
        return False
    return True


def _split_collapsed_education_entries(doc: ResumeDocModel) -> None:
    """LLM extractor sometimes collapses multiple education entries into ONE entry
    by stuffing the other institutions + their degrees into `bullets[]`. Detect
    that pattern and split them back into proper EducationItem entries.

    Walking the first entry's `bullets`, every institution-like line starts a new
    EducationItem; degree-like lines attach to the current entry's `degree`.
    Finally, if the first entry's `dates` field actually holds a degree-line
    (another common LLM mis-fill), we move it down to the next entry that needs
    a degree.
    """
    if not doc.education:
        return
    EduCtor = type(doc.education[0])
    new_education: List[Any] = []
    for edu in doc.education:
        bullets = [_clean_model_text(b) for b in (edu.bullets or []) if _clean_model_text(b)]
        edu.bullets = []
        kept = [edu]
        current = edu
        for b in bullets:
            if _looks_like_education_institution_line(b):
                current = EduCtor(institution=b, degree="", dates="", location="", bullets=[])
                kept.append(current)
                continue
            if _looks_like_education_degree_line(b) and not current.degree:
                current.degree = b
                continue
            current.bullets.append(b)

        # If the first entry's `dates` actually holds a degree-line AND we
        # successfully split into multiple entries, the LLM almost certainly
        # mis-placed a later entry's degree into the first's dates. Move it.
        # Degree-line markers (Higher Secondary, CGPA, %, B.Tech, ICSE, etc.)
        # take priority over an incidental year in parentheses — real degree
        # lines often include "(2023)" as the graduation year.
        if (
            len(kept) > 1
            and edu.dates
            and _looks_like_education_degree_line(edu.dates)
        ):
            misplaced = edu.dates
            edu.dates = ""
            for k in kept[1:]:
                if not k.degree:
                    k.degree = misplaced
                    break
            else:
                # No taker — restore so we don't silently drop content
                edu.dates = misplaced

        new_education.extend(kept)
    doc.education = new_education
