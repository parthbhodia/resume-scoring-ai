"""Shared text-cleaning helpers for structured resume documents."""
from __future__ import annotations

import re


def _clean_model_text(value: str) -> str:
    t = (value or "").strip()
    if not t:
        return ""
    # Remove Markdown emphasis markers that leak from parser output.
    t = t.replace("**", "")
    # Remove common LaTeX control sequences while preserving plain words.
    t = re.sub(r"\\(?:begin|end)\{[^}]*\}", " ", t)
    t = re.sub(r"\\[a-zA-Z]+\*?(?:\[[^\]]*\])?", " ", t)
    t = t.replace("{", " ").replace("}", " ")
    t = re.sub(r"\s+", " ", t).strip()
    return t
