"""Education line grouping for structured LaTeX render."""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import _education_item_from_combined_line  # noqa: E402


def _clean_model_text(value: str) -> str:
    return " ".join((value or "").split())


_SECTION_HEADING_LINES = {"education"}
_STRUCTURAL_NOISE_PATTERNS: list = []


def _is_structural_noise_line(value: str) -> bool:
    t = _clean_model_text(value)
    if not t:
        return True
    return t.lower().strip(" :-") in _SECTION_HEADING_LINES


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


def _parse_school_date_line(line: str) -> Tuple[str, str, str]:
    raw = _clean_model_text(line)
    if not raw or "|" not in raw:
        return "", "", ""
    parts = [p.strip() for p in raw.split("|") if p.strip()]
    if len(parts) < 2 or not _EDU_DATE_HINT_RE.search(parts[-1]):
        return "", "", ""
    if len(parts) >= 3:
        return " | ".join(parts[:-2]), parts[-2], parts[-1]
    return parts[0], parts[1], ""


def _looks_like_school_date_line(line: str) -> bool:
    inst, dates, _ = _parse_school_date_line(line)
    return bool(inst and dates)


def _looks_like_degree_line(line: str) -> bool:
    t = _clean_model_text(line)
    if not t or _looks_like_school_date_line(t):
        return False
    if _SCHOOL_HINT_RE.search(t) and not _DEGREE_LINE_RE.search(t):
        return False
    if _DEGREE_LINE_RE.search(t):
        return True
    if re.match(r"^(?:M\.?\s*S\.?|M\.?\s*A\.?|B\.?\s*S\.?|B\.?\s*A\.?|PG)\b", t, re.I):
        return True
    return False


@dataclass
class EducationItem:
    institution: str
    degree: str = ""
    dates: str = ""
    location: str = ""
    bullets: list[str] = field(default_factory=list)


def _education_items_from_flat_lines(lines: list[str]) -> list[EducationItem]:
    items: list[EducationItem] = []
    degree = ""
    institution = ""
    dates = ""
    location = ""
    bullets: list[str] = []

    def flush() -> None:
        nonlocal degree, institution, dates, location, bullets
        if not (degree or institution or bullets):
            return
        items.append(
            EducationItem(
                institution=institution,
                degree=degree,
                dates=dates,
                location=location,
                bullets=list(bullets),
            )
        )
        degree = ""
        institution = ""
        dates = ""
        location = ""
        bullets = []

    for raw in lines:
        line = _clean_model_text(raw)
        if not line or _is_structural_noise_line(line):
            continue

        if _looks_like_degree_line(line):
            flush()
            degree = line
            continue

        inst, dat, loc = _parse_school_date_line(line)
        if inst:
            if degree or not items:
                if institution:
                    flush()
                    degree = ""
                institution = inst
                dates = dat
                location = loc
                continue
            institution = inst
            dates = dat
            location = loc
            continue

        if not degree and not institution:
            continue

        bullets.append(line)

    flush()
    return items


def test_combined_degree_dates_pipe_school_line():
    line = (
        "Master of professional studies in Data Science Aug 2022 - May 2024 | "
        "Baltimore, Maryland University of Maryland, Baltimore County"
    )
    item = _education_item_from_combined_line(line)
    assert item is not None
    assert "Master" in item.degree
    assert "University of Maryland" in item.institution
    assert "2022" in item.dates
    assert "Baltimore" in item.location


def test_groups_degree_school_and_bullets():
    lines = [
        "MS Clinical Mental Health Counseling",
        "Johns Hopkins University | May 2026",
        "Courses: Human Development, Research and Evaluation",
        "GPA: 3.82/4",
        "PG Diploma in Expressive Arts Therapy",
        "St. Xavier's College | July 2023",
        "CGPA: 8.7/10",
    ]
    items = _education_items_from_flat_lines(lines)
    assert len(items) == 2
    assert items[0].degree.startswith("MS Clinical")
    assert items[0].institution == "Johns Hopkins University"
    assert items[0].dates == "May 2026"
    assert len(items[0].bullets) == 2
    assert items[1].degree.startswith("PG Diploma")
    assert items[1].institution == "St. Xavier's College"
    assert items[1].dates == "July 2023"
