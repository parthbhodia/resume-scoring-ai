"""Normalized requirement + match result models (JD-driven vocabulary)."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Literal, Optional

RequirementImportance = Literal["required", "preferred", "nice_to_have"]
RequirementType = Literal[
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
MatchMethod = Literal["exact", "alias", "abbreviation", "semantic", "not_found"]


@dataclass(frozen=True)
class RequirementConcept:
    id: str
    canonical: str
    aliases: tuple[str, ...] = ()
    type: RequirementType = "technical_skill"
    importance: RequirementImportance = "required"
    role_family: str = "general"
    source_text: str = ""
    confidence: float = 0.85

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["aliases"] = list(self.aliases)
        return d


@dataclass(frozen=True)
class RequirementMatch:
    requirement_id: str
    canonical: str
    matched: bool
    method: MatchMethod
    matched_text: Optional[str] = None
    evidence: Optional[str] = None
    confidence: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def requirement_from_dict(raw: dict) -> RequirementConcept:
    aliases = raw.get("aliases") or []
    if isinstance(aliases, str):
        aliases = [aliases]
    return RequirementConcept(
        id=str(raw.get("id") or ""),
        canonical=str(raw.get("canonical") or ""),
        aliases=tuple(str(a) for a in aliases if str(a).strip()),
        type=raw.get("type") or "technical_skill",
        importance=raw.get("importance") or "required",
        role_family=str(raw.get("role_family") or raw.get("roleFamily") or "general"),
        source_text=str(raw.get("source_text") or raw.get("sourceText") or ""),
        confidence=float(raw.get("confidence") or 0.85),
    )
