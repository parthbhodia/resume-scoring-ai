from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional


try:
    from presidio_analyzer import AnalyzerEngine  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    AnalyzerEngine = None  # type: ignore


try:
    import spacy  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    spacy = None  # type: ignore


@dataclass
class ParsedProfile:
    full_name: str = "Candidate"
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    github: str = ""
    location: str = ""
    headline: str = ""
    summary: str = ""
    skills_lines: list[str] = field(default_factory=list)
    experience_bullets: list[str] = field(default_factory=list)
    experience_entries: list[tuple[str, str, str, str, list[str]]] = field(default_factory=list)
    projects_bullets: list[str] = field(default_factory=list)
    education_lines: list[str] = field(default_factory=list)
    extra_sections: list[tuple[str, list[str]]] = field(default_factory=list)


_NLP = None
_PRESIDIO = None


def _nlp_model():
    global _NLP
    if _NLP is not None:
        return _NLP
    if spacy is None:
        _NLP = False
        return None
    try:
        _NLP = spacy.load("en_core_web_sm")
        return _NLP
    except Exception:
        _NLP = False
        return None


def _presidio_engine():
    global _PRESIDIO
    if _PRESIDIO is not None:
        return _PRESIDIO
    if AnalyzerEngine is None:
        _PRESIDIO = False
        return None
    try:
        _PRESIDIO = AnalyzerEngine()
        return _PRESIDIO
    except Exception:
        _PRESIDIO = False
        return None


