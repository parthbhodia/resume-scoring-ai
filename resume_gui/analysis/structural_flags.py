"""Deterministic structural / ATS flags, surfaced as a dedicated panel.

These are document-level *formatting and completeness* issues an ATS or a fast
recruiter skim catches — distinct from the LLM's per-bullet quality categories
(quantification, achievement, …). They were always partly computed by
`_recruiter_checks`, but only fed to the prompt as a hint and never shown; this
module turns the reliable, structure-derivable ones into an explicit
`structuralFlags` list the frontend renders as an "Issue / Risk" table.

Kept separate from `topIssues` on purpose: the reason deterministic insights were
gated out of topIssues (they duplicated category rationales and lacked rewrites)
does not apply to a clearly-labelled structural panel.

All checks are deterministic — no LLM call — so they're cheap and testable.
"""
from __future__ import annotations

import re
from typing import Optional

_LINKEDIN_RE = re.compile(r"linkedin\.com/in/", re.IGNORECASE)
# A lone month-year with no range / "Present" → an open-ended single date.
_DATE_RANGE_HINT_RE = re.compile(
    r"present|current|ongoing|\bto\b|\d{4}\s*[-–—]\s*|[-–—]\s*\d{4}|[-–—]\s*present",
    re.IGNORECASE,
)
# Community / club / hobby signals that read as non-jobs under Experience.
_COMMUNITY_RE = re.compile(
    r"\b(club|society|chapter|meetup|fraternity|sorority|volunteer(?:ing|ed)?|"
    r"hobby|intramural|toastmasters|rotaract|community\s+group)\b",
    re.IGNORECASE,
)
# Header lines that lean on a middot / bullet glyph to separate fields. Some
# older ATS parsers can't split "Company · City, ST" on a "·".
_MIDDOT_HEADER_RE = re.compile(r"[^\n]+·[^\n]+")

_SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _role_label(entry: dict) -> str:
    company = str(entry.get("company") or "").strip()
    role = str(entry.get("role") or "").strip()
    return company or role or "A role"


def _has_single_open_date(dates: str) -> bool:
    d = (dates or "").strip()
    if not d:
        return False
    # Has a recognisable year but no range / "Present" marker.
    return bool(re.search(r"\b(19|20)\d{2}\b", d)) and not _DATE_RANGE_HINT_RE.search(d)


def compute_structural_flags(
    raw_text: Optional[str], structured: Optional[dict]
) -> list[dict]:
    """Return a list of ``{issue, risk, severity}`` structural/ATS flags.

    ``raw_text`` is the ORIGINAL extracted text (before synthesis) so separator /
    formatting checks see what an ATS would. ``structured`` is the serialized
    resume doc (``experience`` entries with company/role/dates/location)."""
    text = raw_text or ""
    structured = structured or {}
    experience = structured.get("experience") or []
    flags: list[dict] = []

    # 1. Contact completeness — LinkedIn is the one recruiters expect most.
    if not _LINKEDIN_RE.search(text):
        flags.append({
            "issue": "No LinkedIn URL",
            "risk": "Recruiters expect a LinkedIn profile, and some ATS score contact completeness.",
            "severity": "medium",
        })

    # 2. Missing location on the most recent / current role.
    if experience:
        current = experience[0] if isinstance(experience[0], dict) else {}
        if not str(current.get("location") or "").strip():
            flags.append({
                "issue": f'No city/state on your current role ({_role_label(current)})',
                "risk": "Many ATS use location for geo-filter matching; an empty location can drop you from local searches.",
                "severity": "low",
            })

    # 3. Open-ended / single-date roles — a parser may read them as still active.
    for entry in experience:
        if not isinstance(entry, dict):
            continue
        dates = str(entry.get("dates") or "")
        if _has_single_open_date(dates):
            flags.append({
                "issue": f'"{_role_label(entry)}" has a single date ({dates.strip()}), no end date',
                "risk": "A parser may treat it as an open / current role and mis-read your timeline.",
                "severity": "low",
            })

    # 4. Community / club entries sitting under Experience.
    for entry in experience:
        if not isinstance(entry, dict):
            continue
        blob = f"{entry.get('company') or ''} {entry.get('role') or ''}"
        if _COMMUNITY_RE.search(blob):
            flags.append({
                "issue": f'"{_role_label(entry)}" looks like a community / club entry under Experience',
                "risk": "ATS reads it as a job, and a fast recruiter scan may flag it. Move it to a Community or Volunteering section.",
                "severity": "low",
            })

    # 5. Middot separators between company and location.
    if _MIDDOT_HEADER_RE.search(text):
        flags.append({
            "issue": "“·” separators between company and location",
            "risk": "Some ATS parsers can't split company from location on a “·” line; a comma or pipe is safer.",
            "severity": "low",
        })

    flags.sort(key=lambda f: _SEVERITY_ORDER.get(f.get("severity", "low"), 2))
    return flags
