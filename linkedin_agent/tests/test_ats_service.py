"""Unit tests for rule-based ATS service (no PDF I/O)."""

from linkedin_agent.ats_service import (
    _employer_fit_evidence_lines,
    _employer_fit_gap_labels,
    _employer_problem_short,
    _extract_education_line,
    _extract_jd_keywords,
    _employer_problem_hint_from_jd,
    _is_low_value_jd_keyword,
    _jd_keyword_is_scorable,
    _pick_strongest_metric_snippet,
    _prune_redundant_keywords,
    _recruiter_top_skills_line,
    _sanitize_recruiter_display_text,
    _skills_line_from_parsed,
    _skills_plain_from_latex_or_text,
    _tokenize_skill_line,
    structured_ratings_from_ats,
)
from linkedin_agent.jd_keyword_filter import is_generic_english, slice_jd_keyword_regions


def test_jd_keywords_filter_generic_and_names():
    jd = (
        "Hi Aaron,\n"
        "We are looking forward to hearing from you.\n"
        "Requirements: Python, React, machine learning, Kubernetes.\n"
        "Python Python Python React.\n"
    )
    blocked = {"aaron"}
    assert not _jd_keyword_is_scorable("already", 3, blocked)
    assert not _jd_keyword_is_scorable("building", 3, blocked, priority_count=0)
    assert _jd_keyword_is_scorable("python", 3, blocked, priority_count=2)
    assert _jd_keyword_is_scorable("machine learning", 2, blocked, priority_count=1)
    kws = _extract_jd_keywords(jd, max_keywords=12)
    keys = {k["keyword"] for k in kws}
    assert "python" in keys
    assert "aaron" not in keys
    assert "already" not in keys
    assert "collaborative" not in keys


def test_generic_english_and_section_slice():
    assert is_generic_english("collaborative")
    assert is_generic_english("innovative")
    assert not is_generic_english("python")
    jd = (
        "About us: We are an innovative, fast-paced team.\n"
        "Requirements:\n"
        "- Python, PostgreSQL, Kubernetes\n"
        "- Experience with REST APIs\n"
    )
    priority, secondary, _ = slice_jd_keyword_regions(jd)
    assert "python" in priority
    assert "innovative" not in priority or priority.find("innovative") > priority.find("python")


def test_jd_keywords_ignore_fluff_outside_requirements():
    jd = (
        "We are passionate about our collaborative culture and dynamic environment.\n"
        "Requirements: Python, Django, AWS, Terraform.\n"
        "Benefits: great compensation and remote work.\n"
    )
    kws = _extract_jd_keywords(jd, max_keywords=15)
    keys = {k["keyword"] for k in kws}
    assert "python" in keys
    assert "terraform" in keys or "aws" in keys
    assert "passionate" not in keys
    assert "compensation" not in keys


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


def test_tokenize_skill_line_splits_sentences_not_commas_only():
    line = (
        "- 4 years of experience in content writing. "
        "Strong writing and storytelling skills. "
        "Bachelor's in mass communication or a related field."
    )
    parts = _tokenize_skill_line(line)
    joined = " ".join(parts).lower()
    assert "and storytelling skills" not in joined
    assert not any(p.lower().startswith("and ") for p in parts)
    assert not any("years of experience" in p for p in parts)
    assert any("content writing" in p.lower() for p in parts)


def test_prune_drops_singletons_inside_phrases():
    items = [
        {"keyword": "content writing", "weight": 3, "jd_count": 2},
        {"keyword": "writing", "weight": 2, "jd_count": 3},
        {"keyword": "content", "weight": 1, "jd_count": 2},
        {"keyword": "python", "weight": 3, "jd_count": 4},
    ]
    pruned = _prune_redundant_keywords(items)
    keys = {k["keyword"].lower() for k in pruned}
    assert "content writing" in keys
    assert "writing" not in keys
    assert "content" not in keys
    assert "python" in keys


def test_low_value_prose_clauses_rejected():
    assert _is_low_value_jd_keyword("4 years of experience in content writing")
    assert _is_low_value_jd_keyword("and storytelling skills.")
    assert _is_low_value_jd_keyword("preferably in healthcare or digital marketing.")
    assert not _is_low_value_jd_keyword("content writing")
    assert not _is_low_value_jd_keyword("social media")


def test_employer_fit_concise_output():
    jd = (
        "Develop high-quality content for social media posts, blogs, website pages, and marketing campaigns.\n"
        "Requirements: 4 years content writing, bachelor's in journalism or mass communication.\n"
    )
    bullets = [
        r"\small Detail-driven Healthcare Content Writer with graduate training in clinical mental health",
        "Increased blog readership by 40% through SEO-focused patient education articles.",
        "Translated complex research into insights for healthcare awareness campaigns.",
    ]
    evidence = _employer_fit_evidence_lines(bullets, jd.lower(), max_lines=3)
    assert len(evidence) <= 3
    assert all("\\small" not in e for e in evidence)
    assert any("40%" in e or "blog" in e.lower() for e in evidence)

    gaps = _employer_fit_gap_labels([
        "requirements",
        "bachelor's degree in journalism, mass communication, or a related field.",
        "4 years of experience in content writing, preferably in healthcare",
    ])
    assert "requirements" not in [g.lower() for g in gaps]
    assert len(gaps) >= 1

    short = _employer_problem_short(jd)
    assert len(short) <= 125
    assert "content" in short.lower()


def test_recruiter_scan_strips_latex_skills():
    raw = (
        r"\begin{itemize}[leftmargin=0in, label={}] \small{\item{ ** Content & Writing **{: "
        r"Content Writing, Educational Content, Patient-Focused Content, Storytelling, "
        r"SEO Optimization, Content Calendar Planning"
    )
    plain = _skills_plain_from_latex_or_text(raw)
    assert "\\begin" not in plain
    assert "Content Writing" in plain
    assert "SEO" in plain or "Optimization" in plain


def test_education_skips_city_only():
    text = (
        "Isha Shah\n"
        "Healthcare Content Writer\n"
        "Baltimore, USA\n"
        "Education\n"
        "Johns Hopkins University | M.A. in Science Writing | May 2026\n"
    )
    edu = _extract_education_line(text)
    assert "Baltimore" not in edu
    assert "Johns Hopkins" in edu or "Science Writing" in edu


def test_metric_skips_graduation_line():
    bullets = [
        "2026 — Johns Hopkins University | May 2026",
        "Increased blog readership by 40% through SEO-focused patient education articles.",
    ]
    metric = _pick_strongest_metric_snippet(bullets)
    assert "40%" in metric
    assert "Johns Hopkins" not in metric


def test_skills_from_parsed_latex():
    parsed = {
        "sections": [
            {
                "name": "Skills",
                "editable": True,
                "entries": [
                    {
                        "bullets": [
                            {
                                "text": (
                                    r"\resumeItem{\textbf{Content \& Writing:} Content Writing, "
                                    r"SEO Optimization, Storytelling}"
                                )
                            }
                        ]
                    }
                ],
            }
        ]
    }
    line = _skills_line_from_parsed(parsed)
    assert "\\resumeItem" not in line
    assert "Content Writing" in line


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
