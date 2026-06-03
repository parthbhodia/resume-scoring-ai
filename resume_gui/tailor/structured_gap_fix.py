"""Eligible gap-fix targets from structured resume JSON (not plain-text lines)."""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Set


def eligible_gap_fix_targets(structured: Any) -> List[Dict[str, str]]:
    """
    Return achievement bullets only — never project titles, tech headers, or job rows.

    Each item: section, employer_or_project, original (verbatim bullet text).
    """
    if not isinstance(structured, dict):
        return []

    out: List[Dict[str, str]] = []

    for exp in structured.get("experience") or []:
        if not isinstance(exp, dict):
            continue
        company = str(exp.get("company") or "").strip()
        role = str(exp.get("role") or "").strip()
        label = " · ".join(p for p in (role, company) if p) or company or "Work Experience"
        for bullet in exp.get("bullets") or []:
            text = str(bullet or "").strip()
            if len(text) < 12:
                continue
            out.append({
                "section": "Work Experience",
                "context": label,
                "original": text,
            })

    for proj in structured.get("projects") or []:
        if not isinstance(proj, dict):
            continue
        name = str(proj.get("name") or "").strip()
        tech = str(proj.get("tech") or "").strip()
        header = f"{name} | {tech}" if tech else name
        for bullet in proj.get("bullets") or []:
            text = str(bullet or "").strip()
            if len(text) < 12:
                continue
            out.append({
                "section": "Projects",
                "context": header or "Project",
                "original": text,
            })

    for edu in structured.get("education") or []:
        if not isinstance(edu, dict):
            continue
        inst = str(edu.get("institution") or "").strip()
        for bullet in edu.get("bullets") or []:
            text = str(bullet or "").strip()
            if len(text) < 12:
                continue
            out.append({
                "section": "Education",
                "context": inst or "Education",
                "original": text,
            })

    return out


def eligible_originals_set(targets: List[Dict[str, str]]) -> Set[str]:
    return {t["original"] for t in targets if t.get("original")}


def structured_targets_json_for_prompt(
    structured: Any,
    *,
    max_bullets: int = 40,
) -> Optional[str]:
    targets = eligible_gap_fix_targets(structured)
    if not targets:
        return None
    payload = targets[:max_bullets]
    return json.dumps(payload, ensure_ascii=False, indent=2)
