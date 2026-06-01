"""Parse flat education lines into EducationItem entries."""
from __future__ import annotations

import re
from typing import Optional

from resume_gui.doc_utils import _clean_model_text
from resume_gui.extract.doc_normalize import (
    _DEGREE_LINE_RE,
    _EDU_DATE_HINT_RE,
    _SCHOOL_HINT_RE,
    _is_structural_noise_line,
)
from resume_gui.renderers.latex_renderer import EducationItem

def _parse_school_date_line(line: str) -> Tuple[str, str, str]:
    """Parse ``School | May 2026`` or ``School | City | May 2026`` into institution, dates, location."""
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


_COMBINED_EDU_DATE_RE = re.compile(
    r"((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|"
    r"Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}"
    r"\s*[–—\-]\s*(?:Present|Now|Current|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|"
    r"May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{4}))",
    re.I,
)


def _education_item_from_combined_line(line: str) -> Optional[EducationItem]:
    """One-line education rows: ``Degree … dates | location institution`` (common in PDF extracts)."""
    raw = _clean_model_text(line)
    if "|" not in raw:
        return None
    left, right = [p.strip() for p in raw.split("|", 1)]
    if not left or not right:
        return None
    if not (_DEGREE_LINE_RE.search(left) or _SCHOOL_HINT_RE.search(right)):
        return None
    dm = _COMBINED_EDU_DATE_RE.search(left)
    dates = dm.group(1).strip() if dm else ""
    degree = _clean_model_text(left.replace(dm.group(1), "")) if dm else left
    institution = right
    location = ""
    um = _SCHOOL_HINT_RE.search(right)
    if um and um.start() > 0:
        location = right[: um.start()].strip().rstrip(",")
        institution = right[um.start() :].strip()
    if not (degree or institution):
        return None
    return EducationItem(institution=institution, degree=degree, dates=dates, location=location)


def _looks_like_degree_line(line: str) -> bool:
    t = _clean_model_text(line)
    if not t or _looks_like_school_date_line(t):
        return False
    if _SCHOOL_HINT_RE.search(t) and not _DEGREE_LINE_RE.search(t):
        return False
    if _DEGREE_LINE_RE.search(t):
        return True
    # "MS Clinical Mental Health Counseling" — degree keywords without word boundaries on "MS"
    if re.match(r"^(?:M\.?\s*S\.?|M\.?\s*A\.?|B\.?\s*S\.?|B\.?\s*A\.?|PG)\b", t, re.I):
        return True
    return False


def _education_item_from_dict(edu: dict) -> Optional[EducationItem]:
    inst = _clean_model_text(edu.get("institution") or "")
    deg = _clean_model_text(edu.get("degree") or "")
    dat = _clean_model_text(edu.get("dates") or "")
    loc = _clean_model_text(edu.get("location") or "")
    bullets = [
        _clean_model_text(str(d))
        for d in (edu.get("details") or [])
        if _clean_model_text(str(d))
    ]
    if not inst and deg:
        combined = _education_item_from_combined_line(deg)
        if combined:
            return EducationItem(
                institution=combined.institution or inst,
                degree=combined.degree or deg,
                dates=combined.dates or dat,
                location=combined.location or loc,
                bullets=bullets or combined.bullets,
            )
    if not (inst or deg or dat or loc or bullets):
        return None
    return EducationItem(
        institution=inst,
        degree=deg,
        dates=dat,
        location=loc,
        bullets=bullets,
    )


def _education_items_from_flat_lines(lines: list[str]) -> list[EducationItem]:
    """Group flat education lines (degree, school|date, detail bullets) into structured entries."""
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
        if institution and not (degree or dates or location or bullets):
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

        combined = _education_item_from_combined_line(line)
        if combined:
            flush()
            items.append(combined)
            continue

        if _looks_like_degree_line(line):
            flush()
            degree = line
            continue

        if (
            _EDU_DATE_HINT_RE.search(line)
            and not _DEGREE_LINE_RE.search(line)
            and not _SCHOOL_HINT_RE.search(line)
            and (degree or institution)
            and not dates
        ):
            dates = line
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
            row = _education_item_from_csv_line(line)
            if row.institution and not row.degree and not row.dates:
                institution = row.institution
                continue
            if row.institution or row.degree:
                flush()
                items.append(row)
            continue

        bullets.append(line)

    flush()
    return items


def _collect_education_flat_lines(
    education_lines: list[str],
    extra_sections: list[tuple[str, list[str]]],
) -> list[str]:
    out: list[str] = []
    for ln in education_lines or []:
        ce = _clean_model_text(ln)
        if ce:
            out.append(ce)
    for name, vals in extra_sections or []:
        if (name or "").strip().lower() != "education":
            continue
        for v in vals:
            ce = _clean_model_text(str(v))
            if ce:
                out.append(ce)
    return out


def _education_item_from_csv_line(line: str) -> EducationItem:
    """Best-effort split of a single-line education row (comma-separated) into hierarchy fields."""
    raw = _clean_model_text(line)
    if not raw:
        return EducationItem(institution="")
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if len(parts) >= 4:
        institution = parts[0]
        location = parts[-1]
        dates = parts[-2]
        degree = ", ".join(parts[1:-2])
        return EducationItem(
            institution=institution,
            degree=degree,
            dates=dates,
            location=location,
        )
    if len(parts) == 3:
        return EducationItem(institution=parts[0], degree=parts[1], dates=parts[2])
    if len(parts) == 2:
        if _SCHOOL_HINT_RE.search(parts[0]) and not _DEGREE_LINE_RE.search(parts[1]):
            return EducationItem(institution=raw)
        return EducationItem(institution=parts[0], degree=parts[1])
    return EducationItem(institution=raw)
