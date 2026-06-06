"""Build field-aware LLM input packets for comprehensive analysis."""
from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from resume_gui.analysis.industry_playbooks import (
    build_playbook_prompt_context,
    get_playbook,
    infer_field_family,
)

MAX_ANALYSIS_PACKET_CHARS = 18_000
MAX_RAW_FALLBACK_CHARS = 3_500


def _model_to_dict(value: Any) -> Any:
    """Convert Pydantic/dataclass-like values into plain Python containers."""
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Mapping):
        return {str(key): _model_to_dict(nested) for key, nested in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_model_to_dict(item) for item in value]
    if hasattr(value, "model_dump"):
        return _model_to_dict(value.model_dump(exclude_none=True))
    if hasattr(value, "dict"):
        return _model_to_dict(value.dict(exclude_none=True))
    if hasattr(value, "__dict__"):
        return _model_to_dict({key: nested for key, nested in vars(value).items() if not key.startswith("_")})
    return str(value)


def _stringify_compact(value: Any, limit: int = 500) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        text = value
    elif isinstance(value, Mapping):
        text = "; ".join(
            f"{key}: {_stringify_compact(nested, limit=120)}"
            for key, nested in value.items()
            if nested not in (None, "", [], {})
        )
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        text = "; ".join(_stringify_compact(item, limit=120) for item in value if item not in (None, "", [], {}))
    else:
        text = str(value)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit].rstrip()


def _first_present(mapping: Mapping[str, Any], names: Sequence[str], default: str = "") -> str:
    for name in names:
        value = mapping.get(name)
        if value not in (None, "", [], {}):
            return _stringify_compact(value)
    return default


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def _find_section(data: Mapping[str, Any], aliases: Sequence[str]) -> Any:
    lowered = {key.lower(): value for key, value in data.items()}
    for alias in aliases:
        if alias.lower() in lowered:
            return lowered[alias.lower()]
    return None


def _header_signals(text: str) -> str:
    email = bool(re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", text, re.IGNORECASE))
    phone = bool(re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", text))
    linkedin = "linkedin.com" in text.lower()
    github = "github.com" in text.lower()
    portfolio = bool(re.search(r"https?://|www\.", text, re.IGNORECASE))
    return (
        f"email={email}; phone={phone}; linkedin={linkedin}; "
        f"github={github}; portfolio_or_url={portfolio}"
    )


def _append_bullets(lines: list[str], bullets: Any, prefix: str = "  - ") -> None:
    for bullet in _as_list(bullets):
        text = _stringify_compact(bullet, limit=800)
        if text:
            lines.append(f"{prefix}{text}")


def _append_role_like_section(lines: list[str], title: str, items: Any) -> None:
    rows = _as_list(items)
    if not rows:
        return
    lines.append(f"\n[{title}]")
    for index, item in enumerate(rows, start=1):
        row = _model_to_dict(item)
        if not isinstance(row, Mapping):
            text = _stringify_compact(row, limit=900)
            if text:
                lines.append(f"{index}. {text}")
            continue

        role_title = _first_present(row, ("title", "role", "position", "job_title", "name"), "Untitled role")
        org = _first_present(row, ("company", "organization", "employer", "institution", "client"))
        dates = _first_present(row, ("dates", "date", "start_end", "duration", "start_date", "end_date"))
        location = _first_present(row, ("location", "city"))
        heading_bits = [role_title]
        if org:
            heading_bits.append(f"at {org}")
        if dates:
            heading_bits.append(f"({dates})")
        if location:
            heading_bits.append(f"- {location}")
        lines.append(f"{index}. " + " ".join(heading_bits))

        bullet_value = None
        for key in ("bullets", "bullet_points", "responsibilities", "achievements", "descriptions", "description"):
            if row.get(key):
                bullet_value = row[key]
                break
        _append_bullets(lines, bullet_value)

        extra_fields = {
            key: value
            for key, value in row.items()
            if key not in {
                "title", "role", "position", "job_title", "name", "company", "organization", "employer",
                "institution", "client", "dates", "date", "start_end", "duration", "start_date", "end_date",
                "location", "city", "bullets", "bullet_points", "responsibilities", "achievements",
                "descriptions", "description",
            }
            and value not in (None, "", [], {})
        }
        if extra_fields:
            lines.append("  context: " + _stringify_compact(extra_fields, limit=700))


def _append_simple_section(lines: list[str], title: str, value: Any, item_limit: int = 80) -> None:
    rows = [row for row in _as_list(value) if row not in (None, "", [], {})]
    if not rows:
        return
    lines.append(f"\n[{title}]")
    for row in rows[:item_limit]:
        text = _stringify_compact(row, limit=700)
        if text:
            lines.append(f"- {text}")


def _trim_packet_preserving_tail(lines: list[str], max_chars: int) -> str:
    packet = "\n".join(lines).strip()
    if len(packet) <= max_chars:
        return packet

    head_budget = int(max_chars * 0.7)
    tail_budget = max_chars - head_budget - 120
    head = packet[:head_budget].rstrip()
    tail = packet[-tail_budget:].lstrip()
    return f"{head}\n\n[PACKET TRIMMED: middle omitted, tail preserved to avoid dropping late roles]\n\n{tail}"


def _raw_fallback_excerpt(text: str, max_chars: int = MAX_RAW_FALLBACK_CHARS) -> str:
    clean = re.sub(r"\s+", " ", text or "").strip()
    if len(clean) <= max_chars:
        return clean
    head_budget = int(max_chars * 0.6)
    tail_budget = max_chars - head_budget - 90
    return (
        clean[:head_budget].rstrip()
        + "\n[RAW TEXT TRIMMED: middle omitted, tail preserved]\n"
        + clean[-tail_budget:].lstrip()
    )


def _build_analysis_packet(
    text: str,
    structured: object | None = None,
    max_chars: int = MAX_ANALYSIS_PACKET_CHARS,
) -> str:
    """Build a compact, field-aware packet for the LLM analyzer."""
    data = _model_to_dict(structured)
    data = data if isinstance(data, Mapping) else {}

    family = infer_field_family(text, structured)
    playbook = get_playbook(family)

    lines: list[str] = [
        "RESUME ANALYSIS PACKET",
        build_playbook_prompt_context(playbook),
        "",
        "HEADER / CONTACT SIGNALS: " + _header_signals(text),
    ]

    _append_simple_section(
        lines,
        "Skills",
        _find_section(data, ("skills", "technical_skills", "core_skills", "competencies")),
    )
    _append_role_like_section(
        lines,
        "Experience",
        _find_section(data, ("experience", "work_experience", "employment", "roles", "professional_experience")),
    )
    _append_role_like_section(
        lines,
        "Projects",
        _find_section(data, ("projects", "project_experience", "academic_projects")),
    )
    _append_simple_section(
        lines,
        "Education",
        _find_section(data, ("education", "degrees", "academic_background")),
    )
    _append_simple_section(
        lines,
        "Certifications",
        _find_section(data, ("certifications", "licenses", "credentials")),
    )
    _append_simple_section(
        lines,
        "Extra Sections",
        _find_section(data, ("extra_sections", "additional_sections", "awards", "publications", "leadership", "volunteer")),
    )

    raw_fallback = _raw_fallback_excerpt(text)
    if raw_fallback:
        lines.append("\n[Raw Text Fallback / Cross-check]")
        lines.append(raw_fallback)

    return _trim_packet_preserving_tail(lines, max_chars=max_chars)
