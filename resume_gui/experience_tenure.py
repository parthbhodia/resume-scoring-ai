"""Compute merged professional tenure from structured experience date strings."""

from __future__ import annotations

import re
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

_MONTHS = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}

_PRESENT_TOKENS = frozenset({"present", "current", "now", "ongoing"})

_MONTH_YEAR_RE = re.compile(
    r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    r"\.?\s+((?:19|20)\d{2})",
    re.IGNORECASE,
)

# "January- February 2023" / "June- July 2019" — two months sharing a single year
_SHARED_YEAR_MONTH_RANGE_RE = re.compile(
    r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    r"\.?\s*[-–—/]\s*"
    r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    r"\.?\s+((?:19|20)\d{2})\b",
    re.IGNORECASE,
)

_YEAR_RANGE_RE = re.compile(
    r"\b((?:19|20)\d{2})\s*[-–—/]\s*((?:19|20)\d{2}|Present|Current|Now|Ongoing)\b",
    re.IGNORECASE,
)

_SINGLE_YEAR_RE = re.compile(r"\b((?:19|20)\d{2})\b")


def _month_from_token(token: str) -> Optional[int]:
    return _MONTHS.get(token.lower().strip("."))


def _parse_month_year(text: str) -> Optional[Tuple[int, int]]:
    m = _MONTH_YEAR_RE.search(text)
    if not m:
        return None
    month = _month_from_token(m.group(1))
    if not month:
        return None
    return month, int(m.group(2))


def _is_present(token: str) -> bool:
    return token.strip().lower().rstrip(".") in _PRESENT_TOKENS


def _end_of_month(year: int, month: int) -> date:
    if month == 12:
        return date(year, 12, 31)
    nxt = date(year, month + 1, 1)
    return date.fromordinal(nxt.toordinal() - 1)


def _months_inclusive(start: date, end: date) -> int:
    if end < start:
        return 0
    return (end.year - start.year) * 12 + (end.month - start.month) + 1


def _parse_date_range(dates: str, *, today: Optional[date] = None) -> Optional[Tuple[date, date]]:
    """Parse a role dates string into inclusive (start, end) calendar dates."""
    raw = (dates or "").strip()
    if not raw:
        return None
    today = today or date.today()

    # "January- February 2023" — two months sharing one year (no year after start month)
    shared = _SHARED_YEAR_MONTH_RANGE_RE.search(raw)
    if shared:
        start_m = _month_from_token(shared.group(1))
        end_m = _month_from_token(shared.group(2))
        year = int(shared.group(3))
        if start_m and end_m:
            return date(year, start_m, 1), _end_of_month(year, end_m)

    # Month-year range: Jan 2020 – Mar 2023 / Present
    starts = list(_MONTH_YEAR_RE.finditer(raw))
    if starts:
        start_m, start_y = _month_from_token(starts[0].group(1)), int(starts[0].group(2))
        if not start_m:
            return None
        start = date(start_y, start_m, 1)
        tail = raw[starts[0].end():]
        end_match = _MONTH_YEAR_RE.search(tail)
        if end_match:
            end_m, end_y = _month_from_token(end_match.group(1)), int(end_match.group(2))
            if end_m:
                return start, _end_of_month(end_y, end_m)
        if _YEAR_RANGE_RE.search(raw):
            yr = _YEAR_RANGE_RE.search(raw)
            if yr and _is_present(yr.group(2)):
                return start, today
        if any(_is_present(tok) for tok in re.split(r"[-–—/]", raw)[1:]):
            return start, today
        # Single month-year only — treat as that calendar month (1-month role), not open-ended
        return start, _end_of_month(start_y, start_m)

    # Year-only range: 2020 – 2023 / Present
    yr = _YEAR_RANGE_RE.search(raw)
    if yr:
        start_y = int(yr.group(1))
        end_token = yr.group(2)
        start = date(start_y, 1, 1)
        if _is_present(end_token):
            return start, today
        end_y = int(end_token)
        return start, date(end_y, 12, 31)

    # Lone year — treat as Jan–Dec of that year unless it's the current year
    lone = _SINGLE_YEAR_RE.search(raw)
    if lone:
        y = int(lone.group(1))
        start = date(y, 1, 1)
        end = today if y == today.year else date(y, 12, 31)
        return start, end

    return None


def _merge_intervals(intervals: List[Tuple[date, date]]) -> List[Tuple[date, date]]:
    if not intervals:
        return []
    sorted_iv = sorted(intervals, key=lambda iv: iv[0])
    merged: List[Tuple[date, date]] = [sorted_iv[0]]
    for start, end in sorted_iv[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


def format_tenure_label(total_months: int) -> str:
    if total_months <= 0:
        return "No dated experience"
    if total_months < 12:
        return "< 1 year"
    years = total_months // 12
    return "1 year" if years == 1 else f"{years} years"


def compute_experience_summary(
    experience: Optional[List[Dict[str, Any]]],
    *,
    today: Optional[date] = None,
) -> Dict[str, Any]:
    """Return merged tenure summary from structured experience rows."""
    rows = experience if isinstance(experience, list) else []
    roles: List[Dict[str, Any]] = []
    intervals: List[Tuple[date, date]] = []

    for row in rows:
        if not isinstance(row, dict):
            continue
        dates = str(row.get("dates") or "").strip()
        parsed = _parse_date_range(dates, today=today)
        months = 0
        if parsed:
            start, end = parsed
            months = _months_inclusive(start, end)
            intervals.append((start, end))
        roles.append({
            "company": str(row.get("company") or "").strip(),
            "role": str(row.get("role") or "").strip(),
            "dates": dates,
            "months": months,
        })

    merged = _merge_intervals(intervals)
    total_months = sum(_months_inclusive(s, e) for s, e in merged)
    dated_roles = sum(1 for r in roles if r.get("months", 0) > 0)

    return {
        "totalMonths": total_months,
        "totalYearsLabel": format_tenure_label(total_months),
        "roleCount": len(roles),
        "datedRoleCount": dated_roles,
        "roles": roles,
    }


def compute_experience_summary_from_structured(structured: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(structured, dict):
        return compute_experience_summary([])
    return compute_experience_summary(structured.get("experience"))
