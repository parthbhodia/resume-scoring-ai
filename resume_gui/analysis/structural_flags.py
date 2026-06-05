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
# "(cid:NN)" glyph codes: a text extractor couldn't map the PDF's embedded font
# to characters — the résumé reads as scrambled glyphs to any text-based ATS.
_CID_GLYPH_RE = re.compile(r"\(cid:\d+\)")

_SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}

_US_STATE_NAMES = frozenset({
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
    "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
    "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
    "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
    "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
    "new mexico", "north carolina", "north dakota", "ohio", "oklahoma",
    "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota",
    "tennessee", "texas", "utah", "vermont", "virginia", "west virginia",
    "wisconsin", "wyoming", "district of columbia",
})
_US_STATE_ABBRS = frozenset({
    "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id",
    "il", "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms",
    "mo", "mt", "ne", "nv", "nh", "nj", "nm", "nc", "nd", "oh", "ok", "or",
    "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wv", "wi", "wy", "dc",
})
# State names that double as a major city — too ambiguous to flag as state-only.
_CITY_AMBIGUOUS_STATES = frozenset({"new york", "washington"})


def _location_missing_city(loc: str) -> bool:
    """True when a non-empty location is state-only (e.g. "New Jersey, NJ" or a
    bare "NJ") with no city, which ATS geo-filters can't match well."""
    s = (loc or "").strip()
    if not s or "remote" in s.lower():
        return False
    parts = [p.strip().lower() for p in s.split(",") if p.strip()]
    if not parts:
        return False
    first = parts[0]
    if first in _CITY_AMBIGUOUS_STATES:
        return False
    if first in _US_STATE_NAMES:
        return True
    if len(parts) == 1 and first in _US_STATE_ABBRS:
        return True
    return False


def _has_emdash_field_separator(raw_text: str) -> bool:
    """True when a short header-style line (company/location/date, not a bullet)
    uses an em-dash to separate fields — some ATS can't split on it."""
    for line in (raw_text or "").splitlines():
        s = line.strip()
        if not s or len(s) > 90 or "—" not in s:
            continue
        if re.match(r"^[•\-*▪▸]", s):
            continue
        if re.search(r",\s*[A-Z]{2}\b", s) or re.search(r"\b(19|20)\d{2}\b", s):
            return True
    return False


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

    # 2. Missing / incomplete location on the most recent / current role.
    if experience:
        current = experience[0] if isinstance(experience[0], dict) else {}
        loc = str(current.get("location") or "").strip()
        if not loc:
            flags.append({
                "issue": f'No city/state on your current role ({_role_label(current)})',
                "risk": "Many ATS use location for geo-filter matching; an empty location can drop you from local searches.",
                "severity": "low",
            })
        elif _location_missing_city(loc):
            flags.append({
                "issue": f'No city on your current role (just "{loc}")',
                "risk": "ATS geo-filters match on city; a state-only location can miss local searches.",
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

    # 5. Risky field separators (middot or em-dash) between company and location.
    sep = "·" if _MIDDOT_HEADER_RE.search(text) else ("—" if _has_emdash_field_separator(text) else None)
    if sep:
        flags.append({
            "issue": f"“{sep}” separator between company and location",
            "risk": f"Some ATS parsers can't reliably split company from location on a “{sep}” line; a comma or pipe is clearer.",
            "severity": "low",
        })

    # 6. Broken text layer — extractor produced "(cid:NN)" glyph codes instead of
    #    real characters. The résumé may look fine on screen (our vision path read
    #    it), but a text-based ATS gets scrambled content. This is also what hid
    #    the original company/location separators behind glyph codes.
    if len(_CID_GLYPH_RE.findall(text)) >= 3:
        flags.append({
            "issue": "PDF text doesn't extract cleanly (font encoding)",
            "risk": "A plain-text reader sees scrambled glyph codes instead of your words. Many ATS read résumés as text and would get garbled content; re-export from your editor with standard fonts, or use Print to PDF.",
            "severity": "high",
        })

    flags.sort(key=lambda f: _SEVERITY_ORDER.get(f.get("severity", "low"), 2))
    return flags
