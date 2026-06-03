"""Plain-text résumé line classification (gap-fix eligibility, headers)."""
from __future__ import annotations

import re

_ACHIEVEMENT_VERB_RE = re.compile(
    r"\b("
    r"built|developed|designed|implemented|led|managed|created|delivered|"
    r"optimized|migrated|improved|reduced|increased|achieved|engineered|"
    r"architected|automated|deployed|established|launched|scaled|streamlined|"
    r"collaborated|maintained|won|spearheaded|drove|owned|integrated"
    r")\b",
    re.IGNORECASE,
)

_BULLET_LEAD_RE = re.compile(
    r"^[\s\uFEFF]*(?:[-*•●◦‧·‣⁃▪►➤○⚫—–‑]|\d{1,2}[\).\]])",
)


def is_gap_fix_eligible_line(line: str) -> bool:
    """True when a line is an achievement bullet, not a project/job header row."""
    t = (line or "").strip()
    if len(t) < 12:
        return False
    if _BULLET_LEAD_RE.match(t):
        return True
    if "|" in t and not _ACHIEVEMENT_VERB_RE.search(t) and len(t) < 140:
        return False
    if "·" in t and t.count("·") >= 1 and not _ACHIEVEMENT_VERB_RE.search(t) and len(t) < 120:
        parts = [p.strip() for p in t.split("·") if p.strip()]
        if len(parts) >= 2:
            return False
    return bool(_ACHIEVEMENT_VERB_RE.search(t))
