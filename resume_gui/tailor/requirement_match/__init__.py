"""JD-driven requirement matching for tailor gap verification."""
from resume_gui.tailor.requirement_match.matcher import (
    match_requirement,
    score_resume_against_requirements,
    verify_gap_in_resume,
)
from resume_gui.tailor.requirement_match.models import RequirementConcept, RequirementMatch
from resume_gui.tailor.requirement_match.role_family import classify_role_family
from resume_gui.tailor.requirement_match.vocabulary import (
    build_requirement_vocabulary_from_gaps,
    requirement_from_gap_label,
)

__all__ = [
    "RequirementConcept",
    "RequirementMatch",
    "classify_role_family",
    "match_requirement",
    "requirement_from_gap_label",
    "build_requirement_vocabulary_from_gaps",
    "score_resume_against_requirements",
    "verify_gap_in_resume",
]