def normalize_profile_text(raw: Optional[str]) -> str:
    text = (raw or "").strip()
    if not text:
        return ""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("`n", "\n")
    text = text.replace("\\n", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _first_regex(text: str, pattern: str) -> str:
    m = re.search(pattern, text, flags=re.IGNORECASE)
    return (m.group(1).strip() if m else "")


def parse_profile_text(raw: Optional[str]) -> ParsedProfile:
    text = normalize_profile_text(raw)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    out = ParsedProfile()
    if not lines:
        return out

    out.email = _first_regex(text, r"([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})")
    out.phone = _first_regex(text, r"(\+?\d[\d\s().-]{8,}\d)")
    out.linkedin = _first_regex(text, r"(https?://(?:www\.)?linkedin\.com/[^\s|]+|linkedin\.com/[^\s|]+|linkedin/[^\s|]+)")
    out.github = _first_regex(text, r"(https?://(?:www\.)?github\.com/[^\s|]+|github\.com/[^\s|]+|github/[^\s|]+)")

    loc = _first_regex(text, r"location\s*:\s*([^\n|]+)")
    out.location = loc

    out.full_name = lines[0]
    if ":" in out.full_name or "@" in out.full_name or len(out.full_name.split()) > 6:
        out.full_name = "Candidate"

    nlp = _nlp_model()
    if nlp and out.full_name == "Candidate":
        try:
            doc = nlp(lines[0])
            for ent in doc.ents:
                if ent.label_ == "PERSON" and 1 < len(ent.text.split()) <= 5:
                    out.full_name = ent.text.strip()
                    break
        except Exception:
            pass

    presidio = _presidio_engine()
    if presidio and (not out.email or not out.phone):
        try:
            entities = presidio.analyze(text=text, entities=["EMAIL_ADDRESS", "PHONE_NUMBER"], language="en")
            for e in entities:
                val = text[e.start:e.end].strip()
                if e.entity_type == "EMAIL_ADDRESS" and not out.email:
                    out.email = val
                if e.entity_type == "PHONE_NUMBER" and not out.phone:
                    out.phone = val
        except Exception:
            pass

    # Headline: first short role-like line that is not metadata.
    for ln in lines[1:8]:
        low = ln.lower()
        if any(x in low for x in ("location:", "email:", "mobile:", "github", "linkedin", "technical skills", "summary")):
            continue
        if 2 <= len(ln.split()) <= 8:
            out.headline = ln
            break

    summary_parts: list[str] = []
    for ln in lines:
        low = ln.lower()
        if low in {"summary", "technical skills", "experience", "education", "projects"}:
            continue
        if len(ln.split()) >= 10 and ":" not in ln:
            summary_parts.append(ln)
        if len(summary_parts) >= 2:
            break
    out.summary = " ".join(summary_parts)[:1200]

    def _collect_between(start_terms: set[str], stop_terms: set[str], max_items: int) -> list[str]:
        in_section = False
        collected: list[str] = []
        for ln in lines:
            low = ln.lower().strip()
            if low in start_terms:
                in_section = True
                continue
            if in_section and low in stop_terms:
                break
            if in_section:
                val = ln.lstrip("-•* ").strip()
                if val:
                    collected.append(val)
                if len(collected) >= max_items:
                    break
        return collected

    out.skills_lines = _collect_between(
        {"technical skills", "skills"},
        {"experience", "professional experience", "work experience", "projects", "education"},
        20,
    )

    out.experience_bullets = [
        b for b in _collect_between(
            {"experience", "professional experience", "work experience"},
            {"projects", "education", "technical skills", "skills"},
            40,
        )
        if len(b.split()) >= 6
    ]

    out.projects_bullets = _collect_between(
        {"projects", "project"},
        {"education", "experience", "professional experience", "work experience", "technical skills", "skills"},
        20,
    )

    out.education_lines = _collect_between(
        {"education"},
        {"projects", "experience", "professional experience", "work experience", "technical skills", "skills"},
        12,
    )

    # Parse multi-role experience entries using paragraph-based splitting.
    # Blank lines are the most reliable separator between job entries.
    _MONTHS = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    _DATE_RANGE_PAT = re.compile(
        f"({_MONTHS}\\s+\\d{{4}})"
        r"\s*[–-]\s*"
        f"(present|now|current|{_MONTHS}\\s+\\d{{4}}|\\d{{4}})",
        re.I,
    )
    raw_all = text.splitlines()
    exp_start = -1
    exp_end = -1
    exp_lc = [ln.lower().strip() for ln in raw_all]
    for i, low in enumerate(exp_lc):
        if low in {"experience", "professional experience", "work experience"}:
            exp_start = i
        if exp_start >= 0 and low in {"projects", "project", "education", "technical skills", "skills"} and i > exp_start:
            exp_end = i
            break
    if exp_end < 0:
        exp_end = len(raw_all)
    raw_exp_section = raw_all[exp_start + 1:exp_end] if exp_start >= 0 else []

    if raw_exp_section:
        # Split into paragraphs by blank lines, then sub-split by date boundaries.
        paragraphs: list[list[str]] = [[]]
        for ln in raw_exp_section:
            if ln.strip():
                paragraphs[-1].append(ln)
            else:
                if paragraphs[-1]:
                    paragraphs.append([])

        entries: list[tuple[str, str, str, str, list[str]]] = []
        for para in paragraphs:
            if not para:
                continue
            # Sub-split paragraph by date-range lines (handles no-blank-line input).
            sub_paras: list[list[str]] = [[]]
            for ln in para:
                stripped = ln.strip()
                is_bullet = ln.lstrip()[:1] in ("-", "•", "*")
                clean = stripped.lstrip("-•* ").strip()
                dm = _DATE_RANGE_PAT.search(clean)
                # Start new sub-paragraph on each new date line (role header).
                if dm and not is_bullet and sub_paras[-1]:
                    sub_paras.append([])
                sub_paras[-1].append(ln)

            for sub in sub_paras:
                if not sub:
                    continue
                role = ""
                company = ""
                location = ""
                dates = ""
                bullets: list[str] = []
                for ln in sub:
                    stripped = ln.strip()
                    is_bullet = ln.lstrip()[:1] in ("-", "•", "*")
                    clean = stripped.lstrip("-•* ").strip()
                    dm = _DATE_RANGE_PAT.search(clean)
                    has_dates = bool(dm)

                    if has_dates and not is_bullet:
                        dates = dm.group(0).strip()
                        role = clean.replace(dm.group(0), "").strip().rstrip(",")
                    elif not is_bullet and role:
                        if not company:
                            company = clean
                        elif not location:
                            location = clean
                    elif is_bullet:
                        if clean and len(clean.split()) >= 3:
                            bullets.append(clean)
                if role and bullets:
                    entries.append((company, role, dates, location, bullets))

        out.experience_entries = entries
        out.experience_bullets = [b for e in entries for b in e[4]] or out.experience_bullets

    # Collect all content lines already handled by known sections (experience, etc.)
    # so the dynamic catch-all doesn't duplicate them as extra sections.
    _known_content: set[str] = set()
    for _c, _r, _d, _l, _b in out.experience_entries:
        for _w in (_c, _r, _l, _d):
            for _tok in _w.lower().split():
                if len(_tok) > 3:
                    _known_content.add(_tok)
    for _ln in out.skills_lines:
        for _tok in _ln.lower().split():
            _known_content.add(_tok)
    for _ln in out.projects_bullets:
        for _tok in _ln.lower().split():
            if len(_tok) > 3:
                _known_content.add(_tok)
    for _ln in out.education_lines:
        for _tok in _ln.lower().split():
            if len(_tok) > 3:
                _known_content.add(_tok)

    # Dynamic catch-all: capture additional headed sections so content is not lost.
    known = {
        "summary", "technical skills", "skills",
        "experience", "professional experience", "work experience",
        "projects", "project", "education",
    }
    _CONTACT_WORDS = {"linkedin", "github", "location", "email", "phone",
                      "mobile", "website", "portfolio"}
    current_header = ""
    current_items: list[str] = []
    extras: list[tuple[str, list[str]]] = []
    for ln in lines:
        low = ln.lower().strip()
        # Exclude candidate name line and lines that look like contact metadata
        is_name_line = out.full_name != "Candidate" and ln.strip().lower() == out.full_name.lower()
        has_contact = any(w in low for w in _CONTACT_WORDS)
        has_url = ".com" in low or "http" in low or "https://" in low
        # Skip lines whose content already belongs to parsed sections.
        low_tokens = set(low.split())
        already_handled = bool(low_tokens & _known_content)
        # Likely a section heading: short alpha, no sentence-punctuation, not contact/name
        if (
            1 <= len(low.split()) <= 5
            and ":" not in low
            and not low.startswith(("-", "•", "*"))
            and re.match(r"^[a-zA-Z /&]+$", low) is not None
            and not is_name_line
            and not has_contact
            and not has_url
            and not already_handled
        ):
            if current_header and current_items and current_header.lower() not in known:
                extras.append((current_header, current_items[:]))
            current_header = ln.strip()
            current_items = []
            continue
        if current_header:
            val = ln.lstrip("-•* ").strip()
            if val:
                current_items.append(val)
    if current_header and current_items and current_header.lower() not in known:
        extras.append((current_header, current_items[:]))

    out.extra_sections = extras[:8]

    if not out.experience_bullets:
        out.experience_bullets = [ln.lstrip("-•* ").strip() for ln in lines if len(ln.split()) >= 10][:12]

    return out
