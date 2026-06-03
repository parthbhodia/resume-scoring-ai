"""LLM-powered JD requirement extractor.

Public API
----------
extract_requirements_from_jd(jd_text, *, role_family="") -> list[RequirementConcept]
    Parse a raw job-description string into a typed, deduped list of
    RequirementConcept objects via a single _llm_json_call.  Returns []
    on any failure — never raises.

build_requirement_vocabulary_from_jd(jd_text, *, role_family="") -> list[RequirementConcept]
    Thin alias kept for callers that want vocabulary-style naming.  Delegates
    entirely to extract_requirements_from_jd.
"""
from __future__ import annotations

import logging
import re
from typing import List, Optional

from resume_gui.tailor.requirement_match.models import (
    RequirementConcept,
    RequirementImportance,
    RequirementType,
    requirement_from_dict,
)
from resume_gui.tailor.requirement_match.role_family import classify_role_family

logger = logging.getLogger("resume_gui")

# ---------------------------------------------------------------------------
# Valid literal sets — used for safe coercion before passing to the dataclass.
# ---------------------------------------------------------------------------
_VALID_TYPES: frozenset[str] = frozenset(
    [
        "technical_skill",
        "tool",
        "certification",
        "license",
        "degree",
        "domain_knowledge",
        "soft_skill",
        "experience",
        "responsibility",
    ]
)
_VALID_IMPORTANCE: frozenset[str] = frozenset(["required", "preferred", "nice_to_have"])

# Maximum items we accept from the LLM (spec says 40).
_MAX_ITEMS = 40

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = (
    "You are a structured job-description parser. "
    "Extract every discrete requirement from the JD and return a JSON object "
    "with a single key 'requirements' whose value is an array of requirement objects.\n\n"
    "Each requirement object MUST have exactly these fields:\n"
    "  id          : string  — slug like 'req:python-3', unique within this JD\n"
    "  canonical   : string  — normalized label, e.g. 'Python', 'AWS Lambda'\n"
    "  aliases     : array of strings — common abbreviations/variants, max 4\n"
    "  type        : one of technical_skill | tool | certification | license | "
    "degree | domain_knowledge | soft_skill | experience | responsibility\n"
    "  importance  : one of required | preferred | nice_to_have\n"
    "                (infer from language: 'must have'→required, "
    "'preferred'→preferred, 'nice to have'→nice_to_have)\n"
    "  role_family : string — e.g. 'software_engineer', 'data_scientist', "
    "'nurse', 'attorney'\n"
    "  source_text : string — verbatim phrase from JD that implied this "
    "requirement, ≤120 chars\n"
    "  confidence  : float 0.0–1.0\n\n"
    "Rules:\n"
    "- Always include the job title as an item with type=experience, id=req:job-title, "
    "importance=required.\n"
    "- Separate required vs preferred requirements based on explicit JD language.\n"
    "- Do NOT invent requirements that are absent from the JD.\n"
    "- Return at most 40 items; prioritise required > preferred > nice_to_have.\n"
    "- Omit generic soft skills like 'communication' or 'teamwork' UNLESS the JD "
    "explicitly calls them out by name.\n"
    "- This parser is role-neutral: it works equally well for legal, medical, "
    "engineering, trades, education, and any other domain.\n"
    "- Respond ONLY with the JSON object — no prose, no markdown fences.\n\n"
)


def _build_prompt(jd_text: str, role_family: str) -> str:
    truncated = (jd_text or "").strip()[:4000]
    role_hint = (
        f"\nRole family hint (may be empty): {role_family}\n" if role_family else ""
    )
    return (
        _SYSTEM_PROMPT
        + role_hint
        + "JOB DESCRIPTION:\n"
        + truncated
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _slug_id(text: str, prefix: str = "req") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:80]
    return f"{prefix}:{slug or 'unknown'}"


def _coerce_type(raw: object) -> RequirementType:
    val = str(raw or "").strip().lower()
    return val if val in _VALID_TYPES else "technical_skill"  # type: ignore[return-value]


def _coerce_importance(raw: object) -> RequirementImportance:
    val = str(raw or "").strip().lower()
    return val if val in _VALID_IMPORTANCE else "required"  # type: ignore[return-value]


