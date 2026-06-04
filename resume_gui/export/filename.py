"""Consistent Name_Role export filenames for PDF/DOCX downloads."""
from __future__ import annotations

import re
from typing import Any, Optional


def _slug_token(part: str, fallback: str = "x") -> str:
    token = re.sub(r"[^\w]+", "", (part or "").strip())
    return token or fallback


def _name_slug_from_structured(structured: dict) -> str:
    name = str(structured.get("full_name") or "").strip()
    if name:
        return _slug_token(name.replace(" ", ""), "User")
    return "User"


def _role_slug_from_structured(structured: dict) -> str:
    experience = structured.get("experience") or []
    if experience and isinstance(experience[0], dict):
        role = str(experience[0].get("role") or "").strip()
        if role:
            return _slug_token(role, "Resume")
    headline = str(structured.get("headline") or "").strip()
    if headline:
        return _slug_token(headline, "Resume")
    return "Resume"


def name_role_export_stem(
    structured: dict[str, Any],
    role_override: Optional[str] = None,
) -> str:
    """Return ``Name_Role`` stem (no extension)."""
    name = _name_slug_from_structured(structured)
    role = _slug_token(role_override, "") if (role_override or "").strip() else ""
    if not role:
        role = _role_slug_from_structured(structured)
    return f"{name}_{role}"


def name_role_export_filename(
    structured: dict[str, Any],
    ext: str,
    role_override: Optional[str] = None,
) -> str:
    stem = name_role_export_stem(structured, role_override=role_override)
    if stem == "User_Resume":
        return f"resume.{ext.lstrip('.')}"
    return f"{stem}.{ext.lstrip('.')}"
