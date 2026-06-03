"""Safety layer for ambiguous terms — not a universal skill database."""
from __future__ import annotations

from resume_gui.tailor.requirement_match.normalize import normalize_text, phrase_exists

# Terms that must not match via substring overlap with longer phrases.
_GLOBAL_AMBIGUOUS: dict[str, dict] = {
    "java": {"do_not_match": ["javascript", "javascripts"]},
    "sql": {"do_not_match": ["nosql", "no sql"]},
    "pt": {"requires_context": True},
    "cna": {"requires_role_family": ["healthcare", "nursing"]},
}


def _canonical_token(canonical: str) -> str:
    parts = normalize_text(canonical).split()
    return parts[0] if parts else ""


def match_blocked(
    resume_text: str,
    candidate_phrase: str,
    canonical: str,
    role_family: str,
) -> bool:
    """
    True when a candidate match should be rejected (ambiguous term collision).
    """
    token = _canonical_token(canonical) or normalize_text(candidate_phrase).split()[0]
    rules = _GLOBAL_AMBIGUOUS.get(token)
    if not rules:
        return False

    for blocked in rules.get("do_not_match") or []:
        if phrase_exists(resume_text, blocked) and not phrase_exists(resume_text, canonical):
            if phrase_exists(resume_text, candidate_phrase):
                return True

    if rules.get("requires_role_family"):
        allowed = rules["requires_role_family"]
        if role_family not in allowed and phrase_exists(resume_text, candidate_phrase):
            if token == normalize_text(candidate_phrase):
                return True

    return False