def _coerce_aliases(raw: object) -> tuple[str, ...]:
    if isinstance(raw, (list, tuple)):
        return tuple(str(a).strip() for a in raw if str(a).strip())[:4]
    if isinstance(raw, str) and raw.strip():
        return (raw.strip(),)
    return ()


def _parse_item(raw: dict, seen_ids: set[str], family_fallback: str) -> Optional[RequirementConcept]:
    """Convert one raw LLM dict to a RequirementConcept, or None on failure."""
    try:
        canonical = str(raw.get("canonical") or "").strip()
        if not canonical:
            return None

        # Build a stable id; de-duplicate within this JD.
        rid = str(raw.get("id") or "").strip()
        if not rid:
            rid = _slug_id(canonical)
        # Ensure uniqueness by appending a counter suffix if needed.
        base_rid = rid
        counter = 1
        while rid in seen_ids:
            rid = f"{base_rid}-{counter}"
            counter += 1
        seen_ids.add(rid)

        role_family = str(
            raw.get("role_family") or raw.get("roleFamily") or family_fallback or "general"
        ).strip()

        return RequirementConcept(
            id=rid,
            canonical=canonical,
            aliases=_coerce_aliases(raw.get("aliases")),
            type=_coerce_type(raw.get("type")),
            importance=_coerce_importance(raw.get("importance")),
            role_family=role_family,
            source_text=str(raw.get("source_text") or raw.get("sourceText") or canonical)[:120],
            confidence=min(1.0, max(0.0, float(raw.get("confidence") or 0.85))),
        )
    except Exception as exc:  # noqa: BLE001
        logger.debug("jd_extractor: skipping malformed item %r: %s", raw, exc)
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def extract_requirements_from_jd(
    jd_text: str,
    *,
    role_family: str = "",
) -> List[RequirementConcept]:
    """Parse a raw JD string into a list of RequirementConcept objects.

    Uses a single non-reasoning LLM call (GROK_MODEL tier — fast, cheap).
    Returns [] on any LLM failure or parse error; never raises.

    Parameters
    ----------
    jd_text:
        Raw job-description text (any language, any domain).  Truncated to
        4 000 chars inside the prompt.
    role_family:
        Optional hint (e.g. ``classify_role_family(jd_text)``).  When empty
        the function classifies itself so the role_family field on each concept
        is always populated.
    """
    if not (jd_text or "").strip():
        return []

    # Resolve role_family once so every item carries a consistent value.
    resolved_family = (role_family or "").strip() or classify_role_family(jd_text)

    prompt = _build_prompt(jd_text, resolved_family)

    try:
        from resume_gui.llm.client import _llm_json_call  # local import avoids circular deps

        raw_response = _llm_json_call(prompt)  # uses GROK_MODEL (non-reasoning) by default
    except Exception as exc:  # noqa: BLE001
        logger.warning("jd_extractor: LLM call failed: %s", exc)
        return []

    if not raw_response or not isinstance(raw_response, dict):
        logger.warning(
            "jd_extractor: LLM returned non-dict for JD of length %d", len(jd_text)
        )
        return []

    raw_items = raw_response.get("requirements")
    if not isinstance(raw_items, list):
        # Some models wrap in a different key — try common alternatives.
        for fallback_key in ("items", "data", "results"):
            if isinstance(raw_response.get(fallback_key), list):
                raw_items = raw_response[fallback_key]
                break
        else:
            logger.warning(
                "jd_extractor: 'requirements' key missing or not a list in LLM response"
            )
            return []

    results: List[RequirementConcept] = []
    seen_ids: set[str] = set()

    for raw_item in raw_items[:_MAX_ITEMS]:
        if not isinstance(raw_item, dict):
            continue
        concept = _parse_item(raw_item, seen_ids, resolved_family)
        if concept is not None:
            results.append(concept)

    if not results and (jd_text or "").strip():
        logger.warning(
            "jd_extractor: extracted 0 requirements from a non-empty JD (%d chars)",
            len(jd_text),
        )

    return results


def build_requirement_vocabulary_from_jd(
    jd_text: str,
    *,
    role_family: str = "",
) -> List[RequirementConcept]:
    """Vocabulary-style alias for extract_requirements_from_jd.

    Kept for callers that prefer the ``build_*`` naming convention used
    elsewhere in this package (e.g. ``build_requirement_vocabulary_from_gaps``).
    """
    return extract_requirements_from_jd(jd_text, role_family=role_family)
