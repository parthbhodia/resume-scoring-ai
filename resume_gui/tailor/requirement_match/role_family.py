"""Heuristic JD role-family classification (LLM can replace later)."""
from __future__ import annotations

import re
from typing import Tuple

_FAMILY_SIGNALS: Tuple[Tuple[str, Tuple[str, ...]], ...] = (
    ("software", (
        "software", "engineer", "developer", "python", "javascript", "react",
        "api", "backend", "frontend", "devops", "kubernetes", "typescript",
    )),
    ("legal", ("attorney", "paralegal", "litigation", "legal", "counsel", "westlaw", "lexis")),
    ("healthcare", (
        "nurse", "clinical", "patient", "hospital", "cna", "medical", "healthcare",
        "pharmacy", "therapist",
    )),
    ("skilled_trades", (
        "electrician", "plumber", "hvac", "conduit", "nec", "journeyman", "wiring",
    )),
    ("finance", ("accounting", "audit", "fp&a", "financial analyst", "gaap", "sox")),
    ("education", ("teacher", "curriculum", "classroom", "instruction", "pedagogy")),
    ("psychology", (
        "psychology", "behavioral health", "case management", "intake", "crisis intervention",
    )),
)


def classify_role_family(job_description: str) -> str:
    jd = (job_description or "").lower()
    if not jd:
        return "general"
    best_family = "general"
    best_score = 0
    for family, signals in _FAMILY_SIGNALS:
        score = sum(1 for s in signals if re.search(rf"\b{re.escape(s)}\b", jd))
        if score > best_score:
            best_score = score
            best_family = family
    return best_family if best_score >= 2 else "general"
