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
    projects_bullets: list[str] = field(default_factory=list)
    education_lines: list[str] = field(default_factory=list)


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

    if not out.experience_bullets:
        out.experience_bullets = [ln.lstrip("-•* ").strip() for ln in lines if len(ln.split()) >= 10][:12]

    return out
