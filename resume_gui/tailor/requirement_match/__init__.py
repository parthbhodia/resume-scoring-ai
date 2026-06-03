"""JD-driven requirement matching for tailor gap verification."""
from resume_gui.tailor.requirement_match.jd_extractor import (
    build_requirement_vocabulary_from_jd,
    extract_requirements_from_jd,
)
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
from resume_gui.tailor.requirement_match.weighted_scorer import (
    JdMatchBreakdown,
    calculate_weighted_jd_score,
    to_dict as breakdown_to_dict,
)

__all__ = [
    "RequirementConcept",
    "RequirementMatch",
    "classify_role_family",
    "extract_requirements_from_jd",
    "build_requirement_vocabulary_from_jd",
    "match_requirement",
    "requirement_from_gap_label",
    "build_requirement_vocabulary_from_gaps",
    "score_resume_against_requirements",
    "verify_gap_in_resume",
    "JdMatchBreakdown",
    "calculate_weighted_jd_score",
    "breakdown_to_dict",
]
