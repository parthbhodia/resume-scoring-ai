"""Unit tests for rule-based ATS service (no PDF I/O)."""

from linkedin_agent.ats_service import (
    _extract_jd_keywords,
    _employer_problem_hint_from_jd,
    _jd_keyword_is_scorable,
    _recruiter_top_skills_line,
    structured_ratings_from_ats,
)


def test_jd_keywords_filter_generic_and_names():
    jd = (
        "Hi Aaron,\n"
        "We are looking forward to hearing from you.\n"
        "Requirements: Python, React, machine learning, Kubernetes.\n"
        "Python Python Python React.\n"
    )
    blocked = {"aaron"}
    assert not _jd_keyword_is_scorable("already", 3, blocked)
    assert not _jd_keyword_is_scorable("building", 3, blocked)
    assert _jd_keyword_is_scorable("python", 3, blocked)
    assert _jd_keyword_is_scorable("machine learning", 2, blocked)
    kws = _extract_jd_keywords(jd, max_keywords=12)
    keys = {k["keyword"] for k in kws}
    assert "python" in keys
    assert "aaron" not in keys
    assert "already" not in keys


def test_employer_problem_skips_sign_off():
    jd = (
        "You will build scalable APIs and services with Python for our platform team.\n"
        "Looking forward to hearing from you.\n"
    )
    hint = _employer_problem_hint_from_jd(jd)
    assert "looking forward" not in hint.lower()
    assert "python" in hint.lower() or "api" in hint.lower()


def test_recruiter_skills_line_from_experience_text():
    text = (
        "Jane Doe\n"
        "Software Engineer\n"
        "Experience\n"
        "Acme — Built services with Python, React, PostgreSQL, Docker, and AWS.\n"
    )
    line = _recruiter_top_skills_line(text, None, text.lower())
    assert line
    assert "python" in line.lower() or "react" in line.lower()


def test_structured_ratings_from_ats_shape():
    ats = {
        "score": 72,
        "checks": [{"name": "Text extractable", "pass": True, "detail": "ok"}],
        "keywords": [{"keyword": "python", "status": "found"}],
        "jdMatch": {"matchScore": 68},
        "jdAnalysis": {"requiredSkills": ["Python"], "preferredSkills": [], "certifications": [], "repeatedKeywords": []},
        "scoreBreakdown": {"jdKeywordMatch": 20},
    }
    out = structured_ratings_from_ats(ats)
    assert out["match_score"] == 72
    assert isinstance(out["criteria"], list)
    assert isinstance(out["whats_working"], list)
    assert out["verdict"]
