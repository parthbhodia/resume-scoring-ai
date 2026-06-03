"""Extract named JD targets from a tailor gap label for suggest-gap-fix validation."""
from __future__ import annotations

import re
from typing import List, Set

# Words that look capitalized but are not product/skill targets
_SKIP = frozenset({
    "llc", "inc", "api", "ui", "ux", "jd", "ai", "ml", "usa", "pm", "vp",
    "specific", "products", "product", "experience", "framework", "platform",
    "the", "and", "for", "with", "your", "you", "gap", "bridge", "mapping",
})


def extract_gap_target_terms(gap_name: str, gap_notes: str = "") -> List[str]:
    """
    Pull concrete product/tool names from a gap label like
    'Specific products CaseWise, Brief, TortEquity, Dockit'.
    """
    text = f"{gap_name or ''} {gap_notes or ''}"
    if not text.strip():
        return []

    found: Set[str] = set()

    # Comma- or slash-separated lists (CaseWise, Brief, TortEquity)
    for chunk in re.split(r"[,;/]", text):
        token = chunk.strip()
        if not token:
            continue
        # Strip leading filler ("Specific products CaseWise" → CaseWise)
        token = re.sub(
            r"^(?:specific\s+)?(?:products?|tools?|platforms?|systems?|skills?)\s+",
            "",
            token,
            flags=re.I,
        ).strip()
        if not token:
            continue
        # Multi-word CamelCase product in chunk
        for m in re.finditer(r"\b[A-Z][a-zA-Z0-9]*(?:[A-Z][a-z0-9]*)+\b", token):
            w = m.group(0)
            if w.lower() not in _SKIP and len(w) >= 3:
                found.add(w)
        # Single capitalized token (Brief, Dockit)
        if re.fullmatch(r"[A-Z][a-zA-Z0-9]{2,}", token) and token.lower() not in _SKIP:
            found.add(token)

    # Standalone CamelCase anywhere in combined text
    for m in re.finditer(r"\b[A-Z][a-zA-Z0-9]*(?:[A-Z][a-z0-9]*)+\b", text):
        w = m.group(0)
        if w.lower() not in _SKIP and len(w) >= 4:
            found.add(w)

    # Tech tokens with dots (Nuxt.js)
    for m in re.finditer(r"\b[A-Za-z][A-Za-z0-9]*\.[A-Za-z]{2,}\b", text):
        found.add(m.group(0))

    return sorted(found, key=len, reverse=True)


def min_terms_required_for_gap(terms: List[str]) -> int:
    """Per-suggestion minimum when the rewrite claims to address a named-product gap."""
    return 1 if terms else 0


def rewrite_includes_gap_terms(suggested: str, terms: List[str]) -> bool:
    if not terms:
        return True
    need = min_terms_required_for_gap(terms)
    sug = (suggested or "").lower()
    hit = sum(1 for t in terms if t.lower() in sug)
    return hit >= need
